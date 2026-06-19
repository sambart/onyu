# 슈퍼 관리자 콘솔 Phase 1 — 백엔드(api) 구현 계획

> 대상: `apps/api` 만. web 은 별도 계획(`docs/plans/super-admin-web.md` 예정).
> 입력: PRD `docs/specs/prd/super-admin.md` · Userflow `docs/specs/userflow/super-admin.md` · Usecase `docs/usecases/super-admin/UC-01~04` · Endpoint Spec `docs/specs/endpoint-spec/super-admin.md` · DB 설계 `docs/specs/database/_index.md#슈퍼-관리자-super-admin-도메인`.
> 마커: 🟨 미정 / 💬 정보성. (🔴 미사용 — 권한·개인정보 사전 승인 완료)
> 핵심 원칙: 완전 read-only(mutation 신설 금지), allowlist 기반 식별, 모든 열람 감사.

---

## 0. 코드베이스 사실 확인 (실제 코드 기준)

계획 작성 전 실제 코드를 읽고 확인한 사항(추측 아님):

| 항목 | 확인 결과 |
|---|---|
| 테스트 러너 | **Vitest** (`vi`, `Mocked` from `'vitest'`). Jest 아님 — `*.spec.ts` 는 vitest 컨벤션 따름 (`apps/api/src/bot-api/bot-api-auth.guard.spec.ts` 기준) |
| `AuthService` 의존성 | 현재 `JwtService` + `RedisService` 만 주입. **ConfigService 미주입** → 추가 필요 |
| `createToken(user)` 입력 | `{ discordId, username, avatar?, guilds? }`. `discordId` 는 `DiscordStrategy.validate` 의 `profile.id` 에서 옴 → PRD 의 `user.discordId` 와 일치 |
| JWT payload 현재 필드 | `{ sub, username, avatar, guilds }`. `isSuperAdmin` 없음 |
| `JwtStrategy.validate` 반환 | `{ discordId, username, avatar, guilds }` → `req.user` |
| `GuildMembershipGuard` | 전역 `APP_GUARD` (`app.module.ts` providers). `request.user as { guilds?: Array<{ id }> }` 로 멤버십 체크. `guildId` 없으면 통과 |
| `JwtAuthGuard` | `AuthGuard('jwt')` 단순 래퍼. 컨트롤러별 `@UseGuards(JwtAuthGuard)` 로 적용 (전역 아님) |
| 전역 Interceptor 등록 패턴 | `monitoring.module.ts` 가 `{ provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor }` 로 등록 → audit interceptor 도 **모듈 내 `APP_INTERCEPTOR`** 로 등록(동일 패턴) |
| Discord REST 길드목록 메서드 | `DiscordRestService` 에 "봇 참여 길드 전체 목록" 메서드 **없음** (`Routes.userGuilds()` 미사용). REST 방식 채택 시 신규 메서드 필요 |
| guild_member 테이블 | `guildId`/`userId`/`joinedAt`/`isBot`/`isActive` 보유. distinct `guildId` 집계로 봇 참여 길드 추정 가능. **단 길드명(name)/아이콘(icon) 컬럼 없음** |
| 길드명·아이콘 보강 | `DiscordRestService.fetchGuild(guildId)` → `APIGuild`(name, icon) 로 길드별 보강 가능 |
| env 검증 | `apps/api/src/config/env.validation.ts` Joi 스키마. `SUPER_ADMIN_IDS` 추가 지점 |
| 마이그레이션 import 스타일 | `import { type MigrationInterface, type QueryRunner } from 'typeorm'` (type import 분리) |
| 엔티티 스타일 | `@Entity({ name, schema: 'public' })` + `@Index(...)` 데코레이터, `@CreateDateColumn` 사용 |

### 🟨 경로 불일치 — `super-admin/` vs `admin/`

PRD·Userflow·DB 설계 문서는 신규 모듈 경로를 `apps/api/src/admin/` 으로 기재(예: `admin.module.ts`, `admin/audit/audit-log.orm-entity.ts`). 그러나 **본 계획의 작업 지시(코드 표면적)는 `apps/api/src/super-admin/`** 을 명시한다.

**결정**: 작업 지시를 우선하여 **`apps/api/src/super-admin/`** 로 신설한다. 문서상 `admin/` 참조는 추후 문서 갱신 대상(코드와 문서 정합). 라우트 경로(`/api/admin/guilds`)는 PRD/Endpoint Spec 대로 **유지**(디렉토리명과 URL 은 무관). DB 설계 문서의 "선행 조건"에 적힌 `apps/api/src/admin/...` 경로는 `apps/api/src/super-admin/...` 으로 읽는다.

---

## 1. 작업 범위 요약

