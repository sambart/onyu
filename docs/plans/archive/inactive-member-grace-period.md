# 비활동 회원 분류 신입 유예 기간 (gracePeriodDays) 구현 계획

## 개요

서버에 새로 가입한 멤버가 일정 기간(gracePeriodDays) 동안 비활동 분류 대상에서 제외되도록 한다.
마이그레이션 및 ORM 엔티티 변경은 이미 완료되었으므로, 서비스 로직/DTO/Repository/FE 설정 페이지/API 타입만 수정한다.

---

## 1. 분류 서비스 수정

**파일**: `apps/api/src/inactive-member/application/inactive-member.service.ts`
**메서드**: `classifyGuild`

### 변경 위치

63~66행의 `targetMembers` 필터 로직 직후에 유예 기간 필터링을 추가한다.

### 변경 전

```typescript
const targetMembers = members.filter(
  (m: APIGuildMember) =>
    !m.user?.bot && !config.excludedRoleIds.some((roleId) => m.roles.includes(roleId)),
);
```

### 변경 후

```typescript
const targetMembers = members.filter((m: APIGuildMember) => {
  if (m.user?.bot) return false;
  if (config.excludedRoleIds.some((roleId) => m.roles.includes(roleId))) return false;

  // 신입 유예 기간: joined_at이 존재하고 유예 기간 내이면 분류 대상에서 제외
  if (config.gracePeriodDays > 0 && m.joined_at) {
    const joinedAt = new Date(m.joined_at);
    const graceCutoff = new Date();
    graceCutoff.setDate(graceCutoff.getDate() - config.gracePeriodDays);
    if (joinedAt > graceCutoff) return false;
  }

  return true;
});
```

### 동작 규칙

| 조건 | 결과 |
|------|------|
| `gracePeriodDays === 0` | 유예 없음, 모든 멤버 분류 대상 |
| `gracePeriodDays > 0` && `joined_at`이 유예 기간 내 | 분류 대상에서 **제외** |
| `gracePeriodDays > 0` && `joined_at`이 null | 분류 대상에 **포함** (유예 적용 불가) |

---

## 2. 설정 저장 DTO 수정

**파일**: `apps/api/src/inactive-member/dto/inactive-member-config-save.dto.ts`

### 추가 위치

기존 `decliningPercent` 필드 뒤 (17행 이후)에 추가한다.

### 추가 코드

```typescript
@IsOptional()
@IsInt()
@Min(0)
@Max(30)
gracePeriodDays?: number;
```

`Max` 데코레이터는 이미 import 되어 있으므로 추가 import 불필요하다.

---

## 3. Repository upsertConfig 수정

**파일**: `apps/api/src/inactive-member/infrastructure/inactive-member.repository.ts`
**메서드**: `upsertConfig`

### 변경 위치

71행 (`decliningPercent` 처리) 이후에 한 줄 추가한다.

### 추가 코드

```typescript
if (dto.gracePeriodDays !== undefined) config.gracePeriodDays = dto.gracePeriodDays;
```

기존 패턴(`if (dto.xxx !== undefined) config.xxx = dto.xxx;`)을 그대로 따른다.

---

## 4. FE API 클라이언트 타입 수정

**파일**: `apps/web/app/lib/inactive-member-api.ts`

### 변경 위치

`InactiveMemberConfig` 인터페이스 (62~79행)의 `decliningPercent` 필드 뒤에 추가한다.

### 추가 코드

```typescript
gracePeriodDays: number;
```

`InactiveMemberConfigSaveDto` 타입은 `Partial<Omit<InactiveMemberConfig, ...>>`로 자동 도출되므로 별도 수정 불필요하다.

---

## 5. FE 설정 페이지 수정

**파일**: `apps/web/app/settings/guild/[guildId]/inactive-member/page.tsx`

### 5-1. 폼 초기값에 gracePeriodDays 추가

**변경 위치**: 29~42행 `useState` 초기값

`decliningPercent: 50,` 뒤에 추가:

