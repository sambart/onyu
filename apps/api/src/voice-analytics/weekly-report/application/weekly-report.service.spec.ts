/**
 * WeeklyReportService 단위 테스트
 * 대상: collectReportData (topPairs 수집 + opt-out 필터) + buildPayload (친밀도 섹션)
 *
 * 외부 의존성은 모두 vi.mock으로 차단한다.
 */

vi.mock('discord.js', () => ({
  ActionRowBuilder: vi.fn().mockImplementation(() => ({
    addComponents: vi.fn().mockReturnThis(),
    toJSON: vi.fn().mockReturnValue({}),
  })),
  ButtonBuilder: vi.fn().mockImplementation(() => ({
    setLabel: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis(),
    setURL: vi.fn().mockReturnThis(),
  })),
  ButtonStyle: { Link: 5 },
}));

vi.mock('../../../discord-rest/discord-rest.service', () => ({
  DiscordRestService: vi.fn(),
}));

vi.mock('../../application/voice-analytics.service', () => {
  const DATE_RANGE = { start: '2026-04-28', end: '2026-05-04' };
  const PREV_DATE_RANGE = { start: '2026-04-21', end: '2026-04-27' };
  return {
    VoiceAnalyticsService: Object.assign(vi.fn(), {
      getDateRange: vi.fn().mockReturnValue(DATE_RANGE),
      getPrevDateRange: vi.fn().mockReturnValue(PREV_DATE_RANGE),
    }),
  };
});

vi.mock('../../application/voice-ai-analysis.service', () => ({
  VoiceAiAnalysisService: vi.fn(),
}));

vi.mock('../../../channel/voice/co-presence/co-presence-analytics.service', () => ({
  CoPresenceAnalyticsService: vi.fn(),
}));

vi.mock('../../../user-privacy/application/user-privacy-config.service', () => ({
  UserPrivacyConfigService: vi.fn(),
}));

import type { Mock } from 'vitest';

const PAIR_MINUTES_1ST = 750; // 1위 페어 함께한 시간(분)
const PAIR_MINUTES_2ND = 492; // 2위 페어 함께한 시간(분)
const PAIR_SESSIONS_1ST = 45; // 1위 페어 세션 수

import { WeeklyReportConfigOrmEntity } from '../infrastructure/weekly-report-config.orm-entity';
import { WeeklyReportService } from './weekly-report.service';

// ─── 테스트 픽스처 헬퍼 ────────────────────────────────────────────────────────

function makeConfig(
  overrides: Partial<WeeklyReportConfigOrmEntity> = {},
): WeeklyReportConfigOrmEntity {
  const entity = new WeeklyReportConfigOrmEntity();
  entity.guildId = 'guild-1';
  entity.channelId = 'ch-1';
  entity.isEnabled = true;
  entity.dayOfWeek = 1;
  entity.hour = 9;
  entity.timezone = 'Asia/Seoul';
  entity.updatedAt = new Date('2026-03-01T00:00:00Z');
  return Object.assign(entity, overrides);
}

const DUMMY_VOICE_DATA = {
  guildId: 'guild-1',
  guildName: 'Test Guild',
  timeRange: { start: '2026-04-28', end: '2026-05-04' },
  totalStats: { totalUsers: 10, totalVoiceTime: 36000, avgDailyActiveUsers: 5, totalMicOnTime: 0 },
  userActivities: [],
  channelStats: [
    { channelId: 'ch-1', channelName: '일반', totalVoiceTime: 7200, uniqueUsers: 5 },
    { channelId: 'ch-2', channelName: '게임', totalVoiceTime: 3600, uniqueUsers: 3 },
  ],
  dailyTrends: [],
};

const DUMMY_LEADERBOARD = {
  users: [
    // 리더보드 유저명은 페어 유저명(동현/민수/지수/영희 등)과 겹치지 않도록 별도 이름 사용
    { rank: 1, nickName: '리더A', totalSec: 7200, micOnSec: 3600, activeDays: 5 },
    { rank: 2, nickName: '리더B', totalSec: 5400, micOnSec: 1800, activeDays: 4 },
  ],
  total: 2,
  page: 1,
  limit: 5,
};

const DUMMY_CHANNEL_STATS = [
  { channelName: '일반', totalSec: 7200, uniqueUsers: 5 },
  { channelName: '게임', totalSec: 3600, uniqueUsers: 3 },
];

