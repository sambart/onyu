# Auto 채널 누수/로그/Dead code 수정 계획

> 도메인: voice(auto-channel) · 규모: M · 브랜치: `fix/auto-channel-leak`
> 코드 표면적: `apps/api/src/channel/auto/**`, `apps/api/src/discord-rest/**`, `apps/api/src/redis/**`, `apps/api/src/channel/auto/application/auto-channel-sweep.scheduler.ts`, `apps/bot/src/event/auto-channel/**`
> DB 변경 없음 · PRD 변경 없음 · 신규 엔드포인트 없음

## 배경 (버그 검토 결과)

1. **High — 12h TTL 만료로 장기 점유 채널 영구 누수**: 확정방 Redis 상태(`auto_channel:confirmed:{channelId}`)의 TTL이 12h 고정이며 생성 시 1회만 설정. 채널이 12h 넘게 점유되면 점유 중 키 만료 → 이후 빈 채널이 돼도 `handleChannelEmpty`가 state=null로 일반 채널 취급해 삭제 안 함. sweep의 `scanConfirmedChannelIds`도 존재하는 키만 스캔하므로 백스톱도 실패.
2. **High — sweep의 일시 오류 오판**: `discordRest.fetchChannel`이 404뿐 아니라 모든 오류(429/5xx/네트워크)에서 `null` 반환. sweep `cleanupOrphan`/`retryDelete`가 이를 "채널 없음"으로 해석 → 살아있는 채널의 Redis state 삭제 → 위 1번과 동일 누수.
3. **Low — PII/디버그 로그가 운영 레벨**: 정상 흐름 로그가 `warn`/`log`로 PII(displayName·userId) 평문 출력. 현 보안 하드닝 방향과 상충 + 노이즈.
4. **Low — dead code**: interaction 직접 경로(`handleButtonClick`/`handleSubOptionClick`/`convertToConfirmed` + 전용 헬퍼)는 봇이 API 경로(`*FromBot`)를 쓰면서 미사용. 테스트도 없음.

## 변경 상세

### Fix A — sweep 오판 차단 (`probeChannel` 신규)

**`apps/api/src/discord-rest/discord-rest.service.ts`**
- 기존 `fetchChannel`은 **변경하지 않는다** (status-prefix·gateway 호출처 회귀 방지).
- 신규 메서드 추가:
  ```ts
  /**
   * 채널 존재 여부를 3-state로 판별한다 (sweep 백스톱 전용).
   * - 'gone'   : 404 / Unknown Channel — 확실히 존재하지 않음
   * - 'exists' : 정상 조회됨
   * - 'unknown': 일시 오류(429/5xx/네트워크) — 판단 보류 (호출자가 손대지 않음)
   */
  async probeChannel(channelId: string): Promise<'exists' | 'gone' | 'unknown'> {
    try {
      await this.rest.get(Routes.channel(channelId));
      return 'exists';
    } catch (error) {
      if (this.isAlreadyGone(error)) return 'gone';
      this.logger.warn(`probeChannel transient error: channel=${channelId} ${this.describeError(error)}`);
      return 'unknown';
    }
  }
  ```
  (`isAlreadyGone`/`describeError`는 기존 private 메서드 재사용)

### Fix B — TTL 누수 차단 (heartbeat + TTL 상향)

**`apps/api/src/redis/redis.service.ts`**
- 신규 메서드 추가 (ioredis `expire` 위임):
  ```ts
  /** 기존 키의 TTL을 갱신한다 (키가 없으면 no-op). */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds); // 실제 client 필드명은 기존 set/get 구현 참조
  }
  ```
  > 주의: redis client 내부 필드명(예: `this.redis`/`this.client`)은 기존 `set`/`del` 구현을 그대로 따른다.

**`apps/api/src/channel/auto/infrastructure/auto-channel-redis.repository.ts`**
- `TTL.CONFIRMED`를 12h → **7일**(`60 * 60 * 24 * 7`)로 상향 (sweep 다운타임 안전 마진).
- 신규 메서드:
  ```ts
  /** 확정방 상태 TTL 갱신 (sweep heartbeat). */
  async refreshConfirmedTtl(channelId: string): Promise<void> {
    await this.redis.expire(AutoChannelKeys.confirmed(channelId), TTL.CONFIRMED);
  }
  ```

### Fix C — sweep 로직 수정 (`probeChannel` + heartbeat 적용)

**`apps/api/src/channel/auto/application/auto-channel-sweep.scheduler.ts`**
- `DiscordRestService.probeChannel` 사용으로 전환.
- `retryDelete`:
  - `'gone'` → Redis/큐 정리 후 `'cleaned'`
  - `'exists'` → delete 재시도 (성공 시 정리/`'cleaned'`, 실패 시 `'failed'`)
  - `'unknown'` → **큐 유지** `'failed'` (다음 sweep 재시도)
