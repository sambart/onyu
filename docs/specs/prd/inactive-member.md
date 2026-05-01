# Inactive Member 도메인 PRD

> 신규 도메인. 음성 채널 활동 데이터(VoiceDailyEntity)를 기반으로 비활동 회원을 자동 분류하고, 웹 대시보드에서 조회·필터·조치할 수 있는 관리 기능이다.

## 개요

디스코드 서버에서 **일정 기간 동안 음성 채널 활동이 없거나 현저히 감소한 회원을 자동으로 식별**하고, 관리자가 웹 대시보드를 통해 해당 회원에게 독려 DM을 보내거나 역할을 변경하는 등 체계적인 조치를 취할 수 있도록 한다.

기존 `VoiceDailyEntity`(voice_daily)의 `channelDurationSec` 데이터를 집계 기반으로 활용하며, 별도의 음성 이벤트 리스너 없이 **매일 자정 스케줄러**가 분류를 갱신한다.

## 관련 모듈

- `apps/api/src/inactive-member/` — **신규** 비활동 회원 분류·관리 핵심 로직
  - `inactive-member.module.ts`
  - `inactive-member.scheduler.ts` — 매일 자정 분류 갱신 스케줄러
  - `inactive-member.service.ts` — 분류 집계, 조치(DM·역할) 처리
  - `inactive-member.controller.ts` — REST API 엔드포인트
  - `inactive-member-config.service.ts` — 길드별 설정 CRUD
  - `inactive-member-action.service.ts` — 조치 이력 기록 및 실행
  - `entities/` — TypeORM 엔티티 파일
- `apps/api/src/channel/voice/` — `VoiceDailyEntity` 제공처 (기존)
- `apps/web/app/settings/guild/[guildId]/inactive-member/` — **신규** 웹 설정 페이지
- `apps/web/app/dashboard/guild/[guildId]/inactive-member/` — **신규** 웹 대시보드 페이지

## 아키텍처

```
[InactiveMemberScheduler] ← 매일 00:00 KST (Cron)
    │
    ├──► VoiceDailyEntity 집계 (기간 내 channelDurationSec 합산)
    ├──► 이전 동일 길이 기간 집계 (활동 감소 판정용)
    │
    └──► [InactiveMemberService] ← 분류 등급 결정 + DB upsert
            ├──► FULLY_INACTIVE: 기간 내 총 접속 0분
            ├──► LOW_ACTIVE:     기간 내 총 접속 시간 < 임계값 (분)
            ├──► DECLINING:      이전 기간 대비 접속 시간 N% 이상 감소
            └──► InactiveMemberTrendDaily ← 날짜별 등급 인원수 UPSERT (일별 스냅샷)

[Web Dashboard] ← Next.js 관리자 페이지
    │
    ├──► GET  /api/guilds/{guildId}/inactive-members          (목록 조회)
    ├──► POST /api/guilds/{guildId}/inactive-members/actions  (조치 실행)
    ├──► GET  /api/guilds/{guildId}/inactive-members/stats    (통계 조회)
    └──► CRUD /api/guilds/{guildId}/inactive-member-config    (설정 관리)
```

## 기능 상세

### F-INACTIVE-001: 비활동 회원 자동 분류

- **트리거**: 스케줄러가 매일 00:00 KST에 실행
- **분류 기준**: 길드별 `InactiveMemberConfig`의 설정값을 참조
  - `periodDays` — 판단 기간 (일). 기본값 30일, 선택 가능 값: 7/15/30일
  - `lowActiveThresholdMin` — 저활동 임계값 (분). 기본값 30분
  - `decliningPercent` — 활동 감소 판정 비율 (%). 기본값 50%
  - `gracePeriodDays` — 신입 유예 기간 (일). 서버 가입 후 이 값 미만인 멤버는 분류 대상에서 제외. 기본값 7일, 허용 범위 0~30일 (0이면 유예 없음)

- **분류 등급**:
  | 등급 | 상수 | 판정 조건 |
  |------|------|-----------|
  | 완전 비활동 | `FULLY_INACTIVE` | 판단 기간 내 음성 접속 총 시간 = 0분 |
  | 저활동 | `LOW_ACTIVE` | 0분 초과 & `lowActiveThresholdMin` 미만 |
  | 활동 감소 | `DECLINING` | 이전 동일 기간 대비 접속 시간 `decliningPercent`% 이상 감소 |

