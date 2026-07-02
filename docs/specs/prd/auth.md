> 변경이력: [prd-changelog.md](../../archive/prd-changelog.md)

# Auth 도메인 PRD

## 개요
웹 대시보드 접근을 위한 Discord OAuth2 인증과 JWT 세션 관리를 담당한다.

## 관련 모듈
- `apps/api/src/auth/application/auth.service.ts` — JWT 토큰 생성/검증
- `apps/api/src/auth/auth.module.ts` — JwtModule 설정
- `apps/api/src/auth/infrastructure/jwt.strategy.ts` — JWT 검증 전략 (payload 파싱)
- `apps/web/app/auth/discord/route.ts` — Discord OAuth 시작
- `apps/web/app/auth/callback/route.ts` — OAuth 콜백 처리
- `apps/web/app/auth/me/route.ts` — 웹 사이드 현재 사용자 정보 API (JwtPayload 타입 포함)

## 기능 상세

### F-AUTH-001: Discord OAuth2 로그인
- **흐름**:
  1. 웹 대시보드에서 "시작하기" 클릭
  2. Discord OAuth2 인증 페이지로 리다이렉트
  3. 인증 완료 후 콜백 URL로 리다이렉트
  4. 콜백에서 access token 교환
  5. createToken() 내부에서 admin_user 테이블 조회 → role + scopes 산출 후 JWT payload에 포함
- **스코프**: identify (기본)

### F-AUTH-002: JWT 세션 관리
- **토큰 설정**: 1~2시간 만료 권장 (🔒 관리자 권한 변경이 재로그인/토큰만료 후에만 반영되므로 TTL을 짧게 유지)
- **시크릿**: 환경변수 `JWT_SECRET`
- **용도**: API 요청 인증

#### JWT Payload 구조 (DB 기반 role/scope 전환 후)

```ts
interface JwtPayload {
  sub: string;          // Discord user ID
  username: string;
  avatar: string | null;
  guilds: string[];     // 사용자가 속한 길드 ID 목록
  role: 'super_admin' | 'bot_operator' | null;  // admin_user 테이블 조회 결과
  scopes: string[];     // role별 기본 permission scope 배열 (예: ['guild:view', 'admin:manage'])
}
```

**role/scopes 산출 규칙** (createToken() 내 DB 조회):
1. `admin_user` 테이블에서 `discordUserId` 조회
2. 레코드 없음 → `role: null`, `scopes: []`
3. 레코드 있고 `isActive=true` → role 반환 + role별 기본 scope 배열 산출 (`permissions` 컬럼 값 있으면 override)
4. 레코드 있고 `isActive=false` → `role: null`, `scopes: []`

> 🔒 권한 변경(역할 변경, 비활성화)은 현재 발급된 JWT가 만료되거나 재로그인 시에만 반영된다. 즉시 회수가 필요한 경우 `isActive=false` 처리 후 TTL(1~2h) 대기. 추후 Redis 토큰 블랙리스트 도입으로 즉시 회수 가능 — 현재 범위 밖.

**이전 payload (v6.5 이하)**:
```ts
{ sub, username, avatar, guilds, isSuperAdmin: boolean }
```

**전환 후 payload**:
```ts
{ sub, username, avatar, guilds, role: 'super_admin'|'bot_operator'|null, scopes: string[] }
```

## API 보안 계층

### Rate Limiting
- **전역**: `@nestjs/throttler` 기반 60 req/min
- **auth 엔드포인트**: 20 req/min
- **voice-analytics 엔드포인트**: 10 req/min
- **bot-api(봇→API 내부 호출)**: rate limit 제외 (`@SkipThrottle()`) — `BotApiAuthGuard` 토큰으로 보호되는 단일 신뢰 클라이언트라, 봇 단일 IP가 전역 버킷을 공유해 동기화가 유실되는 것을 방지

### 보안 헤더
- `helmet` 미들웨어 적용 (CSP, X-Frame-Options, HSTS 등)

### Guild 접근 제어
- **Guard**: `GuildMembershipGuard`
- **동작**: JWT 페이로드의 `guilds` 목록과 요청 `guildId`를 대조하여 멤버 여부 검증
- **적용 범위**: `/api/guilds/:guildId/*` 엔드포인트 전역 적용
- **관리자 우회**: `req.user.role`이 null이 아닌 경우(admin_user 등록된 관리자) + HTTP method가 GET이면 길드 멤버십 체크를 우회한다. non-GET은 403 반환 (read-only fail-closed). 상세 정책은 super-admin.md F-SUPER-ADMIN-002 참조.

## 환경변수
| 변수 | 용도 |
|------|------|
| JWT_SECRET | JWT 서명 키 |
| DISCORD_CLIENT_ID | OAuth 앱 ID |
| DISCORD_CLIENT_SECRET | OAuth 앱 시크릿 |