| # | 작업 | 종류 | 파일 |
|---|---|---|---|
| A | env 스키마에 `SUPER_ADMIN_IDS` 추가 | 기존 수정 | `config/env.validation.ts` |
| B | `createToken` allowlist 대조 → JWT `isSuperAdmin` | 기존 수정 | `auth/application/auth.service.ts`, `auth/auth.module.ts`(ConfigService import 확인) |
| C | `JwtStrategy.validate` 에 `isSuperAdmin` 전달 | 기존 수정 | `auth/infrastructure/jwt.strategy.ts` |
| D | `GuildMembershipGuard` GET 우회 분기 | 기존 수정 | `common/guards/guild-membership.guard.ts` |
| E | `SuperAdminGuard` 신규 | 신규 | `super-admin/guards/super-admin.guard.ts` |
| F | `AuditLog` 엔티티 + repository | 신규 | `super-admin/infrastructure/*` |
| G | `AuditLogInterceptor` (비차단 기록) | 신규 | `super-admin/audit/audit-log.interceptor.ts` |
| H | `GET /api/admin/guilds` (controller/service/dto) | 신규 | `super-admin/presentation/*`, `super-admin/application/*`, `super-admin/dto/*` |
| I | `SuperAdminModule` (엔티티·인터셉터·컨트롤러 wiring) | 신규 | `super-admin/super-admin.module.ts` |
| J | `app.module.ts` 에 `SuperAdminModule` 등록 | 기존 수정 | `app.module.ts` |
| K | 마이그레이션 `1777300000000-AddSuperAdminAuditLog` | 신규 | `migrations/1777300000000-AddSuperAdminAuditLog.ts` |
| L | 테스트(가드 분기 매트릭스 6케이스 + 토큰 + 인터셉터) | 신규 | 각 `*.spec.ts` |

> 모든 경로는 워크트리 `E:\Workspace\onyu-super-admin-console` 기준. 위 표 밖 코드 생성/수정 없음.

### 신규 모듈 디렉토리 구조 (onyu DDD 레이어)

```
apps/api/src/super-admin/
├── super-admin.module.ts
├── guards/
│   ├── super-admin.guard.ts
│   └── super-admin.guard.spec.ts
├── presentation/
│   ├── admin-guild.controller.ts
│   └── admin-guild.controller.spec.ts        (선택 — 컨트롤러 얇으면 service spec 으로 대체)
├── application/
│   ├── admin-guild.service.ts
│   └── admin-guild.service.spec.ts
├── infrastructure/
│   ├── audit-log.orm-entity.ts
│   ├── audit-log.repository.ts
│   └── admin-guild.repository.ts             (guild_member distinct 집계 전용 read-only repo)
├── audit/
│   ├── audit-log.interceptor.ts
│   └── audit-log.interceptor.spec.ts
└── dto/
    └── admin-guild.dto.ts
```

---

## 2. 단계별 구현

### Phase A — env 스키마 (`config/env.validation.ts`)

`envValidationSchema` 에 추가:

```ts
// Super Admin
SUPER_ADMIN_IDS: Joi.string().allow('').default(''),
```

- 쉼표 구분 Discord user ID 문자열. **미설정 안전** — `.allow('').default('')` 로 빈 문자열 허용(슈퍼 관리자 0명).
- 파싱(공백 trim·빈값 필터)은 런타임(`AuthService`)에서 수행. Joi 단계는 존재/타입만 보장.

---

### Phase B — `createToken` allowlist 대조 (`auth/application/auth.service.ts`)

**의존성 추가**: 생성자에 `private readonly configService: ConfigService` 주입(`@nestjs/config`).

**allowlist 파싱 헬퍼**(클래스 private 메서드 또는 모듈 상수 함수):

```ts
private parseSuperAdminIds(): Set<string> {
  const raw = this.configService.get<string>('SUPER_ADMIN_IDS', '');
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  );
}
```

**`createToken` 변경**: payload 에 `isSuperAdmin` 추가.

```ts
createToken(user: { discordId: string; username: string; avatar?: string; guilds?: DiscordGuild[] }) {
  const managedGuilds = /* 기존 동일 */;
  const superAdminIds = this.parseSuperAdminIds();
  const isSuperAdmin = superAdminIds.has(user.discordId);

  const payload = {
    sub: user.discordId,
    username: user.username,
    avatar: user.avatar,
    guilds: managedGuilds,
    isSuperAdmin,                 // 신규 — 항상 boolean (allowlist 미스 시 false)
  };
  return this.jwtService.sign(payload);
}
```

- **항상 boolean 포함**(PRD 의 "false 또는 필드 없음" 중 명시적 `false` 채택 — 하위호환·디버깅 명확성). 기존 토큰(필드 없음)은 strategy 단계에서 `?? false` 로 흡수(Phase C).
- 함수 50줄/중첩 3단계 준수. 파싱은 헬퍼로 분리.