- **동작**:
  1. `VoiceDailyEntity`에서 `(guildId, userId, date BETWEEN [기간 시작] AND [기간 종료])`로 집계
  2. `channelDurationSec`을 합산하여 기간 내 총 음성 접속 시간 계산
  3. 활동 감소 판정: 현재 기간의 합산 vs 직전 동일 길이 기간의 합산 비교
  4. `excludedRoleIds` 설정에 포함된 역할을 보유한 회원은 판정에서 제외 (Discord API 조회)
  5. `gracePeriodDays > 0`인 경우, `APIGuildMember.joined_at`이 `(오늘 - gracePeriodDays)` 이후인 멤버는 `targetMembers` 필터링 단계에서 분류 대상에서 제외
  6. 분류 결과를 `InactiveMemberRecord` 테이블에 upsert (복합 유니크 키: `guildId + userId`)
  7. 이전 분류와 등급이 변경된 경우 `gradeChangedAt` 갱신
  8. 분류 완료 후 당일 날짜(`date = 오늘`)의 등급별 인원수를 집계하여 `InactiveMemberTrendDaily`에 UPSERT (유니크 키: `guildId + date`)

- **닉네임 캐싱**: 분류 시점에 Discord API에서 가져온 멤버 displayName(`nick > global_name > username`)을 `InactiveMemberRecord.nickName`에 저장. 목록 조회 시 Discord API 호출 없이 DB 값을 사용.

- **퇴장자 레코드 정리**: 분류 완료 후 현재 서버 멤버에 포함되지 않는 레코드를 자동 삭제 (`deleteRecordsNotIn`). 서버를 떠난 유저가 대시보드에 남지 않도록 함.

- **제약**:
  - 봇 유저는 분류 대상에서 항상 제외
  - `VoiceDailyEntity`에 기록이 전혀 없는 신규 가입자도 `FULLY_INACTIVE`로 분류됨. 이를 방지하려면 `gracePeriodDays`를 1 이상으로 설정한다.
  - `gracePeriodDays > 0`인 경우, 가입일(`joined_at`) 판정에 Discord API `APIGuildMember.joined_at` 값을 사용한다. 값이 없는 경우 유예 조건 적용 불가로 간주하여 분류 대상에 포함한다.
  - 등급이 동시에 두 조건을 충족할 경우 우선순위: `FULLY_INACTIVE` > `LOW_ACTIVE` > `DECLINING`

### F-INACTIVE-002: 웹 대시보드 비활동 회원 목록

- **경로**: `/dashboard/guild/{guildId}/inactive-member`
- **위치**: 대시보드 사이드바 > 비활동 회원 관리

#### 등급 필터 탭 UI

목록 상단에 **탭 UI** 4개를 배치한다. 기존 select 드롭다운을 대체한다.

```
[ 전체 ] [ 완전 비활동 (N) ] [ 저활동 (N) ] [ 활동 감소 (N) ]
```

- 각 탭 라벨에 해당 등급의 인원수 표시 (`stats.fullyInactiveCount`, `stats.lowActiveCount`, `stats.decliningCount` 사용)
- 탭 선택 시 `grade` 쿼리 파라미터로 해당 등급 필터링 (전체 탭은 파라미터 미포함)
- i18n 키: `inactive.tabs.all`, `inactive.tabs.fullyInactive`, `inactive.tabs.lowActive`, `inactive.tabs.declining`

#### 탭별 테이블 컬럼

각 탭은 해당 등급에 의미 있는 컬럼만 노출한다.

**전체 탭**:
| 컬럼 | 설명 |
|------|------|
| 체크박스 | 일괄 선택용 |
| 닉네임 | `InactiveMemberRecord.nickName` |
| 등급 배지 | FULLY_INACTIVE / LOW_ACTIVE / DECLINING 배지 |
| 마지막 접속일 | `lastVoiceDate` |
| 누적 분 | `totalMinutes` (분 단위 표시) |
| 등급 변경일 | `gradeChangedAt` |

