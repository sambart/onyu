#!/bin/bash
# =============================================================================
# 운영서버 DB → 로컬 개발 Docker DB 동기화 스크립트
#
# 사용법:
#   ./scripts/sync-db-from-prod.sh [SSH_HOST]
#
# 모드:
#   --voice-only  음성 추적 데이터만 동기화 (설정/config 테이블 제외)
#   (기본)        전체 DB 동기화
#
# 사전 조건:
#   - 운영서버에 SSH 키 인증 설정 완료
#   - 로컬 Docker(postgres 컨테이너)가 실행 중
#   - 운영서버에서 docker exec 권한 보유
#
# 환경변수 (선택, 기본값 있음):
#   PROD_SSH_HOST   - 운영서버 SSH 주소 (user@host 형식)
#   PROD_SSH_KEY    - SSH 키 파일 경로 (기본: ~/.ssh/id_rsa)
#   PROD_CONTAINER  - 운영 DB 컨테이너명 (기본: postgres-prod)
#   LOCAL_CONTAINER - 로컬 DB 컨테이너명 (기본: postgres)
#   DB_USER         - DB 사용자 (기본: dhyun)
#   DB_NAME         - DB 이름 (기본: onyu)
# =============================================================================

set -euo pipefail

# ─── 인자 파싱 ─────────────────────────────────────────────────────────────
VOICE_ONLY=false
POSITIONAL_ARGS=()

for arg in "$@"; do
  case $arg in
    --voice-only)
      VOICE_ONLY=true
      ;;
    *)
      POSITIONAL_ARGS+=("$arg")
      ;;
  esac
done

# ─── 설정 ────────────────────────────────────────────────────────────────────
PROD_SSH_HOST="${PROD_SSH_HOST:-${POSITIONAL_ARGS[0]:-}}"
PROD_SSH_KEY="${PROD_SSH_KEY:-$HOME/.ssh/id_rsa}"
PROD_CONTAINER="${PROD_CONTAINER:-postgres-prod}"
LOCAL_CONTAINER="${LOCAL_CONTAINER:-postgres}"
DB_USER="${DB_USER:-dhyun}"
DB_NAME="${DB_NAME:-onyu}"

DUMP_FILE="/tmp/onyu_prod_dump_$(date +%Y%m%d_%H%M%S).dump"
SKIP_CONFIRM="${SKIP_CONFIRM:-false}"

# 음성 추적 데이터 테이블 목록 (channel은 voice_channel_history FK 참조용)
VOICE_TABLES=(
  "channel"
  "member"
  "voice_daily"
  "voice_channel_history"
  "voice_co_presence_daily"
  "voice_co_presence_pair_daily"
  "voice_co_presence_session"
  "voice_game_activity"
  "voice_game_daily"
  "voice_health_badge"
  "moco_hunting_daily"
  "moco_hunting_session"
)

# ─── 유효성 검사 ─────────────────────────────────────────────────────────────
if [[ -z "$PROD_SSH_HOST" ]]; then
  echo "❌ 운영서버 SSH 주소가 필요합니다."
  echo ""
  echo "사용법:"
  echo "  ./scripts/sync-db-from-prod.sh user@your-server-ip"
  echo "  ./scripts/sync-db-from-prod.sh user@your-server-ip --voice-only"
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${LOCAL_CONTAINER}$"; then
  echo "❌ 로컬 Docker 컨테이너 '${LOCAL_CONTAINER}'가 실행 중이 아닙니다."
  echo "   먼저 docker compose up -d db 를 실행하세요."
  exit 1
fi

# ─── 확인 프롬프트 ───────────────────────────────────────────────────────────
echo "============================================"
if [[ "$VOICE_ONLY" == "true" ]]; then
  echo "  운영 DB → 로컬 DB 동기화 (음성 데이터만)"
else
  echo "  운영 DB → 로컬 DB 동기화 (전체)"
fi
echo "============================================"
echo ""
echo "  운영서버:     ${PROD_SSH_HOST}"
echo "  운영 컨테이너: ${PROD_CONTAINER}"
echo "  로컬 컨테이너: ${LOCAL_CONTAINER}"
echo "  DB:           ${DB_NAME} (user: ${DB_USER})"
echo ""

if [[ "$VOICE_ONLY" == "true" ]]; then
  echo "  대상 테이블:"
  for table in "${VOICE_TABLES[@]}"; do
    echo "    - ${table}"
  done
  echo ""
  echo "⚠️  위 테이블의 로컬 데이터가 덮어쓰기됩니다!"
else
  echo "⚠️  로컬 DB의 모든 데이터가 덮어쓰기됩니다!"
fi

echo ""
if [[ "$SKIP_CONFIRM" != "true" ]]; then
  read -rp "계속하시겠습니까? (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "취소되었습니다."
    exit 0
  fi
fi

