# 리전 마이그레이션 가이드: 서울 → 미국 동부

## 배경

Discord API 서버가 미국에 위치하여, 서울 리전에서 API 호출 시 150~250ms RTT 지연 발생.
미국 동부(us-east-1)로 이전하면 API RTT가 5~20ms로 약 10~15배 개선됨.

## 현재 인프라

| 항목 | 상세 |
|------|------|
| 호스팅 | AWS Lightsail (서울 ap-northeast-2) |
| 런타임 | Docker Compose (`docker-compose.prod.yml`) |
| 서비스 | API (NestJS) + Web (Next.js) + PostgreSQL 15 + Redis 7 |
| 이미지 | ghcr.io에서 pull (GHCR) |
| CI/CD | GitHub Actions → SSH 배포 (`deploy.yml`) |

---

## Phase 1. 미국 Lightsail 인스턴스 준비

[deploy-guide.md](deploy-guide.md) 섹션 1과 동일하게 진행하되, 리전을 **us-east-1 (버지니아)** 로 선택한다.

```bash
# 시스템 설정 (deploy-guide.md 1-1 ~ 1-3)
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# 타임존 (한국 시간 유지 — 로그 가독성)
sudo timedatectl set-timezone Asia/Seoul

# 방화벽
sudo ufw allow OpenSSH
sudo ufw allow 3000   # API
sudo ufw allow 4000   # Web
sudo ufw enable
```

> Lightsail 콘솔 > Networking 탭에서도 3000, 4000 포트를 열어야 한다.

```bash
# 프로젝트 클론 + 환경변수
git clone <repo-url> ~/onyu
cd ~/onyu
nano .env.prod   # Phase 5 참고하여 새 IP 반영

# ghcr.io 로그인
echo "<GHCR_TOKEN>" | docker login ghcr.io -u <GITHUB_USERNAME> --password-stdin
```

---

## Phase 2. DB 데이터 마이그레이션 (PostgreSQL)

### 서울 서버에서 덤프

```bash
# DB 덤프 생성
docker exec postgres-prod pg_dump \
  -U dhyun -d onyu \
  --format=custom --compress=9 \
  -f /tmp/onyu.dump

# 컨테이너 → 호스트 복사
docker cp postgres-prod:/tmp/onyu.dump ~/onyu.dump

# 미국 서버로 전송
scp ~/onyu.dump ubuntu@<US_SERVER_IP>:~/
```

### 미국 서버에서 복원

```bash
cd ~/onyu

# DB, Redis 컨테이너만 먼저 기동
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d db redis

# DB healthcheck 통과 대기
docker compose --env-file .env.prod -f docker-compose.prod.yml exec db \
  pg_isready -U dhyun -d onyu

# 덤프 파일 복사 → 복원
docker cp ~/onyu.dump postgres-prod:/tmp/
docker exec postgres-prod pg_restore \
  -U dhyun -d onyu \
  --clean --if-exists --no-owner \
  /tmp/onyu.dump

# 검증
docker exec postgres-prod psql -U dhyun -d onyu \
  -c "SELECT schemaname, tablename FROM pg_tables WHERE schemaname='public';"
```

---

## Phase 3. Redis 데이터 마이그레이션

```bash
# ── 서울 서버 ──

# AOF/RDB 스냅샷 강제 저장
docker exec redis-prod redis-cli -a $REDIS_PASSWORD BGSAVE
sleep 2

# 데이터 파일 복사 & 전송
docker cp redis-prod:/data/dump.rdb ~/dump.rdb
scp ~/dump.rdb ubuntu@<US_SERVER_IP>:~/

# ── 미국 서버 ──

# Redis 중지 → 데이터 배치 → 재시작
docker compose --env-file .env.prod -f docker-compose.prod.yml stop redis
docker cp ~/dump.rdb redis-prod:/data/dump.rdb
docker compose --env-file .env.prod -f docker-compose.prod.yml start redis
```

> Redis 데이터가 캐시 용도라면 이 단계는 생략 가능.

---

## Phase 4. 전환 (예상 다운타임: 5~10분)