**완전 비활동 탭** (`grade=FULLY_INACTIVE`):
| 컬럼 | 설명 |
|------|------|
| 체크박스 | 일괄 선택용 |
| 닉네임 | `InactiveMemberRecord.nickName` |
| 마지막 접속일 | `lastVoiceDate` |
| 미접속 일수 | 오늘 - `lastVoiceDate` (일 단위). `lastVoiceDate`가 null이면 "기록 없음" 표시. i18n 키: `inactive.table.daysAbsent` |
| 등급 진입일 | `gradeChangedAt` |

**저활동 탭** (`grade=LOW_ACTIVE`):
| 컬럼 | 설명 |
|------|------|
| 체크박스 | 일괄 선택용 |
| 닉네임 | `InactiveMemberRecord.nickName` |
| 누적 분 / 임계값 | `totalMinutes / lowActiveThresholdMin` (예: `12 / 30분`). 임계값은 `fetchInactiveMemberConfig` API로 로드. i18n 키: `inactive.table.thresholdProgress` |
| 진척도 바 | `totalMinutes / lowActiveThresholdMin` 비율의 프로그레스 바. 시각적 강조 |
| 마지막 접속일 | `lastVoiceDate` |
| 등급 진입일 | `gradeChangedAt` |

**활동 감소 탭** (`grade=DECLINING`):
| 컬럼 | 설명 |
|------|------|
| 체크박스 | 일괄 선택용 |
| 닉네임 | `InactiveMemberRecord.nickName` |
| 이전 → 현재 분 | `prevTotalMinutes → totalMinutes` 형식으로 표시. i18n 키: `inactive.table.prevTotalMinutes` |
| 감소율 | `Math.round((prevTotalMinutes - totalMinutes) / prevTotalMinutes * 100)` %. `prevTotalMinutes = 0`이면 `-` 표시. i18n 키: `inactive.table.decreaseRate` |
| 감소량 | `prevTotalMinutes - totalMinutes` (분). i18n 키: `inactive.table.decreaseAmount` |
| 마지막 접속일 | `lastVoiceDate` |
| 등급 진입일 | `gradeChangedAt` |

> 감소율·감소량은 API 응답의 `prevTotalMinutes`, `totalMinutes`를 사용하여 프런트에서 계산한다.

#### 탭별 기본 정렬

| 탭 | 기본 정렬 키 | 기본 방향 |
|----|------------|---------|
| 전체 | `lastVoiceDate` | ASC |
| 완전 비활동 | `lastVoiceDate` | ASC (미접속 오래된 순) |
| 저활동 | `totalMinutes` | ASC (적은 순) |
| 활동 감소 | `decreaseRate` | DESC (감소율 높은 순) |

#### 기타 필터·UX

- **판단 기간 프리셋**: 7일 / 15일 / 30일 (탭과 독립 동작)
- **검색**: 닉네임 키워드 검색 (debounce 300ms, DB ILIKE 매칭 — `InactiveMemberRecord.nickName` 컬럼 활용)
- **일괄 선택**: 전체 선택/해제 체크박스 + 개별 체크박스
- **페이지네이션**: 한 페이지당 20명, 오프셋 기반

- **호출 API**:
  | 메서드 | 경로 | 설명 |
  |--------|------|------|
  | GET | `/api/guilds/{guildId}/inactive-members` | 목록 조회 |
  | GET | `/api/guilds/{guildId}/inactive-members/stats` | 통계 조회 (탭 카운트용) |
  | GET | `/api/guilds/{guildId}/inactive-member-config` | 설정 조회 (저활동 임계값 표시용) |

### F-INACTIVE-003: 비활동 회원 조치 액션

- **트리거**: 웹 대시보드에서 회원 선택 후 액션 버튼 클릭

