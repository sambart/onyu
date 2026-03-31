<h1 align="center">Onyu</h1>

<p align="center">
  <strong>Discord Voice Analytics & Community Management Platform</strong>
</p>

<p align="center">
  Real-time voice activity tracking, AI-powered analytics, and comprehensive server management — built on NestJS and Next.js.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Discord.js-14-5865F2?logo=discord&logoColor=white" alt="Discord.js" />
  <img src="https://img.shields.io/badge/Gemini_AI-Integrated-4285F4?logo=google&logoColor=white" alt="Gemini AI" />
</p>

---

## Overview

Onyu은 디스코드 서버의 음성 채널 활동을 이벤트 드리븐 방식으로 실시간 추적하고, Redis 세션 기반의 시간 누적과 PostgreSQL 일별 집계를 통해 정밀한 통계를 산출합니다. Google Gemini AI를 활용한 자동 분석 리포트, 웹 대시보드 시각화, 커뮤니티 관리 자동화까지 포괄하는 올인원 디스코드 플랫폼입니다.

## Architecture

```
Discord Gateway (voiceStateUpdate, guildMemberAdd, interactionCreate)
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  NestJS API Server (apps/api)                           │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Voice Domain │  │ Newbie Domain│  │ Gemini Domain│  │
│  │ ─────────────│  │ ─────────────│  │ ─────────────│  │
│  │ Session Mgmt │  │ Welcome Msg  │  │ AI Analytics │  │
│  │ Daily Flush  │  │ Mission Track│  │ Report Gen   │  │
│  │ Auto Channel │  │ Moco Hunting │  │ Leaderboard  │  │
│  │ Co-Presence  │  │ Role Mgmt    │  │              │  │
│  │ Excluded Ch  │  │              │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│  ┌──────┴─────────────────┴─────────────────┴───────┐  │
│  │             Shared Infrastructure                 │  │
│  │  PostgreSQL 15  ·  Redis 7  ·  TypeORM 0.3       │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
       │ REST API (JWT Auth)
       ▼
┌─────────────────────────────────────────────────────────┐
│  Next.js Web Dashboard (apps/web)                       │
│                                                         │
│  Voice Analytics  ·  User Detail  ·  Bot Monitoring     │
│  Auto Channel Settings  ·  Newbie Settings              │
│  Sticky Message  ·  Status Prefix  ·  Inactive Members  │
└─────────────────────────────────────────────────────────┘
```

## Core Features

### Voice Activity Tracking

실시간 음성 채널 이벤트(입장/퇴장/이동/마이크 토글)를 감지하고, Redis 세션으로 체류 시간을 누적합니다. 일별로 PostgreSQL에 flush하여 유저별·채널별·카테고리별 통계를 영구 보존합니다.

- **이벤트 드리븐 세션 관리**: `voiceStateUpdate` → VoiceStateDispatcher → Handler 체인
- **듀얼 스토리지**: Redis(실시간 세션, TTL 관리) + PostgreSQL(일별 집계, GLOBAL + 개별 채널)
- **마이크 통계**: ON/OFF 시간 분리 추적, 혼자 있는 시간(aloneSec) 별도 집계
- **크래시 복구**: 비정상 종료 시 orphan 세션 자동 flush + 재시작 시 음성 상태 동기화
- **제외 채널**: 길드별 음성 시간 제외 채널/카테고리 설정 (Redis 캐시 + DB)

### AI-Powered Analytics (Gemini)

수집된 음성 데이터를 Google Gemini AI로 분석하여 인사이트를 제공합니다.

| Command | Description |
|---------|-------------|
| `/voice-stats` | 서버 전체 음성 활동 AI 분석 (기간 지정, 최대 90일) |
| `/my-voice-stats` | 개인 음성 활동 통계 (순위, 채널 TOP 5, 활동 패턴) |
| `/community-health` | 커뮤니티 건강도 AI 진단 |
| `/voice-leaderboard` | 음성 활동 리더보드 |
| `/me` | 개인 프로필 카드 (15일 바 차트, 마이크 통계, 피크 요일) |

