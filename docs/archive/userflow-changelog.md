# Userflow 변경이력

> `docs/specs/userflow/` 산출물의 생성·수정·폐기 이력을 기록한다.
> 형식: `YYYY-MM-DD | 도메인 | 액션 | 내용`

---

| 날짜 | 도메인 | 액션 | 내용 |
|------|--------|------|------|
| 2026-06-19 | super-admin | 신규 생성 | `/admin` 콘솔 진입, 전체 길드 현황 조회, 특정 길드 read-only drill-in, mutation 차단, 권한 없는 접근 거부 플로우 (UF-SUPER-ADMIN-001~004 + 003-A). `feature-manifest.json` super-admin 도메인 등재, `_index.md` 목차 등재 |
| 2026-06-19 | role-panel | 신규 생성 | 패널 목록 조회, 새 패널 생성·저장, 패널 게시(신규), 패널 수정·재동기화, 패널 삭제(웹), GRANT 모드 역할 부여, TOGGLE 모드 역할 토글, 인증 게이트 동의 버튼 클릭(봇) 플로우 (UF-ROLE-PANEL-001~008). `_index.md` 목차 등재 |