- **조치 유형**:

  **DM 알림 전송** (`ACTION_DM`):
  - 선택한 회원들에게 "활동 독려" Discord DM 일괄 전송
  - 길드별 `InactiveMemberConfig`의 DM 템플릿(`dmEmbedTitle`, `dmEmbedBody`, `dmEmbedColor`)을 Embed로 전송
  - DM 수신이 거부된 경우 실패로 기록하되, 나머지 회원의 전송은 계속 진행
  - 템플릿 변수: `{nickName}`, `{serverName}`, `{periodDays}`, `{totalMinutes}`

  **역할 부여** (`ACTION_ROLE_ADD`):
  - 선택한 회원들에게 `inactiveRoleId`로 설정된 역할 부여
  - Discord API `guild.members.addRole()` 호출

  **역할 제거** (`ACTION_ROLE_REMOVE`):
  - 선택한 회원들에게 `removeRoleId`로 설정된 역할 제거
  - Discord API `guild.members.removeRole()` 호출

- **조치 이력**:
  - 모든 조치는 `InactiveMemberActionLog` 테이블에 기록
  - 기록 항목: 조치 유형, 대상 userId 배열, 실행자(관리자) userId, 성공/실패 수, 실행 시각

- **자동 조치 규칙** (`InactiveMemberConfig.autoActionEnabled = true`):
  - 스케줄러 실행 시, 새로 `FULLY_INACTIVE`로 분류된 회원에게 자동 조치 실행
  - 자동 조치 유형은 설정에서 ON/OFF 가능: 자동 역할 부여(`autoRoleAdd`), 자동 DM 발송(`autoDm`)
  - 자동 조치 이력도 `InactiveMemberActionLog`에 기록 (실행자를 시스템으로 표기)

### F-INACTIVE-004: 비활동 통계 대시보드

- **경로**: `/dashboard/guild/{guildId}/inactive-member` (목록 페이지 상단 섹션)

- **활동률 파이 차트 (`ActivityRatioPieChart`)**:
  - 현재 시점 기준 전체 서버 멤버 중 활동 / FULLY_INACTIVE / LOW_ACTIVE / DECLINING 비율
  - Recharts `PieChart` 또는 `RadialBarChart` 사용

- **추이 라인 차트 (`InactiveTrendLineChart`)**:
  - 최근 30일 비활동 회원 수 변화 추이
  - X축: 날짜, Y축: 비활동 회원 수
  - 등급별 라인 3개 (FULLY_INACTIVE, LOW_ACTIVE, DECLINING)
  - 데이터 소스: `InactiveMemberTrendDaily` 테이블 (일별 스냅샷). 스케줄러가 분류 완료 후 해당 날짜의 등급별 인원수를 UPSERT하여 적재한다.

- **활동 복귀 하이라이트**:
  - 직전 분류 스케줄러 실행 시점에 비활동이었다가 이번 실행에서 활동으로 복귀한 회원 목록
  - `InactiveMemberRecord.grade`가 NULL(활동)로 변경된 회원 조회

### F-INACTIVE-005: 길드별 설정

- **경로**: `/settings/guild/{guildId}/inactive-member`
- **위치**: 설정 사이드바 > 비활동 회원 설정

- **비활동 판정 기준 섹션**:
  | UI 요소 | 설명 |
  |---------|------|
  | 판단 기간 선택 | 라디오 버튼 또는 셀렉트박스 (7일/15일/30일) |
  | 저활동 임계값 입력 | 숫자 입력 (분), 기본값 30 |
  | 활동 감소 비율 입력 | 숫자 입력 (%), 기본값 50 |
  | 신입 유예 기간 입력 | 숫자 입력 (일), 기본값 7, 범위 0~30. 0 입력 시 유예 없음 안내 문구 표시 |

- **자동 조치 설정 섹션**:
  | UI 요소 | 설명 |
  |---------|------|
  | 자동 조치 ON/OFF 토글 | 전체 자동 조치 활성화 여부 |
  | 자동 역할 부여 토글 | FULLY_INACTIVE 판정 시 비활동 역할 자동 부여 |
  | 자동 DM 발송 토글 | FULLY_INACTIVE 판정 시 DM 자동 발송 |

- **역할 설정 섹션**:
  | UI 요소 | 설명 |
  |---------|------|
  | 비활동 역할 선택 | 서버 역할 드롭다운 (`inactiveRoleId`) |
  | 제거할 역할 선택 | 서버 역할 드롭다운 (`removeRoleId`) |

- **제외 역할 섹션**:
  | UI 요소 | 설명 |
  |---------|------|
  | 제외 역할 멀티 셀렉트 | 비활동 판정에서 제외할 역할 선택 (예: 관리자, 봇 역할) |