- `cleanupOrphan`:
  - `'gone'` → Redis state/큐 삭제 후 `true`
  - `'exists'` → **`refreshConfirmedTtl(channelId)` 호출(heartbeat)** 후 `false`
  - `'unknown'` → 손대지 않고 `false`
- sweep 요약 로그에 heartbeat 갱신 수(`refreshed`) 추가(선택).

> 결과: 살아있는 확정방은 매 sweep(5분)마다 TTL이 7일로 리셋 → 점유 기간과 무관하게 만료되지 않음. 일시 오류 시에는 절대 삭제하지 않음.

### Fix D — PII/디버그 로그 정리

- **`apps/api/src/bot-api/auto-channel/bot-auto-channel.controller.ts`** L61/L63: `warn([BUTTON-CLICK] dto=${JSON.stringify(dto)})` / result 로그 제거. 필요 시 PII 없는 `debug(buttonId만)` 수준으로만.
- **`apps/bot/src/event/auto-channel/bot-auto-channel-interaction.handler.ts`** L58-60: `warn(... displayName=...)` → `debug`로 강등 + displayName/userId 제거(채널 유무 등 비식별 정보만, 또는 라인 삭제).
- **`apps/api/src/channel/auto/infrastructure/auto-channel-discord.gateway.ts`** L71-79: `[EDIT]` payload/result 덤프 `log` → `debug` 강등.

### Fix E — dead code 제거 (interaction 직접 경로)

**`apps/api/src/channel/auto/application/auto-channel.service.ts`**
- 제거: `handleButtonClick(interaction)`, `handleSubOptionClick(interaction)`, `convertToConfirmed`(interaction 버전), `buildVoiceStateDtoFromMember`, `buildSubOptionActionRows`(interaction 전용).
- **유지**: `handleButtonClickFromBot`, `handleSubOptionClickFromBot`, `convertToConfirmedFromBot`, `handleInstantTriggerJoin`, `handleChannelEmpty`, `sendOrUpdateGuideMessage`, `buildChannelName`, `resolveChannelName`, `buildInstantChannelName`, `cacheAutoChannelInfo`, `deleteConfirmedChannel`, `clearPendingDelete`.
- 그 결과 미사용이 되는 의존성/임포트 정리:
  - 생성자에서 `VoiceChannelService` 주입 제거(다른 곳에서 미사용 확인 후). `VoiceRedisRepository`·`DiscordVoiceGateway`·`AutoChannelDiscordGateway`는 **유지**(봇/instant/guide 경로에서 사용).
  - 미사용 import 제거: `ActionRowBuilder`, `ButtonBuilder`, `ButtonInteraction`, `ButtonStyle`, `GuildMember`(discord.js), `VoiceStateDto`, `BUTTONS_PER_ROW`/`CUSTOM_ID_SUB_OPTION_PREFIX` 중 interaction 전용 상수.
- **테스트 동기화**: `auto-channel.service.spec.ts`의 provider 목록에서 제거된 의존성(`VoiceChannelService` 등) mock 정리. spec은 `*FromBot` 경로만 검증하므로 interaction 메서드 테스트는 원래 없음(추가 삭제 불필요).

> ⚠️ 제거 전 `VoiceChannelService`가 auto 모듈/spec 외에서 참조되지 않는지 재확인. 봇 경로(`convertToConfirmedFromBot`)는 onUserJoined를 호출하지 않으므로 auto 도메인 내 onUserJoined 호출은 interaction 경로뿐.

## 검증

- `pnpm --filter @onyu/api lint && pnpm --filter @onyu/api build`
- `pnpm --filter @onyu/api test` (auto-channel + sweep + redis repo spec)
- 봇 변경분: `pnpm --filter @onyu/bot lint && pnpm --filter @onyu/bot build`

## 테스트 추가 (Phase 6)

- sweep: `probeChannel`이 `'unknown'` 반환 시 **state 삭제/큐 제거가 일어나지 않음** 검증(회귀 핵심).
- sweep: `'exists'` 반환 시 `refreshConfirmedTtl` 호출 검증(heartbeat).
- sweep: `'gone'` 반환 시 정리 검증.
- redis repo: `refreshConfirmedTtl`이 `expire` 위임 + TTL 7일 상수 검증.
- discord-rest: `probeChannel` 3-state 매핑(404→gone / 성공→exists / 기타→unknown).

## 마커

- 🔴 없음 (법무/결제/권한/DB 파괴적 변경 없음). DB·마이그레이션 무변경. 권한(IDOR)은 본 작업 범위 제외(별도 트랙).
