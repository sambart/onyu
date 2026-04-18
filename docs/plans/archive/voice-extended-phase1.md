# Voice Extended Phase 1 구현 계획 -- VoiceState 추가 수집 (streaming, selfVideo, selfDeaf)

## 개요

기존 `voiceStateUpdate` 이벤트에서 수집하지 않던 3개 필드(streaming, selfVideo, selfDeaf)를 추가 수집한다.
기존 마이크(mic) ON/OFF 추적과 동일한 패턴을 따른다.

- PRD 참조: F-VOICE-025 (streaming), F-VOICE-026 (selfVideo), F-VOICE-027 (selfDeaf)

## 기존 mic 추적 패턴 요약

```
1. VoiceStateDto      -- micOn 필드로 selfMute 반전값 전달
2. VoiceStateDispatcher -- selfMute 변경 감지 -> MIC_TOGGLE 이벤트 발행
3. voice-events.ts    -- VOICE_EVENTS.MIC_TOGGLE 상수 + VoiceMicToggleEvent 클래스
4. MicToggleHandler   -- 이벤트 리스닝 -> VoiceChannelService.onUserMicToggle() 호출
5. VoiceChannelService -- onUserMicToggle() -> VoiceSessionService.startOrUpdateSession() 호출
6. VoiceSessionService -- startOrUpdateSession()에서 세션의 mic 상태를 갱신
7. VoiceRedisRepository -- accumulateDuration()에서 session.mic 기준으로 mic:on/off 키에 시간 누적
8. VoiceDailyFlushService -- flushDate()에서 mic:on/off Redis 키를 읽어 DB에 flush
9. VoiceDailyRepository -- accumulateMicDuration()으로 GLOBAL 레코드에 micOnSec/micOffSec upsert
```

## 변경 대상 파일 및 상세

---

### 1. `apps/api/src/channel/voice/infrastructure/voice-state.dto.ts`

**현재 상태**: `micOn`, `alone`, `channelMemberCount` 등 필드 존재. streaming/video/deaf 필드 없음.

**변경 내용**:
- 생성자에 `streaming: boolean`, `videoOn: boolean`, `selfDeaf: boolean` 파라미터 3개 추가
- `fromVoiceState()` 정적 메서드에서 `state.streaming`, `state.selfVideo`, `state.selfDeaf` 값을 매핑
  - `streaming`: `state.streaming ?? false` (Discord.js에서 nullable일 수 있음)
  - `videoOn`: `state.selfVideo`
  - `selfDeaf`: `state.selfDeaf`

**변경 이유**: 디스패처와 세션 서비스가 새 상태값을 참조하려면 DTO에 필드가 있어야 한다.

---

### 2. `apps/api/src/event/voice/voice-events.ts`

**현재 상태**: `VOICE_EVENTS` 객체에 JOIN/LEAVE/MOVE/MIC_TOGGLE/ALONE_CHANGED 정의. 이벤트 클래스로 `VoiceMicToggleEvent` 등 존재.

**변경 내용**:
- `VOICE_EVENTS` 객체에 3개 상수 추가:
  - `STREAMING_TOGGLE: 'voice.streaming-toggle'`
  - `VIDEO_TOGGLE: 'voice.video-toggle'`
  - `DEAF_TOGGLE: 'voice.deaf-toggle'`
- 이벤트 클래스 3개 추가:
  - `VoiceStreamingToggleEvent` (state: VoiceStateDto)
  - `VoiceVideoToggleEvent` (state: VoiceStateDto)
  - `VoiceDeafToggleEvent` (state: VoiceStateDto)
- 구조는 `VoiceMicToggleEvent`와 동일

**변경 이유**: 디스패처가 상태 변경을 감지했을 때 발행할 이벤트가 필요하다.

---

### 3. `apps/api/src/event/voice/voice-state.dispatcher.ts`

**현재 상태**: `dispatch()` 메서드에서 `isMuteChanged`를 감지하여 채널 변경이 아닌 경우 `MIC_TOGGLE` 이벤트 발행. import에 `VoiceMicToggleEvent`만 존재.