- **DM 템플릿 커스텀 섹션**:
  | UI 요소 | 설명 |
  |---------|------|
  | Embed 제목 입력 | `dmEmbedTitle` |
  | Embed 본문 입력 (Textarea) | `dmEmbedBody` (템플릿 변수 인라인 안내 포함) |
  | Embed 색상 선택 | 컬러 피커, `dmEmbedColor` (hex) |
  | 실시간 미리보기 | debounce 300ms, 고정 더미 데이터로 Embed 미리보기 |

- **저장 동작**: 탭별 개별 저장. `PUT /api/guilds/{guildId}/inactive-member-config` 호출. 성공/실패 인라인 메시지(3초 소멸)

## 데이터 모델

### InactiveMemberConfig (`inactive_member_config`)

길드별 비활동 판정 기준 및 자동 조치 설정.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | UNIQUE, NOT NULL | 디스코드 서버 ID |
| `periodDays` | `int` | NOT NULL, DEFAULT `30` | 비활동 판단 기간 (일). 허용값: 7/15/30 |
| `lowActiveThresholdMin` | `int` | NOT NULL, DEFAULT `30` | 저활동 임계값 (분). 이 값 미만이면 LOW_ACTIVE |
| `decliningPercent` | `int` | NOT NULL, DEFAULT `50` | 활동 감소 판정 비율 (%). 0~100 |
| `gracePeriodDays` | `int` | NOT NULL, DEFAULT `7` | 신입 유예 기간 (일). 서버 가입 후 이 값 미만인 멤버는 분류 제외. 허용 범위: 0~30 |
| `autoActionEnabled` | `boolean` | NOT NULL, DEFAULT `false` | 자동 조치 전체 활성화 여부 |
| `autoRoleAdd` | `boolean` | NOT NULL, DEFAULT `false` | FULLY_INACTIVE 시 자동 역할 부여 |
| `autoDm` | `boolean` | NOT NULL, DEFAULT `false` | FULLY_INACTIVE 시 자동 DM 발송 |
| `inactiveRoleId` | `varchar` | NULLABLE | 비활동 역할 Discord ID |
| `removeRoleId` | `varchar` | NULLABLE | 제거할 역할 Discord ID |
| `excludedRoleIds` | `json` | NOT NULL, DEFAULT `'[]'` | 판정 제외 역할 ID 배열 |
| `dmEmbedTitle` | `varchar` | NULLABLE | DM Embed 제목 |
| `dmEmbedBody` | `text` | NULLABLE | DM Embed 본문 (템플릿 변수 포함) |
| `dmEmbedColor` | `varchar` | NULLABLE | DM Embed 색상 (hex, 예: `#FF0000`) |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

**인덱스**:
- UNIQUE: `(guildId)` — 길드당 하나의 설정

---

### InactiveMemberRecord (`inactive_member_record`)

최신 비활동 분류 결과 스냅샷. 스케줄러 실행 시 upsert.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `userId` | `varchar` | NOT NULL | 디스코드 유저 ID |
| `nickName` | `varchar(64)` | NULLABLE | 분류 시점의 멤버 표시명 (nick > global_name > username). 목록 조회 시 Discord API 대신 사용 |
| `grade` | `enum` | NULLABLE | 분류 등급: `FULLY_INACTIVE` / `LOW_ACTIVE` / `DECLINING`. NULL이면 활동 상태 |
| `totalMinutes` | `int` | NOT NULL, DEFAULT `0` | 판단 기간 내 총 음성 접속 시간 (분) |
| `prevTotalMinutes` | `int` | NOT NULL, DEFAULT `0` | 직전 동일 기간의 총 음성 접속 시간 (분). 활동 감소 판정용 |
| `lastVoiceDate` | `date` | NULLABLE | 마지막 음성 접속 날짜 (`VoiceDailyEntity` 기준) |
| `gradeChangedAt` | `timestamp` | NULLABLE | 등급이 변경된 시각 |
| `classifiedAt` | `timestamp` | NOT NULL | 마지막으로 분류된 시각 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 생성일 |
| `updatedAt` | `timestamp` | NOT NULL, DEFAULT now() | 수정일 |

