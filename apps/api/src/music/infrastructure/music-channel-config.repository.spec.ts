import type { Repository } from 'typeorm';
import type { Mock } from 'vitest';

import type { MusicChannelConfigSaveDto } from '../dto/music-channel-config.dto';
import { type MusicChannelConfigOrm } from './music-channel-config.orm-entity';
import { MusicChannelConfigRepository } from './music-channel-config.repository';

const DEFAULT_BUTTON_CONFIG = {
  buttons: [{ type: 'search', label: '음악 검색하기', emoji: '🔍', enabled: true, row: 0 }],
};

function makeOrm(overrides: Partial<MusicChannelConfigOrm> = {}): MusicChannelConfigOrm {
  return {
    id: 1,
    guildId: 'guild-1',
    channelId: 'ch-1',
    messageId: null,
    embedTitle: null,
    embedDescription: null,
    embedColor: null,
    embedThumbnailUrl: null,
    buttonConfig: DEFAULT_BUTTON_CONFIG,
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeSaveDto(
  overrides: Partial<MusicChannelConfigSaveDto> = {},
): MusicChannelConfigSaveDto {
  return {
    channelId: 'ch-1',
    embedTitle: null,
    embedDescription: null,
    embedColor: null,
    embedThumbnailUrl: null,
    buttonConfig: DEFAULT_BUTTON_CONFIG,
    enabled: true,
    ...overrides,
  } as MusicChannelConfigSaveDto;
}

describe('MusicChannelConfigRepository', () => {
  let repository: MusicChannelConfigRepository;
  let mockRepo: {
    findOne: Mock;
    create: Mock;
    save: Mock;
    update: Mock;
    delete: Mock;
  };

  beforeEach(() => {
    mockRepo = {
      findOne: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    repository = new MusicChannelConfigRepository(
      mockRepo as unknown as Repository<MusicChannelConfigOrm>,
    );
  });

  // ─────────────────────────────────────────────────────────
  // findByGuildId
  // ─────────────────────────────────────────────────────────
  describe('findByGuildId', () => {
    it('guildId로 단건 조회하여 결과를 반환한다', async () => {
      const config = makeOrm();
      mockRepo.findOne.mockResolvedValue(config);

      const result = await repository.findByGuildId('guild-1');

      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { guildId: 'guild-1' } });
      expect(result).toBe(config);
    });

    it('설정이 없으면 null을 반환한다', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await repository.findByGuildId('guild-unknown');

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────
  // findByChannelId
  // ─────────────────────────────────────────────────────────
  describe('findByChannelId', () => {
    it('channelId로 단건 조회하여 결과를 반환한다', async () => {
      const config = makeOrm();
      mockRepo.findOne.mockResolvedValue(config);

      const result = await repository.findByChannelId('ch-1');

      expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { channelId: 'ch-1' } });
      expect(result).toBe(config);
    });

    it('채널 설정이 없으면 null을 반환한다', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await repository.findByChannelId('ch-unknown');

      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────
  // save (upsert)
  // ─────────────────────────────────────────────────────────
  describe('save', () => {
    it('기존 설정이 없으면 신규 엔티티를 생성하고 저장한다', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const newEntity = makeOrm({ messageId: null });
      mockRepo.create.mockReturnValue(newEntity);
      mockRepo.save.mockResolvedValue(newEntity);

      const dto = makeSaveDto();
      const result = await repository.save('guild-1', dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild-1',
          channelId: 'ch-1',
          messageId: null,
        }),
      );
      expect(mockRepo.save).toHaveBeenCalledWith(newEntity);
      expect(result).toBe(newEntity);
    });

    it('신규 생성 시 messageId는 항상 null로 초기화한다', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const captured: Partial<MusicChannelConfigOrm>[] = [];
      mockRepo.create.mockImplementation((data: Partial<MusicChannelConfigOrm>) => {
        captured.push(data);
        return data;
      });
      mockRepo.save.mockImplementation((e: MusicChannelConfigOrm) => Promise.resolve(e));

      await repository.save('guild-1', makeSaveDto());

      expect(captured[0]?.messageId).toBeNull();
    });

    it('기존 설정이 있으면 필드를 업데이트하고 저장한다', async () => {
      const existing = makeOrm({ channelId: 'old-ch', messageId: 'existing-msg' });
      mockRepo.findOne.mockResolvedValue(existing);
      mockRepo.save.mockResolvedValue({ ...existing, channelId: 'new-ch' });

      const dto = makeSaveDto({ channelId: 'new-ch' });
      await repository.save('guild-1', dto);

      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(existing.channelId).toBe('new-ch');
      expect(mockRepo.save).toHaveBeenCalledWith(existing);
    });

    it('기존 설정 업데이트 시 messageId는 변경하지 않는다', async () => {
      const existing = makeOrm({ messageId: 'keep-this-msg' });
      mockRepo.findOne.mockResolvedValue(existing);
      mockRepo.save.mockResolvedValue(existing);

      await repository.save('guild-1', makeSaveDto({ channelId: 'new-ch' }));

      // messageId는 save()에서 수정하지 않는다
      expect(existing.messageId).toBe('keep-this-msg');
    });

    it('embedTitle, embedDescription, embedColor, embedThumbnailUrl이 undefined이면 null로 저장한다', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const captured: Partial<MusicChannelConfigOrm>[] = [];
      mockRepo.create.mockImplementation((data: Partial<MusicChannelConfigOrm>) => {
        captured.push(data);
        return data;
      });
      mockRepo.save.mockImplementation((e: MusicChannelConfigOrm) => Promise.resolve(e));

      await repository.save(
        'guild-1',
        makeSaveDto({
          embedTitle: undefined,
          embedDescription: undefined,
          embedColor: undefined,
          embedThumbnailUrl: undefined,
        }),
      );

      expect(captured[0]?.embedTitle).toBeNull();
      expect(captured[0]?.embedDescription).toBeNull();
      expect(captured[0]?.embedColor).toBeNull();
      expect(captured[0]?.embedThumbnailUrl).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────
  // updateMessageId
  // ─────────────────────────────────────────────────────────
  describe('updateMessageId', () => {
    it('id와 messageId로 update를 호출한다', async () => {
      await repository.updateMessageId(1, 'msg-100');

      expect(mockRepo.update).toHaveBeenCalledWith({ id: 1 }, { messageId: 'msg-100' });
    });

    it('messageId를 null로 초기화할 수 있다', async () => {
      await repository.updateMessageId(1, null);

      expect(mockRepo.update).toHaveBeenCalledWith({ id: 1 }, { messageId: null });
    });
  });

  // ─────────────────────────────────────────────────────────
  // delete
  // ─────────────────────────────────────────────────────────
  describe('delete', () => {
    it('guildId로 설정을 삭제한다', async () => {
      await repository.delete('guild-1');

      expect(mockRepo.delete).toHaveBeenCalledWith({ guildId: 'guild-1' });
    });
  });
});
