# Userflow 변경이력

> `docs/specs/userflow/` 산출물의 생성·수정·폐기 이력을 기록한다.
> 형식: `YYYY-MM-DD | 도메인 | 액션 | 내용`

---

| 날짜 | 도메인 | 액션 | 내용 |
|------|--------|------|------|
| 2026-06-19 | super-admin | 신규 생성 | `/admin` 콘솔 진입, 전체 길드 현황 조회, 특정 길드 read-only drill-in, mutation 차단, 권한 없는 접근 거부 플로우 (UF-SUPER-ADMIN-001~004 + 003-A). `feature-manifest.json` super-admin 도메인 등재, `_index.md` 목차 등재 |
| 2026-06-19 | super-admin | 갱신 | DB 기반 role/scopes 전환 반영: `isSuperAdmin` → `role`/`scopes` 기반으로 UF-001~004 + 003-A 전면 갱신. 관리자 관리 콘솔 흐름 신규 추가 (UF-SUPER-ADMIN-005~009: 콘솔 진입, 관리자 추가, 역할 변경, bot_operator 접근 거부, 비활성화). 재로그인 후 권한 반영 지연 엣지케이스 추가. `_index.md` super-admin 설명 갱신 |
| 2026-06-19 | voice | 신규 생성 | 일반 멤버 본인 음성 마이페이지 `/my/voice` 플로우 (UF-VOICE-MY-001~008). 마이페이지 진입, 빈 상태, 길드 선택 및 초기 로드, 길드 변경, 기간 변경, 해당 기간 활동 없음, 통계 컴포넌트 상세, 일반 멤버 로그인 후 라우팅 안내. F-VOICE-050/051/052 PRD 기반. `_index.md` 목차 등재 |
