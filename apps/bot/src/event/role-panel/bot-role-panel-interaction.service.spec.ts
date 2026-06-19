/**
 * RolePanelInteractionService 단위 테스트
 *
 * 커버 케이스:
 * - handle: API config 조회 실패 → NOT_FOUND
 * - handle: panelId/buttonId 미존재 → NOT_FOUND
 * - GRANT 멱등: 이미 역할 보유 → ALREADY_HAS (roles.add 미호출)
 * - GRANT: 미보유 → roles.add 호출 → GRANTED
 * - TOGGLE: 보유 → roles.remove → REMOVED
 * - TOGGLE: 미보유 → roles.add → GRANTED
 * - TOGGLE: 동시 호출 → 첫 번째 성공, 두 번째 LOCKED (EC-RP-16)
 * - mapDiscordError: 50013 → NO_PERMISSION
 * - mapDiscordError: 403 status → NO_PERMISSION
 * - mapDiscordError: 10011 → UNKNOWN_ROLE
 * - mapDiscordError: 그 외 DiscordAPIError → 재던짐
 * - mapDiscordError: 비-DiscordAPIError → 재던짐
 */

import { DiscordAPIError, type GuildMember } from 'discord.js';
import { type Mock } from 'vitest';

import {
  type HandleRolePanelButtonInput,
  RolePanelInteractionService,
} from './bot-role-panel-interaction.service';

