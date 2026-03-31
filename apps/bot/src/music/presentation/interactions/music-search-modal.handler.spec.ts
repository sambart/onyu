import { GuildMember } from 'discord.js';
import type { Mock } from 'vitest';

import { MusicSearchModalHandler } from './music-search-modal.handler';

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
    isModalSubmit?: boolean;
    customId?: string;
    guildId?: string;
    channelId?: string;
    userId?: string;
    member?: GuildMember | null;
    query?: string;
    replied?: boolean;
    deferred?: boolean;
  } = {},
) {
  const member = overrides.member !== undefined ? overrides.member : makeMember('voice-1');
  return {
    isModalSubmit: vi.fn().mockReturnValue(overrides.isModalSubmit ?? true),
    customId: overrides.customId ?? 'music_channel:search_modal',
    guildId: overrides.guildId ?? 'guild-1',
    channelId: overrides.channelId ?? 'ch-1',
    user: { id: overrides.userId ?? 'user-1' },
    member,
    replied: overrides.replied ?? false,
    deferred: overrides.deferred ?? false,
    fields: {
      getTextInputValue: vi.fn().mockReturnValue(overrides.query ?? '검색어'),
    },
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  };
}

describe('MusicSearchModalHandler', () => {
  let handler: MusicSearchModalHandler;
  let musicService: {
    play: Mock;
  };

  beforeEach(() => {
    musicService = {
      play: vi.fn(),
    };

    handler = new MusicSearchModalHandler(musicService as never);
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────
  // 기본 필터링
  // ─────────────────────────────────────────────────────────
  describe('handle — 기본 필터링', () => {
    it('모달 제출 인터랙션이 아니면 무시한다', async () => {
      const interaction = makeInteraction({ isModalSubmit: false });
      await handler.handle(interaction as never);
      expect(musicService.play).not.toHaveBeenCalled();
    });

    it('customId가 music_channel:search_modal이 아니면 무시한다', async () => {
      const interaction = makeInteraction({ customId: 'other:modal' });
      await handler.handle(interaction as never);
      expect(musicService.play).not.toHaveBeenCalled();
    });

    it('guildId가 없으면 무시한다', async () => {
      const interaction = makeInteraction();
      (interaction as { guildId: string | null }).guildId = null;
      await handler.handle(interaction as never);
      expect(musicService.play).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────
  // 음성 채널 검증
  // ─────────────────────────────────────────────────────────
  describe('음성 채널 검증', () => {
    it('음성 채널 미접속 시 "음성 채널에 먼저 입장해 주세요." ephemeral 응답을 반환한다', async () => {
      const member = makeMember(null);
      const interaction = makeInteraction({ member });
      await handler.handle(interaction as never);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '음성 채널에 먼저 입장해 주세요.',
          ephemeral: true,
        }),
      );
      expect(musicService.play).not.toHaveBeenCalled();
    });

    it('GuildMember가 아닌 경우 "길드 멤버 정보를 가져올 수 없습니다." ephemeral 응답을 반환한다', async () => {
      const interaction = makeInteraction({ member: { id: 'user-1' } as unknown as GuildMember });
      await handler.handle(interaction as never);
      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: '길드 멤버 정보를 가져올 수 없습니다.',
          ephemeral: true,
        }),
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // 정상 처리
  // ─────────────────────────────────────────────────────────
  describe('정상 처리', () => {
    it('검색어로 음악을 재생하고 트랙 제목을 포함한 응답을 반환한다', async () => {
      const playResult = { firstTrack: { title: '봄날' }, isPlaylist: false, trackCount: 1 };
      musicService.play.mockResolvedValue(playResult);
      const interaction = makeInteraction({ query: '봄날 BTS' });

      await handler.handle(interaction as never);

      expect(musicService.play).toHaveBeenCalledWith(
        expect.objectContaining({
          query: '봄날 BTS',
          guildId: 'guild-1',
          voiceChannelId: 'voice-1',
          requesterId: 'user-1',
        }),
      );
      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '"봄날"을(를) 대기열에 추가했습니다.' }),
      );
    });

    it('play() 호출 전 deferReply를 ephemeral로 호출한다', async () => {
      musicService.play.mockResolvedValue({
        firstTrack: { title: '트랙' },
        isPlaylist: false,
        trackCount: 1,
      });
      const interaction = makeInteraction();

      await handler.handle(interaction as never);

      expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    });
  });

  // ─────────────────────────────────────────────────────────
  // 에러 처리
  // ─────────────────────────────────────────────────────────
  describe('에러 처리', () => {
    it('play() 실패 시 deferReply 이후이므로 deferred=true 상태에서 editReply로 에러 메시지를 응답한다', async () => {
      // play() 실패는 deferReply 이후에 발생한다
      // 구현에서 interaction.replied || interaction.deferred 를 체크하므로
      // deferred: true로 설정해야 editReply가 호출된다
      musicService.play.mockRejectedValue(new Error('Track not found'));
      const interaction = makeInteraction({ deferred: true });

      await handler.handle(interaction as never);

      expect(interaction.editReply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '음악 검색에 실패했습니다. 다시 시도해 주세요.' }),
      );
    });

    it('deferReply 이전에 에러 발생 시 reply로 에러 메시지를 응답한다', async () => {
      // deferred=false, replied=false 상태에서는 reply가 호출된다
      musicService.play.mockRejectedValue(new Error('Track not found'));
      const interaction = makeInteraction({ deferred: false, replied: false });
      // deferReply 호출 자체를 실패시켜 deferred 상태가 안 되도록
      interaction.deferReply.mockRejectedValue(new Error('defer failed'));

      await handler.handle(interaction as never);

      expect(interaction.reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: '음악 검색에 실패했습니다. 다시 시도해 주세요.' }),
      );
    });
  });
});
