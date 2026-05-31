# Auth 도메인 PRD

## 개요
웹 대시보드 접근을 위한 Discord OAuth2 인증과 JWT 세션 관리를 담당한다.

## 관련 모듈
- `apps/api/src/auth/auth.service.ts` — JWT 토큰 생성/검증
- `apps/api/src/auth/auth.module.ts` — JwtModule 설정
- `apps/web/app/auth/discord/route.ts` — Discord OAuth 시작
- `apps/web/app/auth/callback/route.ts` — OAuth 콜백 처리

## 기능 상세

### F-AUTH-001: Discord OAuth2 로그인
- **흐름**:
  1. 웹 대시보드에서 "시작하기" 클릭
  2. Discord OAuth2 인증 페이지로 리다이렉트
  3. 인증 완료 후 콜백 URL로 리다이렉트
  4. 콜백에서 access token 교환
- **스코프**: identify (기본)

### F-AUTH-002: JWT 세션 관리
- **토큰 설정**: 1시간 만료
- **시크릿**: 환경변수 `JWT_SECRET`
- **용도**: API 요청 인증

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

## 환경변수
| 변수 | 용도 |
|------|------|
| JWT_SECRET | JWT 서명 키 |
| DISCORD_CLIENT_ID | OAuth 앱 ID |
| DISCORD_CLIENT_SECRET | OAuth 앱 시크릿 |