**변경 내용**:
- import에 `VoiceStreamingToggleEvent`, `VoiceVideoToggleEvent`, `VoiceDeafToggleEvent` 추가
- `dispatch()` 메서드 상단에 변경 감지 플래그 3개 추가:
  ```typescript
  const isStreamingChanged = (oldState.streaming ?? false) !== (newState.streaming ?? false);
  const isVideoChanged = oldState.selfVideo !== newState.selfVideo;
  const isDeafChanged = oldState.selfDeaf !== newState.selfDeaf;
  ```
- 기존 `isMuteChanged` 블록 아래에 동일 패턴으로 3개 블록 추가:
  - 각각 `!isJoin && !isLeave && !isMove` 조건 동일 적용
  - `VoiceStateDto.fromVoiceState(newState)` 후 해당 이벤트 발행

**변경 이유**: 기존 mic 토글 감지와 동일한 방식으로 새 상태 변경을 감지하여 이벤트로 분리 위임한다.

**주의사항**: `streaming` 필드는 Discord.js에서 `boolean | undefined`이므로 `?? false` 처리 필수.

---

### 4. 신규 파일: `apps/api/src/event/voice/voice-streaming-toggle.handler.ts`

**구조**: `MicToggleHandler`와 동일

```typescript
@Injectable()
export class StreamingToggleHandler {
  constructor(private readonly voiceChannelService: VoiceChannelService) {}

  @OnEvent(VOICE_EVENTS.STREAMING_TOGGLE)
  async handle(event: VoiceStreamingToggleEvent) {
    await this.voiceChannelService.onUserStreamingToggle(event.state);
  }
}
```

---

### 5. 신규 파일: `apps/api/src/event/voice/voice-video-toggle.handler.ts`

**구조**: 위와 동일, `VOICE_EVENTS.VIDEO_TOGGLE` 리스닝, `onUserVideoToggle()` 호출

---

### 6. 신규 파일: `apps/api/src/event/voice/voice-deaf-toggle.handler.ts`

**구조**: 위와 동일, `VOICE_EVENTS.DEAF_TOGGLE` 리스닝, `onUserDeafToggle()` 호출

---

### 7. `apps/api/src/channel/voice/application/voice-channel.service.ts`

**현재 상태**: `onUserMicToggle()` 메서드가 `sessionService.startOrUpdateSession(cmd)` 호출.

**변경 내용**:
- 3개 메서드 추가 (모두 `onUserMicToggle`과 동일 구현):
  - `onUserStreamingToggle(cmd: VoiceStateDto)` -> `sessionService.startOrUpdateSession(cmd)`
  - `onUserVideoToggle(cmd: VoiceStateDto)` -> `sessionService.startOrUpdateSession(cmd)`
  - `onUserDeafToggle(cmd: VoiceStateDto)` -> `sessionService.startOrUpdateSession(cmd)`

**변경 이유**: 핸들러에서 호출할 진입점. 현재는 모두 `startOrUpdateSession`을 호출하지만, 향후 토글별 추가 로직이 필요할 때 확장 지점이 된다.

---

### 8. `apps/api/src/channel/voice/infrastructure/voice-session.keys.ts`

**현재 상태**: `VoiceSession` 인터페이스에 `channelId`, `joinedAt`, `mic`, `alone`, `lastUpdatedAt`, `date` 필드.

**변경 내용**:
- 3개 필드 추가:
  - `streaming: boolean` -- 화면 공유 상태
  - `videoOn: boolean` -- 카메라 상태
  - `selfDeaf: boolean` -- 스피커 음소거 상태

**변경 이유**: Redis 세션에 상태를 저장해야 `accumulateDuration`에서 해당 상태 기준으로 시간을 누적할 수 있다.

---

### 9. `apps/api/src/channel/voice/infrastructure/voice-cache.keys.ts`

**현재 상태**: `VoiceKeys` 객체에 `channelDuration`, `micDuration`, `aloneDuration` 등 키 함수 정의.

**변경 내용**:
- 3개 키 함수 추가:
  - `streamingDuration: (guild, user, date) => 'voice:duration:streaming:${guild}:${user}:${date}'`
  - `videoDuration: (guild, user, date) => 'voice:duration:video:${guild}:${user}:${date}'`
  - `deafDuration: (guild, user, date) => 'voice:duration:deaf:${guild}:${user}:${date}'`

**변경 이유**: Redis에 streaming/video/deaf 누적 시간을 저장할 키가 필요하다.