echo ""

if [[ "$VOICE_ONLY" == "true" ]]; then
  # ═══════════════════════════════════════════════════════════════════════════
  # 음성 데이터만 동기화
  # ═══════════════════════════════════════════════════════════════════════════

  # pg_dump 테이블 필터 옵션 구성
  TABLE_OPTS=""
  for table in "${VOICE_TABLES[@]}"; do
    TABLE_OPTS="${TABLE_OPTS} -t ${table}"
  done

  # Step 1: 운영서버에서 음성 테이블만 덤프
  echo "📦 [1/3] 운영서버에서 음성 데이터 덤프 중..."
  ssh -i "$PROD_SSH_KEY" "$PROD_SSH_HOST" \
    "docker exec ${PROD_CONTAINER} pg_dump -U ${DB_USER} -d ${DB_NAME} --format=custom --data-only ${TABLE_OPTS}" \
    > "$DUMP_FILE"

  DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
  echo "   ✅ 덤프 완료 (${DUMP_SIZE}): ${DUMP_FILE}"

  # Step 2: 로컬 대상 테이블 TRUNCATE
  echo ""
  echo "🗑️  [2/3] 로컬 음성 테이블 초기화 중..."
  TRUNCATE_SQL=""
  for table in "${VOICE_TABLES[@]}"; do
    TRUNCATE_SQL="${TRUNCATE_SQL}TRUNCATE TABLE \"${table}\" CASCADE; "
  done
  docker exec "${LOCAL_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -c "${TRUNCATE_SQL}" \
    > /dev/null 2>&1
  echo "   ✅ 테이블 초기화 완료"

  # Step 3: pg_restore로 데이터만 복원
  echo ""
  echo "📥 [3/3] 로컬 DB에 음성 데이터 복원 중..."

  # CHECK 제약 임시 비활성화 (운영 DB에 단방향 마이그레이션 미적용 시 대비)
  docker exec "${LOCAL_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -c \
    "ALTER TABLE voice_co_presence_pair_daily DROP CONSTRAINT IF EXISTS \"CHK_pair_daily_unidirectional\";" \
    > /dev/null 2>&1 || true

  docker exec -i "${LOCAL_CONTAINER}" pg_restore -U "${DB_USER}" -d "${DB_NAME}" \
    --no-owner --no-privileges --data-only --disable-triggers \
    < "$DUMP_FILE"

  # CHECK 제약 재활성화
  docker exec "${LOCAL_CONTAINER}" psql -U "${DB_USER}" -d "${DB_NAME}" -c \
    "ALTER TABLE voice_co_presence_pair_daily ADD CONSTRAINT \"CHK_pair_daily_unidirectional\" CHECK (\"userId\" < \"peerId\") NOT VALID;" \
    > /dev/null 2>&1 || true

  echo "   ✅ 복원 완료"

else
  # ═══════════════════════════════════════════════════════════════════════════
  # 전체 DB 동기화 (기존 동작)
  # ═══════════════════════════════════════════════════════════════════════════

  # Step 1: 운영서버에서 pg_dump 실행 → 로컬로 전송
  echo "📦 [1/3] 운영서버에서 DB 덤프 중..."
  ssh -i "$PROD_SSH_KEY" "$PROD_SSH_HOST" \
    "docker exec ${PROD_CONTAINER} pg_dump -U ${DB_USER} -d ${DB_NAME} --format=custom --clean --if-exists" \
    > "$DUMP_FILE"

  DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
  echo "   ✅ 덤프 완료 (${DUMP_SIZE}): ${DUMP_FILE}"

  # Step 2: 로컬 DB 초기화
  echo ""
  echo "🗑️  [2/3] 로컬 DB 초기화 중..."
  docker exec "${LOCAL_CONTAINER}" psql -U "${DB_USER}" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

  docker exec "${LOCAL_CONTAINER}" dropdb -U "${DB_USER}" --if-exists "${DB_NAME}"
  docker exec "${LOCAL_CONTAINER}" createdb -U "${DB_USER}" "${DB_NAME}"
  echo "   ✅ DB 재생성 완료"

  # Step 3: pg_restore로 복원
  echo ""
  echo "📥 [3/3] 로컬 DB에 복원 중..."
  docker exec -i "${LOCAL_CONTAINER}" pg_restore -U "${DB_USER}" -d "${DB_NAME}" --no-owner --no-privileges \
    < "$DUMP_FILE"

  echo "   ✅ 복원 완료"
fi

# ─── 정리 ────────────────────────────────────────────────────────────────────
rm -f "$DUMP_FILE"
echo ""
echo "============================================"
echo "  ✅ 동기화 완료!"
echo "============================================"
echo ""
echo "로컬 DB 확인: docker exec -it ${LOCAL_CONTAINER} psql -U ${DB_USER} -d ${DB_NAME}"
