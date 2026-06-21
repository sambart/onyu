# Userflow 변경이력

> `docs/specs/userflow/` 산출물의 생성·수정·폐기 이력을 기록한다.
> 형식: `YYYY-MM-DD | 도메인 | 액션 | 내용`

---

| 날짜 | 도메인 | 액션 | 내용 |
|------|--------|------|------|
| 2026-06-19 | super-admin | 신규 생성 | `/admin` 콘솔 진입, 전체 길드 현황 조회, 특정 길드 read-only drill-in, mutation 차단, 권한 없는 접근 거부 플로우 (UF-SUPER-ADMIN-001~004 + 003-A). `feature-manifest.json` super-admin 도메인 등재, `_index.md` 목차 등재 |
| 2026-06-19 | super-admin | 갱신 | DB 기반 role/scopes 전환 반영: `isSuperAdmin` → `role`/`scopes` 기반으로 UF-001~004 + 003-A 전면 갱신. 관리자 관리 콘솔 흐름 신규 추가 (UF-SUPER-ADMIN-005~009: 콘솔 진입, 관리자 추가, 역할 변경, bot_operator 접근 거부, 비활성화). 재로그인 후 권한 반영 지연 엣지케이스 추가. `_index.md` super-admin 설명 갱신 |
| 2026-06-19 | role-panel | 신규 생성 | 패널 목록 조회, 새 패널 생성·저장, 패널 게시(신규), 패널 수정·재동기화, 패널 삭제(웹), GRANT 모드 역할 부여, TOGGLE 모드 역할 토글, 인증 게이트 동의 버튼 클릭(봇) 플로우 (UF-ROLE-PANEL-001~008). `_index.md` 목차 등재 |
| 2026-06-20 | settings-apply-model | 신규 생성 | 4개 도메인(status-prefix / sticky-message / role-panel / auto-channel) 저장→디스코드 반영 + 마지막 반영 시각 배지 + 다시 반영 유저플로우 (UF-SETTINGS-APPLY-001~011). role-panel 저장-게시 통합(게시 버튼 폐지), 비활성 상태 배지 처리, 채널 삭제/봇 권한 부족 실패 흐름, 메시지 삭제 감지 불가 정보성 흐름 포함. `_index.md` 목차 등재 |
| 2026-06-19 | voice | 신규 생성 | 일반 멤버 본인 음성 마이페이지 `/my/voice` 플로우 (UF-VOICE-MY-001~008). 마이페이지 진입, 빈 상태, 길드 선택 및 초기 로드, 길드 변경, 기간 변경, 해당 기간 활동 없음, 통계 컴포넌트 상세, 일반 멤버 로그인 후 라우팅 안내. F-VOICE-050/051/052 PRD 기반. `_index.md` 목차 등재 |
