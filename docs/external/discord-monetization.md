# Discord App Monetization (Premium Apps) 연동 가이드

> 조사 기준일: 2026-05-31
> 대상 스택: NestJS 10 + discord.js 14 + discord-nestjs 5 (Onyu 모노레포)
> 1차 출처: [Discord Developer Docs — Monetization](https://docs.discord.com/developers/monetization/overview)

---

## 개요

Discord App Monetization(이하 Premium Apps)은 Discord 생태계 안에서 봇/앱 개발자가 유료 기능을 판매할 수 있는 인앱 결제 플랫폼이다. 사용자가 Discord를 떠나지 않고 구독/일회성 구매를 완료하며, Discord가 결제·세금·환불·사기 방지를 일괄 처리한다.

**Onyu와의 관련성**

| 도메인 | 활용 가능한 수익화 아이디어 |
|--------|---------------------------|
| gemini | AI 분석 리포트 월간 구독 (User Subscription) |
| voice | 고급 음성 통계/리포트 잠금 해제 (User/Guild Subscription) |
| inactive-member | 비활동 회원 자동 조치 고급 설정 (Guild Subscription) |
| best-friend | 베스트 프렌드 확장 분석 (User Subscription) |

> **결론 선요약**: 현재(2026-05 기준) Discord Premium Apps는 **미국·EU·영국 소재 개발자/팀에게만 개방**되어 있다. **한국(대한민국) 소재 팀은 수익화 활성화 불가**이며, 외부 결제(Stripe 해외 법인 경유 또는 MoR 서비스) 연동이 현실적 대안이다. 기술 연동 준비는 미리 완료해 두고 지역 지원 확대를 기다리는 접근이 권장된다.

---

## 1. 제품 종류 / SKU 모델

출처: [SKU Resource](https://docs.discord.com/developers/resources/sku), [Monetization Overview](https://docs.discord.com/developers/monetization/overview)

### 1-1. SKU 타입

| type 값 | 이름 | 설명 |
|---------|------|------|
| `2` | `DURABLE` | 영구 일회성 구매 (소유권 유지) |
| `3` | `CONSUMABLE` | 소비형 일회성 구매 (사용 후 소진) |
| `5` | `SUBSCRIPTION` | 반복 구독 (월간 자동 갱신) |
| `6` | `SUBSCRIPTION_GROUP` | `SUBSCRIPTION` 생성 시 자동 생성되는 그룹 컨테이너 (개발자가 직접 사용 안 함) |

> 현재 Discord는 **월간 구독만** 공식 지원한다. 연간 구독은 공식 확인 안 됨 — 확인 필요.

### 1-2. 구독 접근 범위 (SKU Flags)

| Flag | 비트 | 의미 |
|------|------|------|
| `AVAILABLE` | `1 << 2` | 구매 가능 상태 |
| `GUILD_SUBSCRIPTION` | `1 << 7` | 길드(서버) 구독 — 구매자 1인이 서버 전체 멤버에게 혜택 제공 |
| `USER_SUBSCRIPTION` | `1 << 8` | 유저 구독 — 구매자 본인이 모든 서버에서 혜택 수령 |

**User Subscription vs Guild Subscription 차이 요약**

| 구분 | User Subscription | Guild Subscription |
|------|------------------|-------------------|
| 구매 주체 | 개별 사용자 | 서버 관리자(1인) |
| 혜택 범위 | 구매자 개인 (전 서버) | 해당 서버 전 멤버 |
| Entitlement `guild_id` | null | 서버 ID |
| 적합한 사례 | AI 리포트 개인 이용권 | 서버 전체 프리미엄 봇 기능 |

### 1-3. 일회성 구매 (Durable / Consumable) 지원 여부

공식 문서 및 Overview에서 `DURABLE`(내구재)·`CONSUMABLE`(소비재) 두 유형 모두 지원함을 명시한다. 단, 현재 Discord Developer Portal에서 실제로 Durable/Consumable SKU를 직접 생성할 수 있는지의 UI 접근성은 **확인 필요** (지역 제한으로 직접 검증 불가).

---

## 2. 자격 요건 (Eligibility)

출처: [Enabling Monetization](https://docs.discord.com/developers/monetization/enabling-monetization)

### 2-1. 체크리스트

| 항목 | 요건 |
|------|------|
| 앱 검증 (Verification) | 앱이 Discord Verified 상태여야 함 |
| 팀 소유 | 앱은 개인이 아닌 팀(Team)이 소유해야 함 |
| 팀 소유자 연령 | 18세 이상 |
| 이메일 인증 | 팀 전원 이메일 인증 완료 |
| 2FA | 팀 전원 2FA(이중 인증) 활성화 |
| 슬래시 커맨드 | 슬래시 커맨드 사용 OR Message Content Privileged Intent 승인 |
| 정책 문서 | 앱에 이용약관·개인정보처리방침 링크 등록 |
| 유해 언어 없음 | 앱 이름·설명에 유해 표현 없음 |
| 결제 수단 | 유효한 Stripe 결제 수단으로 지급 설정 (팀 소유자만 가능) |
| 약관 동의 | Discord Monetization Terms + Discord Developer Policy 동의 |

### 2-2. 지원 국가 (핵심)

```
현재 지원: 미국(US), 유럽연합(EU), 영국(UK)
"Premium Apps is not currently available outside of these regions."
```

> **한국(대한민국) 소재 팀은 현재 수익화 활성화 불가.** 지역 확대 계획은 공식 Discord Developers 서버 및 Supported Locales 섹션에서 발표 예정이라고만 명시됨. 2026-05 기준 확대 일정 미공개.

### 2-3. 앱 검증(Verification) 요건 요약

- 75개 이상의 서버에 설치된 봇이어야 검증 신청 가능 (확인 필요 — Discord 공식 검증 기준은 변동 가능)
- 검증 이후 팀으로 이전 및 수익화 활성화 가능

---

## 3. 수수료 / 정산

출처: [Premium Apps Payout (한국어 번역 페이지)](https://support-dev.discord.com/hc/en-us/articles/17299902720919-Premium-Apps-Payout), [Discord Blog](https://discord.com/blog/premium-app-subscriptions-for-discord-developers)

### 3-1. Platform Fee (수수료)

| 구간 | Discord 수수료 | 개발자 수취 |
|------|---------------|------------|
| Growth Tier (누적 매출 $0 ~ $1M) | **15%** | 85% |
| Standard Tier (누적 매출 $1M 초과) | **30%** | 70% |

- 수수료 계산 기준: (총 결제액 - 거래세 - Payment Processing Fee - Transaction Fee) × 수수료율
- 환불·차지백 금액은 정산에서 차감

### 3-2. 결제 처리

- Discord가 직접 청구·결제·세금(소비세/VAT 포함)·환불·차지백을 처리
- 개발자는 별도 결제 게이트웨이 불필요 (지원 국가에서)
- 정산 처리 대행사: **Stripe** (개발자 수익은 Stripe를 통해 지급)

### 3-3. 지급 조건

| 항목 | 내용 |
|------|------|
| 최초 지급 기준 | 앱 전체 SKU 누적 매출 **$100 도달** 시 지급 자격 획득 |
| 정산 통화 | USD |
| 지급 주기 | 확인 필요 (공식 Payout 문서 접근 불가) |

### 3-4. 가격 설정

- Developer Portal에서 **USD 기준**으로 가격 설정
- Discord가 구매 시점에 사용자 지역 통화로 자동 환산
- 한국 원화(KRW)도 사용자 측 표시 통화로 지원됨 (개발자 설정과 무관)
- SKU별 가격 최솟값·최댓값: **확인 필요** (공식 문서에 명시 안 됨; 커뮤니티 예시로는 $2.99~$199.99 범위)
- SKU 수 제한: 앱당 최대 **50개**

---

## 4. 기술 연동 스펙

### 4-1. 연동 수단 결정

| 수단 | 사용 여부 | 근거 |
|------|---------|------|
| **SDK** (discord.js 14) | 사용 | Entitlement 클래스, Premium Button Builder, Gateway 이벤트 핸들링 |
| **API** (Discord REST) | 사용 | SKU 조회, Entitlement 목록/생성(테스트)/삭제, Subscription 조회 |
| **Webhook** | 미사용 | Discord는 수익화 관련 Webhook 미제공; Gateway 이벤트로 대체 |

### 4-2. 필요한 OAuth Scope / Intent

| 항목 | 값 | 비고 |
|------|-----|------|
| OAuth Scope | `identify` | 사용자 식별 (기존 auth 도메인과 동일) |
| Gateway Intent | 별도 Privileged Intent 불필요 | 엔타이틀먼트 이벤트는 기본 범위 내에서 수신됨 (공식 문서 미명시 — 확인 필요) |
| Bot Permission | 없음 | 수익화 API는 bot token만 있으면 접근 가능 |

### 4-3. SKU API

출처: [SKU Resource](https://docs.discord.com/developers/resources/sku)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `GET` | `/applications/{application.id}/skus` | 앱의 전체 SKU 목록 조회 |

응답에서 **type 5** (SUBSCRIPTION) SKU만 사용 — type 6 (SUBSCRIPTION_GROUP)은 자동 생성 컨테이너로 무시.

```typescript
// apps/bot/src/ — 봇에서 SKU 조회 예시 (discord-nestjs)
const skus = await client.application.fetchSKUs();
```

### 4-4. Entitlement API

출처: [Entitlement Resource](https://docs.discord.com/developers/resources/entitlement)

#### 엔드포인트 목록

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `GET` | `/applications/{app.id}/entitlements` | 필터 기반 목록 조회 |
| `GET` | `/applications/{app.id}/entitlements/{id}` | 단건 조회 |
| `POST` | `/applications/{app.id}/entitlements/{id}/consume` | Consumable 소진 처리 (204 반환) |
| `POST` | `/applications/{app.id}/entitlements` | **테스트용** Entitlement 생성 |
| `DELETE` | `/applications/{app.id}/entitlements/{id}` | **테스트용** Entitlement 삭제 (204 반환) |

#### GET /entitlements 쿼리 파라미터

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `user_id` | snowflake | 특정 유저 필터 |
| `sku_ids` | snowflake[] | 특정 SKU 필터 |
| `guild_id` | snowflake | 특정 길드 필터 |
| `before` | snowflake | 페이지네이션 |
| `after` | snowflake | 페이지네이션 |
| `limit` | int (1~100) | 반환 개수 |
| `exclude_ended` | bool | 만료된 항목 제외 |
| `exclude_deleted` | bool | 삭제된 항목 제외 |

#### Entitlement 오브젝트 주요 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | snowflake | 엔타이틀먼트 ID |
| `sku_id` | snowflake | 연결된 SKU |
| `application_id` | snowflake | 앱 ID |
| `user_id` | snowflake? | 유저 구독이면 유저 ID |
| `guild_id` | snowflake? | 길드 구독이면 길드 ID |
| `type` | int | 엔타이틀먼트 타입 (8가지) |
| `starts_at` | ISO8601? | 유효 시작 시각 |
| `ends_at` | ISO8601? | 유효 종료 시각 (갱신 전 null, 구독 종료 시 설정) |
| `consumed` | bool | 소비형 구매의 소진 여부 |
| `deleted` | bool | 삭제 여부 |

#### discord.js 14 Entitlement 클래스 주요 멤버

```typescript
entitlement.isActive()           // 현재 유효한 엔타이틀먼트인지
entitlement.isUserSubscription() // 유저 구독인지
entitlement.isGuildSubscription()// 길드 구독인지
entitlement.isTest()             // 테스트 엔타이틀먼트인지
entitlement.consume()            // Consumable 소진 (Promise<void>)
entitlement.fetchUser()          // 연결된 유저 조회
entitlement.endsAt               // Date | null
entitlement.startsAt             // Date | null
```

#### 테스트용 Entitlement 생성 (POST /entitlements)

```json
{
  "sku_id": "1234567890",
  "owner_id": "9876543210",
  "owner_type": 2
}
```

- `owner_type`: `1` = 길드, `2` = 유저
- 테스트 엔타이틀먼트는 결제 없이 생성되며 `starts_at`/`ends_at` 없음 (영구)

### 4-5. Subscription API

출처: [Subscription Resource](https://docs.discord.com/developers/resources/subscription)

> 주의: Subscription은 **보조 정보 목적**. 접근 권한 판단에는 반드시 **Entitlement**를 진실 공급원(source of truth)으로 사용할 것.

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| `GET` | `/skus/{sku.id}/subscriptions` | SKU 전체 구독 목록 (페이지네이션) |
| `GET` | `/skus/{sku.id}/subscriptions/{id}` | 단건 조회 |

#### Subscription 상태값

| status | 값 | 설명 |
|--------|-----|------|
| `ACTIVE` | `0` | 활성 중, 갱신 예정 |
| `ENDING` | `1` | 활성이지만 갱신 안 됨 (취소 후 기간 만료 대기) |
| `INACTIVE` | `2` | 비활성 (결제 실패·환불·만료) |

#### Subscription 주요 필드

| 필드 | 설명 |
|------|------|
| `current_period_start` | 현재 청구 사이클 시작 |
| `current_period_end` | 현재 청구 사이클 종료 (이 시점 이후 INACTIVE 전환) |
| `canceled_at` | 취소 시각 |
| `country` | 결제 수단 국가 코드 |
| `renewal_sku_ids` | 갱신 시 적용될 SKU 배열 |

### 4-6. Gateway 이벤트

출처: [Gateway Events](https://docs.discord.com/developers/events/gateway-events)

| 이벤트 | 트리거 | Payload |
|--------|--------|---------|
| `ENTITLEMENT_CREATE` | 사용자가 구독/구매 완료 시 | Entitlement 오브젝트 |
| `ENTITLEMENT_UPDATE` | 구독이 **종료**될 때 (`ends_at` 설정됨) | Entitlement 오브젝트 |
| `ENTITLEMENT_DELETE` | 환불·Discord 수동 삭제·앱이 테스트 엔타이틀먼트 삭제 시 | Entitlement 오브젝트 |

> 중요: `ENTITLEMENT_DELETE`는 **구독 만료 시에는 발생하지 않는다**. 만료는 `ENTITLEMENT_UPDATE`의 `ends_at` 설정으로 감지.

#### discord.js 14 이벤트 핸들링

```typescript
// apps/bot/src/event/ 에서 구현
client.on('entitlementCreate', (entitlement) => {
  // 구독/구매 완료 시 처리
});

client.on('entitlementUpdate', (oldEntitlement, newEntitlement) => {
  // ends_at 설정 = 구독 종료 예정
  if (newEntitlement.endsAt && !oldEntitlement?.endsAt) {
    // 구독 종료 처리
  }
});

client.on('entitlementDelete', (entitlement) => {
  // 환불/삭제 처리
});
```

#### discord-nestjs 패턴 (Onyu 스타일)

```typescript
// apps/bot/src/event/entitlement-create.handler.ts
@Injectable()
export class EntitlementCreateHandler {
  @On('entitlementCreate')
  async handle(entitlement: Entitlement): Promise<void> {
    // DB에 entitlement 기록 또는 캐시 무효화
  }
}
```

### 4-7. Premium Button (결제 유도 UI)

출처: [Component Reference](https://docs.discord.com/developers/components/reference)

Premium Button은 클릭 시 Discord 인앱 구매 플로우를 직접 열어주는 전용 버튼 스타일이다.

| 필드 | 값 |
|------|-----|
| `type` | `2` (버튼) |
| `style` | `6` (ButtonStyle.Premium) |
| `sku_id` | 구매 대상 SKU의 snowflake ID |

**제약사항**:
- `custom_id`, `label`, `url`, `emoji` 설정 불가
- 클릭 시 봇에 interaction 이벤트 오지 않음 (Discord가 직접 처리)
- 버튼에는 Discord가 자동으로 Shop 아이콘·SKU 이름·가격을 표시

**deprecated 여부**: Premium Button은 **현재 미deprecated**. 반면 구버전 `PREMIUM_REQUIRED` interaction response type(10)은 discord.js v15에서 제거됨 — **사용 금지**.

#### discord.js 14 코드

```typescript
import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';

const premiumButton = new ButtonBuilder()
  .setStyle(ButtonStyle.Premium)
  .setSKUId('YOUR_SKU_SNOWFLAKE_ID');

const row = new ActionRowBuilder<ButtonBuilder>()
  .addComponents(premiumButton);

await interaction.reply({
  content: '이 기능은 프리미엄 구독이 필요합니다.',
  components: [row],
  ephemeral: true,
});
```

### 4-8. Interaction Payload의 Entitlement 확인

커맨드·버튼 인터랙션 payload에는 `entitlements` 배열이 포함된다. 이를 통해 API 호출 없이 즉시 접근 권한 판단 가능.

```typescript
// discord-nestjs @SlashCommand 핸들러 내부
@SlashCommand({ name: '리포트', description: 'AI 음성 분석 리포트' })
async handleReport(@InteractionEvent() interaction: ChatInputCommandInteraction): Promise<void> {
  const entitlements = interaction.entitlements;
  const hasSubscription = entitlements.some(
    (e) => e.skuId === PREMIUM_SKU_ID && e.isActive(),
  );

  if (!hasSubscription) {
    const premiumButton = new ButtonBuilder()
      .setStyle(ButtonStyle.Premium)
      .setSKUId(PREMIUM_SKU_ID);

    await interaction.reply({
      content: '이 기능은 프리미엄 구독이 필요합니다.',
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(premiumButton)],
      ephemeral: true,
    });
    return;
  }

  // 프리미엄 기능 실행
}
```

### 4-9. 구독 수명주기 요약

```
사용자 결제 완료
  → ENTITLEMENT_CREATE (ends_at: null)
  → 구독 활성 상태 유지

사용자 취소
  → Subscription.status: ENDING
  → 기간 만료 시 ENTITLEMENT_UPDATE (ends_at 설정됨)
  → 이후 ends_at 경과 → 접근 불가 (isActive() = false)

결제 실패
  → Subscription.status: ACTIVE 유지 (재시도 중)
  → 재시도 기간(플랫폼에 따라 30~60일) 경과 후 INACTIVE
  → ENTITLEMENT_UPDATE (ends_at 설정됨)

환불
  → ENTITLEMENT_DELETE (즉시)
  → Subscription.status: INACTIVE

테스트 엔타이틀먼트 삭제
  → ENTITLEMENT_DELETE
```

> **접근 권한 판단 원칙**: `entitlement.isActive()` 또는 `ends_at`이 null이거나 미래인지 확인. Subscription.status는 보조 참고용.

---

## 5. 테스트 방법

### 5-1. Test Entitlement (추천)

1. Developer Portal > 앱 > Monetization > SKU 선택
2. REST API로 테스트 엔타이틀먼트 생성:
   ```http
   POST /applications/{app.id}/entitlements
   Authorization: Bot {BOT_TOKEN}
   Content-Type: application/json

   {
     "sku_id": "{SKU_ID}",
     "owner_id": "{USER_ID_OR_GUILD_ID}",
     "owner_type": 2
   }
   ```
3. 봇에서 해당 유저로 커맨드 실행 → 프리미엄 기능 활성화 확인
4. 테스트 완료 후 삭제:
   ```http
   DELETE /applications/{app.id}/entitlements/{entitlement.id}
   ```

### 5-2. Team Member 100% 할인

팀 멤버는 실제 결제 플로우에서 100% 할인 적용됨 → 전체 구매 flow(버튼 클릭 → 구매 완료 → ENTITLEMENT_CREATE 이벤트) 검증 가능.

### 5-3. discord.js 14에서 테스트 엔타이틀먼트 생성

```typescript
// EntitlementManager.create() 사용
await client.application.entitlements.create({
  skuId: 'YOUR_SKU_ID',
  ownerId: 'USER_ID',
  ownerType: 2, // 1: guild, 2: user
});
```

---

## 6. 제약 및 리스크

### 6-1. 지역 제한 (가장 큰 제약)

한국 소재 팀은 **현재 수익화 활성화 불가**. 확대 일정 미공개. 기술 구현은 가능하나 실제 수익화는 불가.

### 6-2. 가격 동등 요건 (Price Parity, 2024-10-07 시행)

외부(웹사이트 등)에서 동일 상품을 판매 중이면 Discord Store 가격이 외부 가격보다 **높아서는 안 됨** (pre-tax 기준). Discord Store를 통해 반드시 구매 가능해야 함.

> Onyu가 외부 웹(예: 토스페이먼츠 또는 Paddle)을 통해 프리미엄 구독을 판매한다면, Discord Store에도 동일 가격 이하로 등록이 의무. 이 경우 Discord 수수료(15~30%)로 인해 외부 결제 수익이 더 높아지는 구조적 모순 발생.

### 6-3. 기타 정책 제한

- 도박·성인·유해 콘텐츠, 처방약, 주류·담배, 타인 IP 무단 사용 등 판매 금지 (Discord Monetization Policy)
- 결제 우회 유도 금지 (외부 결제 링크로 유도하며 Discord 수수료 회피하는 행위)
- SKU 변경·구독 업/다운그레이드 지원 여부: **확인 필요**

### 6-4. 플랫폼 종속(Lock-in) 리스크

- 모든 결제·고객 데이터는 Discord 측에서 관리됨 → 탈출 시 고객 데이터 이전 불가
- Discord가 수수료율·정책을 단독으로 변경 가능 (2024-10-07 Price Parity 정책 소급 시행이 선례)

---

## 7. 외부 결제 대안 비교

한국 소재 팀이 실제 수익화를 추진할 경우의 대안 비교.

| 항목 | Discord Premium Apps | Stripe (해외 법인 경유) | Paddle / Dodo (MoR) | 토스페이먼츠 |
|------|---------------------|----------------------|---------------------|-------------|
| **한국 개발자 가용 여부** | 불가 (2026-05 현재) | 해외 법인 필요 | 한국 개인/법인 가능 | 한국 법인 필요 |
| **수수료** | 15~30% | 2.9% + $0.30 | 4~5% + $0.40~$0.50 | 1.2~3.3% (카드) |
| **구매 경험** | Discord 내 원클릭 | 외부 웹으로 이탈 | 외부 웹으로 이탈 | 외부 웹으로 이탈 |
| **전환율** | 최고 (이탈 없음) | 낮음 | 낮음 | 낮음 |
| **결제·세금 처리** | Discord 전담 | 개발자 직접 | MoR 대행 | 개발자 직접 |
| **세금계산서/현금영수증** | 불가 | 불가 | 불가 | 가능 |
| **국내 간편결제** | 불가 | 불가 | 불가 | 카카오페이·네이버페이 등 가능 |
| **Price Parity 의무** | 해당 없음 | Discord에도 등록 의무 | Discord에도 등록 의무 | Discord에도 등록 의무 |
| **구현 복잡도** | 낮음 (Discord 처리) | 중간 | 낮음 (MoR 처리) | 중간 |
| **플랫폼 lock-in** | 높음 | 낮음 | 중간 | 낮음 |

### 대안별 시나리오 권장

| 시나리오 | 권장 방법 |
|----------|----------|
| 한국 사용자 중심, 세금계산서 필요 | 토스페이먼츠 + 웹 결제 (국내 B2B/법인 대상) |
| 글로벌 사용자, 빠른 시작, 법인 없음 | Paddle 또는 Dodo Payments (MoR) |
| Discord 생태계 전환율 극대화 | Discord Premium Apps 대기 (지역 확대 후) |
| 고매출(연 $100k+ USD) | 해외 법인 설립 + Stripe 직접 연동 |

> 참고: Lemon Squeezy는 2024년 7월 Stripe에 인수된 이후 신규 기능 개발 정체 — 신규 프로젝트에는 비권장.

---

## 8. Step-by-Step 구현 가이드 (지역 지원 확대 후 적용)

### Phase 1: Developer Portal 설정

1. [Discord Developer Portal](https://discord.com/developers/applications) 접속 → 앱 선택
2. **Monetization** 탭 → 자격 요건 체크리스트 확인
3. 팀 소유자: **Payout Settings** → Stripe 계정 연결
4. **SKU 생성**: Monetization > Manage SKUs > Add SKU
   - Name, Description, Image 입력
   - Type: Subscription
   - Scope: User 또는 Guild 선택
   - Price: USD 기준 입력
5. SKU의 `id`(snowflake) 복사 → 환경변수에 저장

### Phase 2: 환경변수 설정

```bash
# apps/bot/.env (또는 루트 .env)
DISCORD_PREMIUM_SKU_ID=your_sku_snowflake_id
```

### Phase 3: Bot 코드 구현

```typescript
// libs/shared/src/constants/discord.constants.ts
export const PREMIUM_SKU_ID = process.env.DISCORD_PREMIUM_SKU_ID ?? '';
```

```typescript
// apps/bot/src/event/entitlement-create.handler.ts
import { Injectable } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import type { Entitlement } from 'discord.js';

@Injectable()
export class EntitlementCreateHandler {
  @On('entitlementCreate')
  async handle(entitlement: Entitlement): Promise<void> {
    // 구독 시작 처리: DB 기록, 캐시 갱신 등
  }
}
```

```typescript
// apps/bot/src/event/entitlement-update.handler.ts
import { Injectable } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import type { Entitlement } from 'discord.js';

@Injectable()
export class EntitlementUpdateHandler {
  @On('entitlementUpdate')
  async handle(oldEntitlement: Entitlement | null, newEntitlement: Entitlement): Promise<void> {
    if (newEntitlement.endsAt && !oldEntitlement?.endsAt) {
      // 구독 종료 예정 처리
    }
  }
}
```

### Phase 4: 커맨드에서 접근 제어

```typescript
// apps/bot/src/command/report/report.command.ts
import { PREMIUM_SKU_ID } from '@onyu/shared';
import { ButtonBuilder, ButtonStyle, ActionRowBuilder, ChatInputCommandInteraction } from 'discord.js';

// 프리미엄 체크 헬퍼 함수
function hasPremiumAccess(interaction: ChatInputCommandInteraction): boolean {
  return interaction.entitlements.some(
    (e) => e.skuId === PREMIUM_SKU_ID && e.isActive(),
  );
}

// 커맨드 핸들러 내
if (!hasPremiumAccess(interaction)) {
  const button = new ButtonBuilder()
    .setStyle(ButtonStyle.Premium)
    .setSKUId(PREMIUM_SKU_ID);

  await interaction.reply({
    content: '이 기능은 프리미엄 구독이 필요합니다.',
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
    ephemeral: true,
  });
  return;
}
```

### Phase 5: 테스트

```bash
# 테스트 Entitlement 생성 (curl)
curl -X POST https://discord.com/api/v10/applications/{APP_ID}/entitlements \
  -H "Authorization: Bot {BOT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"sku_id":"{SKU_ID}","owner_id":"{YOUR_USER_ID}","owner_type":2}'
```

1. 위 명령 실행 후 봇에서 프리미엄 커맨드 실행 → 접근 가능 확인
2. 테스트 Entitlement 삭제 후 재시도 → 프리미엄 버튼 표시 확인
3. ENTITLEMENT_CREATE/UPDATE/DELETE 이벤트 로그 확인

---

## 9. 출처 목록

| 출처 | URL |
|------|-----|
| Discord Monetization Overview (공식) | https://docs.discord.com/developers/monetization/overview |
| Enabling Monetization (공식) | https://docs.discord.com/developers/monetization/enabling-monetization |
| Implementing App Subscriptions (공식) | https://docs.discord.com/developers/monetization/implementing-app-subscriptions |
| SKU Resource (공식) | https://docs.discord.com/developers/resources/sku |
| Entitlement Resource (공식) | https://docs.discord.com/developers/resources/entitlement |
| Subscription Resource (공식) | https://docs.discord.com/developers/resources/subscription |
| Gateway Events — Entitlement (공식) | https://docs.discord.com/developers/events/gateway-events |
| Component Reference — Premium Button (공식) | https://docs.discord.com/developers/components/reference |
| Premium Apps & Activities (공식) | https://docs.discord.com/developers/platform/app-monetization |
| Discord Blog — Premium App Subscriptions (공식) | https://discord.com/blog/premium-app-subscriptions-for-discord-developers |
| discord.js v14 Entitlement 클래스 | https://discord.js.org/docs/packages/discord.js/14.19.1/Entitlement:Class |
| discord.js PremiumButtonBuilder | https://discord.js.org/docs/packages/builders/main/PremiumButtonBuilder:Class |
| Premium Apps Payout (개발자 지원) | https://support-dev.discord.com/hc/en-us/articles/17299902720919-Premium-Apps-Payout |
| Premium App FAQ (사용자 지원) | https://support-apps.discord.com/hc/en-us/articles/26501767768471-Premium-App-FAQ |
| Discord Monetization Policy (공식) | https://support.discord.com/hc/en-us/articles/10575066024983-Monetization-Policy |
| A Guide to Discord Premium Apps (Mava, 2025) | https://www.mava.app/blog/a-guide-to-discord-premium-apps-and-setting-up-your-discord-store |
| 한국에서 Stripe 사용 가능? (인블로그, 2026) | https://inblog.ai/ko/blog/stripe-in-korea |
| Stripe 없이 살아남기: 한국 SaaS의 글로벌 결제 전략 (매쉬업벤처스) | https://www.mashupventures.co/contents/global-payment-solutions-for-saas-startups |
