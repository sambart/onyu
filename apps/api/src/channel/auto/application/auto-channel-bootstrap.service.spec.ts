import { type Mock } from 'vitest';

import { AutoChannelBootstrapService } from './auto-channel-bootstrap.service';

describe('AutoChannelBootstrapService', () => {
  let service: AutoChannelBootstrapService;
  let configRepo: { findAllConfigs: Mock };

  beforeEach(() => {
    configRepo = {
      findAllConfigs: vi.fn(),
    };

    service = new AutoChannelBootstrapService(configRepo as never);
  });

  describe('onApplicationBootstrap', () => {
    it('부팅 시 모든 설정을 조회한다', async () => {
      configRepo.findAllConfigs.mockResolvedValue([
        { id: 1, guildId: 'guild-1', triggerChannelId: 'ch-trigger-1' },
        { id: 2, guildId: 'guild-2', triggerChannelId: 'ch-trigger-2' },
      ]);

      await service.onApplicationBootstrap();

      expect(configRepo.findAllConfigs).toHaveBeenCalledOnce();
    });

    it('설정이 없어도 에러 없이 완료된다', async () => {
      configRepo.findAllConfigs.mockResolvedValue([]);

      await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
    });

    it('설정 조회 실패 시 에러를 삼키고 정상 완료된다', async () => {
      configRepo.findAllConfigs.mockRejectedValue(new Error('DB 연결 실패'));

      await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
    });

    it('설정 수와 무관하게 findAllConfigs를 1번만 호출한다', async () => {
      configRepo.findAllConfigs.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          guildId: `guild-${i + 1}`,
          triggerChannelId: `ch-${i + 1}`,
        })),
      );

      await service.onApplicationBootstrap();

      expect(configRepo.findAllConfigs).toHaveBeenCalledTimes(1);
    });
  });
});
