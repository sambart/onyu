import { type Mock } from 'vitest';

const NONEXISTENT_BUTTON_ID = 99; // 존재하지 않는 버튼 ID

import { StatusPrefixButtonType } from '../domain/status-prefix.types';
import { type StatusPrefixButtonOrm } from '../infrastructure/status-prefix-button.orm-entity';
import { type StatusPrefixConfigOrm } from '../infrastructure/status-prefix-config.orm-entity';
import { StatusPrefixApplyService } from './status-prefix-apply.service';

function makeButton(overrides: Partial<StatusPrefixButtonOrm> = {}): StatusPrefixButtonOrm {
  return {
    id: 1,
    configId: 1,
    config: {} as StatusPrefixConfigOrm,
    type: StatusPrefixButtonType.PREFIX,
    prefix: '관전',
    label: '관전',
    emoji: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<StatusPrefixConfigOrm> = {}): StatusPrefixConfigOrm {
  return {
    id: 1,
    guildId: 'guild-1',
    enabled: true,
    channelId: 'ch-1',
    messageId: null,
    embedTitle: '접두사 설정',
    embedDescription: null,
    embedColor: null,
    prefixTemplate: '[{prefix}] {nickname}',
    buttons: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('StatusPrefixApplyService.applyFromBot', () => {
  let service: StatusPrefixApplyService;
  let configRepo: { findButtonById: Mock };
  let redis: { getOriginalNickname: Mock; setOriginalNicknameNx: Mock };
  let configService: { getConfig: Mock; stripPrefixFromNickname: Mock };

  beforeEach(() => {
    configRepo = {
      findButtonById: vi.fn(),
    };

    redis = {
      getOriginalNickname: vi.fn(),
      setOriginalNicknameNx: vi.fn().mockResolvedValue(undefined),
    };

    configService = {
      getConfig: vi.fn(),
      stripPrefixFromNickname: vi.fn(),
    };

    service = new StatusPrefixApplyService(
      configRepo as never,
      redis as never,
      configService as never,
    );

    vi.clearAllMocks();
  });

  it('정상 적용: 버튼 조회 → 설정 조회 → 원래 닉네임 저장 → 새 닉네임 생성 → success: true', async () => {
    configRepo.findButtonById.mockResolvedValue(makeButton({ prefix: '관전' }));
    configService.getConfig.mockResolvedValue(
      makeConfig({ prefixTemplate: '[{prefix}] {nickname}' }),
    );
    redis.getOriginalNickname.mockResolvedValue(null);
    configService.stripPrefixFromNickname.mockReturnValue('동현');

    const result = await service.applyFromBot('guild-1', 'user-1', 1, '동현');

    expect(result.success).toBe(true);
    expect(result.newNickname).toBe('[관전] 동현');
    expect(redis.setOriginalNicknameNx).toHaveBeenCalledWith('guild-1', 'user-1', '동현');
  });

  it('버튼이 없으면 success: false 반환', async () => {
    configRepo.findButtonById.mockResolvedValue(null);

    const result = await service.applyFromBot('guild-1', 'user-1', NONEXISTENT_BUTTON_ID, '동현');

    expect(result.success).toBe(false);
    expect(result.newNickname).toBeUndefined();
  });

  it('버튼에 prefix가 없으면 success: false 반환', async () => {
    configRepo.findButtonById.mockResolvedValue(makeButton({ prefix: null }));

    const result = await service.applyFromBot('guild-1', 'user-1', 1, '동현');

    expect(result.success).toBe(false);
  });

  it('config가 없으면 success: false 반환', async () => {
    configRepo.findButtonById.mockResolvedValue(makeButton({ prefix: '관전' }));
    configService.getConfig.mockResolvedValue(null);

    const result = await service.applyFromBot('guild-1', 'user-1', 1, '동현');

    expect(result.success).toBe(false);
  });

  it('원래 닉네임이 이미 Redis에 있으면 기존 값 사용 (덮어쓰기 방지)', async () => {
    configRepo.findButtonById.mockResolvedValue(makeButton({ prefix: '관전' }));
    configService.getConfig.mockResolvedValue(
      makeConfig({ prefixTemplate: '[{prefix}] {nickname}' }),
    );
    // Redis에 이미 원래 닉네임이 있는 상태
    redis.getOriginalNickname.mockResolvedValue('원래닉네임');

    const result = await service.applyFromBot('guild-1', 'user-1', 1, '[관전] 원래닉네임');

    expect(result.success).toBe(true);
    // Redis에 이미 값이 있으므로 setOriginalNicknameNx 호출하지 않음
    expect(redis.setOriginalNicknameNx).not.toHaveBeenCalled();
    expect(result.newNickname).toBe('[관전] 원래닉네임');
  });

  it('prefixTemplate 적용: {prefix}와 {nickname} 치환 검증', async () => {
    configRepo.findButtonById.mockResolvedValue(makeButton({ prefix: '대기' }));
    configService.getConfig.mockResolvedValue(
      makeConfig({ prefixTemplate: '({prefix}) {nickname}' }),
    );
    redis.getOriginalNickname.mockResolvedValue(null);
    configService.stripPrefixFromNickname.mockReturnValue('Alice');

    const result = await service.applyFromBot('guild-1', 'user-1', 1, 'Alice');

    expect(result.success).toBe(true);
    expect(result.newNickname).toBe('(대기) Alice');
  });
});
