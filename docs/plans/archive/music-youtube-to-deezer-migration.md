# Music 도메인: YouTube → Spotify 검색 + Deezer 스트리밍 전환 계획

> 최종 업데이트: 2026-04-04

## 배경

YouTube가 인증 없는 재생을 점점 차단하고 있어, 모든 Lavalink 클라이언트(TVHTML5, WEB, ANDROID_VR)가 "This video requires login" 오류를 발생시킨다. OAuth 인증으로 우회 가능하나 주기적 만료·계정 제한 위험이 있어, YouTube 의존성을 완전히 제거하고 **Spotify 검색 + Deezer 스트리밍** 조합으로 전환한다.

## 현재 상태

| 항목 | 현재 값 |
|------|---------|
| Lavalink 플러그인 | `dev.lavalink.youtube:youtube-plugin:1.18.0` |
| Kazagumo `defaultSearchEngine` | `'youtube'` |
| Kazagumo `defaultSource` | 미설정 (미사용) |
| Kazagumo `plugins` | `[]` (비어있음) |
| 차트 크롤링 검색 | `${title} ${artist}` → YouTube 텍스트 검색 |
| 썸네일 | `track.thumbnail` (YouTube 제공) |
| Spotify 환경변수 | `.env.example`에 정의만 됨, 코드 미사용 |

## 전환 후 상태

| 항목 | 전환 후 |
|------|---------|
| Lavalink 플러그인 | `com.github.topi314.lavasrc:lavasrc-plugin:4.8.1` (LavaSrc) |
| Kazagumo `defaultSearchEngine` | `'spotify'` (타입 호환용, 실제 prefix 결정에는 미사용) |
| Kazagumo `defaultSource` | **`'spsearch:'`** (실제 검색 prefix 결정) |
| Kazagumo `plugins` | `[]` (비어있음 — 서버 사이드 LavaSrc가 처리) |
| 검색 흐름 | 검색어 → Spotify 메타데이터 → Deezer ISRC 매칭 → 스트리밍 |
| 차트 크롤링 검색 | 동일 (`${title} ${artist}`) — LavaSrc가 Spotify로 검색 |
| 썸네일 | Spotify/Deezer 앨범 아트 (동일 `track.thumbnail` 필드) |
| YouTube 의존성 | **완전 제거** |

## 대안 비교 (결정 근거)

| 대안 | 장점 | 단점 | 선택 |
|------|------|------|------|
| A. SoundCloud 전환 | 설정 변경만으로 동작 | 한국 음악 라이브러리 부족 | --- |
| B. Spotify + YouTube fallback | 검색 품질 우수 | YouTube 의존성 유지 | --- |
| **C. Spotify 검색 + Deezer 스트리밍** | **YouTube 완전 제거, 토큰 불필요(128kbps)** | Spotify Client ID 발급 필요(무료) | 채택 |
| D. YouTube OAuth 유지 | 변경 최소 | 주기적 만료, 계정 차단 위험 | --- |

---

## 변경 범위 요약

| 구분 | 파일 | 변경 내용 |
|------|------|-----------|
| Lavalink 설정 | `lavalink/application.yml` | YouTube 플러그인 제거, LavaSrc 플러그인 추가, Deezer/Spotify 소스 설정 |
| Docker | `docker-compose.yml` | 변경 없음 (Spotify 환경변수 이미 전달 중) |
| 환경변수 | `.env`, `.env.example` | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` 활성화 |
| Kazagumo | `kazagumo.provider.ts` | `defaultSearchEngine` → `'spotify'`, `defaultSource` → `'spsearch:'` 추가 |
| 서비스 | `music.service.ts` | 변경 없음 (Kazagumo API 동일) |
| 차트 | `chart-crawler.service.ts` | 변경 없음 (검색어 형식 동일) |
| Embed | `now-playing-embed.builder.ts`, `music-channel-embed.builder.ts` | 변경 없음 (`track.thumbnail` 동일) |
| 커맨드 | 모든 커맨드 파일 | 변경 없음 |

---

## Phase 1: Lavalink 설정 변경

**파일**: `lavalink/application.yml`

### 변경 전

```yaml
server:
  port: 2333
  address: 0.0.0.0

lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.18.0"
      snapshot: false
  server:
    password: "youshallnotpass"
    sources:
      youtube: false
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      http: true
      local: false

plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    clients:
      - MUSIC
      - TV
      - WEB
      - ANDROID_VR
    oauth:
      enabled: true

logging:
  level:
    root: INFO
    lavalink: INFO
```

### 변경 후 (완전한 최종 형태)

```yaml
server:
  port: 2333
  address: 0.0.0.0

lavalink:
  plugins:
    - dependency: "com.github.topi314.lavasrc:lavasrc-plugin:4.8.1"
      snapshot: false
  server:
    password: "youshallnotpass"
    sources:
      youtube: false
      bandcamp: true
      soundcloud: true
      twitch: true
      vimeo: true
      http: true
      local: false

plugins:
  lavasrc:
    providers:
      - "dzisrc:%ISRC%"
      - "dzsearch:%QUERY%"
    sources:
      spotify: true
      deezer: true
      applemusic: false
      yandexmusic: false
      flowerytts: false
      youtube: false
      vkmusic: false
      tidal: false
      qobuz: false
      ytdlp: false
      jiosaavn: false
    spotify:
      clientId: "${SPOTIFY_CLIENT_ID}"
      clientSecret: "${SPOTIFY_CLIENT_SECRET}"
      countryCode: "KR"
    deezer:
      countryCode: "KR"

logging:
  level:
    root: INFO
    lavalink: INFO
```

### 주요 변경 포인트

1. **플러그인 버전**: `4.3.0` → `4.8.1` (2024-09-05 기준 최신)
   - 4.3.0 이후 Deezer CSRF 토큰 오류 수정(4.7.3), Yandex NPE 수정(4.8.1) 등 안정성 개선 포함
2. **LavaSrc `sources` 전체 명시**: 공식 예제(`application.example.yml`)에 정의된 모든 소스를 명시적으로 `false` 처리하여, 향후 플러그인 업데이트 시 의도치 않은 소스 활성화 방지
3. **Deezer `masterDecryptionKey`/`arl` 미설정**: 128kbps MP3 무료 스트리밍에는 인증 불필요. 이 키들은 FLAC/320kbps 등 프리미엄 포맷 접근 시에만 필요
4. **플러그인 자동 다운로드**: `lavalink.plugins[].dependency`에 Maven 좌표를 선언하면, Lavalink v4 컨테이너가 시작 시 Maven 저장소(`maven.lavalink.dev/releases`)에서 JAR를 자동 다운로드한다. 별도 볼륨 마운트나 수동 JAR 배치 불필요

### 검색 해석 흐름

1. 사용자 검색어 → Kazagumo가 `spsearch:검색어`로 변환 (`defaultSource: 'spsearch:'`)
2. LavaSrc가 Spotify API에서 메타데이터(제목, 아티스트, ISRC, 앨범아트) 조회
3. `providers` 순서대로 실제 스트리밍 소스 탐색:
   - `dzisrc:%ISRC%` → Deezer에서 ISRC로 매칭 (정확도 높음)
   - `dzsearch:%QUERY%` → ISRC 매칭 실패 시 Deezer 텍스트 검색 (fallback)
4. Deezer에서 128kbps MP3 스트리밍

---

## Phase 2: Docker Compose 환경변수

**파일**: `docker-compose.yml` — lavalink 서비스

### 현재 상태 (변경 불필요)

```yaml
lavalink:
  container_name: lavalink
  image: ghcr.io/lavalink-devs/lavalink:4
  ports:
    - "2333:2333"
  volumes:
    - ./lavalink/application.yml:/opt/Lavalink/application.yml
  environment:
    - _JAVA_OPTIONS=-Xmx128m
    - SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID:-}
    - SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET:-}
  restart: unless-stopped