**인덱스**:
- UNIQUE: `(guildId, userId)` — 길드+유저 복합 유니크
- `IDX_inactive_member_record_guild_grade` — `(guildId, grade)` — 등급별 조회
- `IDX_inactive_member_record_guild_last_voice` — `(guildId, lastVoiceDate)` — 마지막 접속일 정렬
- `IDX_inactive_member_record_guild_nickname` — `(guildId, nickName)` — 닉네임 ILIKE 검색

---

### InactiveMemberActionLog (`inactive_member_action_log`)

비활동 회원 조치 이력. 수동 조치 및 자동 조치 모두 기록.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `actionType` | `enum` | NOT NULL | 조치 유형: `ACTION_DM` / `ACTION_ROLE_ADD` / `ACTION_ROLE_REMOVE` |
| `targetUserIds` | `json` | NOT NULL | 조치 대상 유저 ID 배열 |
| `executorUserId` | `varchar` | NULLABLE | 조치를 실행한 관리자 Discord ID. NULL이면 시스템 자동 조치 |
| `successCount` | `int` | NOT NULL, DEFAULT `0` | 성공한 조치 수 |
| `failCount` | `int` | NOT NULL, DEFAULT `0` | 실패한 조치 수 |
| `note` | `text` | NULLABLE | 실패 사유 등 추가 메모 |
| `executedAt` | `timestamp` | NOT NULL, DEFAULT now() | 조치 실행 시각 |

**인덱스**:
- `IDX_inactive_action_log_guild_executed` — `(guildId, executedAt DESC)` — 길드별 이력 최신순 조회

---

### InactiveMemberTrendDaily (`inactive_member_trend_daily`)

일별 등급별 비활동 회원 수 스냅샷. 스케줄러가 분류 완료 후 UPSERT. `findTrend()` 조회의 실제 데이터 소스.

| 컬럼 | 타입 | 제약조건 | 설명 |
|-------|------|----------|------|
| `id` | `int` | PK, AUTO_INCREMENT | 내부 ID |
| `guildId` | `varchar` | NOT NULL | 디스코드 서버 ID |
| `date` | `date` | NOT NULL | 분류 날짜 (스케줄러 실행 날짜 기준) |
| `fullyInactiveCount` | `int` | NOT NULL, DEFAULT `0` | 해당 날짜 FULLY_INACTIVE 인원수 |
| `lowActiveCount` | `int` | NOT NULL, DEFAULT `0` | 해당 날짜 LOW_ACTIVE 인원수 |
| `decliningCount` | `int` | NOT NULL, DEFAULT `0` | 해당 날짜 DECLINING 인원수 |
| `totalClassified` | `int` | NOT NULL, DEFAULT `0` | 해당 날짜 전체 분류 대상 수 |
| `createdAt` | `timestamp` | NOT NULL, DEFAULT now() | 레코드 생성 시각 |

**인덱스**:
- UNIQUE: `(guildId, date)` — 같은 날 같은 길드는 UPSERT로 덮어씀
- `IDX_inactive_trend_daily_guild_date` — `(guildId, date DESC)` — 최근 N일 조회

**보존 정책**: 90일. 데이터 보존 스케줄러(`DATA_RETENTION_DAYS`)가 90일 초과 레코드를 자동 삭제.

**설계 근거**: `InactiveMemberRecord.classifiedAt`은 스케줄러 실행 시 모든 레코드가 오늘 날짜로 갱신되므로, `GROUP BY DATE(classifiedAt)` 방식으로는 항상 하루치 데이터만 조회된다. 이 문제를 해결하기 위해 별도 스냅샷 테이블에 날짜별 인원수를 누적 저장한다.

---

### Grade Enum

```
FULLY_INACTIVE  — 완전 비활동 (0분)
LOW_ACTIVE      — 저활동 (임계값 미만)
DECLINING       — 활동 감소 (이전 기간 대비 N% 이상 감소)
```

## API 엔드포인트

모든 엔드포인트는 JWT Bearer 토큰 인증 필수 (`JwtAuthGuard`).

### 비활동 회원 목록 조회

```
GET /api/guilds/:guildId/inactive-members
```

