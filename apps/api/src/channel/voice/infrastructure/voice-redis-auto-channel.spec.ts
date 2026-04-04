/**
 * VoiceRedisRepository — auto-channel 메타데이터 캐시 테스트
 * 대상: setAutoChannelInfo, getAutoChannelInfo (F-VOICE-032)
 */

import { MockRedisService } from '../../../test-utils/mock-redis.service';
import { VoiceKeys } from './voice-cache.keys';
import { type AutoChannelInfo, VoiceRedisRepository } from './voice-redis.repository';

describe('VoiceRedisRepository — autoChannelInfo 캐시', () => {
  let repo: VoiceRedisRepository;
  let redis: MockRedisService;

  const guild = 'guild-1';
  const channelId = 'ch-auto-1';

  beforeEach(() => {
    redis = new MockRedisService();
    repo = new VoiceRedisRepository(redis as never);
  });

  afterEach(() => {
    redis.clear();
  });

  describe('setAutoChannelInfo / getAutoChannelInfo', () => {
    it('auto_select 타입의 메타데이터를 저장하고 조회할 수 있다', async () => {
      const info: AutoChannelInfo = {
        configId: 1,
        configName: '게임방',
        channelType: 'auto_select',
        buttonId: 10,
        buttonLabel: '게임',
      };

      await repo.setAutoChannelInfo(guild, channelId, info);
      const result = await repo.getAutoChannelInfo(guild, channelId);

      expect(result).toEqual(info);
    });

    it('auto_instant 타입의 메타데이터를 저장하고 조회할 수 있다', async () => {
      const info: AutoChannelInfo = {
        configId: 42,
        configName: '즉시생성방',
        channelType: 'auto_instant',
        buttonId: null,
        buttonLabel: null,
      };

      await repo.setAutoChannelInfo(guild, channelId, info);
      const result = await repo.getAutoChannelInfo(guild, channelId);

      expect(result).toEqual(info);
    });

    it('저장하지 않은 채널 조회 시 null을 반환한다', async () => {
      const result = await repo.getAutoChannelInfo(guild, 'non-existent-channel');

      expect(result).toBeNull();
    });

    it('올바른 키 패턴(voice:channel:auto:{guild}:{channelId})으로 저장된다', async () => {
      const info: AutoChannelInfo = {
        configId: 1,
        configName: '테스트방',
        channelType: 'auto_select',
        buttonId: 5,
        buttonLabel: '테스트',
      };

      await repo.setAutoChannelInfo(guild, channelId, info);

      // VoiceKeys.autoChannelInfo 패턴과 동일한 키로 직접 조회
      const expectedKey = VoiceKeys.autoChannelInfo(guild, channelId);
      const rawValue = await redis.get<AutoChannelInfo>(expectedKey);
      expect(rawValue).toEqual(info);
    });

    it('다른 채널의 메타데이터는 서로 독립적이다', async () => {
      const info1: AutoChannelInfo = {
        configId: 1,
        configName: '방1',
        channelType: 'auto_select',
        buttonId: 1,
        buttonLabel: '방1',
      };
      const info2: AutoChannelInfo = {
        configId: 2,
        configName: '방2',
        channelType: 'auto_instant',
        buttonId: null,
        buttonLabel: null,
      };

      await repo.setAutoChannelInfo(guild, 'ch-1', info1);
      await repo.setAutoChannelInfo(guild, 'ch-2', info2);

      const result1 = await repo.getAutoChannelInfo(guild, 'ch-1');
      const result2 = await repo.getAutoChannelInfo(guild, 'ch-2');

      expect(result1).toEqual(info1);
      expect(result2).toEqual(info2);
    });

    it('다른 길드의 같은 채널 ID는 서로 독립적이다', async () => {
      const info: AutoChannelInfo = {
        configId: 99,
        configName: '공통방',
        channelType: 'auto_select',
        buttonId: 99,
        buttonLabel: '공통',
      };

      await repo.setAutoChannelInfo('guild-A', channelId, info);
      const resultOtherGuild = await repo.getAutoChannelInfo('guild-B', channelId);

      expect(resultOtherGuild).toBeNull();
    });

    it('configId, configName, channelType, buttonId, buttonLabel 필드가 모두 보존된다', async () => {
      const info: AutoChannelInfo = {
        configId: 7,
        configName: '스터디방',
        channelType: 'auto_select',
        buttonId: 7,
        buttonLabel: '스터디',
      };

      await repo.setAutoChannelInfo(guild, channelId, info);
      const result = await repo.getAutoChannelInfo(guild, channelId);

      expect(result?.configId).toBe(7);
      expect(result?.configName).toBe('스터디방');
      expect(result?.channelType).toBe('auto_select');
      expect(result?.buttonId).toBe(7);
      expect(result?.buttonLabel).toBe('스터디');
    });

    it('덮어쓰기(overwrite)하면 최신 값으로 조회된다', async () => {
      const infoV1: AutoChannelInfo = {
        configId: 1,
        configName: '구버전',
        channelType: 'auto_select',
        buttonId: 1,
        buttonLabel: '구버전',
      };
      const infoV2: AutoChannelInfo = {
        configId: 1,
        configName: '신버전',
        channelType: 'auto_select',
        buttonId: 1,
        buttonLabel: '신버전',
      };

      await repo.setAutoChannelInfo(guild, channelId, infoV1);
      await repo.setAutoChannelInfo(guild, channelId, infoV2);

      const result = await repo.getAutoChannelInfo(guild, channelId);
      expect(result?.configName).toBe('신버전');
    });
  });

  describe('VoiceKeys.autoChannelInfo 키 패턴', () => {
    it('voice:channel:auto:{guild}:{channel} 형식의 키를 생성한다', () => {
      const key = VoiceKeys.autoChannelInfo('guild-123', 'ch-456');
      expect(key).toBe('voice:channel:auto:guild-123:ch-456');
    });
  });
});