```

이미 다음이 충족되어 있다:
- `application.yml`이 볼륨 마운트로 컨테이너에 전달됨
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` 환경변수가 `.env`에서 컨테이너로 전달됨
- `application.yml` 내 `${SPOTIFY_CLIENT_ID}`, `${SPOTIFY_CLIENT_SECRET}` 플레이스홀더가 컨테이너 환경변수로 치환됨

### 플러그인 자동 다운로드 동작 방식

Lavalink v4 Docker 이미지(`ghcr.io/lavalink-devs/lavalink:4`)는 시작 시 `application.yml`의 `lavalink.plugins[].dependency` 선언을 읽고, 해당 Maven 아티팩트를 자동으로 다운로드하여 `/opt/Lavalink/plugins/` 디렉토리에 저장한다. 별도 볼륨 마운트나 사전 다운로드 과정이 필요 없다. 단, **최초 시작 시** 네트워크에서 JAR를 다운로드하므로 몇 초 추가 소요될 수 있다.

---

## Phase 3: Kazagumo Provider 수정

**파일**: `apps/bot/src/music/infrastructure/kazagumo.provider.ts`

### 변경 내용

`defaultSearchEngine`을 `'spotify'`로, `defaultSource`를 `'spsearch:'`로 변경.

```diff
  this.kazagumo = new Kazagumo(
    {
-     defaultSearchEngine: 'youtube',
+     defaultSearchEngine: 'spotify',
+     defaultSource: 'spsearch:',
      plugins: [],
```

### Kazagumo v3 검색 엔진 동작 상세 (중요)

Kazagumo v3.4.3의 `search()` 메서드 내부 로직을 분석한 결과, `defaultSearchEngine`과 `defaultSource`의 역할이 다르다:

**`defaultSearchEngine`** (타입: `'youtube' | 'soundcloud' | 'youtube_music' | string`)
- 내부 `SourceIDs` 매핑에 `youtube` → `'yt'`, `youtube_music` → `'ytm'`, `soundcloud` → `'sc'`만 존재
- `'spotify'`를 설정하면 `SourceIDs`에서 매칭되지 않아 **기본값 `'youtube'`(`'yt'`)로 폴백**됨
- 즉, `defaultSearchEngine: 'spotify'`만 설정하면 실제로는 `ytsearch:` prefix가 붙어 YouTube 검색이 시도됨

**`defaultSource`** (타입: `string`, 선택적)
- 검색 시 사용할 prefix를 직접 지정 (예: `'spsearch:'`, `'dzsearch:'`)
- **`defaultSearchEngine`보다 우선 적용됨** (코드: `options.source ?? this.KazagumoOptions.defaultSource ?? ${source}search:`)
- `'spsearch:'`로 설정하면 Kazagumo가 검색어에 `spsearch:` prefix를 붙여 Lavalink에 전달
- LavaSrc 플러그인이 `spsearch:` prefix를 인식하여 Spotify 검색 수행

**결론**: 반드시 `defaultSource: 'spsearch:'`를 설정해야 한다. `defaultSearchEngine: 'spotify'`는 타입 호환성과 코드 가독성을 위해 함께 설정하되, 실제 검색 prefix 결정은 `defaultSource`가 담당한다.

> `plugins: []`는 유지한다. Kazagumo 클라이언트 사이드 Spotify 플러그인(`kazagumo-spotify`)은 불필요하다. LavaSrc가 Lavalink 서버 사이드에서 Spotify 검색을 처리하므로, Kazagumo는 단순히 `spsearch:` prefix를 붙여 Lavalink에 요청하기만 하면 된다.

---

## Phase 4: 환경변수 설정

**파일**: `.env.example` — 이미 정의됨 (변경 없음)