**설계 결정**: mic은 on/off 두 키로 분리하지만, streaming/video/deaf는 단일 키로 ON 시간만 누적한다. 이유: mic은 ON/OFF 모두 의미 있는 지표이나, streaming/video는 ON 시간만, deaf는 음소거 시간만 의미 있다.

---

### 10. `apps/api/src/channel/voice/infrastructure/voice-redis.repository.ts`

**현재 상태**: `accumulateDuration()`에서 pipeline으로 channelDuration, micDuration(on/off), aloneDuration을 한 번에 누적.

**변경 내용**:
- `accumulateDuration()` 메서드의 pipeline 내부에 3개 INCRBY 추가:
  ```typescript
  // 화면 공유 시간
  if (session.streaming && session.channelId) {
    pipe.incrby(VoiceKeys.streamingDuration(guild, user, date), elapsedSeconds);
  }
  // 카메라 ON 시간
  if (session.videoOn && session.channelId) {
    pipe.incrby(VoiceKeys.videoDuration(guild, user, date), elapsedSeconds);
  }
  // 스피커 음소거 시간
  if (session.selfDeaf && session.channelId) {
    pipe.incrby(VoiceKeys.deafDuration(guild, user, date), elapsedSeconds);
  }
  ```

**변경 이유**: 세션 상태가 true인 구간의 경과 시간을 Redis에 누적해야 flush 시 DB에 반영할 수 있다.

---

### 11. `apps/api/src/channel/voice/application/voice-session.service.ts`

**현재 상태**: `startOrUpdateSession()`에서 세션 생성 시 `mic`, `alone` 설정. 업데이트 시 `session.mic`, `session.alone` 갱신.

**변경 내용**:
- 세션 생성 시 (새 세션 객체):
  ```typescript
  streaming: cmd.streaming,
  videoOn: cmd.videoOn,
  selfDeaf: cmd.selfDeaf,
  ```
- 세션 업데이트 시 (기존 세션 갱신):
  ```typescript
  session.streaming = cmd.streaming;
  session.videoOn = cmd.videoOn;
  session.selfDeaf = cmd.selfDeaf;
  ```
- `switchChannel()` 메서드의 새 세션 객체에도 동일하게 추가:
  ```typescript
  streaming: newCmd.streaming,
  videoOn: newCmd.videoOn,
  selfDeaf: newCmd.selfDeaf,
  ```

**변경 이유**: 세션에 현재 상태를 저장해야 `accumulateDuration`에서 해당 상태 기준으로 시간 누적이 가능하다.

---

### 12. `apps/api/src/channel/voice/application/voice-daily-flush-service.ts`

**현재 상태**: `flushDate()`에서 (1) 채널 체류 시간, (2) mic on/off, (3) alone 순으로 Redis -> DB flush.

**변경 내용**:
- `flushDate()` 메서드 끝에 3개 블록 추가 (alone 블록과 동일 패턴):

  ```typescript
  // 4. 화면 공유 시간
  const streamingKey = `voice:duration:streaming:${guild}:${user}:${date}`;
  const streamingSec = Number((await this.redis.get(streamingKey)) || 0);
  if (streamingSec > 0) {
    await this.voiceDailyRepository.accumulateStreamingDuration(guild, user, date, streamingSec);
    await this.redis.del(streamingKey);
  }

  // 5. 카메라 ON 시간
  const videoKey = `voice:duration:video:${guild}:${user}:${date}`;
  const videoOnSec = Number((await this.redis.get(videoKey)) || 0);
  if (videoOnSec > 0) {
    await this.voiceDailyRepository.accumulateVideoDuration(guild, user, date, videoOnSec);
    await this.redis.del(videoKey);
  }

  // 6. 스피커 음소거 시간
  const deafKey = `voice:duration:deaf:${guild}:${user}:${date}`;
  const deafSec = Number((await this.redis.get(deafKey)) || 0);
  if (deafSec > 0) {
    await this.voiceDailyRepository.accumulateDeafDuration(guild, user, date, deafSec);
    await this.redis.del(deafKey);
  }
  ```

**변경 이유**: Redis에 누적된 시간 데이터를 DB에 영구 저장해야 한다.

---

### 13. `apps/api/src/channel/voice/infrastructure/voice-daily.repository.ts`

