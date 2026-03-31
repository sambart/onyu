import { GuildMember } from 'discord.js';
import type { Mock } from 'vitest';

import { MusicChannelButtonHandler } from './music-channel-button.handler';

// GuildMember를 직접 인스턴스화할 수 없으므로 prototype 체크를 우회하는 mock을 사용한다
function makeMember(voiceChannelId: string | null = 'voice-1') {
  const member = Object.create(GuildMember.prototype) as GuildMember;
  Object.defineProperty(member, 'voice', {
    value: { channelId: voiceChannelId },
    configurable: true,
  });
  return member;
}

function makeInteraction(
  overrides: {
    isButton?: boolean;
    customId?: string;
    guildId?: string;
    channelId?: string;
    userId?: string;
    member?: GuildMember | null;
    replied?: boolean;
    deferred?: boolean;
  } = {},
) {
  const member = overrides.member !== undefined ? overrides.member : makeMember('voice-1');
  const interaction = {
    isButton: vi.fn().mockReturnValue(overrides.isButton ?? true),
    isModalSubmit: vi.fn().mockReturnValue(false),
    customId: overrides.customId ?? 'music_channel:search',
    guildId: overrides.guildId ?? 'guild-1',
    channelId: overrides.channelId ?? 'ch-1',
    user: { id: overrides.userId ?? 'user-1' },
    member,
    replied: overrides.replied ?? false,
    deferred: overrides.deferred ?? false,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  };
  return interaction;
}