**`auth/auth.module.ts`**: `AuthService` provider 그대로. `ConfigModule` 은 `BaseConfig` 가 `isGlobal: true` 이므로 별도 import 불필요(ConfigService 전역 주입 가능). → **모듈 수정 불필요 가능성 높음**. 작업 시 ConfigService 주입이 정상 resolve 되는지만 확인(안 되면 `imports: [ConfigModule]` 추가).

---

### Phase C — `JwtStrategy.validate` (`auth/infrastructure/jwt.strategy.ts`)

payload 타입과 반환에 `isSuperAdmin` 추가:

```ts
async validate(payload: {
  sub: string;
  username: string;
  avatar?: string;
  guilds?: Array<{ id: string; name: string; icon: string | null }>;
  isSuperAdmin?: boolean;          // 신규 — optional (기존 토큰 하위호환)
}) {
  return {
    discordId: payload.sub,
    username: payload.username,
    avatar: payload.avatar,
    guilds: payload.guilds ?? [],
    isSuperAdmin: payload.isSuperAdmin ?? false,   // 신규 — 없으면 false
  };
}
```

- `req.user.isSuperAdmin` 가 항상 boolean 으로 보장됨(가드/인터셉터가 안전하게 참조).

---

### Phase D — `GuildMembershipGuard` GET 우회 (`common/guards/guild-membership.guard.ts`)

**확정 설계(방식 A)**: 멤버십 체크 직전에 슈퍼 관리자 GET 우회 분기 삽입. 일반 사용자 동작 불변.

`user` 타입 확장 + `request.method` 참조:

```ts
canActivate(context: ExecutionContext): boolean {
  const request = context.switchToHttp().getRequest<Request>();
  if (!request?.params) return true;

  const guildId = request.params['guildId'] as string | undefined;
  if (!guildId) return true;

  const user = request.user as
    | { guilds?: Array<{ id: string }>; isSuperAdmin?: boolean }
    | undefined;
  if (!user?.guilds) return true;   // 기존: 미인증/비-JWT 통과

  // 슈퍼 관리자 read-only 우회: GET 만 멤버십 무관 통과. non-GET 은 기존 멤버십 로직으로 낙하 → 비멤버 403
  if (user.isSuperAdmin === true && request.method === 'GET') {
    return true;
  }

  const hasAccess = user.guilds.some((g) => g.id === guildId);
  if (!hasAccess) {
    throw new ForbiddenException('해당 길드에 접근 권한이 없습니다.');
  }
  return true;
}
```

**분기 결과 검증**(Endpoint Spec §3 매트릭스와 일치):

| 액터 | method | 멤버십 | 결과 | 경로 |
|---|---|---|---|---|
| 슈퍼관리자 | GET | 비멤버 | ✅ 통과 | 우회 분기 |
| 슈퍼관리자 | non-GET | 비멤버 | ⛔ 403 | 우회 미적용 → `hasAccess=false` → 403 |
| 슈퍼관리자 | GET | 멤버 | ✅ 통과 | 우회 분기(또는 멤버십 둘 다 통과) |
| 일반 | GET | 멤버 | ✅ 통과 | `hasAccess=true` |
| 일반 | any | 비멤버 | ⛔ 403 | `hasAccess=false` |

- ⚠️ **주의**: 우회는 read-only fail-closed 핵심. `=== true` 엄격 비교(undefined/false 모두 우회 안 함).
- non-GET 슈퍼관리자가 우연히 멤버인 경우는 기존 로직대로 통과(이건 일반 멤버십 권한이므로 정상 — read-only 강제는 "비멤버 슈퍼관리자"에 대한 것).
- 이 가드 1파일 외 다른 가드(`BotApiAuthGuard`, `SuperAdminGuard`) 영향 없음.

---

### Phase E — `SuperAdminGuard` 신규 (`super-admin/guards/super-admin.guard.ts`)

**위치 결정**: 기존 가드 위치 컨벤션은 두 가지 — 공통 가드는 `common/guards/`, 도메인 전용 가드는 도메인 모듈 내(예: `bot-api/bot-api-auth.guard.ts`). `SuperAdminGuard` 는 `/api/admin/*` 슈퍼 관리자 도메인 전용이므로 **`super-admin/guards/super-admin.guard.ts`** 에 둔다(PRD `admin/guards/super-admin.guard.ts` 의 super-admin 디렉토리 매핑).

```ts
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as { isSuperAdmin?: boolean } | undefined;
    if (user?.isSuperAdmin !== true) {
      throw new ForbiddenException('슈퍼 관리자 권한이 필요합니다.');
    }
    return true;
  }
}
```

- env 재조회 없음 — `JwtStrategy.validate` 가 전달한 `req.user.isSuperAdmin` 만 신뢰(Endpoint Spec §4).
- 적용 순서: `@UseGuards(JwtAuthGuard, SuperAdminGuard)` — JwtAuthGuard 가 먼저 `req.user` 채움.

---