```env
# Spotify (optional, for Lavalink LavaSrc plugin)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

**실제 `.env`에 값 설정 필요:**

1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)에서 앱 생성
2. Client ID / Client Secret 복사
3. `.env` 파일에 입력

---

## 영향 분석

### 변경 불필요 (코드 호환)

| 파일 | 이유 |
|------|------|
| `music.service.ts` | `kazagumo.search(query)` API 동일, 반환 타입 동일 |
| `chart-crawler.service.ts` | `${title} ${artist}` 검색어 → `spsearch:` prefix 자동 적용 |
| `now-playing-embed.builder.ts` | `track.thumbnail` 필드 — Spotify/Deezer 앨범 아트 자동 매핑 |
| `music-channel-embed.builder.ts` | 동일 |
| `music-play.command.ts` | 서비스 호출 인터페이스 동일 |
| `music-channel-button.handler.ts` | 동일 |
| `music-search-modal.handler.ts` | 동일 |
| `music-channel-message.listener.ts` | 동일 |

### track 필드 매핑 (Kazagumo KazagumoTrack)

| 필드 | YouTube | Spotify+Deezer (LavaSrc) | 호환 |
|------|---------|--------------------------|------|
| `title` | 동영상 제목 | 트랙 제목 | 호환 |
| `author` | 채널명 | 아티스트명 | 호환 (품질 향상) |
| `uri` | YouTube URL | Spotify URL | 호환 |
| `thumbnail` | YouTube 썸네일 | Spotify 앨범아트 | 호환 |
| `length` | 동영상 길이 | 트랙 길이 | 호환 |
| `isrc` | 없음 | ISRC 코드 | 호환 (추가 정보) |

### 잠재적 차이점

1. **URL 직접 입력**: YouTube URL(`youtube.com/watch?v=...`)은 더 이상 동작하지 않음
   - Spotify URL(`open.spotify.com/track/...`)은 동작
   - Deezer URL(`deezer.com/track/...`)도 동작
   - 일반 텍스트 검색은 그대로 동작
2. **플레이리스트**: YouTube 플레이리스트 URL 미지원 → Spotify 플레이리스트 URL 지원

---

## 구현 순서 체크리스트

| 순서 | 작업 | 파일 수 | 난이도 |
|------|------|---------|--------|
| 1 | `lavalink/application.yml` 수정 (YouTube 제거, LavaSrc 4.8.1 추가) | 1 | 낮음 |
| 2 | `.env`에 Spotify Client ID/Secret 설정 | 1 | 낮음 |
| 3 | `kazagumo.provider.ts`의 `defaultSearchEngine` → `'spotify'`, `defaultSource` → `'spsearch:'` | 1 | 낮음 |
| 4 | Docker 재빌드 및 테스트 (`docker compose up -d --build lavalink bot`) | - | - |
| **합계** | | **3 파일** | |

---

## 롤백 계획

전환 실패 시:

1. `lavalink/application.yml`에서 YouTube 플러그인 복원, LavaSrc 제거
2. `kazagumo.provider.ts`의 `defaultSearchEngine` → `'youtube'` 복원, `defaultSource` 제거
3. YouTube OAuth 활성화 후 인증 수행

---

## 검증 항목

- [ ] 텍스트 검색으로 한국 음악 재생 (예: "아이유 블루밍")
- [ ] 텍스트 검색으로 영어 음악 재생 (예: "Billie Eilish bad guy")
- [ ] Spotify 트랙 URL 재생 (`https://open.spotify.com/track/...`)
- [ ] Spotify 플레이리스트 URL 재생 (`https://open.spotify.com/playlist/...`)
- [ ] Deezer 트랙 URL 재생 (`https://deezer.com/track/...`)
- [ ] 멜론 차트 버튼 → 20곡 일괄 재생
- [ ] 빌보드 차트 버튼 → 20곡 일괄 재생
- [ ] Now Playing Embed 썸네일 표시 확인
- [ ] 일시정지/재개/스킵/중지 정상 동작
- [ ] 음악 채널 텍스트 검색 정상 동작
- [ ] YouTube URL 입력 시 적절한 에러/무응답 확인 (의도된 미지원)
- [ ] Lavalink 컨테이너 최초 시작 시 LavaSrc JAR 자동 다운로드 확인 (로그 확인)