**현재 상태**: `accumulateMicDuration()`, `accumulateAloneDuration()` 메서드가 GLOBAL 레코드에 upsert.

**변경 내용**:
- 3개 메서드 추가 (모두 `accumulateAloneDuration`과 동일 패턴, GLOBAL 레코드 upsert):

  ```typescript
  async accumulateStreamingDuration(guildId, userId, date, streamingSec): Promise<void>
  // INSERT ... ON CONFLICT DO UPDATE SET "streamingSec" = vd."streamingSec" + EXCLUDED."streamingSec"

  async accumulateVideoDuration(guildId, userId, date, videoOnSec): Promise<void>
  // INSERT ... ON CONFLICT DO UPDATE SET "videoOnSec" = vd."videoOnSec" + EXCLUDED."videoOnSec"

  async accumulateDeafDuration(guildId, userId, date, deafSec): Promise<void>
  // INSERT ... ON CONFLICT DO UPDATE SET "deafSec" = vd."deafSec" + EXCLUDED."deafSec"
  ```

**변경 이유**: flush 서비스에서 호출할 DB upsert 메서드가 필요하다.

---

### 14. `apps/api/src/channel/voice/infrastructure/voice-daily.orm-entity.ts`

**현재 상태**: 이미 `streamingSec`, `videoOnSec`, `deafSec` 컬럼이 정의되어 있음 (default: 0).

**변경 내용**: 없음 (이미 수정 완료)

---

### 15. `apps/api/src/channel/voice/application/voice-recovery.service.ts`

**현재 상태**: `syncOneVoiceState()`에서 `VoiceStateDto.fromVoiceState(voiceState)` 호출 후 `onUserJoined()` 실행.

**변경 내용**: 없음. `VoiceStateDto.fromVoiceState()`가 자동으로 새 필드를 포함하므로 복구 시 streaming/video/deaf 초기 상태가 세션에 반영된다.

**확인 사항**: `fromVoiceState()`에서 추가된 필드가 세션 생성 시 올바르게 저장되는지 `startOrUpdateSession` 변경과 함께 자연스럽게 보장됨.

---

### 16. `apps/api/src/event/discord-events.module.ts`

**현재 상태**: `MicToggleHandler`만 providers에 등록.

**변경 내용**:
- import에 3개 핸들러 추가:
  - `StreamingToggleHandler`
  - `VideoToggleHandler`
  - `DeafToggleHandler`
- providers 배열에 3개 핸들러 추가

**변경 이유**: NestJS DI 컨테이너에 핸들러를 등록해야 이벤트 리스닝이 동작한다.

---
//이미 마이그레이션 파일을 작성했다 확인해라
### 17. DB 마이그레이션 파일 (신규)

**파일 경로**: `apps/api/src/migrations/1775800000000-AddVoiceExtendedPhase1.ts`

**현재 상태**: ORM 엔티티에 컬럼이 이미 정의되어 있으므로, synchronize: true 환경에서는 자동 반영될 수 있다. 프로덕션 환경을 위해 명시적 마이그레이션이 필요.

**변경 내용**:
```sql
-- up
ALTER TABLE voice_daily ADD COLUMN IF NOT EXISTS "streamingSec" int NOT NULL DEFAULT 0;
ALTER TABLE voice_daily ADD COLUMN IF NOT EXISTS "videoOnSec" int NOT NULL DEFAULT 0;
ALTER TABLE voice_daily ADD COLUMN IF NOT EXISTS "deafSec" int NOT NULL DEFAULT 0;

-- down
ALTER TABLE voice_daily DROP COLUMN IF EXISTS "streamingSec";
ALTER TABLE voice_daily DROP COLUMN IF EXISTS "videoOnSec";
ALTER TABLE voice_daily DROP COLUMN IF EXISTS "deafSec";
```

**확인 필요**: ORM 엔티티에 컬럼이 이미 존재하므로, synchronize 설정에 따라 마이그레이션이 이미 적용되었을 수 있다. 실제 DB 상태를 확인 후 마이그레이션 필요 여부를 판단한다.

---

## 변경 파일 요약