### Phase F — `AuditLog` 엔티티 + repository (`super-admin/infrastructure/`)

**`audit-log.orm-entity.ts`** (DB 설계 §AuditLog 그대로):

```ts
@Entity({ name: 'audit_log', schema: 'public' })
@Index('IDX_audit_log_admin', ['adminDiscordUserId'])
@Index('IDX_audit_log_guild', ['guildId'])
@Index('IDX_audit_log_created_at', ['createdAt'])
export class AuditLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  adminDiscordUserId: string;

  @Column({ type: 'varchar', nullable: true })
  guildId: string | null;

  @Column({ type: 'varchar', length: 10 })
  httpMethod: string;

  @Column({ type: 'varchar', length: 500 })
  requestPath: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
```

> 마이그레이션이 실제 DDL 의 source of truth(아래 Phase K). 엔티티 인덱스명·컬럼은 DB 설계 DDL 과 일치시킨다. `@Index` 의 DESC 표현은 데코레이터로 불가하므로 인덱스 정렬은 마이그레이션 DDL(`("createdAt" DESC)`)에서만 명시 — 엔티티는 단순 인덱스로 둠(기능 동일, synchronize 미사용 전제).

**`audit-log.repository.ts`**:

```ts
export interface AuditLogInput {
  adminDiscordUserId: string;
  guildId: string | null;
  httpMethod: string;
  requestPath: string;
}

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLogOrmEntity)
    private readonly repo: Repository<AuditLogOrmEntity>,
  ) {}

  async insert(input: AuditLogInput): Promise<void> {
    await this.repo.insert(input);   // createdAt 은 DB default(now)
  }
}
```

---

### Phase G — `AuditLogInterceptor` (`super-admin/audit/audit-log.interceptor.ts`)

**적용 범위**: `/api/admin/*` + 슈퍼 관리자의 `/api/guilds/:guildId/*` 요청. 전역 `APP_INTERCEPTOR` 로 등록하되 **인터셉터 내부에서 슈퍼 관리자 + 대상 경로 필터링**(코드 산포 없이 cross-cutting).

**확정 설계(비차단·실패 swallow + 로깅)**:

```ts
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);
  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    this.maybeRecord(req);    // 요청 진입 시점 기록(응답 성공·실패 무관하게 열람 행위 기록)
    return next.handle();
  }

  private maybeRecord(req: Request): void {
    const user = req.user as { discordId?: string; isSuperAdmin?: boolean } | undefined;
    if (user?.isSuperAdmin !== true) return;            // 슈퍼 관리자만
    if (!this.isAuditTarget(req.path)) return;          // /api/admin/* | /api/guilds/* 만

    const guildId = (req.params?.['guildId'] as string | undefined) ?? null;
    // fire-and-forget — 본 요청을 막지 않음
    this.auditLogRepository
      .insert({
        adminDiscordUserId: user.discordId ?? 'unknown',
        guildId,
        httpMethod: req.method,
        requestPath: req.path,
      })
      .catch((err) =>
        this.logger.warn(
          `audit log insert failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  private isAuditTarget(path: string): boolean {
    return path.startsWith('/api/admin/') || /^\/api\/guilds\/[^/]+/.test(path);
  }
}
```

**설계 결정**:
- **기록 시점**: 요청 진입 직후(`next.handle()` 전). 열람 "시도/행위" 자체를 기록 — 응답 성공 여부와 독립. (대안: `tap` 으로 응답 후 기록 시 200 만 기록되나, 감사 목적상 진입 기록이 더 안전. 진입 기록 채택.)
- **비차단**: `insert()` Promise 를 await 하지 않고 `.catch` 로 swallow → 기록 실패가 본 요청을 절대 막지 않음. PRD 비기능 "기록 실패 시 요청 차단 여부는 DB 설계에서 결정" → DB 설계 미명시 → **비차단(fire-and-forget) 채택**, 실패 시 `logger.warn`.
- **ESLint floating promise**: `.catch()` 체이닝으로 처리(반환 안 함). 필요 시 `void this.auditLogRepository.insert(...)` 패턴 + 내부 try/catch 로 대체 가능 — 구현 시 lint 통과 형태 선택.
- **guildId 없는 admin 엔드포인트**(`/api/admin/guilds`): `req.params.guildId` 없음 → `guildId = null` 기록(엣지케이스 §3 참조).
- **등록**: `super-admin.module.ts` 내 `{ provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor }` (monitoring.module 패턴 동일). 전역이지만 슈퍼 관리자·대상 경로 외에는 즉시 return → 일반 트래픽 오버헤드 무시 가능.

> ⚠️ 인터셉터 실행 순서: NestJS 에서 가드 → 인터셉터 순. `req.user` 는 `JwtAuthGuard`(컨트롤러 가드) 통과 후 채워짐. `/api/guilds/*` 컨트롤러들은 `@UseGuards(JwtAuthGuard)` 보유(예: OverviewController) → 인터셉터 시점에 `req.user` 존재. JwtAuthGuard 없는 경로(health 등)는 `user` 없음 → 기록 skip(정상).

---

### Phase H — `GET /api/admin/guilds`

**DTO** (`dto/admin-guild.dto.ts`) — Endpoint Spec `AdminGuildDto` 기준:

```ts
export interface AdminGuildDto {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number | null;
  joinedAt: string | null;     // ISO 8601 | null
}
```

> 응답 형태: PRD F-SUPER-ADMIN-004 는 `{ guilds: AdminGuildDto[], total: number }`, Endpoint Spec 은 `AdminGuildDto[]`. **PRD 의 `{ guilds, total }` 래퍼 채택**(total 은 프론트 빈목록·카운트 표시에 유용, userflow UF-002 가 "total" 참조). DTO 명: `AdminGuildListResponse { guilds: AdminGuildDto[]; total: number }`. 단, web 계획과 정합 필요 — web 계획에 이 응답 형태 명시.

**Repository** (`infrastructure/admin-guild.repository.ts`) — guild_member distinct 집계(read-only):

```ts
@Injectable()
export class AdminGuildRepository {
  constructor(
    @InjectRepository(GuildMemberOrmEntity)
    private readonly repo: Repository<GuildMemberOrmEntity>,
  ) {}

  // 봇 참여 길드 = guild_member 의 distinct guildId. memberCount = 활성 비봇 멤버 수.
  async findDistinctGuilds(): Promise<Array<{ guildId: string; memberCount: number }>> {
    const rows = await this.repo
      .createQueryBuilder('gm')
      .select('gm.guildId', 'guildId')
      .addSelect('COUNT(*) FILTER (WHERE gm.isActive = true AND gm.isBot = false)', 'memberCount')
      .groupBy('gm.guildId')
      .getRawMany<{ guildId: string; memberCount: string }>();
    return rows.map((r) => ({ guildId: r.guildId, memberCount: Number(r.memberCount) }));
  }
}
```

> `GuildMemberOrmEntity` 는 `@Global() GuildMemberModule` 소속이나 엔티티 자체는 `TypeOrmModule.forFeature([GuildMemberOrmEntity])` 를 super-admin.module 에 재등록해야 `@InjectRepository` 가능. (또는 GuildMemberRepository 에 distinct 메서드 추가 후 `GuildMemberModule` 이 export — **단, GuildMemberModule 수정은 다른 도메인 영향**이므로 §"다른 도메인 영향" 참조. 1차 권장: super-admin.module 에서 `forFeature([GuildMemberOrmEntity])` 재등록하여 super-admin 내부에 read-only repo 신설 — 다른 도메인 무수정.)

**Service** (`application/admin-guild.service.ts`):

```ts
@Injectable()
export class AdminGuildService {
  constructor(
    private readonly adminGuildRepository: AdminGuildRepository,
    private readonly discordRest: DiscordRestService,   // 길드명·아이콘 보강용
  ) {}

  async listGuilds(): Promise<AdminGuildListResponse> {
    const distinct = await this.adminGuildRepository.findDistinctGuilds();
    const guilds = await Promise.all(
      distinct.map(async ({ guildId, memberCount }) => {
        const meta = await this.discordRest.fetchGuild(guildId);  // null 가능
        return {
          id: guildId,
          name: meta?.name ?? guildId,          // 🟨 name 없으면 guildId fallback
          icon: meta?.icon ?? null,
          memberCount,
          joinedAt: null,                       // 🟨 봇 참여일 — 아래 §출처 결정 참조
        } satisfies AdminGuildDto;
      }),
    );
    return { guilds, total: guilds.length };
  }
}
```

**Controller** (`presentation/admin-guild.controller.ts`):

```ts
@Controller('api/admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminGuildController {
  constructor(private readonly adminGuildService: AdminGuildService) {}

  @Get('guilds')
  async listGuilds(): Promise<AdminGuildListResponse> {
    return this.adminGuildService.listGuilds();
  }
}
```

> `GuildMembershipGuard`(전역)는 `:guildId` path 파라미터 없으므로 자동 통과(Endpoint Spec §1).

---

### 길드 목록 데이터 출처 — 1차 권장안 (🟨 → 결정)

**1차 권장: DB `guild_member` distinct `guildId` 집계** (설치 비용 0, Discord API 추가 호출 없음).

| 후보 | 장점 | 단점 | 채택 |
|---|---|---|---|
| **① guild_member distinct (권장)** | 추가 Discord API 호출 0, 기존 테이블 재사용, 응답 1초 내(PRD 성능 요건 충족) | 멤버 0/미수집 길드 누락, 봇 퇴장 길드 잔류(isActive=false 만 남으면 집계서 제외 처리 가능), name/icon 별도 보강 필요 | ✅ |
| ② Discord REST `GET /users/@me/guilds` | 봇 실제 참여 최신 목록, name/icon/멤버수 일부 포함 | `DiscordRestService` 에 **신규 메서드 필요**(현재 없음), 길드 多 시 페이지네이션·rate limit, 봇 프로세스 의존 | 옵션 |

- **name·icon 보강**: ①은 길드명/아이콘 미보유 → `DiscordRestService.fetchGuild(guildId)` 로 길드별 보강(이미 존재하는 메서드). 길드 수 N 회 호출 → rate limit 우려 시 캐싱은 후속(Phase 1 범위 외, PRD 길드<1000 기준 허용). fetchGuild 실패 시 `name=guildId fallback`, `icon=null`.
- **memberCount**: `guild_member` 활성 비봇 카운트로 채움(null 아님). 단 길드별 멤버 미동기화 시 0 가능 → 그대로 0 반환(🟨 미수집 표기는 web).
- **joinedAt(봇 참여일)**: guild_member 에 "봇 자신의 joinedAt" 직접 없음(멤버 joinedAt 은 멤버별). 봇 참여일 정확 산출 불가 → **`null` 반환**(🟨 — DTO 가 null 허용. REST 옵션 ②도 `/users/@me/guilds` 응답에 봇 join 시각 미포함 → 동일하게 null). 정확 봇 참여일이 필요하면 후속 티켓.

> **결정 요약**: ① guild_member distinct + DiscordRest.fetchGuild 보강. joinedAt=null(🟨), memberCount=활성비봇수, name/icon=REST 보강(fallback 처리).

---

### Phase I — `SuperAdminModule` (`super-admin/super-admin.module.ts`)

```ts
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLogOrmEntity, GuildMemberOrmEntity]),
    AuthModule,            // JwtAuthGuard 사용
    DiscordRestModule,     // fetchGuild 사용 (전역이면 생략 가능 — 확인)
  ],
  controllers: [AdminGuildController],
  providers: [
    SuperAdminGuard,
    AdminGuildService,
    AdminGuildRepository,
    AuditLogRepository,
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class SuperAdminModule {}
```

- `DiscordRestModule` 전역 여부 확인(`app.module.ts` 에 직접 import 됨 → 전역 export 면 imports 생략, 아니면 명시 import). 구현 시 확인.
- `GuildMemberOrmEntity` 는 super-admin 내 read-only repo 용으로 `forFeature` 재등록(다른 도메인 무수정).

### Phase J — `app.module.ts` 등록

`imports` 배열에 `SuperAdminModule` 추가(1줄). 기존 `APP_GUARD`(GuildMembershipGuard) providers 변경 없음 — GuildMembershipGuard 수정은 Phase D 에서 파일 내부만.

---

### Phase K — 마이그레이션 `1777300000000-AddSuperAdminAuditLog.ts`

DB 설계 §"1777300000000-AddSuperAdminAuditLog" 의 up/down DDL 을 **그대로** 작성(이미 확정 DDL 제공됨).

- 파일: `apps/api/src/migrations/1777300000000-AddSuperAdminAuditLog.ts`
- class: `AddSuperAdminAuditLog1777300000000 implements MigrationInterface`
- `up()`: `CREATE TABLE audit_log` + 인덱스 3개(admin/guild/createdAt DESC) + COMMENT 들(DB 설계 DDL 복사)
- `down()`: 인덱스 3개 DROP → TABLE DROP
- 신규 테이블 생성만 — **파괴적 변경 없음**(DROP/컬럼제거 없음) → HITL 불필요.
- `gen_random_uuid()` PostgreSQL 15 빌트인 사용 가능.

**순서**: 엔티티(Phase F) 정의 → 마이그레이션 수기 작성(DDL 제공됨, generate 불필요) → `pnpm --filter @onyu/api migration:run` 으로 실행(implementer 가 Phase 7/검증 단계에서). 계획은 순서만 명시 — 실제 DB 적용은 implementer.

---

## 3. 예외/경계 처리 (edge cases)

| # | 상황 | 처리 |
|---|---|---|
| E1 | `SUPER_ADMIN_IDS` 미설정(env 없음) | Joi `.default('')` → 빈 문자열 → `parseSuperAdminIds()` = 빈 Set → 모든 사용자 `isSuperAdmin=false`. `/admin` 전원 403. 슈퍼 관리자 0명 정상 동작 |
| E2 | allowlist 공백/빈 토큰(`"123, ,456,"`) | `split(',').map(trim).filter(len>0)` → `{123,456}`. 빈 항목 무시 |
| E3 | 기존 JWT(필드 없음) 하위호환 | `JwtStrategy.validate` 의 `?? false` → `isSuperAdmin=false`. 가드/인터셉터 안전. 기존 사용자 영향 0 |
| E4 | allowlist 에서 제거된 사용자의 기존 토큰 | JWT 만료(1h) 전까지 `isSuperAdmin=true` 유지(userflow UF-004 명시). 재로그인 시 최신 allowlist 로 false 재발급. 의도된 동작(즉시 무효화는 Phase 1 범위 외) |
| E5 | 우회 후 audit 기록 실패 | 인터셉터 fire-and-forget + `.catch(logger.warn)`. 본 GET 응답 정상 반환(비차단). 감사 누락만 로그 |
| E6 | guildId 없는 admin 엔드포인트(`/api/admin/guilds`)의 audit | `req.params.guildId` 없음 → `guildId=null` 기록(DB nullable) |
| E7 | 슈퍼관리자 non-GET 비멤버 | GuildMembershipGuard 우회 미적용 → `hasAccess=false` → 403(fail-closed). 조회성 POST(`ai-insight`, `classify`)도 차단 |
| E8 | 봇 미참여 guildId 직접 접근(슈퍼관리자 GET) | 가드는 통과(우회), 하위 service 가 데이터 없음/빈 응답 반환. 가드 책임 아님 |
| E9 | `fetchGuild` 실패(rate limit/네트워크) | `name=guildId fallback`, `icon=null`. 목록 전체 실패 아님(Promise.all 내 각 항목 fetchGuild 가 null 반환 — DiscordRestService 가 throw 안 하고 null 반환) |
| E10 | guild_member 0행(봇 신규/미동기화) | distinct 빈 배열 → `{ guilds: [], total: 0 }`. userflow UF-002 빈 목록 상태 |
| E11 | 인터셉터 시점 `req.user` 없음(비-JWT 경로) | `user?.isSuperAdmin !== true` → 즉시 return, 기록 skip. health/metrics 등 영향 0 |

---

## 4. 테스트 관점

> 러너: **Vitest**(`vi`, `Mocked`). 기존 `bot-api-auth.guard.spec.ts` 패턴 따름(ConfigService 모킹, `makeContext` 헬퍼).

### 4.1 `GuildMembershipGuard` 분기 매트릭스 (6케이스) — `common/guards/guild-membership.guard.spec.ts`

| # | user | method | guildId | 기대 |
|---|---|---|---|---|
| T1 | `{isSuperAdmin:true, guilds:[]}` | GET | 비멤버 | `true`(우회) |
| T2 | `{isSuperAdmin:true, guilds:[]}` | POST | 비멤버 | `ForbiddenException` |
| T3 | `{isSuperAdmin:true, guilds:[{id:'g1'}]}` | GET | g1(멤버) | `true` |
| T4 | `{isSuperAdmin:false, guilds:[{id:'g1'}]}` | GET | g1(멤버) | `true` |
| T5 | `{isSuperAdmin:false, guilds:[]}` | GET | 비멤버 | `ForbiddenException` |
| T6 | `{isSuperAdmin:false, guilds:[]}` | DELETE | 비멤버 | `ForbiddenException` |

추가 회귀: guildId 없는 경로 통과, `request.params` 없는 non-HTTP 통과(기존 동작 보존).

### 4.2 `SuperAdminGuard` — `super-admin/guards/super-admin.guard.spec.ts`

- `isSuperAdmin=true` → `true`
- `isSuperAdmin=false` → `ForbiddenException`
- `isSuperAdmin` 없음(undefined) → `ForbiddenException`
- `req.user` 없음 → `ForbiddenException`

### 4.3 `AuthService.createToken` — `auth/application/auth.service.spec.ts`(신규 또는 보강)

- allowlist 포함 discordId → payload `isSuperAdmin:true`(JwtService.sign 인자 검증, sign mock)
- 미포함 → `isSuperAdmin:false`
- env 빈값 → 전원 false
- 공백·빈토큰 파싱(E2)

### 4.4 `JwtStrategy.validate` — `auth/infrastructure/jwt.strategy.spec.ts`(신규 또는 보강)

- payload 에 `isSuperAdmin:true` → 반환 `isSuperAdmin:true`
- payload 에 필드 없음 → 반환 `false`(하위호환)

### 4.5 `AuditLogInterceptor` — `super-admin/audit/audit-log.interceptor.spec.ts`

- 슈퍼관리자 + `/api/admin/guilds` → `repository.insert` 호출(guildId=null)
- 슈퍼관리자 + `/api/guilds/g1/overview` → insert(guildId='g1')
- 비-슈퍼관리자 → insert 미호출
- 대상 외 경로(`/health`) → insert 미호출
- insert reject → 본 요청 정상 진행(throw 없음), logger.warn 호출(E5)

### 4.6 `AdminGuildService` — `super-admin/application/admin-guild.service.spec.ts`

- distinct repo + fetchGuild mock → DTO 매핑 검증(name fallback, icon null, joinedAt null, memberCount 숫자)
- 빈 길드 → `{ guilds:[], total:0 }`(E10)
- fetchGuild null → name=guildId fallback(E9)

### 검증 명령

- `pnpm --filter @onyu/api test`
- `pnpm --filter @onyu/api lint`
- `pnpm --filter @onyu/api build`(타입체크)

---

## 5. 다른 도메인 영향

| 항목 | 영향 | 처리 |
|---|---|---|
| `GuildMembershipGuard`(common) 수정 | 전역 가드 — **모든 `:guildId` 라우트에 영향**. 단 변경은 슈퍼관리자 분기 추가뿐, 일반 사용자 경로 불변(T4/T5 회귀로 보장) | 본 계획 Phase D 에 포함. 일반 사용자 회귀 테스트 필수 |
| `GuildMemberModule`/엔티티 | super-admin 이 `GuildMemberOrmEntity` 를 `forFeature` 재등록(read-only). **GuildMemberModule 자체 무수정** | 다른 도메인 영향 없음(권장안). GuildMemberRepository 에 distinct 추가 대안은 채택 안 함 |
| `AuthService`/`JwtStrategy` 수정 | auth 도메인 내부. 웹의 `/auth/me` 가 `isSuperAdmin` 소비(web 계획) | 토큰 payload 추가는 하위호환(E3). web 계획에 `JwtPayload.isSuperAdmin` 반영 필요 |
| `AuditLogInterceptor` 전역 등록 | 모든 HTTP 요청이 인터셉터 통과. 비대상 즉시 return | 오버헤드 무시. 일반 트래픽 동작 불변 |

---

## 6. 범위 밖(구현 금지 재확인)

- mutation 엔드포인트 신설 금지. PRD "범위 제외"(기능 2·3~6·7, 감사 로그 조회 UI) 구현 금지.
- web 작업(`apps/web/app/admin/*`, `/auth/me` JwtPayload) — **별도 계획**. 본 계획은 api 만.
- 봇 참여일 정확 산출, 길드 메타 캐싱, audit 보존 TTL — 후속 티켓.

---

## 7. manifest 갱신 필요

**변경 종류**: (a) status 변경 + (b) `code.*` 경로 신설  — `super-admin` 도메인이 manifest 에 **이미 존재**한다고 가정(PRD/userflow/usecase/endpoint-spec/db 설계 모두 작성됨). 도메인 키 존재 여부는 implementer 가 Phase 7 에서 `docs/specs/feature-manifest.json` 확인 후 처리.

- **(a) status 변경**: `super-admin` — `not-started` → `scaffolded`
  (Phase 1 BE 일부 구현. web 미구현 상태이므로 `implemented` 아님. web 계획 완료 후 `implemented` 승격.)

- **(b) `code.*` 경로 신설** (도메인 `super-admin`):
  - `code.api`: `apps/api/src/super-admin`
  - `code.migrations`: `apps/api/src/migrations/1777300000000-AddSuperAdminAuditLog.ts`
  - `code.tests`:
    - `apps/api/src/super-admin/**/*.spec.ts`
    - `apps/api/src/common/guards/guild-membership.guard.spec.ts`
    - `apps/api/src/auth/application/auth.service.spec.ts`
    - `apps/api/src/auth/infrastructure/jwt.strategy.spec.ts`
  - (참고) 기존 수정 파일(별도 키 아님 — auth/common 도메인 소속): `auth/application/auth.service.ts`, `auth/infrastructure/jwt.strategy.ts`, `common/guards/guild-membership.guard.ts`, `app.module.ts`, `config/env.validation.ts`

- **(c) 신규 도메인 추가**: 해당 없음(super-admin 도메인 문서 일체 기존재). 단 manifest 에 도메인 키가 **없을 경우** implementer 는 아래로 신설:
  - `description`: 플랫폼 운영자의 read-only 전체 길드 열람 + 감사 로그 슈퍼 관리자 콘솔
  - `prd`: `/docs/specs/prd/super-admin.md`
  - `userflow`: `/docs/specs/userflow/super-admin.md`
  - `usecases`: `/docs/usecases/super-admin/`
  - `database`: `/docs/specs/database/_index.md#슈퍼-관리자-super-admin-도메인`
  - `code.api`: `apps/api/src/super-admin`
  - `code.web`: `apps/web/app/admin` (web 계획에서 신설 — 본 계획 범위 밖)
  - `code.migrations`: `apps/api/src/migrations/1777300000000-AddSuperAdminAuditLog.ts`
  - `code.tests`: 위 (b) 목록
  - `status`: `scaffolded`

> ⚠️ 문서(PRD/userflow/db)의 `apps/api/src/admin/` 경로는 본 계획에서 `apps/api/src/super-admin/` 으로 확정(§0 경로 불일치). manifest `code.api` 는 `super-admin` 사용. 문서 경로 표기 정합은 후속 docs 갱신 티켓.