**쿼리 파라미터**:
| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `grade` | `string` | 선택 | 등급 필터: `FULLY_INACTIVE` / `LOW_ACTIVE` / `DECLINING` |
| `periodDays` | `number` | 선택 | 판단 기간 오버라이드 (7/15/30). 미제공 시 설정값 사용 |
| `search` | `string` | 선택 | 닉네임 검색 키워드 |
| `sortBy` | `string` | 선택 | 정렬 기준: `lastVoiceDate` / `totalMinutes` / `decreaseRate`. 기본값: `lastVoiceDate`. `decreaseRate`는 `grade=DECLINING` 조합에서만 유효하며, 다른 등급 필터에서는 무시하고 `lastVoiceDate` ASC로 대체한다 |
| `sortOrder` | `string` | 선택 | 정렬 방향: `ASC` / `DESC`. 기본값: `ASC` |
| `page` | `number` | 선택 | 페이지 번호. 기본값 1 |
| `limit` | `number` | 선택 | 페이지 크기. 기본값 20, 최대 100 |

**응답 (200)**:
```json
{
  "total": 42,
  "page": 1,
  "limit": 20,
  "items": [
    {
      "userId": "123456789",
      "nickName": "홍길동",
      "grade": "FULLY_INACTIVE",
      "totalMinutes": 0,
      "prevTotalMinutes": 0,
      "lastVoiceDate": "2026-02-10",
      "gradeChangedAt": "2026-03-01T00:00:00.000Z",
      "classifiedAt": "2026-03-14T00:00:00.000Z"
    }
  ]
}
```

> `prevTotalMinutes`: 직전 동일 기간의 총 음성 접속 시간(분). `InactiveMemberRecord.prevTotalMinutes` 컬럼 값. 활동 감소 탭의 이전 기간 분 표시 및 감소율·감소량 계산에 사용한다.

---

### 비활동 통계 조회

```
GET /api/guilds/:guildId/inactive-members/stats
```

**응답 (200)**:
```json
{
  "totalMembers": 150,
  "activeCount": 100,
  "fullyInactiveCount": 25,
  "lowActiveCount": 15,
  "decliningCount": 10,
  "returnedCount": 3,
  "trend": [
    { "date": "2026-03-07", "fullyInactive": 28, "lowActive": 18, "declining": 12 },
    { "date": "2026-03-14", "fullyInactive": 25, "lowActive": 15, "declining": 10 }
  ]
}
```

---

### 조치 실행

```
POST /api/guilds/:guildId/inactive-members/actions
```

