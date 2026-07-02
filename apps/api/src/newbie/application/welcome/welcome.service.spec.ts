import { type Mocked, vi } from 'vitest';

import { type DiscordRestService } from '../../../discord-rest/discord-rest.service';
import { type NewbieConfigOrmEntity as NewbieConfig } from '../../infrastructure/newbie-config.orm-entity';
import { type WelcomeMemberData, WelcomeService } from './welcome.service';

function makeMemberData(overrides: Partial<WelcomeMemberData> = {}): WelcomeMemberData {
  return {
    id: 'user-1',
    displayName: '테스트유저',
    guildId: 'guild-1',
    memberCount: 100,
    serverName: '테스트서버',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<NewbieConfig> = {}): NewbieConfig {
  return {
    id: 1,
    guildId: 'guild-1',
    welcomeEnabled: true,
    welcomeChannelId: 'ch-welcome',
    welcomeEmbedTitle: '{username}님 환영합니다!',
    welcomeEmbedDescription: '{mention}님이 {serverName}에 입장했습니다. 현재 {memberCount}명!',
    welcomeEmbedColor: '#FF5733',
    welcomeEmbedThumbnailUrl: 'https://example.com/thumb.png',
    welcomeContent: '{username}님 어서오세요!',
    ...overrides,
  } as NewbieConfig;
}

describe('WelcomeService', () => {
  let service: WelcomeService;
  let discordRest: Mocked<DiscordRestService>;

  beforeEach(() => {
    discordRest = {
      sendMessage: vi.fn().mockResolvedValue({}),
    } as unknown as Mocked<DiscordRestService>;

    service = new WelcomeService(discordRest);
  });

  describe('sendWelcomeMessage', () => {
    it('환영 메시지를 전송한다', async () => {
      const memberData = makeMemberData();
      const config = makeConfig();

      await service.sendWelcomeMessage(memberData, config);

      expect(discordRest.sendMessage).toHaveBeenCalledWith('ch-welcome', {
        content: '테스트유저님 어서오세요!',
        embeds: [
          expect.objectContaining({
            title: '테스트유저님 환영합니다!',
            description: '<@user-1>님이 테스트서버에 입장했습니다. 현재 100명!',
            color: expect.any(Number),
            thumbnail: { url: 'https://example.com/thumb.png' },
          }),
        ],
      });
    });

    it('welcomeChannelId가 없으면 메시지를 전송하지 않는다', async () => {
      const memberData = makeMemberData();
      const config = makeConfig({ welcomeChannelId: null });

      await service.sendWelcomeMessage(memberData, config);

      expect(discordRest.sendMessage).not.toHaveBeenCalled();
    });

    it('welcomeContent가 없으면 content를 undefined로 전송한다', async () => {
      const memberData = makeMemberData();
      const config = makeConfig({ welcomeContent: null });

      await service.sendWelcomeMessage(memberData, config);

      expect(discordRest.sendMessage).toHaveBeenCalledWith(
        'ch-welcome',
        expect.objectContaining({ content: undefined }),
      );
    });

    it('embedTitle이 없으면 title을 설정하지 않는다', async () => {
      const memberData = makeMemberData();
      const config = makeConfig({ welcomeEmbedTitle: null });

      await service.sendWelcomeMessage(memberData, config);

      const payload = discordRest.sendMessage.mock.calls[0][1];
      const embed = (payload as { embeds: Array<{ title?: string }> }).embeds[0];
      expect(embed.title).toBeUndefined();
    });

    it('embedDescription이 없으면 description을 설정하지 않는다', async () => {
      const memberData = makeMemberData();
      const config = makeConfig({ welcomeEmbedDescription: null });

      await service.sendWelcomeMessage(memberData, config);

      const payload = discordRest.sendMessage.mock.calls[0][1];
      const embed = (payload as { embeds: Array<{ description?: string }> }).embeds[0];
      expect(embed.description).toBeUndefined();
    });

    it('embedColor가 없으면 color를 설정하지 않는다', async () => {
      const memberData = makeMemberData();
      const config = makeConfig({ welcomeEmbedColor: null });

      await service.sendWelcomeMessage(memberData, config);

      const payload = discordRest.sendMessage.mock.calls[0][1];
      const embed = (payload as { embeds: Array<{ color?: number }> }).embeds[0];
      expect(embed.color).toBeUndefined();
    });

    it('embedThumbnailUrl이 없으면 thumbnail을 설정하지 않는다', async () => {
      const memberData = makeMemberData();
      const config = makeConfig({ welcomeEmbedThumbnailUrl: null });

      await service.sendWelcomeMessage(memberData, config);

      const payload = discordRest.sendMessage.mock.calls[0][1];
      const embed = (payload as { embeds: Array<{ thumbnail?: unknown }> }).embeds[0];
      expect(embed.thumbnail).toBeUndefined();
    });

    it('템플릿 변수가 여러 번 등장해도 모두 치환한다', async () => {
      const memberData = makeMemberData({ displayName: 'Alice' });
      const config = makeConfig({
        welcomeEmbedTitle: '{username}! {username}!',
        welcomeEmbedDescription: null,
        welcomeContent: null,
      });

      await service.sendWelcomeMessage(memberData, config);

      const payload = discordRest.sendMessage.mock.calls[0][1];
      const embed = (payload as { embeds: Array<{ title?: string }> }).embeds[0];
      expect(embed.title).toBe('Alice! Alice!');
    });
  });
});
