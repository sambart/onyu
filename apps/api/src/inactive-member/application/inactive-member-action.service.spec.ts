import { type Mock } from 'vitest';

import { DomainException } from '../../common/domain-exception';
import { InactiveMemberActionType } from '../domain/inactive-member.types';
import { type InactiveMemberConfigOrm } from '../infrastructure/inactive-member-config.orm-entity';
import { InactiveMemberActionService } from './inactive-member-action.service';

function makeConfig(overrides: Partial<InactiveMemberConfigOrm> = {}): InactiveMemberConfigOrm {
  return {
    id: 1,
    guildId: 'guild-1',
    periodDays: 30,
    lowActiveThresholdMin: 30,
    decliningPercent: 50,
    autoActionEnabled: false,
    autoRoleAdd: false,
    autoDm: false,
    inactiveRoleId: null,
    removeRoleId: null,
    excludedRoleIds: [],
    dmEmbedTitle: null,
    dmEmbedBody: null,
    dmEmbedColor: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('InactiveMemberActionService', () => {
  let service: InactiveMemberActionService;
  let repo: { saveActionLog: Mock; findNickNameMap: Mock };
  let inactiveMemberService: { getOrCreateConfig: Mock };
  let discordAdapter: {
    fetchGuild: Mock;
    kickMember: Mock;
    sendDm: Mock;
    modifyRole: Mock;
  };

  beforeEach(() => {
    repo = {
      saveActionLog: vi.fn().mockResolvedValue({ id: 42 }),
      findNickNameMap: vi.fn().mockResolvedValue({}),
    };

    inactiveMemberService = {
      getOrCreateConfig: vi.fn(),
    };

    discordAdapter = {
      fetchGuild: vi.fn(),
      kickMember: vi.fn(),
      sendDm: vi.fn(),
      modifyRole: vi.fn(),
    };

    service = new InactiveMemberActionService(
      repo as never,
      inactiveMemberService as never,
      discordAdapter as never,
    );
  });

  describe('executeAction', () => {
    it('길드를 찾을 수 없으면 DomainException 발생', async () => {
      inactiveMemberService.getOrCreateConfig.mockResolvedValue(makeConfig());
      discordAdapter.fetchGuild.mockResolvedValue(null);

      await expect(
        service.executeAction('guild-1', InactiveMemberActionType.ACTION_KICK, ['user-1']),
      ).rejects.toBeInstanceOf(DomainException);
    });

    it('ACTION_KICK: kickMember 호출, 성공 카운트 반환, 액션 로그 저장', async () => {
      inactiveMemberService.getOrCreateConfig.mockResolvedValue(makeConfig());
      discordAdapter.fetchGuild.mockResolvedValue({ name: '테스트서버' });
      discordAdapter.kickMember.mockResolvedValue(true);

      const result = await service.executeAction('guild-1', InactiveMemberActionType.ACTION_KICK, [
        'user-1',
        'user-2',
      ]);

      expect(discordAdapter.kickMember).toHaveBeenCalledTimes(2);
      expect(result.successCount).toBe(2);
      expect(result.failCount).toBe(0);
      expect(repo.saveActionLog).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-1',
          actionType: InactiveMemberActionType.ACTION_KICK,
          successCount: 2,
          failCount: 0,
        }),
      );
      expect(result.logId).toBe(42);
    });

    it('ACTION_KICK: 일부 실패 시 failCount 반영', async () => {
      inactiveMemberService.getOrCreateConfig.mockResolvedValue(makeConfig());
      discordAdapter.fetchGuild.mockResolvedValue({ name: '서버' });
      discordAdapter.kickMember.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const result = await service.executeAction('guild-1', InactiveMemberActionType.ACTION_KICK, [
        'user-1',
        'user-2',
      ]);

      expect(result.successCount).toBe(1);
      expect(result.failCount).toBe(1);
    });

    it('ACTION_DM: DM 발송 및 템플릿 변수 치환 ({nickName}, {serverName})', async () => {
      inactiveMemberService.getOrCreateConfig.mockResolvedValue(
        makeConfig({
          autoDm: true,
          dmEmbedTitle: '안녕하세요 {nickName}님',
          dmEmbedBody: '{serverName} 서버에서 비활동 회원으로 분류되었습니다.',
          dmEmbedColor: null,
        }),
      );
      discordAdapter.fetchGuild.mockResolvedValue({ name: '테스트서버' });
      repo.findNickNameMap.mockResolvedValue({ 'user-1': '동현' });
      discordAdapter.sendDm.mockResolvedValue(true);

      const result = await service.executeAction('guild-1', InactiveMemberActionType.ACTION_DM, [
        'user-1',
      ]);

      expect(discordAdapter.sendDm).toHaveBeenCalledWith(
        'guild-1',
        'user-1',
        expect.objectContaining({}),
      );
      expect(result.successCount).toBe(1);
      expect(result.failCount).toBe(0);
    });

    it('ACTION_ROLE_ADD: inactiveRoleId 미설정 시 DomainException 발생', async () => {
      inactiveMemberService.getOrCreateConfig.mockResolvedValue(
        makeConfig({ inactiveRoleId: null }),
      );
      discordAdapter.fetchGuild.mockResolvedValue({ name: '서버' });

      await expect(
        service.executeAction('guild-1', InactiveMemberActionType.ACTION_ROLE_ADD, ['user-1']),
      ).rejects.toBeInstanceOf(DomainException);
    });

    it('ACTION_ROLE_REMOVE: removeRoleId 미설정 시 DomainException 발생', async () => {
      inactiveMemberService.getOrCreateConfig.mockResolvedValue(makeConfig({ removeRoleId: null }));
      discordAdapter.fetchGuild.mockResolvedValue({ name: '서버' });

      await expect(
        service.executeAction('guild-1', InactiveMemberActionType.ACTION_ROLE_REMOVE, ['user-1']),
      ).rejects.toBeInstanceOf(DomainException);
    });
  });

  describe('executeAutoActions', () => {
    it('빈 목록이면 아무것도 하지 않음', async () => {
      await service.executeAutoActions('guild-1', []);

      expect(inactiveMemberService.getOrCreateConfig).not.toHaveBeenCalled();
    });

    it('autoRoleAdd=true이면 ACTION_ROLE_ADD 실행', async () => {
      inactiveMemberService.getOrCreateConfig.mockResolvedValue(
        makeConfig({ autoRoleAdd: true, inactiveRoleId: 'role-1' }),
      );
      discordAdapter.fetchGuild.mockResolvedValue({ name: '서버' });
      discordAdapter.modifyRole.mockResolvedValue(true);

      await service.executeAutoActions('guild-1', ['user-1']);

      expect(discordAdapter.modifyRole).toHaveBeenCalledWith('guild-1', 'user-1', 'role-1', 'add');
    });

    it('autoDm=true이면 ACTION_DM 실행', async () => {
      inactiveMemberService.getOrCreateConfig.mockResolvedValue(
        makeConfig({
          autoDm: true,
          dmEmbedTitle: '{nickName}님 안내',
          dmEmbedBody: '{serverName} 비활동 안내입니다.',
        }),
      );
      discordAdapter.fetchGuild.mockResolvedValue({ name: '서버' });
      repo.findNickNameMap.mockResolvedValue({ 'user-1': '동현' });
      discordAdapter.sendDm.mockResolvedValue(true);

      await service.executeAutoActions('guild-1', ['user-1']);

      expect(discordAdapter.sendDm).toHaveBeenCalled();
    });

    it('autoRoleAdd=false이고 autoDm=false이면 실제 액션 실행하지 않음', async () => {
      inactiveMemberService.getOrCreateConfig.mockResolvedValue(
        makeConfig({ autoRoleAdd: false, autoDm: false }),
      );

      await service.executeAutoActions('guild-1', ['user-1']);

      expect(discordAdapter.modifyRole).not.toHaveBeenCalled();
      expect(discordAdapter.sendDm).not.toHaveBeenCalled();
    });
  });

  describe('배치 처리', () => {
    it('6명 → 2배치(5+1) 처리, 부분 실패 추적', async () => {
      inactiveMemberService.getOrCreateConfig.mockResolvedValue(makeConfig());
      discordAdapter.fetchGuild.mockResolvedValue({ name: '서버' });

      // 6명 중 2명 실패
      discordAdapter.kickMember
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false) // 3번째 실패
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false); // 6번째 실패

      const userIds = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
      const result = await service.executeAction(
        'guild-1',
        InactiveMemberActionType.ACTION_KICK,
        userIds,
      );

      expect(discordAdapter.kickMember).toHaveBeenCalledTimes(6);
      expect(result.successCount).toBe(4);
      expect(result.failCount).toBe(2);
    });
  });
});
