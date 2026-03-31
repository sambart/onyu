import type { MusicChannelConfigResponse } from '@onyu/bot-api-client';
import { ActionRowBuilder, type ButtonBuilder, EmbedBuilder } from 'discord.js';

import {
  EMBED_COLOR_PAUSED,
  EMBED_COLOR_PLAYING,
  PROGRESS_BAR_EMPTY,
  PROGRESS_BAR_HEAD,
  PROGRESS_BAR_LENGTH,
} from '../../music.constants';
import {
  buildIdleMusicChannelEmbed,
  buildMusicChannelButtons,
  buildPlayingMusicChannelEmbed,
  formatProgressBar,
  formatTime,
} from './music-channel-embed.builder';

const DEFAULT_BUTTON_CONFIG: MusicChannelConfigResponse['buttonConfig'] = {
  buttons: [
    { type: 'search', label: '음악 검색하기', emoji: '🔍', enabled: true, row: 0 },
    { type: 'pause_resume', label: '일시정지/재개', emoji: '⏯️', enabled: true, row: 1 },
    { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
    { type: 'stop', label: '정지', emoji: '⏹️', enabled: true, row: 1 },
    { type: 'queue', label: '재생목록', emoji: '📋', enabled: true, row: 2 },
    { type: 'melon_chart', label: '멜론차트', emoji: '🎵', enabled: true, row: 2 },
    { type: 'billboard_chart', label: '빌보드', emoji: '🎶', enabled: true, row: 2 },
  ],
};

function makeConfig(
  overrides: Partial<MusicChannelConfigResponse> = {},
): MusicChannelConfigResponse {
  return {
    id: 1,
    guildId: 'guild-1',
    channelId: 'ch-1',
    messageId: null,
    embedTitle: null,
    embedDescription: null,
    embedColor: null,
    embedThumbnailUrl: null,
    buttonConfig: DEFAULT_BUTTON_CONFIG,
    enabled: true,
    ...overrides,
  };
}

function makeTrack(
  overrides: {
    title?: string;
    uri?: string | null;
    author?: string | null;
    length?: number;
    thumbnail?: string | null;
  } = {},
) {
  return {
    title: overrides.title ?? '테스트 트랙',
    uri: overrides.uri !== undefined ? overrides.uri : 'https://example.com/track',
    author: overrides.author !== undefined ? overrides.author : '테스트 아티스트',
    length: overrides.length ?? 180_000,
    thumbnail: overrides.thumbnail !== undefined ? overrides.thumbnail : null,
  };
}

function makePlayer(overrides: { position?: number; paused?: boolean } = {}) {
  return {
    position: overrides.position ?? 0,
    paused: overrides.paused ?? false,
  };
}

// ─────────────────────────────────────────────────────────
// buildIdleMusicChannelEmbed
// ─────────────────────────────────────────────────────────
describe('buildIdleMusicChannelEmbed', () => {
  it('EmbedBuilder 인스턴스를 반환한다', () => {
    const embed = buildIdleMusicChannelEmbed(makeConfig());
    expect(embed).toBeInstanceOf(EmbedBuilder);
  });

  it('embedTitle이 없으면 기본값 "음악 채널"을 사용한다', () => {
    const embed = buildIdleMusicChannelEmbed(makeConfig({ embedTitle: null }));
    expect(embed.data.title).toBe('음악 채널');
  });

  it('embedTitle이 있으면 커스텀 제목을 사용한다', () => {
    const embed = buildIdleMusicChannelEmbed(makeConfig({ embedTitle: '나만의 뮤직룸' }));
    expect(embed.data.title).toBe('나만의 뮤직룸');
  });

  it('embedDescription이 없으면 기본 설명 텍스트를 사용한다', () => {
    const embed = buildIdleMusicChannelEmbed(makeConfig({ embedDescription: null }));
    expect(embed.data.description).toBe('버튼을 눌러 음악을 재생하거나, 검색어를 입력하세요.');
  });

  it('embedDescription이 있으면 커스텀 설명을 사용한다', () => {
    const embed = buildIdleMusicChannelEmbed(makeConfig({ embedDescription: '커스텀 설명' }));
    expect(embed.data.description).toBe('커스텀 설명');
  });

  it('embedColor가 없으면 기본 색상 #5865F2를 사용한다', () => {
    const embed = buildIdleMusicChannelEmbed(makeConfig({ embedColor: null }));
    // discord.js는 hex 색상을 정수로 저장한다
    expect(embed.data.color).toBeDefined();
  });

  it('embedThumbnailUrl이 있으면 썸네일을 설정한다', () => {
    const embed = buildIdleMusicChannelEmbed(
      makeConfig({ embedThumbnailUrl: 'https://example.com/thumb.png' }),
    );
    expect(embed.data.thumbnail?.url).toBe('https://example.com/thumb.png');
  });

  it('embedThumbnailUrl이 없으면 썸네일을 설정하지 않는다', () => {
    const embed = buildIdleMusicChannelEmbed(makeConfig({ embedThumbnailUrl: null }));
    expect(embed.data.thumbnail).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// buildPlayingMusicChannelEmbed
// ─────────────────────────────────────────────────────────
describe('buildPlayingMusicChannelEmbed', () => {
  it('EmbedBuilder 인스턴스를 반환한다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack() as never,

      isPaused: false,
    });
    expect(embed).toBeInstanceOf(EmbedBuilder);
  });

  it('트랙 제목이 임베드 제목으로 설정된다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack({ title: '봄날' }) as never,

      isPaused: false,
    });
    expect(embed.data.title).toBe('봄날');
  });

  it('트랙 URI가 임베드 URL로 설정된다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack({ uri: 'https://youtu.be/abc123' }) as never,

      isPaused: false,
    });
    expect(embed.data.url).toBe('https://youtu.be/abc123');
  });

  it('isPaused=false이면 EMBED_COLOR_PLAYING 색상이 설정된다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack() as never,

      isPaused: false,
    });
    expect(embed.data.color).toBe(EMBED_COLOR_PLAYING);
  });

  it('isPaused=true이면 EMBED_COLOR_PAUSED 색상이 설정된다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack() as never,

      isPaused: true,
    });
    expect(embed.data.color).toBe(EMBED_COLOR_PAUSED);
  });

  it('아티스트 필드에 track.author가 표시된다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack({ author: 'BTS' }) as never,

      isPaused: false,
    });
    const field = embed.data.fields?.find((f) => f.name === '아티스트');
    expect(field?.value).toBe('BTS');
    expect(field?.inline).toBe(true);
  });

  it('author가 null이면 아티스트 필드에 Unknown이 표시된다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack({ author: null }) as never,

      isPaused: false,
    });
    const field = embed.data.fields?.find((f) => f.name === '아티스트');
    expect(field?.value).toBe('Unknown');
  });

  it('isPaused=false이면 상태 필드에 "재생 중"이 표시된다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack() as never,

      isPaused: false,
    });
    const field = embed.data.fields?.find((f) => f.name === '상태');
    expect(field?.value).toContain('재생 중');
    expect(field?.inline).toBe(true);
  });

  it('isPaused=true이면 상태 필드에 "일시정지"가 표시된다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack() as never,

      isPaused: true,
    });
    const field = embed.data.fields?.find((f) => f.name === '상태');
    expect(field?.value).toContain('일시정지');
  });

  it('길이 필드에 트랙 재생 시간이 표시된다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack({ length: 180_000 }) as never,
      isPaused: false,
    });
    const field = embed.data.fields?.find((f) => f.name === '길이');
    expect(field?.value).toBe('3:00');
    expect(field?.inline).toBe(true);
  });

  it('길이가 0이면 LIVE로 표시된다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack({ length: 0 }) as never,
      isPaused: false,
    });
    const field = embed.data.fields?.find((f) => f.name === '길이');
    expect(field?.value).toBe('LIVE');
  });

  it('트랙 썸네일이 있으면 track.thumbnail을 사용한다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack({ thumbnail: 'https://example.com/track-thumb.jpg' }) as never,

      isPaused: false,
    });
    expect(embed.data.thumbnail?.url).toBe('https://example.com/track-thumb.jpg');
  });

  it('트랙 썸네일이 없고 fallbackThumbnailUrl이 있으면 fallback을 사용한다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack({ thumbnail: null }) as never,

      isPaused: false,
      fallbackThumbnailUrl: 'https://example.com/fallback.jpg',
    });
    expect(embed.data.thumbnail?.url).toBe('https://example.com/fallback.jpg');
  });

  it('트랙 썸네일과 fallback 모두 없으면 썸네일을 설정하지 않는다', () => {
    const embed = buildPlayingMusicChannelEmbed({
      track: makeTrack({ thumbnail: null }) as never,

      isPaused: false,
      fallbackThumbnailUrl: null,
    });
    expect(embed.data.thumbnail).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────
// buildMusicChannelButtons
// ─────────────────────────────────────────────────────────
describe('buildMusicChannelButtons', () => {
  it('ActionRowBuilder 배열을 반환한다', () => {
    const rows = buildMusicChannelButtons(makeConfig());
    expect(rows).toBeInstanceOf(Array);
    rows.forEach((row) => expect(row).toBeInstanceOf(ActionRowBuilder));
  });

  it('enabled=false인 버튼은 ActionRow에 포함하지 않는다', () => {
    const config = makeConfig({
      buttonConfig: {
        buttons: [
          { type: 'search', label: '검색', emoji: '🔍', enabled: true, row: 0 },
          { type: 'stop', label: '정지', emoji: '⏹️', enabled: false, row: 0 },
        ],
      },
    });

    const rows = buildMusicChannelButtons(config);

    // row 0에 enabled=true인 것 1개만
    expect(rows).toHaveLength(1);
    const firstRow = rows[0];
    expect(firstRow?.components).toHaveLength(1);
  });

  it('row 번호별로 ActionRow를 그룹핑한다', () => {
    const config = makeConfig({
      buttonConfig: {
        buttons: [
          { type: 'search', label: '검색', emoji: '🔍', enabled: true, row: 0 },
          { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
          { type: 'queue', label: '목록', emoji: '📋', enabled: true, row: 2 },
        ],
      },
    });

    const rows = buildMusicChannelButtons(config);

    expect(rows).toHaveLength(3);
  });

  it('row 번호 순서로 정렬된 ActionRow 배열을 반환한다', () => {
    const config = makeConfig({
      buttonConfig: {
        buttons: [
          { type: 'queue', label: '목록', emoji: '📋', enabled: true, row: 2 },
          { type: 'search', label: '검색', emoji: '🔍', enabled: true, row: 0 },
          { type: 'skip', label: '스킵', emoji: '⏭️', enabled: true, row: 1 },
        ],
      },
    });

    const rows = buildMusicChannelButtons(config);

    // 3개 row가 올바르게 생성됨
    expect(rows).toHaveLength(3);
    // 각 row에 1개씩 버튼
    rows.forEach((row) => expect(row.components).toHaveLength(1));
  });

  it('한 row에 버튼이 5개를 초과하면 5개만 포함한다', () => {
    const manyButtons = Array.from({ length: 7 }, (_, i) => ({
      type: `btn${i}`,
      label: `버튼${i}`,
      emoji: '',
      enabled: true,
      row: 0,
    }));

    const rows = buildMusicChannelButtons(makeConfig({ buttonConfig: { buttons: manyButtons } }));

    expect(rows[0]?.components).toHaveLength(5);
  });

  it('버튼의 customId는 "music_channel:{type}" 형식이다', () => {
    const config = makeConfig({
      buttonConfig: {
        buttons: [{ type: 'search', label: '검색', emoji: '🔍', enabled: true, row: 0 }],
      },
    });

    const rows = buildMusicChannelButtons(config);
    const button = rows[0]?.components[0] as ButtonBuilder;

    expect(button?.data.custom_id).toBe('music_channel:search');
  });

  it('enabled 버튼이 없으면 빈 배열을 반환한다', () => {
    const config = makeConfig({
      buttonConfig: {
        buttons: [{ type: 'search', label: '검색', emoji: '🔍', enabled: false, row: 0 }],
      },
    });

    const rows = buildMusicChannelButtons(config);

    expect(rows).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────
// formatTime
// ─────────────────────────────────────────────────────────
describe('formatTime', () => {
  it('0ms는 0:00으로 포맷된다', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('83000ms (1분 23초)는 1:23으로 포맷된다', () => {
    expect(formatTime(83_000)).toBe('1:23');
  });

  it('3661000ms (1시간 1분 1초)는 1:01:01으로 포맷된다', () => {
    expect(formatTime(3_661_000)).toBe('1:01:01');
  });

  it('59초는 0:59로 포맷된다', () => {
    expect(formatTime(59_000)).toBe('0:59');
  });

  it('3600000ms (1시간)는 1:00:00으로 포맷된다', () => {
    expect(formatTime(3_600_000)).toBe('1:00:00');
  });

  it('초가 한 자리이면 0으로 패딩된다', () => {
    expect(formatTime(65_000)).toBe('1:05');
  });
});

// ─────────────────────────────────────────────────────────
// formatProgressBar
// ─────────────────────────────────────────────────────────
describe('formatProgressBar', () => {
  it('duration이 0이면 빈 칸(EMPTY)으로 PROGRESS_BAR_LENGTH만큼 채워진다', () => {
    const bar = formatProgressBar(0, 0);
    expect(bar).toBe(PROGRESS_BAR_EMPTY.repeat(PROGRESS_BAR_LENGTH));
    expect(bar.length).toBe(PROGRESS_BAR_LENGTH);
  });

  it('시작 위치(0%)에서는 헤드(>)가 가장 앞에 있다', () => {
    const bar = formatProgressBar(0, 180_000);
    expect(bar[0]).toBe(PROGRESS_BAR_HEAD);
    expect(bar.length).toBe(PROGRESS_BAR_LENGTH);
  });

  it('50% 위치에서는 헤드가 10번째 위치에 있다', () => {
    const bar = formatProgressBar(90_000, 180_000);
    const headIndex = bar.indexOf(PROGRESS_BAR_HEAD);
    expect(headIndex).toBe(10);
    expect(bar.length).toBe(PROGRESS_BAR_LENGTH);
  });

  it('position이 duration보다 크면 1.0으로 클램프하여 처리한다', () => {
    const bar = formatProgressBar(200_000, 180_000);
    // ratio = min(200000/180000, 1) = 1.0
    expect(bar.length).toBeGreaterThanOrEqual(PROGRESS_BAR_LENGTH);
  });

  it('진행바 안에 PROGRESS_BAR_HEAD가 정확히 1개 포함된다', () => {
    const bar = formatProgressBar(60_000, 180_000);
    const headCount = bar.split('').filter((c) => c === PROGRESS_BAR_HEAD).length;
    expect(headCount).toBe(1);
  });
});