### Auto Channel System

트리거 채널 입장 → 버튼 선택 → 확정방 자동 생성의 2단계 자동 음성 채널 생성 시스템입니다.

- **2-Phase Creation**: 대기방(트리거 채널) → 안내 메시지 버튼 → 확정방 신규 생성 및 유저 이동
- **하위 선택지**: 버튼별 Ephemeral 서브옵션 지원 (예: 게임 → [일반/경쟁])
- **동적 네이밍**: 채널명 템플릿 변수 (`{username}`, `{n}` 순번)
- **자동 정리**: 모든 유저 퇴장 시 확정방 즉시 삭제 + Redis 키 정리
- **세션 통합**: 확정방 생성 시점부터 기존 voice 세션 추적과 자동 통합

### Co-Presence Tracking

음성 채널에서 누가 누구와 함께 있었는지를 범용적으로 추적합니다.

- **세션 기록**: 사용자별 동시접속 세션 이력 (peerIds, peerMinutes)
- **쌍 단위 집계**: 사용자 쌍별 일일 동시접속 시간·횟수 (관계 분석 기반)
- **소비자 패턴**: 모코코 사냥, 사용자 관계 분석 등이 범용 데이터를 활용

### Newbie Management

신규 가입 멤버의 온보딩을 자동화합니다.

- **환영 인사**: `guildMemberAdd` 이벤트 기반 커스텀 Embed 자동 전송 (템플릿 변수 지원)
- **미션 추적**: 음성 채널 플레이타임 기반 미션 자동 생성 및 완료/실패 상태 관리
- **모코코 사냥**: 기존 멤버의 신규사용자 동반 플레이 시간·횟수·다양성을 점수화하여 TOP N 순위 표시
- **역할 관리**: 신입기간 만료 시 Discord 역할 자동 제거 (스케줄러 기반)

### Status Prefix

음성 채널 참여 시 닉네임 접두사를 버튼 클릭으로 변경하고, 퇴장 시 자동 복원합니다.

- 관리자 웹 설정: 접두사 버튼 목록, Embed 안내 메시지, 표시 채널, 템플릿 설정
- 사용자 상호작용: 버튼 클릭 → `[관전] 동현` 형식으로 닉네임 변경
- 자동 복원: 음성 채널 퇴장 시 원래 닉네임으로 복원

### Sticky Message

텍스트 채널에 항상 최하단에 고정되는 메시지를 관리합니다.

- 새 메시지 발생 시 기존 고정메시지 삭제 + 재전송 (3초 디바운스)
- 슬래시 커맨드 (`/고정메세지등록`, `/고정메세지목록`, `/고정메세지삭제`) + 웹 대시보드 관리
- 채널당 다중 고정메시지, Redis 캐시 기반 고속 처리

### Inactive Member Management

음성 채널 활동 데이터를 기반으로 비활동 회원을 자동 분류하고 관리합니다.

- **자동 분류 스케줄러**: 매일 자정 `VoiceDailyEntity` 기반 3등급 분류 (FULLY_INACTIVE / LOW_ACTIVE / DECLINING)
- **대시보드**: 비활동 회원 목록, 등급/기간/닉네임 필터, 활동률 차트
- **일괄 조치**: DM 알림 전송, 역할 부여/제거, 자동 조치 규칙 설정

### Bot Monitoring

실시간 봇 상태 모니터링 및 시계열 메트릭 수집 시스템입니다.

- 1분 간격 메트릭 수집: 업타임, 핑, 메모리(Heap), 음성 접속자 수
- 웹 대시보드: 업타임 히스토리, 핑 추이, 메모리 추이, 시간대별 접속자 차트
- 30일 보존 정책 자동 삭제

### Music Player

Discord 음성 채널에서 YouTube 음악을 재생합니다 (discord-player 기반).

