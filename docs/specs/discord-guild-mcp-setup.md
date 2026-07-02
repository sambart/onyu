# Onyu 디스코드 길드 — MCP 도입 & 구조 일괄생성 런북

> **목적**: [discord-guild-ia.md](discord-guild-ia.md)에서 확정한 길드 구조를 MCP(LLM 협업)로 실제 길드에 일괄 생성하는 절차.
> **상태**: 절차서 (실행 전) · **작성일**: 2026-06-19
> **전제**: IA 청사진 확정됨. 본 런북은 "2단계(MCP 도입)"에 해당.

---

## 0. 핵심 원칙 (먼저 읽기)

| 원칙 | 이유 |
|------|------|
| **관리용 봇 ≠ 운영봇(onyu)** 분리 | 토큰/권한/사고 영향범위 격리. onyu 운영봇은 길드 구조를 만들지 않음 |
| **최소권한** (Administrator 통짜 금지) | 토큰 유출 = 길드 장악. 셋업 동안만 권한 부여 후 회수 |
| **파괴적 작업(삭제/권한 회수)은 사람 확인** | LLM 환각 시 복구 불가 (HITL — 권한 분야) |
| **생성 순서 준수**: 역할 → 카테고리 → 채널 → 권한 override | 채널 권한이 역할을 참조하므로 역할이 먼저 존재해야 함 |
| **rate limit 인지** | 채널/역할 수십 개 일괄 생성 시 Discord 제한. MCP 서버가 처리하는지 확인 |

---

## 1. MCP 서버 선택

| 후보 | 특징 |
|------|------|
| `cj-vana/discord-setup-mcp` | **서버 셋업 특화** (서버/채널/카테고리/역할 생성·설정) — 초기 구성에 가장 직결 |
| `barryyip0625/mcp-discord` | 채널/역할/권한 override 풀 CRUD, 문서 정리 양호 — 상시 관리까지 커버 |

> 초기 일괄생성만이면 `discord-setup-mcp`, 이후 운영성 관리까지 한 봇으로 하려면 `mcp-discord`.

---

## 2. Step 1 — Discord 봇(애플리케이션) 생성

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**
2. **Bot** 탭 → 봇 생성 → **Token** 발급 (⚠️ 노출 금지 — `.env`/secret 으로만 관리, git 커밋 금지)
3. **Privileged Gateway Intents**: 구조 생성만이면 불필요. (멤버 조작 필요 시 Server Members Intent)
4. **OAuth2 → URL Generator**:
   - scope: `bot`
   - Bot Permissions: `Manage Roles`, `Manage Channels` (+ 패널 게시 시 `Send Messages`, `View Channels`)
5. 생성된 초대 URL로 **대상 길드에 봇 초대**

---

## 3. Step 2 — 권한 설정 (최소권한)

- 부여 권한: **Manage Roles + Manage Channels** 만 (Administrator ❌)
- 봇 **역할 위치를 역할 목록 상단 가까이** — Discord는 *자기보다 낮은 역할만* 조작 가능
- 셋업 봇 역할은 onyu 운영봇 역할과 **별개**로 둠
- rate limit: 한 번에 수십 개 생성 시 제한 가능 → MCP 서버가 backoff 처리하는지 확인

---

## 4. Step 3 — MCP 서버 설치 & 연결

1. MCP 서버 설치 (서버별 README 기준 — npx 또는 clone)
2. **봇 토큰 주입**: 환경변수로 (⚠️ 정확한 변수명은 서버별 상이 — `DISCORD_TOKEN` / `DISCORD_BOT_TOKEN` 등 README 확인)
3. Claude Code에 MCP 등록:
   - `claude mcp add` 또는 `settings.json`의 `mcpServers`에 추가
4. **연결 확인**: 길드 목록 조회 / 노출된 tool 목록 확인 (채널·역할·권한 tool 이 보이는지)

---

## 5. Step 4 — 구조 일괄 생성 (IA 청사진 적용)

[discord-guild-ia.md](discord-guild-ia.md) 기준으로 **아래 순서대로** LLM에게 지시:

### 5-1. 역할 생성 (위계 순, 위→아래)
`관리자` → `운영진` → (선택)`후원자/부스터` → `정회원` → `비활동`
> onyu 운영봇 역할은 봇 초대 시 자동 생성됨 — 위치만 관리자 바로 아래로 조정.

### 5-2. 카테고리 생성
🏠 시작하기 / 💬 커뮤니티 / 🎮 음성·게임 / 📊 onyu 리포트 / 🆘 지원 / 🔧 운영진

### 5-3. 채널 생성 (카테고리별, IA §2 표 그대로)
text / voice / announcement / forum 타입 구분 주의.

### 5-4. 권한 override 적용 (IA §3 매트릭스)
- **카테고리 단위**로 권한 설정 → 채널이 상속 (채널별 개별 설정 최소화)
- `@everyone`: 시작하기만 보기, 나머지 숨김
- `정회원`: 커뮤니티/음성/리포트/지원 보기·쓰기
- `운영진`: 운영진 카테고리 접근
- `관리자`: 감사-로그 포함 전체

> ⚠️ 채널/역할 **삭제·권한 회수**는 LLM 단독 실행 금지 — 사람이 확인 후.

---

## 6. Step 5 — 검증 & 셋업 봇 정리

1. 생성 결과 검증: 채널 트리 / 역할 위계 / 권한 매트릭스가 IA와 일치하는지
2. **셋업 봇 정리**: 일괄생성 끝나면 관리용 봇 권한 회수 또는 길드에서 추방
   - 상시 Administrator/Manage 봇을 길드에 두지 않음
3. 길드에는 **onyu 운영봇만 상주** (음성추적·리포트·역할패널 등 기능 담당)

---

## 7. 체크리스트

- [ ] 관리용 봇을 onyu 운영봇과 분리 생성
- [ ] 봇 토큰 secret 관리 (git 커밋 금지)
- [ ] 권한 최소화 (Administrator 미부여)
- [ ] 봇 역할 위치 = 부여 대상 역할보다 위
- [ ] 생성 순서: 역할 → 카테고리 → 채널 → 권한
- [ ] 권한은 카테고리 단위로 (상속 활용)
- [ ] 파괴적 작업 사람 확인
- [ ] 셋업 후 관리용 봇 권한 회수/추방
- [ ] 최종 구조 ↔ IA 문서 대조

---

## 8. 후속 연계

- 구조 생성 완료 후 → onyu 운영봇의 **역할 패널 기능**(grant 모드)으로 `규칙-rules` 채널에 동의 게이트 게시 → `정회원` 자동 부여 동선 완성 (IA §4)
- IA 변경 시 본 런북의 §5 생성 항목도 함께 갱신
