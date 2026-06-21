import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import type { StickyMessageSaveDto } from '../dto/sticky-message-save.dto';
import { StickyMessageConfigOrm } from './sticky-message-config.orm-entity';
import { StickyMessageConfigRepository } from './sticky-message-config.repository';

function makeDto(overrides: Partial<StickyMessageSaveDto> = {}): StickyMessageSaveDto {
  return {
    channelId: 'ch-1',
    embedTitle: '고정 메시지',
    embedDescription: '내용입니다',
    embedColor: '#00ff00',
    enabled: true,
    sortOrder: 0,
    ...overrides,
  };
}

describe('StickyMessageConfigRepository (Integration)', () => {
  let module: TestingModule;
  let repository: StickyMessageConfigRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [StickyMessageConfigOrm],
      providers: [StickyMessageConfigRepository],
      withRedis: false,
    }).compile();

    repository = module.get(StickyMessageConfigRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('save + findByGuildId', () => {
    it('신규 설정을 저장하고 guildId로 조회한다', async () => {
      await repository.save('guild-1', makeDto());

      const results = await repository.findByGuildId('guild-1');

      expect(results).toHaveLength(1);
      expect(results[0].guildId).toBe('guild-1');
      expect(results[0].channelId).toBe('ch-1');
      expect(results[0].embedTitle).toBe('고정 메시지');
      expect(results[0].messageId).toBeNull();
    });

    it('같은 guild에 여러 설정을 저장하면 모두 조회된다', async () => {
      await repository.save('guild-1', makeDto({ channelId: 'ch-1', sortOrder: 0 }));
      await repository.save('guild-1', makeDto({ channelId: 'ch-2', sortOrder: 1 }));

      const results = await repository.findByGuildId('guild-1');

      expect(results).toHaveLength(2);
    });

    it('결과가 sortOrder ASC 순서로 정렬된다', async () => {
      await repository.save('guild-1', makeDto({ channelId: 'ch-a', sortOrder: 5 }));
      await repository.save('guild-1', makeDto({ channelId: 'ch-b', sortOrder: 1 }));
      await repository.save('guild-1', makeDto({ channelId: 'ch-c', sortOrder: 3 }));

      const results = await repository.findByGuildId('guild-1');

      expect(results[0].sortOrder).toBe(1);
      expect(results[1].sortOrder).toBe(3);
      expect(results[2].sortOrder).toBe(5);
    });

    it('존재하지 않는 guildId이면 빈 배열을 반환한다', async () => {
      const results = await repository.findByGuildId('guild-no-exist');

      expect(results).toHaveLength(0);
    });
  });

  describe('save — id 있는 경우 업데이트', () => {
    it('기존 id로 save하면 레코드가 수정된다', async () => {
      const created = await repository.save('guild-1', makeDto({ embedTitle: '초기 제목' }));

      await repository.save('guild-1', makeDto({ id: created.id, embedTitle: '변경된 제목' }));

      const results = await repository.findByGuildId('guild-1');
      expect(results).toHaveLength(1);
      expect(results[0].embedTitle).toBe('변경된 제목');
    });

    it('업데이트 시 messageId는 변경되지 않는다', async () => {
      const created = await repository.save('guild-1', makeDto());
      await repository.updateMessageId(created.id, 'msg-preserve');

      await repository.save('guild-1', makeDto({ id: created.id, embedTitle: '수정됨' }));

      const result = await repository.findById(created.id);
      expect(result.messageId).toBe('msg-preserve');
    });
  });

  describe('findByGuildAndChannel', () => {
    it('enabled=true인 설정만 조회한다', async () => {
      await repository.save('guild-1', makeDto({ channelId: 'ch-1', enabled: true }));
      await repository.save('guild-1', makeDto({ channelId: 'ch-1', enabled: false }));

      const results = await repository.findByGuildAndChannel('guild-1', 'ch-1');

      expect(results).toHaveLength(1);
      expect(results[0].enabled).toBe(true);
    });

    it('다른 guildId는 조회되지 않는다', async () => {
      await repository.save('guild-1', makeDto({ channelId: 'ch-1' }));
      await repository.save('guild-2', makeDto({ channelId: 'ch-1' }));

      const results = await repository.findByGuildAndChannel('guild-1', 'ch-1');

      expect(results).toHaveLength(1);
      expect(results[0].guildId).toBe('guild-1');
    });

    it('다른 channelId는 조회되지 않는다', async () => {
      await repository.save('guild-1', makeDto({ channelId: 'ch-1' }));
      await repository.save('guild-1', makeDto({ channelId: 'ch-2' }));

      const results = await repository.findByGuildAndChannel('guild-1', 'ch-1');

      expect(results).toHaveLength(1);
      expect(results[0].channelId).toBe('ch-1');
    });

    it('해당 조건에 맞는 설정이 없으면 빈 배열을 반환한다', async () => {
      const results = await repository.findByGuildAndChannel('guild-no-data', 'ch-no-data');

      expect(results).toHaveLength(0);
    });
  });

  describe('updateMessageId', () => {
    it('messageId를 갱신한다', async () => {
      const created = await repository.save('guild-1', makeDto());

      await repository.updateMessageId(created.id, 'msg-xyz');

      const result = await repository.findById(created.id);
      expect(result.messageId).toBe('msg-xyz');
    });

    it('messageId를 다시 갱신하면 최신값으로 덮어쓴다', async () => {
      const created = await repository.save('guild-1', makeDto());
      await repository.updateMessageId(created.id, 'msg-first');
      await repository.updateMessageId(created.id, 'msg-second');

      const result = await repository.findById(created.id);
      expect(result.messageId).toBe('msg-second');
    });
  });

  describe('delete', () => {
    it('단건 삭제 후 조회되지 않는다', async () => {
      const created = await repository.save('guild-1', makeDto());

      await repository.delete(created.id);

      const result = await repository.findById(created.id);
      expect(result).toBeNull();
    });

    it('다른 설정은 영향받지 않는다', async () => {
      const config1 = await repository.save('guild-1', makeDto({ channelId: 'ch-1' }));
      await repository.save('guild-1', makeDto({ channelId: 'ch-2' }));

      await repository.delete(config1.id);

      const results = await repository.findByGuildId('guild-1');
      expect(results).toHaveLength(1);
      expect(results[0].channelId).toBe('ch-2');
    });
  });

  describe('deleteByGuildAndChannel', () => {
    it('채널 내 모든 설정을 삭제한다', async () => {
      await repository.save('guild-1', makeDto({ channelId: 'ch-1', sortOrder: 0 }));
      await repository.save('guild-1', makeDto({ channelId: 'ch-1', sortOrder: 1 }));

      await repository.deleteByGuildAndChannel('guild-1', 'ch-1');

      const results = await repository.findByGuildAndChannel('guild-1', 'ch-1');
      expect(results).toHaveLength(0);
    });

    it('다른 채널의 설정은 영향받지 않는다', async () => {
      await repository.save('guild-1', makeDto({ channelId: 'ch-1' }));
      await repository.save('guild-1', makeDto({ channelId: 'ch-2' }));

      await repository.deleteByGuildAndChannel('guild-1', 'ch-1');

      const results = await repository.findByGuildId('guild-1');
      expect(results).toHaveLength(1);
      expect(results[0].channelId).toBe('ch-2');
    });

    it('다른 guildId의 설정은 삭제되지 않는다', async () => {
      await repository.save('guild-1', makeDto({ channelId: 'ch-1' }));
      await repository.save('guild-2', makeDto({ channelId: 'ch-1' }));

      await repository.deleteByGuildAndChannel('guild-1', 'ch-1');

      const results = await repository.findByGuildId('guild-2');
      expect(results).toHaveLength(1);
    });
  });
});
