import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Mocked } from 'vitest';

import type {
  MeProfileData,
  MeProfileService,
  MeVoiceGuild,
} from '../application/me-profile.service';
import { MeVoiceController } from './me-voice.controller';

/** JwtUser 형태의 req.user를 주입한 Express Request mock을 생성한다 */
function makeReq(discordId: string): Mocked<Request> {
  return {
    user: { discordId, username: `user_${discordId}` },
  } as unknown as Mocked<Request>;
}

/** Express Response mock (passthrough 패턴용) */
function makeRes(): Mocked<Response> {
  return {
    status: vi.fn().mockReturnThis(),
  } as unknown as Mocked<Response>;
}

/** 최소한의 MeProfileData fixture */
function makeProfileData(overrides: Partial<MeProfileData> = {}): MeProfileData {
  return {
    rank: 1,
    totalUsers: 10,
    totalSec: 7200,
    activeDays: 5,
    avgDailySec: 1440,
    micOnSec: 3600,
    micOffSec: 3600,
    micUsageRate: 50,
    aloneSec: 900,
    dailyChart: [],
    peakDayOfWeek: '월',
    weeklyAvgSec: 1800,
    badges: [],
    excludedChannels: [],
    ...overrides,
  };
}

describe('MeVoiceController', () => {
  let controller: MeVoiceController;
  let meProfileService: Mocked<Pick<MeProfileService, 'getMyGuilds' | 'getProfile'>>;

  beforeEach(() => {
    meProfileService = {
      getMyGuilds: vi.fn(),
      getProfile: vi.fn(),
    } as unknown as Mocked<Pick<MeProfileService, 'getMyGuilds' | 'getProfile'>>;

    controller = new MeVoiceController(meProfileService as unknown as MeProfileService);
  });

  // ─── GET guilds ───────────────────────────────────────────────────────────

  describe('GET guilds', () => {
    it('req.user.discordId를 인자로 getMyGuilds를 호출한다', async () => {
      const guilds: MeVoiceGuild[] = [{ guildId: 'g1', guildName: '서버1', guildIcon: null }];
      meProfileService.getMyGuilds.mockResolvedValue(guilds);

      const req = makeReq('discord-user-42');
      await controller.getMyGuilds(req as unknown as Request);

      expect(meProfileService.getMyGuilds).toHaveBeenCalledWith('discord-user-42');
    });

    it('getMyGuilds 결과를 그대로 반환한다', async () => {
      const guilds: MeVoiceGuild[] = [
        {
          guildId: 'g1',
          guildName: '서버1',
          guildIcon: 'https://cdn.discordapp.com/icons/g1/hash.png',
        },
        { guildId: 'g2', guildName: '서버2', guildIcon: null },
      ];
      meProfileService.getMyGuilds.mockResolvedValue(guilds);

      const result = await controller.getMyGuilds(makeReq('u1') as unknown as Request);

      expect(result).toEqual(guilds);
    });

    it('활동 기록이 없는 경우 빈 배열을 반환한다', async () => {
      meProfileService.getMyGuilds.mockResolvedValue([]);

      const result = await controller.getMyGuilds(makeReq('u-empty') as unknown as Request);

      expect(result).toEqual([]);
    });

    it('다른 discordId를 가진 사용자 컨텍스트로 호출해도 해당 사용자의 discordId만 서비스에 전달된다', async () => {
      meProfileService.getMyGuilds.mockResolvedValue([]);

      await controller.getMyGuilds(makeReq('user-A') as unknown as Request);
      await controller.getMyGuilds(makeReq('user-B') as unknown as Request);

      expect(meProfileService.getMyGuilds).toHaveBeenNthCalledWith(1, 'user-A');
      expect(meProfileService.getMyGuilds).toHaveBeenNthCalledWith(2, 'user-B');
    });
  });

  // ─── GET profile ──────────────────────────────────────────────────────────

  describe('GET profile', () => {
    describe('정상 동작', () => {
      it('guildId와 days=15로 getProfile을 호출하고 결과를 반환한다', async () => {
        const profile = makeProfileData();
        meProfileService.getProfile.mockResolvedValue(profile);
        const res = makeRes();

        const result = await controller.getMyProfile(
          'guild-1',
          '15',
          makeReq('u1') as unknown as Request,
          res as unknown as Response,
        );

        expect(meProfileService.getProfile).toHaveBeenCalledWith('guild-1', 'u1', 15);
        expect(result).toEqual(profile);
      });

      it('days=7 허용값을 올바르게 파싱하여 getProfile에 전달한다', async () => {
        meProfileService.getProfile.mockResolvedValue(makeProfileData());
        const res = makeRes();

        await controller.getMyProfile(
          'guild-1',
          '7',
          makeReq('u1') as unknown as Request,
          res as unknown as Response,
        );

        expect(meProfileService.getProfile).toHaveBeenCalledWith('guild-1', 'u1', 7);
      });

      it('days=30 허용값을 올바르게 파싱하여 getProfile에 전달한다', async () => {
        meProfileService.getProfile.mockResolvedValue(makeProfileData());
        const res = makeRes();

        await controller.getMyProfile(
          'guild-1',
          '30',
          makeReq('u1') as unknown as Request,
          res as unknown as Response,
        );

        expect(meProfileService.getProfile).toHaveBeenCalledWith('guild-1', 'u1', 30);
      });

      it('days 미지정 시 기본값 15로 getProfile을 호출한다', async () => {
        meProfileService.getProfile.mockResolvedValue(makeProfileData());
        const res = makeRes();

        await controller.getMyProfile(
          'guild-1',
          undefined,
          makeReq('u1') as unknown as Request,
          res as unknown as Response,
        );

        expect(meProfileService.getProfile).toHaveBeenCalledWith('guild-1', 'u1', 15);
      });

      it('getProfile null 반환 시 204 No Content를 설정하고 undefined를 반환한다', async () => {
        meProfileService.getProfile.mockResolvedValue(null);
        const res = makeRes();

        const result = await controller.getMyProfile(
          'guild-1',
          '15',
          makeReq('u1') as unknown as Request,
          res as unknown as Response,
        );

        expect(res.status).toHaveBeenCalledWith(204);
        expect(result).toBeUndefined();
      });
    });

    describe('보안 — userId 강제 주입', () => {
      it('userId는 항상 req.user.discordId에서 가져오며 getProfile 2번째 인자에 전달된다', async () => {
        meProfileService.getProfile.mockResolvedValue(makeProfileData());
        const res = makeRes();

        await controller.getMyProfile(
          'any-guild',
          '15',
          makeReq('jwt-discord-id') as unknown as Request,
          res as unknown as Response,
        );

        // 두 번째 인자가 반드시 req.user.discordId임을 검증
        const calledUserId = (meProfileService.getProfile as ReturnType<typeof vi.fn>).mock
          .calls[0][1];
        expect(calledUserId).toBe('jwt-discord-id');
      });

      it('서로 다른 discordId를 가진 두 사용자가 같은 guildId로 호출해도 각자의 discordId로 조회된다', async () => {
        meProfileService.getProfile.mockResolvedValue(makeProfileData());
        const res = makeRes();

        await controller.getMyProfile(
          'shared-guild',
          '15',
          makeReq('user-X') as unknown as Request,
          res as unknown as Response,
        );
        await controller.getMyProfile(
          'shared-guild',
          '15',
          makeReq('user-Y') as unknown as Request,
          res as unknown as Response,
        );

        expect(meProfileService.getProfile).toHaveBeenNthCalledWith(
          1,
          'shared-guild',
          'user-X',
          15,
        );
        expect(meProfileService.getProfile).toHaveBeenNthCalledWith(
          2,
          'shared-guild',
          'user-Y',
          15,
        );
      });

      it('타인의 guildId를 전달해도 본인 discordId만 서비스에 주입된다', async () => {
        // 엣지케이스 ④: guildId 위조 시도
        meProfileService.getProfile.mockResolvedValue(null); // 본인 데이터 없으면 null → 204
        const res = makeRes();

        await controller.getMyProfile(
          'other-users-guild-id',
          '15',
          makeReq('attacker-discord-id') as unknown as Request,
          res as unknown as Response,
        );

        // getProfile은 공격자 본인 discordId로 호출됨
        expect(meProfileService.getProfile).toHaveBeenCalledWith(
          'other-users-guild-id',
          'attacker-discord-id',
          15,
        );
        // 본인 데이터 없으면 204
        expect(res.status).toHaveBeenCalledWith(204);
      });
    });

    describe('입력 검증', () => {
      it('guildId 미제공 시 BadRequestException을 throw한다', async () => {
        const res = makeRes();

        await expect(
          controller.getMyProfile(
            undefined,
            '15',
            makeReq('u1') as unknown as Request,
            res as unknown as Response,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('guildId 빈 문자열 시 BadRequestException을 throw한다', async () => {
        const res = makeRes();

        await expect(
          controller.getMyProfile(
            '',
            '15',
            makeReq('u1') as unknown as Request,
            res as unknown as Response,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('days=10 비허용값 시 BadRequestException을 throw한다', async () => {
        const res = makeRes();

        await expect(
          controller.getMyProfile(
            'guild-1',
            '10',
            makeReq('u1') as unknown as Request,
            res as unknown as Response,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('days="abc" 비정수 문자열 시 BadRequestException을 throw한다', async () => {
        const res = makeRes();

        await expect(
          controller.getMyProfile(
            'guild-1',
            'abc',
            makeReq('u1') as unknown as Request,
            res as unknown as Response,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('days=0 비허용값 시 BadRequestException을 throw한다', async () => {
        const res = makeRes();

        await expect(
          controller.getMyProfile(
            'guild-1',
            '0',
            makeReq('u1') as unknown as Request,
            res as unknown as Response,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('days=60 비허용값 시 BadRequestException을 throw한다', async () => {
        const res = makeRes();

        await expect(
          controller.getMyProfile(
            'guild-1',
            '60',
            makeReq('u1') as unknown as Request,
            res as unknown as Response,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('guildId 누락 시 getProfile을 호출하지 않는다', async () => {
        const res = makeRes();

        try {
          await controller.getMyProfile(
            undefined,
            '15',
            makeReq('u1') as unknown as Request,
            res as unknown as Response,
          );
        } catch {
          // expected
        }

        expect(meProfileService.getProfile).not.toHaveBeenCalled();
      });

      it('days 비허용값 시 getProfile을 호출하지 않는다', async () => {
        const res = makeRes();

        try {
          await controller.getMyProfile(
            'guild-1',
            '99',
            makeReq('u1') as unknown as Request,
            res as unknown as Response,
          );
        } catch {
          // expected
        }

        expect(meProfileService.getProfile).not.toHaveBeenCalled();
      });
    });
  });
});