function makeTopPairItem(
  userAId: string,
  userAName: string,
  userBId: string,
  userBName: string,
  totalMinutes = PAIR_MINUTES_1ST,
  sessionCount = 24,
) {
  return {
    userA: { userId: userAId, userName: userAName, avatarUrl: null },
    userB: { userId: userBId, userName: userBName, avatarUrl: null },
    totalMinutes,
    sessionCount,
  };
}

// ─── 테스트 ────────────────────────────────────────────────────────────────────

describe('WeeklyReportService', () => {
  let service: WeeklyReportService;
  let analyticsService: {
    collectVoiceActivityData: Mock;
    getLeaderboard: Mock;
    getChannelStats: Mock;
  };
  let aiAnalysisService: { generateWeeklyReport: Mock };
  let discordRestService: { sendMessage: Mock };
  let coPresenceAnalyticsService: { getTopPairs: Mock };
  let userPrivacyConfigService: { filterPeers: Mock };

  beforeEach(() => {
    analyticsService = {
      collectVoiceActivityData: vi.fn().mockResolvedValue(DUMMY_VOICE_DATA),
      getLeaderboard: vi.fn().mockResolvedValue(DUMMY_LEADERBOARD),
      getChannelStats: vi.fn().mockResolvedValue(DUMMY_CHANNEL_STATS),
    };
    aiAnalysisService = {
      generateWeeklyReport: vi.fn().mockResolvedValue('AI 분석 결과'),
    };
    discordRestService = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    coPresenceAnalyticsService = { getTopPairs: vi.fn().mockResolvedValue([]) };
    userPrivacyConfigService = { filterPeers: vi.fn().mockResolvedValue(new Map()) };

    service = new WeeklyReportService(
      analyticsService as never,
      aiAnalysisService as never,
      discordRestService as never,
      coPresenceAnalyticsService as never,
      userPrivacyConfigService as never,
    );
  });

  // ── 케이스 1: 기존 회귀 — topPairs 0건 시 4섹션 정상 출력 ─────────────────

  it('topPairs가 0건이면 친밀도 섹션 없이 기존 4섹션이 모두 출력된다', async () => {
    coPresenceAnalyticsService.getTopPairs.mockResolvedValue([]);

    await service.generateAndSendReport(makeConfig());

    const [, payload] = discordRestService.sendMessage.mock.calls[0] as [
      string,
      { embeds: Array<{ description: string }> },
    ];
    const description = payload.embeds[0].description;

    expect(description).toContain('📊 이번 주 vs 지난 주');
    expect(description).toContain('👥 TOP 5 유저');
    expect(description).toContain('📺 TOP 3 채널');
    expect(description).toContain('🤖 AI 종합 분석');
    expect(description).not.toContain('💞 이번 주 베스트 페어 TOP 5');
  });

  // ── 케이스 2: 친밀도 섹션 정상 출력 (양측 공개) ──────────────────────────

  it('양측 공개 페어 5쌍이 있으면 친밀도 섹션이 정상 출력된다', async () => {
    const pairs = [
      makeTopPairItem('u1', '동현', 'u2', '민수', PAIR_MINUTES_1ST, 24),
      makeTopPairItem('u3', '지수', 'u4', '영희', PAIR_MINUTES_2ND, 15),
    ];
    coPresenceAnalyticsService.getTopPairs.mockResolvedValue(pairs);
    userPrivacyConfigService.filterPeers.mockResolvedValue(
      new Map([
        ['u1', { isAnonymous: false }],
        ['u2', { isAnonymous: false }],
        ['u3', { isAnonymous: false }],
        ['u4', { isAnonymous: false }],
      ]),
    );

    await service.generateAndSendReport(makeConfig());

    const [, payload] = discordRestService.sendMessage.mock.calls[0] as [
      string,
      { embeds: Array<{ description: string }> },
    ];
    const description = payload.embeds[0].description;

    expect(description).toContain('💞 이번 주 베스트 페어 TOP 5');
    expect(description).toContain('동현 ↔ 민수');
    expect(description).toContain('12시간 30분');
    expect(description).toContain('(24세션)');
    expect(description).toContain('지수 ↔ 영희');
  });

  // ── 케이스 3: 한쪽 비공개 익명화 ────────────────────────────────────────

  it('userA가 비공개면 userAName이 ???로 익명화되고 "1명 비공개" 비고가 표시된다', async () => {
    const pairs = [makeTopPairItem('u1', '동현', 'u2', '민수', PAIR_MINUTES_1ST, 24)];
    coPresenceAnalyticsService.getTopPairs.mockResolvedValue(pairs);
    userPrivacyConfigService.filterPeers.mockResolvedValue(
      new Map([
        ['u1', { isAnonymous: true }],
        ['u2', { isAnonymous: false }],
      ]),
    );

    await service.generateAndSendReport(makeConfig());

    const [, payload] = discordRestService.sendMessage.mock.calls[0] as [
      string,
      { embeds: Array<{ description: string }> },
    ];
    const description = payload.embeds[0].description;

    expect(description).toContain('??? ↔ 민수');
    expect(description).toContain('1명 비공개');
    expect(description).not.toContain('동현');
  });

  // ── 케이스 4: 양측 비공개 제거 ───────────────────────────────────────────

  it('양측 비공개 페어는 제거되고 나머지 페어만 출력된다', async () => {
    const pairs = [
      makeTopPairItem('u1', '동현', 'u2', '민수', PAIR_MINUTES_1ST, 24),
      makeTopPairItem('u3', '지수', 'u4', '영희', PAIR_MINUTES_2ND, 15),
    ];
    coPresenceAnalyticsService.getTopPairs.mockResolvedValue(pairs);
    // 첫 번째 페어는 양측 비공개 → 제거
    userPrivacyConfigService.filterPeers.mockResolvedValue(
      new Map([
        ['u1', { isAnonymous: true }],
        ['u2', { isAnonymous: true }],
        ['u3', { isAnonymous: false }],
        ['u4', { isAnonymous: false }],
      ]),
    );

    await service.generateAndSendReport(makeConfig());

    const [, payload] = discordRestService.sendMessage.mock.calls[0] as [
      string,
      { embeds: Array<{ description: string }> },
    ];
    const description = payload.embeds[0].description;

    expect(description).toContain('💞 이번 주 베스트 페어 TOP 5');
    // 동현/민수 페어는 제거됨
    expect(description).not.toContain('동현');
    expect(description).not.toContain('민수');
    // 지수/영희 페어는 1번 순위로 표시
    expect(description).toContain('1. 지수 ↔ 영희');
  });

  // ── 케이스 5: 전부 양측 비공개 → 섹션 미출력 ────────────────────────────

  it('모든 페어가 양측 비공개이면 친밀도 섹션 헤더가 출력되지 않는다', async () => {
    const pairs = [
      makeTopPairItem('u1', '동현', 'u2', '민수', PAIR_MINUTES_1ST, 24),
      makeTopPairItem('u3', '지수', 'u4', '영희', PAIR_MINUTES_2ND, 15),
    ];
    coPresenceAnalyticsService.getTopPairs.mockResolvedValue(pairs);
    userPrivacyConfigService.filterPeers.mockResolvedValue(
      new Map([
        ['u1', { isAnonymous: true }],
        ['u2', { isAnonymous: true }],
        ['u3', { isAnonymous: true }],
        ['u4', { isAnonymous: true }],
      ]),
    );

    await service.generateAndSendReport(makeConfig());

    const [, payload] = discordRestService.sendMessage.mock.calls[0] as [
      string,
      { embeds: Array<{ description: string }> },
    ];
    const description = payload.embeds[0].description;

    expect(description).not.toContain('💞');
    // 기존 섹션은 정상
    expect(description).toContain('📊 이번 주 vs 지난 주');
  });

  // ── 케이스 6: getTopPairs 실패 → 다른 섹션 정상 발송 ────────────────────

  it('getTopPairs가 throw해도 sendMessage가 호출되고 친밀도 섹션이 없다', async () => {
    coPresenceAnalyticsService.getTopPairs.mockRejectedValue(new Error('DB 오류'));

    await service.generateAndSendReport(makeConfig());

    expect(discordRestService.sendMessage).toHaveBeenCalledTimes(1);

    const [, payload] = discordRestService.sendMessage.mock.calls[0] as [
      string,
      { embeds: Array<{ description: string }> },
    ];
    const description = payload.embeds[0].description;

    expect(description).not.toContain('💞');
    expect(description).toContain('📊 이번 주 vs 지난 주');
    expect(description).toContain('🤖 AI 종합 분석');
  });

  // ── 케이스 7: filterPeers 실패 → 사생활 우선 섹션 제거 ──────────────────

  it('filterPeers가 throw하면 사생활 우선으로 친밀도 섹션이 제거되고 다른 섹션은 정상이다', async () => {
    coPresenceAnalyticsService.getTopPairs.mockResolvedValue([
      makeTopPairItem('u1', '동현', 'u2', '민수', PAIR_MINUTES_1ST, 24),
    ]);
    userPrivacyConfigService.filterPeers.mockRejectedValue(new Error('Redis 오류'));

    await service.generateAndSendReport(makeConfig());

    expect(discordRestService.sendMessage).toHaveBeenCalledTimes(1);

    const [, payload] = discordRestService.sendMessage.mock.calls[0] as [
      string,
      { embeds: Array<{ description: string }> },
    ];
    const description = payload.embeds[0].description;

    expect(description).not.toContain('💞');
    expect(description).toContain('📊 이번 주 vs 지난 주');
  });

  // ── 케이스 8: 실데이터 0건 → 섹션 미출력 ────────────────────────────────

  it('getTopPairs가 빈 배열을 반환하면 친밀도 섹션이 출력되지 않는다', async () => {
    coPresenceAnalyticsService.getTopPairs.mockResolvedValue([]);

    await service.generateAndSendReport(makeConfig());

    const [, payload] = discordRestService.sendMessage.mock.calls[0] as [
      string,
      { embeds: Array<{ description: string }> },
    ];
    const description = payload.embeds[0].description;

    expect(description).not.toContain('💞');
  });

  // ── 케이스 9: 섹션 위치 순서 검증 ───────────────────────────────────────

  it('섹션 순서가 이번주비교 < TOP5유저 < TOP3채널 < 베스트페어 < AI분석 이다', async () => {
    const pairs = [makeTopPairItem('u1', '동현', 'u2', '민수', PAIR_MINUTES_1ST, 24)];
    coPresenceAnalyticsService.getTopPairs.mockResolvedValue(pairs);
    userPrivacyConfigService.filterPeers.mockResolvedValue(
      new Map([
        ['u1', { isAnonymous: false }],
        ['u2', { isAnonymous: false }],
      ]),
    );

    await service.generateAndSendReport(makeConfig());

    const [, payload] = discordRestService.sendMessage.mock.calls[0] as [
      string,
      { embeds: Array<{ description: string }> },
    ];
    const description = payload.embeds[0].description;

    const idxComparison = description.indexOf('📊 이번 주 vs 지난 주');
    const idxUsers = description.indexOf('👥 TOP 5 유저');
    const idxChannels = description.indexOf('📺 TOP 3 채널');
    const idxPairs = description.indexOf('💞 이번 주 베스트 페어 TOP 5');
    const idxAi = description.indexOf('🤖 AI 종합 분석');

    expect(idxComparison).toBeGreaterThanOrEqual(0);
    expect(idxComparison).toBeLessThan(idxUsers);
    expect(idxUsers).toBeLessThan(idxChannels);
    expect(idxChannels).toBeLessThan(idxPairs);
    expect(idxPairs).toBeLessThan(idxAi);
  });

  // ── 케이스 10: 시간 포맷 검증 ────────────────────────────────────────────

  it('750분은 "12시간 30분"으로, 45분은 "45분"으로 포맷된다', async () => {
    const pairs = [
      makeTopPairItem('u1', 'A', 'u2', 'B', PAIR_MINUTES_1ST, 10),
      makeTopPairItem('u3', 'C', 'u4', 'D', PAIR_SESSIONS_1ST, 3),
    ];
    coPresenceAnalyticsService.getTopPairs.mockResolvedValue(pairs);
    userPrivacyConfigService.filterPeers.mockResolvedValue(
      new Map([
        ['u1', { isAnonymous: false }],
        ['u2', { isAnonymous: false }],
        ['u3', { isAnonymous: false }],
        ['u4', { isAnonymous: false }],
      ]),
    );

    await service.generateAndSendReport(makeConfig());

    const [, payload] = discordRestService.sendMessage.mock.calls[0] as [
      string,
      { embeds: Array<{ description: string }> },
    ];
    const description = payload.embeds[0].description;

    expect(description).toContain('12시간 30분');
    expect(description).toContain('45분');
  });
});
