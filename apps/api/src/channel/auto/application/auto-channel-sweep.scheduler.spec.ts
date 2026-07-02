// auto-channel-sweep.scheduler.spec.ts
import { type Mock, vi } from 'vitest';

import type { DiscordRestService } from '../../../discord-rest/discord-rest.service';
import type { DiscordVoiceGateway } from '../../voice/infrastructure/discord-voice.gateway';
import type { AutoChannelRedisRepository } from '../infrastructure/auto-channel-redis.repository';
import { AutoChannelSweepScheduler } from './auto-channel-sweep.scheduler';

describe('AutoChannelSweepScheduler', () => {
  let scheduler: AutoChannelSweepScheduler;
  let autoChannelRedis: {
    listPendingDeletes: Mock;
    scanConfirmedChannelIds: Mock;
    deleteConfirmedState: Mock;
    unmarkPendingDelete: Mock;
    refreshConfirmedTtl: Mock;
  };
  let discordRest: {
    probeChannel: Mock;
  };
  let discordVoiceGateway: {
    deleteChannel: Mock;
  };

  beforeEach(() => {
    autoChannelRedis = {
      listPendingDeletes: vi.fn().mockResolvedValue([]),
      scanConfirmedChannelIds: vi.fn().mockResolvedValue([]),
      deleteConfirmedState: vi.fn().mockResolvedValue(undefined),
      unmarkPendingDelete: vi.fn().mockResolvedValue(undefined),
      refreshConfirmedTtl: vi.fn().mockResolvedValue(undefined),
    };
    discordRest = {
      probeChannel: vi.fn(),
    };
    discordVoiceGateway = {
      deleteChannel: vi.fn().mockResolvedValue(undefined),
    };

    scheduler = new AutoChannelSweepScheduler(
      autoChannelRedis as unknown as AutoChannelRedisRepository,
      discordRest as unknown as DiscordRestService,
      discordVoiceGateway as unknown as DiscordVoiceGateway,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────
  // sweep (통합 흐름)
  // ──────────────────────────────────────────────────────────
  describe('sweep', () => {
    it('pending 큐와 confirmed 키가 모두 비어있으면 별도 처리 없이 완료된다', async () => {
      autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
      autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);

      await scheduler.sweep();

      expect(autoChannelRedis.deleteConfirmedState).not.toHaveBeenCalled();
      expect(autoChannelRedis.refreshConfirmedTtl).not.toHaveBeenCalled();
      expect(discordRest.probeChannel).not.toHaveBeenCalled();
    });

    it('sweep은 listPendingDeletes와 scanConfirmedChannelIds를 각각 1회 호출한다', async () => {
      autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
      autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);

      await scheduler.sweep();

      expect(autoChannelRedis.listPendingDeletes).toHaveBeenCalledTimes(1);
      expect(autoChannelRedis.scanConfirmedChannelIds).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────
  // retryDelete — 핵심 회귀 방지
  // ──────────────────────────────────────────────────────────
  describe('retryDelete (pending 큐 처리)', () => {
    describe("probe='unknown': 일시 오류 → 큐 유지, 상태 건드리지 않음 (핵심 회귀 케이스)", () => {
      it('unknown 시 deleteConfirmedState를 호출하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-1']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockResolvedValue('unknown');

        await scheduler.sweep();

        expect(autoChannelRedis.deleteConfirmedState).not.toHaveBeenCalled();
      });

      it('unknown 시 unmarkPendingDelete를 호출하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-1']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockResolvedValue('unknown');

        await scheduler.sweep();

        expect(autoChannelRedis.unmarkPendingDelete).not.toHaveBeenCalled();
      });

      it('unknown 시 deleteChannel(Discord)을 호출하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-1']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockResolvedValue('unknown');

        await scheduler.sweep();

        expect(discordVoiceGateway.deleteChannel).not.toHaveBeenCalled();
      });
    });

    describe("probe='gone': 이미 삭제됨 → Redis 정리", () => {
      it('gone 시 deleteConfirmedState를 해당 채널 ID로 호출한다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-gone']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockResolvedValue('gone');

        await scheduler.sweep();

        expect(autoChannelRedis.deleteConfirmedState).toHaveBeenCalledWith('ch-gone');
      });

      it('gone 시 unmarkPendingDelete를 해당 채널 ID로 호출한다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-gone']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockResolvedValue('gone');

        await scheduler.sweep();

        expect(autoChannelRedis.unmarkPendingDelete).toHaveBeenCalledWith('ch-gone');
      });

      it('gone 시 Discord deleteChannel을 호출하지 않는다 (이미 사라짐)', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-gone']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockResolvedValue('gone');

        await scheduler.sweep();

        expect(discordVoiceGateway.deleteChannel).not.toHaveBeenCalled();
      });
    });

    describe("probe='exists': 채널 존재 → delete 재시도", () => {
      it('exists + delete 성공 시 deleteConfirmedState를 호출한다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-exists']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockResolvedValue('exists');
        discordVoiceGateway.deleteChannel.mockResolvedValue(undefined);

        await scheduler.sweep();

        expect(discordVoiceGateway.deleteChannel).toHaveBeenCalledWith('ch-exists');
        expect(autoChannelRedis.deleteConfirmedState).toHaveBeenCalledWith('ch-exists');
        expect(autoChannelRedis.unmarkPendingDelete).toHaveBeenCalledWith('ch-exists');
      });

      it('exists + delete 실패 시 deleteConfirmedState를 호출하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-exists']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockResolvedValue('exists');
        discordVoiceGateway.deleteChannel.mockRejectedValue(new Error('403 Forbidden'));

        await scheduler.sweep();

        expect(autoChannelRedis.deleteConfirmedState).not.toHaveBeenCalled();
        expect(autoChannelRedis.unmarkPendingDelete).not.toHaveBeenCalled();
      });

      it('exists + delete 실패해도 sweep 전체가 throw하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-exists']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockResolvedValue('exists');
        discordVoiceGateway.deleteChannel.mockRejectedValue(new Error('5xx'));

        await expect(scheduler.sweep()).resolves.toBeUndefined();
      });
    });

    describe('복수 채널 처리', () => {
      it('여러 채널이 pending 큐에 있을 때 각각 probeChannel을 호출한다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-1', 'ch-2', 'ch-3']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockResolvedValue('unknown');

        await scheduler.sweep();

        expect(discordRest.probeChannel).toHaveBeenCalledTimes(3);
        expect(discordRest.probeChannel).toHaveBeenCalledWith('ch-1');
        expect(discordRest.probeChannel).toHaveBeenCalledWith('ch-2');
        expect(discordRest.probeChannel).toHaveBeenCalledWith('ch-3');
      });

      it('unknown/gone/exists 혼합 시 unknown만 Redis 상태를 건드리지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue(['ch-unknown', 'ch-gone']);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([]);
        discordRest.probeChannel.mockImplementation((id: string) => {
          if (id === 'ch-unknown') return Promise.resolve('unknown');
          if (id === 'ch-gone') return Promise.resolve('gone');
          return Promise.resolve('unknown');
        });

        await scheduler.sweep();

        // ch-unknown: 아무것도 안 함
        expect(autoChannelRedis.deleteConfirmedState).not.toHaveBeenCalledWith('ch-unknown');
        expect(autoChannelRedis.unmarkPendingDelete).not.toHaveBeenCalledWith('ch-unknown');
        // ch-gone: 정리됨
        expect(autoChannelRedis.deleteConfirmedState).toHaveBeenCalledWith('ch-gone');
        expect(autoChannelRedis.unmarkPendingDelete).toHaveBeenCalledWith('ch-gone');
      });
    });
  });

  // ──────────────────────────────────────────────────────────
  // cleanupOrphan — heartbeat 핵심 검증
  // ──────────────────────────────────────────────────────────
  describe('cleanupOrphan (confirmed 키 스캔 처리)', () => {
    describe("probe='unknown': 일시 오류 → 상태 보존, 절대 삭제 안 함 (핵심 회귀 케이스)", () => {
      it('unknown 시 deleteConfirmedState를 호출하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue(['ch-1']);
        discordRest.probeChannel.mockResolvedValue('unknown');

        await scheduler.sweep();

        expect(autoChannelRedis.deleteConfirmedState).not.toHaveBeenCalled();
      });

      it('unknown 시 unmarkPendingDelete를 호출하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue(['ch-1']);
        discordRest.probeChannel.mockResolvedValue('unknown');

        await scheduler.sweep();

        expect(autoChannelRedis.unmarkPendingDelete).not.toHaveBeenCalled();
      });

      it('unknown 시 refreshConfirmedTtl도 호출하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue(['ch-1']);
        discordRest.probeChannel.mockResolvedValue('unknown');

        await scheduler.sweep();

        expect(autoChannelRedis.refreshConfirmedTtl).not.toHaveBeenCalled();
      });
    });

    describe("probe='exists': 살아있는 채널 → TTL heartbeat 갱신", () => {
      it('exists 시 refreshConfirmedTtl을 해당 채널 ID로 호출한다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue(['ch-alive']);
        discordRest.probeChannel.mockResolvedValue('exists');

        await scheduler.sweep();

        expect(autoChannelRedis.refreshConfirmedTtl).toHaveBeenCalledWith('ch-alive');
      });

      it('exists 시 deleteConfirmedState를 호출하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue(['ch-alive']);
        discordRest.probeChannel.mockResolvedValue('exists');

        await scheduler.sweep();

        expect(autoChannelRedis.deleteConfirmedState).not.toHaveBeenCalled();
      });

      it('exists 시 unmarkPendingDelete를 호출하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue(['ch-alive']);
        discordRest.probeChannel.mockResolvedValue('exists');

        await scheduler.sweep();

        expect(autoChannelRedis.unmarkPendingDelete).not.toHaveBeenCalled();
      });

      it('복수 존재 채널에 대해 각각 refreshConfirmedTtl을 호출한다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue(['ch-a', 'ch-b', 'ch-c']);
        discordRest.probeChannel.mockResolvedValue('exists');

        await scheduler.sweep();

        expect(autoChannelRedis.refreshConfirmedTtl).toHaveBeenCalledTimes(3);
        expect(autoChannelRedis.refreshConfirmedTtl).toHaveBeenCalledWith('ch-a');
        expect(autoChannelRedis.refreshConfirmedTtl).toHaveBeenCalledWith('ch-b');
        expect(autoChannelRedis.refreshConfirmedTtl).toHaveBeenCalledWith('ch-c');
      });
    });

    describe("probe='gone': 고아 확정 → Redis state 정리", () => {
      it('gone 시 deleteConfirmedState를 해당 채널 ID로 호출한다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue(['ch-orphan']);
        discordRest.probeChannel.mockResolvedValue('gone');

        await scheduler.sweep();

        expect(autoChannelRedis.deleteConfirmedState).toHaveBeenCalledWith('ch-orphan');
      });

      it('gone 시 unmarkPendingDelete를 호출한다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue(['ch-orphan']);
        discordRest.probeChannel.mockResolvedValue('gone');

        await scheduler.sweep();

        expect(autoChannelRedis.unmarkPendingDelete).toHaveBeenCalledWith('ch-orphan');
      });

      it('gone 시 refreshConfirmedTtl을 호출하지 않는다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue(['ch-orphan']);
        discordRest.probeChannel.mockResolvedValue('gone');

        await scheduler.sweep();

        expect(autoChannelRedis.refreshConfirmedTtl).not.toHaveBeenCalled();
      });
    });

    describe('복수 채널 혼합 시나리오', () => {
      it('exists/unknown/gone 혼합 시 각 채널을 독립적으로 처리한다', async () => {
        autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
        autoChannelRedis.scanConfirmedChannelIds.mockResolvedValue([
          'ch-exists',
          'ch-unknown',
          'ch-gone',
        ]);
        discordRest.probeChannel.mockImplementation((id: string) => {
          if (id === 'ch-exists') return Promise.resolve('exists');
          if (id === 'ch-unknown') return Promise.resolve('unknown');
          if (id === 'ch-gone') return Promise.resolve('gone');
          return Promise.resolve('unknown');
        });

        await scheduler.sweep();

        // exists → heartbeat only
        expect(autoChannelRedis.refreshConfirmedTtl).toHaveBeenCalledWith('ch-exists');
        expect(autoChannelRedis.deleteConfirmedState).not.toHaveBeenCalledWith('ch-exists');

        // unknown → no-op
        expect(autoChannelRedis.refreshConfirmedTtl).not.toHaveBeenCalledWith('ch-unknown');
        expect(autoChannelRedis.deleteConfirmedState).not.toHaveBeenCalledWith('ch-unknown');

        // gone → cleanup
        expect(autoChannelRedis.deleteConfirmedState).toHaveBeenCalledWith('ch-gone');
        expect(autoChannelRedis.unmarkPendingDelete).toHaveBeenCalledWith('ch-gone');
      });
    });
  });

  // ──────────────────────────────────────────────────────────
  // sweep 전체 안정성
  // ──────────────────────────────────────────────────────────
  describe('sweep 에러 내성', () => {
    it('listPendingDeletes가 reject해도 sweep이 throw하지 않는다', async () => {
      autoChannelRedis.listPendingDeletes.mockRejectedValue(new Error('Redis 연결 끊김'));

      await expect(scheduler.sweep()).resolves.toBeUndefined();
    });

    it('scanConfirmedChannelIds가 reject해도 sweep이 throw하지 않는다', async () => {
      autoChannelRedis.listPendingDeletes.mockResolvedValue([]);
      autoChannelRedis.scanConfirmedChannelIds.mockRejectedValue(new Error('Redis 연결 끊김'));

      await expect(scheduler.sweep()).resolves.toBeUndefined();
    });
  });
});
