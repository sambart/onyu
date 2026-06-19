# Userflow 목차 및 공통 플로우

> 기능별 유저플로우는 `/docs/specs/userflow/{domain}.md`에 작성한다. {domain} 목록의 진실의 소스는 `/docs/specs/feature-manifest.json`의 `domains` 키이다.
> 각 플로우는 **입력 → 처리 → 출력** 3단계와 엣지케이스로 구성한다. 구체적 UI 문구/구현 코드는 포함하지 않으며 흐름과 엣지케이스에 집중한다.
> 🔒 마커: 법무/결제/권한/DB파괴적 4분야 결정이 흐름에 나타나는 줄. feat-implement 파이프라인이 이 마커를 grep 한다.

## 작성된 도메인

| 도메인 | 표면 | 문서 |
|--------|------|------|
| auth | Discord OAuth2 로그인 / JWT 세션 (web + api) | [auth.md](auth.md) |
| voice | 일반 멤버 본인 음성 통계 마이페이지 `/my/voice` (web + api) | [voice.md](voice.md) |
| status-prefix | 버튼 클릭 → 닉네임 접두사 변경 / 자동 복원 (bot + web) | [status-prefix.md](status-prefix.md) |
| self-diagnosis | `/자가진단` 슬래시 커맨드 + 웹 정책 설정 + 뱃지 + 주간리포트 (bot + web) | [self-diagnosis.md](self-diagnosis.md) |
| newbie | 환영인사 / 미션 추적 / 모코코 사냥 / 신입역할 (bot + web) | [newbie.md](newbie.md) |
| super-admin | 플랫폼 어드민 콘솔 진입 / 전체 길드 현황 조회 / 특정 길드 read-only drill-in / 관리자 관리 콘솔(추가·역할변경·비활성화) / 권한 없는 접근 거부 (web + api) | [super-admin.md](super-admin.md) |
| role-panel | 패널 목록 조회 / 패널 생성·수정·게시·삭제 (web) / GRANT 모드 역할 부여 / TOGGLE 모드 역할 토글 / 인증 게이트 동의 버튼 (bot + web) | [role-panel.md](role-panel.md) |

> 위 표 외 도메인(gemini, web, general, sticky-message, monitoring, voice-co-presence, inactive-member, guild-member)은 매니페스트에 정의되어 있으나 본 문서 범위 밖이다. 추가 작성 시 manifest `domains` 키 순서를 따른다.

---

## 공통 전제 (웹 대시보드 진입)

웹 표면을 가진 모든 도메인은 다음 공통 진입 흐름을 전제한다. 각 도메인 문서는 이 흐름 이후 지점부터 기술한다.

### 입력
- 사용자가 웹 대시보드에 접근

### 처리
1. 세션 토큰 쿠키 확인
2. 토큰 없음 또는 만료 → 로그인 유도 (auth 도메인 흐름 진입)
3. 토큰 유효 → 서버 선택(select-guild) 화면 진입
4. 사용자가 관리 권한 보유 서버를 선택
5. 🔒 선택한 서버에 대한 관리 권한(소유자 또는 서버 관리 권한)을 토큰 내 길드 목록과 대조 검증 (권한 도메인 결정)
6. 권한 통과 시 해당 서버의 설정/대시보드 화면으로 전이

### 출력
- 권한 통과: 도메인별 설정/대시보드 화면 렌더
- 권한 미달: 접근 거부 안내 또는 서버 선택 화면으로 복귀

### 공통 엣지케이스
- 토큰 만료: 401 응답 → 로그인 재유도
- 토큰 위변조/디코딩 실패: 비로그인 처리
- 길드 목록에 없는 서버 직접 URL 접근: 권한 거부
- 봇이 해당 서버에 미참여: 설정 저장은 가능하나 Discord 측 반영(메시지 전송/역할 부여)은 실패할 수 있음 → 도메인별 오류 처리

---

## 공통 전제 (봇 슬래시 커맨드 / 버튼 상호작용)

봇 표면을 가진 모든 도메인은 다음 전제를 공유한다.

### 처리 공통
1. 인터랙션 수신 시 길드(서버) 컨텍스트 존재 여부 확인 (DM 환경 차단)
2. customId 접두사로 핸들러 분기 (버튼) 또는 커맨드명으로 분기 (슬래시)
3. 비즈니스 로직은 API에 위임, Discord 응답·닉네임 변경·역할 부여는 봇이 직접 수행
4. 처리 실패 시 Ephemeral 오류 응답 (이미 응답/지연된 경우 followUp)

### 봇 공통 엣지케이스
- DM 등 길드 컨텍스트 없는 인터랙션: 무시 또는 안내 후 종료
- 잘못된 customId 포맷(파싱 실패): 잘못된 요청 안내
- API 통신 실패: 일반 오류 안내 후 로그 기록
- Discord 응답 자체 실패(인터랙션 만료 등): 조용히 무시