describe('MusicChannelButtonHandler', () => {
  let handler: MusicChannelButtonHandler;
  let musicService: {
    getKazagumo: Mock;
    pause: Mock;
    resume: Mock;
    skip: Mock;
    stop: Mock;
    playBulk: Mock;
  };
  let chartCrawler: {
    getMelonChart: Mock;
    getBillboardChart: Mock;
  };
  let mockKazagumo: {
    players: Map<
      string,
      {
        queue: {
          current: { title: string; author: string } | null;
          [Symbol.iterator]?: () => Iterator<unknown>;
        };
        paused: boolean;
      }
    >;
  };

  beforeEach(() => {
    mockKazagumo = {
      players: new Map(),
    };

    musicService = {
      getKazagumo: vi.fn().mockReturnValue(mockKazagumo),
      pause: vi.fn(),
      resume: vi.fn(),
      skip: vi.fn(),
      stop: vi.fn(),
      playBulk: vi.fn().mockResolvedValue(0),
    };

    chartCrawler = {
      getMelonChart: vi.fn(),
      getBillboardChart: vi.fn(),
    };

    handler = new MusicChannelButtonHandler(musicService as never, chartCrawler as never);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // 기본 필터링
  // ─────────────────────────────────────────────────────────
  describe('handle — 기본 필터링', () => {
    it('버튼 인터랙션이 아니면 무시한다', async () => {
      const interaction = makeInteraction({ isButton: false });
      await handler.handle(interaction as never);
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('music_channel: 접두사가 없는 버튼은 무시한다', async () => {
      const interaction = makeInteraction({ customId: 'other:button' });
      await handler.handle(interaction as never);
      expect(interaction.reply).not.toHaveBeenCalled();
      expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it('guildId가 없으면 무시한다', async () => {
      const interaction = makeInteraction({ guildId: undefined as unknown as string });
      // guildId를 null로 설정
      (interaction as { guildId: string | null }).guildId = null;
      await handler.handle(interaction as never);
      expect(interaction.reply).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────
  // search 버튼
  // ─────────────────────────────────────────────────────────
  describe('search 버튼', () => {
    it('음악 검색 모달을 팝업으로 표시한다', async () => {
      const interaction = makeInteraction({ customId: 'music_channel:search' });
      await handler.handle(interaction as never);
      expect(interaction.showModal).toHaveBeenCalled();
    });

    it('모달의 customId는 music_channel:search_modal이다', async () => {
      const interaction = makeInteraction({ customId: 'music_channel:search' });
      await handler.handle(interaction as never);
      const [modal] = interaction.showModal.mock.calls[0] as [{ data: { custom_id: string } }];
      expect(modal.data?.custom_id).toBe('music_channel:search_modal');
    });

    it('search 버튼은 음성 채널 접속 여부를 확인하지 않는다', async () => {
      const member = makeMember(null); // 음성 채널 미접속
      const interaction = makeInteraction({ customId: 'music_channel:search', member });
      await handler.handle(interaction as never);
      // modal이 표시되어야 함 (음성 채널 체크 없음)
      expect(interaction.showModal).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────
  // pause_resume 버튼
  // ─────────────────────────────────────────────────────────
  describe('pause_resume 버튼', () => {
    it('음성 채널 미접속 시 ephemeral 에러 응답을 반환한다', async () => {
      const member = makeMember(null);
      const interaction = makeInteraction({ customId: 'music_channel:pause_resume', member });
      await handler.handle(interaction as never);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true, content: '음성 채널에 먼저 입장해 주세요.' }),
      );
    });

    it('재생 중인 곡이 없으면 "현재 재생 중인 곡이 없습니다." 응답을 반환한다', async () => {
      mockKazagumo.players.set('guild-1', {
        queue: { current: null },
        paused: false,
      });
      const interaction = makeInteraction({ customId: 'music_channel:pause_resume' });
      await handler.handle(interaction as never);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '현재 재생 중인 곡이 없습니다.' }),
      );
    });

    it('재생 중이면 일시정지하고 "일시정지했습니다." 응답을 반환한다', async () => {
      mockKazagumo.players.set('guild-1', {
        queue: { current: { title: '현재 트랙', author: '아티스트' } },
        paused: false,
      });
      const interaction = makeInteraction({ customId: 'music_channel:pause_resume' });
      await handler.handle(interaction as never);
      expect(musicService.pause).toHaveBeenCalledWith('guild-1');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '일시정지했습니다.' }),
      );
    });

    it('일시정지 중이면 재개하고 "재생을 재개했습니다." 응답을 반환한다', async () => {
      mockKazagumo.players.set('guild-1', {
        queue: { current: { title: '현재 트랙', author: '아티스트' } },
        paused: true,
      });
      const interaction = makeInteraction({ customId: 'music_channel:pause_resume' });
      await handler.handle(interaction as never);
      expect(musicService.resume).toHaveBeenCalledWith('guild-1');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '재생을 재개했습니다.' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // skip 버튼
  // ─────────────────────────────────────────────────────────
  describe('skip 버튼', () => {
    it('음성 채널 미접속 시 ephemeral 에러 응답을 반환한다', async () => {
      const member = makeMember(null);
      const interaction = makeInteraction({ customId: 'music_channel:skip', member });
      await handler.handle(interaction as never);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true, content: '음성 채널에 먼저 입장해 주세요.' }),
      );
    });

    it('다음 트랙이 있으면 "스킵했습니다. 다음 곡: ..." 응답을 반환한다', async () => {
      musicService.skip.mockResolvedValue({ player: {}, nextTrack: { title: '다음 노래' } });
      const interaction = makeInteraction({ customId: 'music_channel:skip' });
      await handler.handle(interaction as never);
      expect(musicService.skip).toHaveBeenCalledWith('guild-1');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '스킵했습니다. 다음 곡: **다음 노래**' }),
      );
    });

    it('다음 트랙이 없으면 "스킵했습니다. 다음 곡이 없어 퇴장합니다." 응답을 반환한다', async () => {
      musicService.skip.mockResolvedValue({ player: {}, nextTrack: null });
      const interaction = makeInteraction({ customId: 'music_channel:skip' });
      await handler.handle(interaction as never);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '스킵했습니다. 다음 곡이 없어 퇴장합니다.' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // stop 버튼
  // ─────────────────────────────────────────────────────────
  describe('stop 버튼', () => {
    it('음성 채널 미접속 시 ephemeral 에러 응답을 반환한다', async () => {
      const member = makeMember(null);
      const interaction = makeInteraction({ customId: 'music_channel:stop', member });
      await handler.handle(interaction as never);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true, content: '음성 채널에 먼저 입장해 주세요.' }),
      );
    });

    it('정상 정지 후 "재생을 정지하고 퇴장했습니다." 응답을 반환한다', async () => {
      const interaction = makeInteraction({ customId: 'music_channel:stop' });
      await handler.handle(interaction as never);
      expect(musicService.stop).toHaveBeenCalledWith('guild-1');
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '재생을 정지하고 퇴장했습니다.' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // queue 버튼
  // ─────────────────────────────────────────────────────────
  describe('queue 버튼', () => {
    it('현재 재생 중인 곡이 없으면 "현재 재생 중인 곡이 없습니다." 응답을 반환한다', async () => {
      mockKazagumo.players.set('guild-1', {
        queue: { current: null, [Symbol.iterator]: () => [][Symbol.iterator]() },
        paused: false,
      });
      const interaction = makeInteraction({ customId: 'music_channel:queue' });
      await handler.handle(interaction as never);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '현재 재생 중인 곡이 없습니다.' }),
      );
    });

    it('현재 재생 중 곡이 있으면 큐 목록을 ephemeral 메시지로 응답한다', async () => {
      const player = {
        queue: {
          current: { title: '현재 트랙', author: 'BTS' },
          [Symbol.iterator]: () => [][Symbol.iterator](),
        },
        paused: false,
      };
      mockKazagumo.players.set('guild-1', player);
      const interaction = makeInteraction({ customId: 'music_channel:queue' });
      await handler.handle(interaction as never);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('현재 트랙') }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // melon_chart 버튼
  // ─────────────────────────────────────────────────────────
  describe('melon_chart 버튼', () => {
    it('음성 채널 미접속 시 ephemeral 에러 응답을 반환한다', async () => {
      const member = makeMember(null);
      const interaction = makeInteraction({ customId: 'music_channel:melon_chart', member });
      await handler.handle(interaction as never);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true, content: '음성 채널에 먼저 입장해 주세요.' }),
      );
    });

    it('차트 조회 결과가 없으면 "멜론 차트를 불러오지 못했습니다." 응답을 반환한다', async () => {
      chartCrawler.getMelonChart.mockResolvedValue([]);
      const interaction = makeInteraction({ customId: 'music_channel:melon_chart' });
      await handler.handle(interaction as never);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '멜론 차트를 불러오지 못했습니다.' }),
      );
    });

    it('차트 곡들을 일괄 재생하고 추가된 곡 수를 응답한다', async () => {
      const entries = [
        { rank: 1, title: '봄날', artist: 'BTS' },
        { rank: 2, title: 'Dynamite', artist: 'BTS' },
      ];
      chartCrawler.getMelonChart.mockResolvedValue(entries);
      musicService.playBulk.mockResolvedValue(2);
      const interaction = makeInteraction({ customId: 'music_channel:melon_chart' });
      await handler.handle(interaction as never);

      expect(musicService.playBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          queries: ['봄날 BTS', 'Dynamite BTS'],
          guildId: 'guild-1',
          voiceChannelId: 'voice-1',
        }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '멜론 차트 2곡을 대기열에 추가했습니다.' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // billboard_chart 버튼
  // ─────────────────────────────────────────────────────────
  describe('billboard_chart 버튼', () => {
    it('음성 채널 미접속 시 ephemeral 에러 응답을 반환한다', async () => {
      const member = makeMember(null);
      const interaction = makeInteraction({ customId: 'music_channel:billboard_chart', member });
      await handler.handle(interaction as never);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ ephemeral: true, content: '음성 채널에 먼저 입장해 주세요.' }),
      );
    });

    it('차트 조회 결과가 없으면 "빌보드 차트를 불러오지 못했습니다." 응답을 반환한다', async () => {
      chartCrawler.getBillboardChart.mockResolvedValue([]);
      const interaction = makeInteraction({ customId: 'music_channel:billboard_chart' });
      await handler.handle(interaction as never);
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '빌보드 차트를 불러오지 못했습니다.' }),
      );
    });

    it('차트 곡들을 일괄 재생하고 추가된 곡 수를 응답한다', async () => {
      const entries = [
        { rank: 1, title: 'Flowers', artist: 'Miley Cyrus' },
        { rank: 2, title: 'Anti-Hero', artist: 'Taylor Swift' },
      ];
      chartCrawler.getBillboardChart.mockResolvedValue(entries);
      musicService.playBulk.mockResolvedValue(2);
      const interaction = makeInteraction({ customId: 'music_channel:billboard_chart' });
      await handler.handle(interaction as never);

      expect(musicService.playBulk).toHaveBeenCalledWith(
        expect.objectContaining({
          queries: ['Flowers Miley Cyrus', 'Anti-Hero Taylor Swift'],
          guildId: 'guild-1',
        }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '빌보드 차트 2곡을 대기열에 추가했습니다.' }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // 에러 처리
  // ─────────────────────────────────────────────────────────
  describe('에러 처리', () => {
    it('버튼 처리 중 개별 핸들러 에러 발생 시 내부 catch에서 처리하여 응답한다', async () => {
      // handleStop 내부 try-catch가 에러를 잡아 "현재 재생 중인 곡이 없습니다."로 응답한다
      musicService.stop.mockImplementation(() => {
        throw new Error('처리 실패');
      });
      const interaction = makeInteraction({ customId: 'music_channel:stop' });
      await handler.handle(interaction as never);
      // 내부 catch가 먼저 처리하므로 editReply가 호출됨
      expect(interaction.editReply).toHaveBeenCalled();
    });

    it('deferReply 실패 시 외부 에러 핸들러가 reply로 에러 응답을 반환한다', async () => {
      // deferReply 자체가 실패하면 외부 catch로 올라가고
      // replied=false, deferred=false이므로 reply가 호출된다
      const interaction = makeInteraction({
        customId: 'music_channel:stop',
        replied: false,
        deferred: false,
      });
      interaction.deferReply.mockRejectedValue(new Error('deferReply 실패'));
      await handler.handle(interaction as never);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '오류가 발생했습니다. 잠시 후 다시 시도하세요.' }),
      );
    });
  });
});