/** GuildMember 최소 mock 생성 */
function makeMember(overrides: { hasRole?: boolean } = {}): GuildMember {
  const { hasRole = false } = overrides;
  return {
    roles: {
      cache: {
        has: vi.fn().mockReturnValue(hasRole),
      },
      add: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    guild: {},
    user: { id: 'user-1' },
  } as unknown as GuildMember;
}

/** DiscordAPIError mock 생성 */
function makeDiscordAPIError(code: number, status = 400): DiscordAPIError {
  const err = new Error('Discord API Error') as DiscordAPIError;
  Object.setPrototypeOf(err, DiscordAPIError.prototype);
  (err as unknown as { code: number }).code = code;
  (err as unknown as { status: number }).status = status;
  return err;
}

/** 기본 HandleRolePanelButtonInput 픽스처 */
function makeInput(
  overrides: Partial<HandleRolePanelButtonInput> = {},
): HandleRolePanelButtonInput {
  return {
    guildId: 'guild-1',
    userId: 'user-1',
    member: makeMember(),
    panelId: 1,
    buttonId: 10,
    ...overrides,
  };
}

/** 기본 API config 응답 픽스처 */
function makeConfigResponse(mode: 'GRANT' | 'TOGGLE' = 'GRANT') {
  return {
    ok: true,
    data: [
      {
        panelId: 1,
        buttons: [
          {
            buttonId: 10,
            roleId: 'role-1',
            mode,
          },
        ],
      },
    ],
  };
}

describe('RolePanelInteractionService', () => {
  let service: RolePanelInteractionService;
  let apiClient: { getRolePanelConfig: Mock };

  beforeEach(() => {
    apiClient = {
      getRolePanelConfig: vi.fn(),
    };

    service = new RolePanelInteractionService(apiClient as never);

    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────
  // handle — config 조회 실패
  // ──────────────────────────────────────────────────────
  describe('handle — config 조회 실패', () => {
    it('API 응답 ok=false 시 NOT_FOUND 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue({ ok: false });

      const result = await service.handle(makeInput());

      expect(result.status).toBe('NOT_FOUND');
    });

    it('API 응답 data=null 시 NOT_FOUND 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue({ ok: true, data: null });

      const result = await service.handle(makeInput());

      expect(result.status).toBe('NOT_FOUND');
    });

    it('panelId가 데이터에 없으면 NOT_FOUND 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue({
        ok: true,
        data: [{ panelId: 999, buttons: [] }],
      });

      const result = await service.handle(makeInput({ panelId: 1 }));

      expect(result.status).toBe('NOT_FOUND');
    });

    it('buttonId가 패널에 없으면 NOT_FOUND 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue({
        ok: true,
        data: [{ panelId: 1, buttons: [{ buttonId: 99, roleId: 'role-1', mode: 'GRANT' }] }],
      });

      const result = await service.handle(makeInput({ buttonId: 10 }));

      expect(result.status).toBe('NOT_FOUND');
    });
  });

  // ──────────────────────────────────────────────────────
  // GRANT 모드 (UC-04)
  // ──────────────────────────────────────────────────────
  describe('GRANT 모드', () => {
    it('이미 역할 보유 시 roles.add 미호출 + ALREADY_HAS 반환 (멱등)', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: true });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('ALREADY_HAS');
      expect(member.roles.add).not.toHaveBeenCalled();
    });

    it('역할 미보유 시 roles.add 호출 + GRANTED 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).toHaveBeenCalledWith('role-1');
    });
  });

  // ──────────────────────────────────────────────────────
  // TOGGLE 모드 (UC-05)
  // ──────────────────────────────────────────────────────
  describe('TOGGLE 모드', () => {
    it('역할 보유 시 roles.remove 호출 + REMOVED 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('TOGGLE'));
      const member = makeMember({ hasRole: true });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('REMOVED');
      expect(member.roles.remove).toHaveBeenCalledWith('role-1');
    });

    it('역할 미보유 시 roles.add 호출 + GRANTED 반환', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('TOGGLE'));
      const member = makeMember({ hasRole: false });

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('GRANTED');
      expect(member.roles.add).toHaveBeenCalledWith('role-1');
    });

    it('EC-RP-16: 동일 키 동시 TOGGLE 호출 → 첫 번째 성공, 두 번째 LOCKED', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('TOGGLE'));

      // 첫 번째 호출: roles.add가 느리게 완료 (락이 잡혀 있는 동안 두 번째 시도)
      let resolveFirstAdd!: () => void;
      const firstMember = makeMember({ hasRole: false });
      (firstMember.roles.add as Mock).mockReturnValue(
        new Promise<void>((resolve) => {
          resolveFirstAdd = resolve;
        }),
      );

      const secondMember = makeMember({ hasRole: false });

      const input = makeInput({ guildId: 'guild-lock', userId: 'user-lock', buttonId: 10 });

      // 첫 번째 호출 시작 (아직 완료 안 됨)
      const firstPromise = service.handle({ ...input, member: firstMember });
      // 두 번째 호출 즉시 실행 (락 점유 중)
      const secondResult = await service.handle({ ...input, member: secondMember });

      expect(secondResult.status).toBe('LOCKED');

      // 첫 번째 완료
      resolveFirstAdd();
      const firstResult = await firstPromise;
      expect(firstResult.status).toBe('GRANTED');
    });
  });

  // ──────────────────────────────────────────────────────
  // Discord 에러 매핑
  // ──────────────────────────────────────────────────────
  describe('mapDiscordError', () => {
    it('DiscordAPIError code=50013 → NO_PERMISSION', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });
      (member.roles.add as Mock).mockRejectedValue(makeDiscordAPIError(50013, 403));

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('NO_PERMISSION');
    });

    it('DiscordAPIError status=403 → NO_PERMISSION', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });
      // code는 다르지만 status=403
      (member.roles.add as Mock).mockRejectedValue(makeDiscordAPIError(99999, 403));

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('NO_PERMISSION');
    });

    it('DiscordAPIError code=10011 → UNKNOWN_ROLE', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });
      (member.roles.add as Mock).mockRejectedValue(makeDiscordAPIError(10011));

      const result = await service.handle(makeInput({ member }));

      expect(result.status).toBe('UNKNOWN_ROLE');
    });

    it('그 외 DiscordAPIError(알 수 없는 코드) → 재던짐', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });
      (member.roles.add as Mock).mockRejectedValue(makeDiscordAPIError(99999, 500));

      await expect(service.handle(makeInput({ member }))).rejects.toBeInstanceOf(DiscordAPIError);
    });

    it('비-DiscordAPIError(일반 Error) → 재던짐', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });
      (member.roles.add as Mock).mockRejectedValue(new Error('네트워크 오류'));

      await expect(service.handle(makeInput({ member }))).rejects.toThrow('네트워크 오류');
    });
  });

  // ──────────────────────────────────────────────────────
  // 각 호출마다 guildId를 사용한 config 조회
  // ──────────────────────────────────────────────────────
  describe('API 호출 검증', () => {
    it('guildId로 getRolePanelConfig 호출', async () => {
      apiClient.getRolePanelConfig.mockResolvedValue(makeConfigResponse('GRANT'));
      const member = makeMember({ hasRole: false });

      await service.handle(makeInput({ guildId: 'my-guild', member }));

      expect(apiClient.getRolePanelConfig).toHaveBeenCalledWith('my-guild');
    });
  });
});