| Command | Description |
|---------|-------------|
| `/play` | YouTube 검색어 또는 URL로 음악 재생 |
| `/skip` | 현재 곡 건너뛰기 |
| `/stop` | 재생 중지 및 채널 퇴장 |

## Web Dashboard

Next.js 16 + React 19 + Tailwind CSS 기반 관리 대시보드입니다. Discord OAuth2 인증을 통해 접근하며, 서버 관리 권한을 가진 사용자만 설정을 변경할 수 있습니다.

| Page | Path | Description |
|------|------|-------------|
| Landing | `/` | 기능 소개, CTA |
| Guild Select | `/select-guild` | 관리 가능 서버 선택 |
| Voice Dashboard | `/dashboard/guild/{id}/voice` | 채널별/카테고리별 바차트, 유저 랭킹 |
| User Detail | `/dashboard/guild/{id}/user/{userId}` | 개인 통계, 일별 트렌드, 채널 비율, 입퇴장 이력 |
| Bot Monitoring | `/dashboard/guild/{id}/monitoring` | 실시간 상태, 시계열 차트 |
| Inactive Members | `/dashboard/guild/{id}/inactive-member` | 비활동 회원 목록, 조치 |
| General Settings | `/settings/guild/{id}` | 슬래시 커맨드 목록 (API 기반 동적 렌더링) |
| Auto Channel | `/settings/guild/{id}/auto-channel` | 다중 탭 자동방 설정 |
| Newbie Settings | `/settings/guild/{id}/newbie` | 신입 관리 설정 |
| Status Prefix | `/settings/guild/{id}/status-prefix` | 게임방 상태 접두사 설정 |
| Sticky Message | `/settings/guild/{id}/sticky-message` | 다중 탭 고정메시지 설정 |
| Voice Settings | `/settings/guild/{id}/voice` | 음성 시간 제외 채널 설정 |

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | NestJS 10 · TypeORM 0.3 · PostgreSQL 15 · Redis 7 |
| **Frontend** | Next.js 16 · React 19 · Tailwind CSS 3 · Lucide Icons |
| **Discord** | Discord.js 14 · discord-nestjs 5 · discord-player |
| **AI** | Google Gemini API (`@google/generative-ai`) |
| **Infrastructure** | Docker Compose · pnpm workspaces monorepo |

## Project Structure

```
onyu/
├── apps/
│   ├── api/                    # NestJS Backend API (port 3000)
│   │   └── src/
│   │       ├── channel/voice/  # Voice tracking, auto-channel, co-presence
│   │       ├── gemini/         # AI analytics & report generation
│   │       ├── music/          # Music player commands
│   │       ├── newbie/         # Newbie management (welcome, mission, moco, role)
│   │       ├── monitoring/     # Bot metrics collection & API
│   │       ├── inactive-member/# Inactive member classification & actions
│   │       ├── auth/           # Discord OAuth2 + JWT
│   │       ├── member/         # Member entity & service
│   │       ├── redis/          # Redis client & repositories
│   │       └── config/         # App & Discord configuration
│   └── web/                    # Next.js Web Dashboard (port 4000)
│       └── app/
│           ├── dashboard/      # Analytics dashboards (voice, user, monitoring)
│           ├── settings/       # Guild settings (auto-channel, newbie, etc.)
│           ├── auth/           # OAuth routes
│           ├── api/            # API proxy routes (JWT injection)
│           ├── components/     # Shared UI components
│           └── lib/            # API client helpers
├── libs/
│   └── shared/                 # Common types, interfaces, constants
├── docs/                       # PRD, plans, guides
├── docker-compose.yml          # Container orchestration
├── pnpm-workspace.yaml         # Monorepo workspace config
└── .eslintrc.js                # Shared ESLint rules
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Docker & Docker Compose

### Setup

```bash
# Clone & install
git clone https://github.com/sambart/onyu
cd onyu
pnpm install