```bash
# 1) 서울 서버: 봇 중지 (새 이벤트 유입 차단)
ssh SEOUL "cd ~/onyu && \
  docker compose -f docker-compose.prod.yml stop api web"

# 2) 최종 DB 덤프 (봇 중지 후 → 정합성 보장)
ssh SEOUL "docker exec postgres-prod pg_dump \
  -U dhyun -d onyu -Fc -f /tmp/final.dump && \
  docker cp postgres-prod:/tmp/final.dump ~/final.dump"
scp SEOUL:~/final.dump .
scp final.dump US:~/

# 3) 미국 서버: 최종 덤프 복원
ssh US "docker cp ~/final.dump postgres-prod:/tmp/ && \
  docker exec postgres-prod pg_restore \
  -U dhyun -d onyu --clean --if-exists --no-owner /tmp/final.dump"

# 4) 미국 서버: 이미지 pull & 전체 기동
ssh US "cd ~/onyu && \
  docker compose --env-file .env.prod -f docker-compose.prod.yml pull api web && \
  docker compose --env-file .env.prod -f docker-compose.prod.yml up -d && \
  docker compose --env-file .env.prod -f docker-compose.prod.yml exec api \
    npx typeorm migration:run -d dist/apps/api/src/data-source.js"
```

---

## Phase 5. 환경변수 변경 (.env.prod)

```env
# 변경 필요 항목 (새 미국 서버 IP 반영)
SERVER_HOST=<US_SERVER_IP>
DISCORD_CALLBACK_URL=http://<US_SERVER_IP>:3000/auth/discord/callback
WEB_URL=http://<US_SERVER_IP>:4000
NEXT_PUBLIC_API_URL=http://<US_SERVER_IP>:3000

# 변경 불필요 (Docker 내부 DNS)
# DATABASE_HOST=db
# REDIS_HOST=redis
```

---

## Phase 6. GitHub Secrets 업데이트 (CI/CD 전환)

리포지토리 > Settings > Secrets and variables > Actions에서 변경:

| Secret | 변경 내용 |
|--------|----------|
| `LIGHTSAIL_HOST` | 서울 IP → **미국 서버 IP** |
| `LIGHTSAIL_SSH_KEY` | **미국 Lightsail의 새 SSH 키 (.pem)** |
| `LIGHTSAIL_USER` | 변경 불필요 (`ubuntu`) |
| `GHCR_TOKEN` | 변경 불필요 |

이후 `main` push 시 자동으로 미국 서버에 배포된다.

---

## Phase 7. 검증 체크리스트

| 항목 | 확인 방법 |
|------|----------|
| API 헬스체크 | `curl http://<US_SERVER_IP>:3000/health` |
| 웹 대시보드 접근 | `curl http://<US_SERVER_IP>:4000` |
| Discord 봇 온라인 | 디스코드에서 봇 상태 확인 |
| 슬래시 커맨드 응답 | 디스코드에서 명령어 테스트 |
| 웹 OAuth 로그인 | 새 IP로 콜백 정상 동작 확인 |
| DB 데이터 정합성 | 길드 설정, 미션 데이터 조회 |
| API 응답 속도 개선 | `time curl` 로 비교 |
| CI/CD 자동 배포 | main에 테스트 커밋 push → Actions 성공 확인 |

---

## 롤백 계획

- 서울 서버는 **전환 후 최소 2주간 유지** (컨테이너 중지 상태)
- 문제 발생 시:
  1. GitHub Secrets를 서울 서버 값으로 복원
  2. 서울 서버에서 `docker compose up -d` 재기동
- 2주간 문제없으면 서울 Lightsail 인스턴스 삭제

---

## 예상 효과

| 지표 | 서울 (현재) | 미국 동부 (이전 후) |
|------|-----------|-------------------|
| Discord API RTT | 150~250ms | 5~20ms |
| REST API 호출 1회 | ~200ms | ~15ms |
| 연속 API 호출 5회 | ~1초 | ~75ms |
| Lightsail 비용 | 동일 플랜 기준 동일 | 동일 |