**요청 본문**:
```json
{
  "actionType": "ACTION_DM",
  "targetUserIds": ["123456789", "987654321"]
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `actionType` | `string` | 필수 | `ACTION_DM` / `ACTION_ROLE_ADD` / `ACTION_ROLE_REMOVE` |
| `targetUserIds` | `string[]` | 필수 | 조치 대상 유저 ID 배열. 최소 1명, 최대 100명 |

**응답 (200)**:
```json
{
  "actionType": "ACTION_DM",
  "successCount": 2,
  "failCount": 0,
  "logId": 7
}
```

**에러 처리**:
- `400`: `targetUserIds` 누락 또는 빈 배열, `actionType` 미지원 값
- `404`: `ACTION_ROLE_ADD` 또는 `ACTION_ROLE_REMOVE` 요청 시 `inactiveRoleId`/`removeRoleId`가 설정되지 않은 경우

---

### 길드별 설정 조회

```
GET /api/guilds/:guildId/inactive-member-config
```

**응답 (200)**: `InactiveMemberConfig` 전체 필드 반환. 설정이 없으면 기본값으로 생성 후 반환.

---

### 길드별 설정 저장

```
PUT /api/guilds/:guildId/inactive-member-config
```

**요청 본문**: `InactiveMemberConfig` 갱신 가능 필드 (id, guildId, createdAt 제외). 부분 업데이트 허용. `gracePeriodDays` 포함.

**유효성 검증**:
| 필드 | 규칙 |
|------|------|
| `gracePeriodDays` | 정수, 0 이상 30 이하 |

**응답 (200)**: 갱신된 `InactiveMemberConfig` 반환.

---

### 조치 이력 조회

```
GET /api/guilds/:guildId/inactive-members/action-logs
```

**쿼리 파라미터**:
| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `page` | `number` | 선택 | 페이지 번호. 기본값 1 |
| `limit` | `number` | 선택 | 페이지 크기. 기본값 20 |

**응답 (200)**: 이력 목록 (`total`, `page`, `limit`, `items[]`).

## 기존 기능과의 관계

| 기존 기능 | 관계 | 설명 |
|-----------|------|------|
| Voice 일별 통계 (F-VOICE-002) | **데이터 소비** | `VoiceDailyEntity`의 `channelDurationSec`을 집계하여 비활동 분류 기준으로 사용 |
| 음성 제외 채널 (F-VOICE-013~016) | **무관** | 비활동 분류는 이미 집계된 `VoiceDailyEntity` 기반. 제외 채널 설정은 집계 단계에서 적용됨 |
| 신규사용자 관리 (newbie) | **독립** | 신입기간 중인 회원도 비활동 판정 대상에 포함. `excludedRoleIds`에 신입 역할을 추가하거나, `gracePeriodDays` 유예 기간으로 제외 가능 |
| Co-Presence (voice-co-presence) | **무관** | Co-Presence는 동시접속 관계 분석용. Inactive Member는 개인 활동량 기반 |
| 웹 대시보드 (web) | **연동** | 비활동 회원 목록, 통계, 설정 페이지가 대시보드 및 설정 사이드바에 통합됨 |

## 제약사항

- 분류 스케줄러는 하루 1회 실행 (매일 00:00 KST). 실시간 분류 갱신 없음.
- `VoiceDailyEntity`에 기록이 없는 회원(음성 접속 이력 전무)도 `FULLY_INACTIVE`로 분류된다. 이를 원하지 않으면 `excludedRoleIds`로 제외하거나 `gracePeriodDays`를 1 이상으로 설정한다.
- `gracePeriodDays > 0`인 경우 `APIGuildMember.joined_at` 기준으로 가입일을 판정한다. `joined_at` 값이 누락된 멤버는 유예 조건 적용 불가로 간주하여 분류 대상에 포함된다.
- `gracePeriodDays`의 허용 범위는 0~30일이며, 0으로 설정하면 유예 기간 없이 모든 멤버가 분류 대상이 된다.
- 닉네임은 분류 시점 기준이며, 분류 주기(1일) 동안의 닉네임 변경은 다음 분류까지 반영되지 않는다.
- 분류 시 서버를 떠난 유저의 레코드는 자동 삭제된다.
- 자동 DM 발송은 Discord 제한으로 DM 수신이 비활성화된 사용자에게는 전송되지 않는다. 실패는 `InactiveMemberActionLog`에 기록되며 예외로 처리하지 않는다.
- `ACTION_ROLE_ADD` / `ACTION_ROLE_REMOVE` 실행 시 봇이 해당 역할보다 높은 계층의 역할을 보유해야 한다 (Discord 권한 계층 규칙).
- `targetUserIds` 최대 100명 제한. 100명 초과 조치가 필요한 경우 분할 호출.
- 통계 추이 데이터(`trend`)는 `InactiveMemberTrendDaily` 테이블에서 최근 30일 데이터를 조회한다. `InactiveMemberRecord.classifiedAt`은 스케줄러 실행 시 모든 레코드가 오늘 날짜로 갱신되므로 추이 조회에 사용할 수 없다.
- 스케줄러 미실행 날짜는 `InactiveMemberTrendDaily`에 행이 존재하지 않으며, 이전 값을 이월하지 않고 데이터 없음으로 처리한다.
- `InactiveMemberTrendDaily` 데이터는 90일 보존 정책에 따라 자동 삭제된다.

## 변경이력

> 변경이력은 `/docs/archive/prd-changelog.md`에서 관리한다.
> 이 문서와 관련된 변경이력: [수정 21] inactive-member: 비활동 회원 관리 도메인 PRD 신규 추가 / [수정 36] inactive-member: gracePeriodDays 신입 유예 기간 추가 / [수정 46] inactive-member: 비활동 회원 추이 일별 스냅샷 테이블 추가 / [수정 49] inactive-member: 등급별 탭 분리 및 컬럼 차별화