| # | 파일 | 유형 | 변경 내용 요약 |
|---|------|------|---------------|
| 1 | `voice-state.dto.ts` | 수정 | streaming, videoOn, selfDeaf 필드 추가 |
| 2 | `voice-events.ts` | 수정 | 3개 이벤트 상수 + 클래스 추가 |
| 3 | `voice-state.dispatcher.ts` | 수정 | 3개 상태 변경 감지 + 이벤트 발행 |
| 4 | `voice-streaming-toggle.handler.ts` | 신규 | StreamingToggleHandler |
| 5 | `voice-video-toggle.handler.ts` | 신규 | VideoToggleHandler |
| 6 | `voice-deaf-toggle.handler.ts` | 신규 | DeafToggleHandler |
| 7 | `voice-channel.service.ts` | 수정 | 3개 toggle 메서드 추가 |
| 8 | `voice-session.keys.ts` | 수정 | VoiceSession에 3개 필드 추가 |
| 9 | `voice-cache.keys.ts` | 수정 | 3개 Redis 키 함수 추가 |
| 10 | `voice-redis.repository.ts` | 수정 | accumulateDuration에 3개 INCRBY 추가 |
| 11 | `voice-session.service.ts` | 수정 | 세션 생성/갱신 시 3개 필드 반영 |
| 12 | `voice-daily-flush-service.ts` | 수정 | flushDate에 3개 flush 블록 추가 |
| 13 | `voice-daily.repository.ts` | 수정 | 3개 accumulate 메서드 추가 |
| 14 | `voice-daily.orm-entity.ts` | 변경 없음 | 이미 컬럼 정의됨 |
| 15 | `voice-recovery.service.ts` | 변경 없음 | DTO 변경으로 자동 반영 |
| 16 | `discord-events.module.ts` | 수정 | 3개 핸들러 등록 |
| 17 | 마이그레이션 파일 | 신규 | voice_daily 테이블 컬럼 추가 |

## 구현 순서

1. **VoiceSession 인터페이스 확장** (#8) -- 세션 구조에 3개 필드 추가
2. **VoiceStateDto 확장** (#1) -- Discord VoiceState에서 3개 필드 매핑
3. **Redis 키 정의** (#9) -- streaming/video/deaf duration 키 추가
4. **Redis 누적 로직** (#10) -- accumulateDuration에 3개 상태 누적 추가
5. **세션 서비스 수정** (#11) -- 세션 생성/갱신 시 새 필드 반영
6. **이벤트 정의** (#2) -- 3개 이벤트 상수 + 클래스
7. **이벤트 핸들러 생성** (#4, #5, #6) -- 3개 핸들러 파일 생성
8. **VoiceChannelService 확장** (#7) -- 3개 toggle 메서드 추가
9. **디스패처 수정** (#3) -- 3개 상태 변경 감지 + 이벤트 발행
10. **DB Repository 확장** (#13) -- 3개 accumulate 메서드 추가
11. **Flush 서비스 확장** (#12) -- flushDate에 3개 블록 추가
12. **모듈 등록** (#16) -- 3개 핸들러를 DiscordEventsModule에 등록
13. **마이그레이션** (#17) -- DB 컬럼 추가 (필요 시)

## 충돌 및 호환성

- **기존 세션 호환성**: Redis에 저장된 기존 세션에는 `streaming`, `videoOn`, `selfDeaf` 필드가 없다. `VoiceSession` 인터페이스에 이 필드들을 추가할 때 optional로 선언하거나, 세션 읽기 시 기본값 처리(`?? false`)가 필요하다. `accumulateDuration`에서 `session.streaming`이 undefined이면 falsy로 평가되어 INCRBY가 실행되지 않으므로, 기존 세션에 대해 안전하다.
- **DB 호환성**: ORM 엔티티에 이미 컬럼이 정의되어 있고 기본값이 0이므로, 기존 데이터에 영향 없다.
- **API 호환성**: 기존 API 응답에 새 컬럼이 추가로 노출될 수 있으나, 기본값 0이므로 하위 호환성 문제 없다.
- **디스패처 성능**: 새로운 상태 변경 감지는 boolean 비교 3개 추가에 불과하므로 성능 영향 무시 가능.

## 범위 밖 (이 계획에서 제외)

- Phase 2 게임 활동 수집 (F-VOICE-028 ~ F-VOICE-031)
- 웹 대시보드 UI에 streaming/video/deaf 통계 표시
- `/me` 커맨드에 새 필드 반영
- Gemini AI 분석에 새 데이터 활용