```typescript
gracePeriodDays: 7,
```

### 5-2. catch fallback 객체에 추가

**변경 위치**: 76~94행 fallback `InactiveMemberConfig` 객체

`decliningPercent: 50,` 뒤에 추가:

```typescript
gracePeriodDays: 7,
```

### 5-3. setForm 호출부에 추가

**변경 위치**: 98~111행 `setForm` 호출

`decliningPercent: config.decliningPercent,` 뒤에 추가:

```typescript
gracePeriodDays: config.gracePeriodDays,
```

### 5-4. 비활동 판정 기준 섹션에 입력 필드 추가

**변경 위치**: "활동 감소 비율" 입력 필드 (`declining-percent`) div 종료 태그 (329행) 뒤에 추가.

```tsx
{/* 신입 유예 기간 */}
<div>
  <label
    htmlFor="grace-period-days"
    className="block text-sm font-medium text-gray-700 mb-1"
  >
    {t('inactiveMember.gracePeriodDays')}
  </label>
  <p className="text-xs text-gray-500 mb-1">
    {t('inactiveMember.gracePeriodDaysDesc')}
  </p>
  <input
    id="grace-period-days"
    type="number"
    min={0}
    max={30}
    value={form.gracePeriodDays ?? 7}
    onChange={(e) => updateForm('gracePeriodDays', Number(e.target.value))}
    className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
  />
  {form.gracePeriodDays === 0 && (
    <p className="text-xs text-amber-600 mt-1">
      {t('inactiveMember.gracePeriodDaysZeroWarn')}
    </p>
  )}
</div>
```

---

## 6. i18n 메시지 추가

### 6-1. 한국어

**파일**: `libs/i18n/locales/ko/web/settings.json`

`inactiveMember` 객체 내 `decliningPercentDesc` 뒤에 추가:

```json
"gracePeriodDays": "신입 유예 기간 (일)",
"gracePeriodDaysDesc": "서버에 가입한 지 이 기간 이내인 멤버는 비활동 분류에서 제외됩니다.",
"gracePeriodDaysZeroWarn": "0으로 설정하면 유예 기간 없이 모든 멤버가 분류 대상이 됩니다."
```

### 6-2. 영어

**파일**: `libs/i18n/locales/en/web/settings.json`

`inactiveMember` 객체 내 `decliningPercentDesc` 뒤에 추가:

```json
"gracePeriodDays": "Newbie Grace Period (days)",
"gracePeriodDaysDesc": "Members who joined the server within this period are excluded from inactivity classification.",
"gracePeriodDaysZeroWarn": "Setting this to 0 means all members will be classified with no grace period."
```

---

## 수정 파일 요약

| # | 파일 | 변경 내용 |
|---|------|----------|
| 1 | `apps/api/src/inactive-member/application/inactive-member.service.ts` | `classifyGuild`에 유예 기간 필터 추가 |
| 2 | `apps/api/src/inactive-member/dto/inactive-member-config-save.dto.ts` | `gracePeriodDays` 필드 추가 |
| 3 | `apps/api/src/inactive-member/infrastructure/inactive-member.repository.ts` | `upsertConfig`에 `gracePeriodDays` 반영 |
| 4 | `apps/web/app/lib/inactive-member-api.ts` | `InactiveMemberConfig` 타입에 필드 추가 |
| 5 | `apps/web/app/settings/guild/[guildId]/inactive-member/page.tsx` | 설정 UI에 신입 유예 기간 입력 필드 추가 |
| 6 | `libs/i18n/locales/ko/web/settings.json` | 한국어 번역 키 3개 추가 |
| 7 | `libs/i18n/locales/en/web/settings.json` | 영어 번역 키 3개 추가 |

## 의존 관계

```
(2) DTO → (3) Repository → (1) Service   (BE, 순서 무관하게 구현 가능)
(4) API 타입 → (5) 설정 페이지           (FE)
(6) i18n ← (5) 설정 페이지에서 참조
```

BE와 FE는 독립적으로 병렬 구현 가능하다.