# Environment configuration
cp .env.example .env
# Edit .env with your credentials (Discord token, DB, Redis, Gemini API key, JWT secret)
```

### Run with Docker Compose

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| API Server | `http://localhost:3000` |
| Web Dashboard | `http://localhost:4000` |
| PostgreSQL | `localhost:5432` |
| Redis | `localhost:6379` |

### Run Locally (Development)

```bash
# Start database & cache
docker compose up db redis

# API server (terminal 1)
pnpm --filter @nexus/api dev

# Web dashboard (terminal 2)
pnpm --filter @nexus/web dev
```

## Data Pipeline

```
Voice Event (Discord Gateway)
    │
    ▼
VoiceStateDispatcher ── classify ──► Join / Leave / Move / MicToggle Handler
    │
    ├── Redis: Session start/end, mic time accumulation
    ├── PostgreSQL: VoiceChannelHistory (raw join/leave log)
    │
    ▼
VoiceDailyFlushService ── daily aggregate ──► VoiceDailyEntity
    │                                         (GLOBAL + per-channel)
    ├── channelDurationSec, micOnSec, micOffSec, aloneSec
    ├── categoryId, categoryName (denormalized)
    │
    ├──► Gemini AI Analysis ──► Discord Embed Report
    ├──► Web Dashboard Charts (bar, pie, trend, ranking)
    ├──► Inactive Member Scheduler (daily classification)
    └──► /me Profile Card (15-day bar chart)
```

## Database Schema

<details>
<summary>20+ entities across 12 domains</summary>

| Entity | Table | Description |
|--------|-------|-------------|
| Member | `member` | Discord user info |
| Channel | `channel` | Discord channel info (with categoryId/categoryName) |
| VoiceChannelHistory | `voice_channel_history` | Raw voice join/leave log |
| VoiceDailyEntity | `voice_daily` | Daily aggregated voice stats |
| VoiceExcludedChannel | `voice_excluded_channel` | Excluded channel/category settings |
| AutoChannelConfig | `auto_channel_config` | Auto-channel trigger & guide settings |
| AutoChannelButton | `auto_channel_button` | Auto-channel button definitions |
| AutoChannelSubOption | `auto_channel_sub_option` | Button sub-options |
| VoiceCoPresenceSession | `voice_co_presence_session` | Co-presence session history (90-day retention) |
| VoiceCoPresenceDaily | `voice_co_presence_daily` | Daily co-presence aggregation |
| VoiceCoPresencePairDaily | `voice_co_presence_pair_daily` | Pair-level daily co-presence |
| NewbieConfig | `newbie_config` | Newbie management guild settings |
| NewbieMissionTemplate | `newbie_mission_template` | Mission embed template |
| NewbieMocoTemplate | `newbie_moco_template` | Moco hunting embed template |
| NewbieMission | `newbie_mission` | Individual mission progress |
| NewbiePeriod | `newbie_period` | Newbie role period tracking |
| MocoHuntingSession | `moco_hunting_session` | Moco hunting session log |
| MocoHuntingDaily | `moco_hunting_daily` | Moco daily aggregation |
| StatusPrefixConfig | `status_prefix_config` | Status prefix guild settings |
| StatusPrefixButton | `status_prefix_button` | Prefix button definitions |
| StickyMessageConfig | `sticky_message_config` | Sticky message settings |
| BotMetric | `bot_metric` | Bot metrics time series (30-day retention) |
| InactiveMemberConfig | `inactive_member_config` | Inactive classification settings |
| InactiveMemberRecord | `inactive_member_record` | Latest inactive snapshot |
| InactiveMemberActionLog | `inactive_member_action_log` | Action history log |

</details>

## Preview

### Voice Activity AI Report (Discord Embed)

![voice-report](./docs/voice-report.png)

---

<p align="center">
  Built with NestJS · Next.js · TypeScript · PostgreSQL · Redis · Gemini AI
</p>
