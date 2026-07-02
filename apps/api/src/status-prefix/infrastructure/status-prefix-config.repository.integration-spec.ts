import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import { StatusPrefixButtonType } from '../domain/status-prefix.types';
import type { StatusPrefixConfigSaveDto } from '../presentation/status-prefix-config-save.dto';
import { StatusPrefixButtonOrm } from './status-prefix-button.orm-entity';
import { StatusPrefixConfigOrm } from './status-prefix-config.orm-entity';
import { StatusPrefixConfigRepository } from './status-prefix-config.repository';

function makeDto(overrides: Partial<StatusPrefixConfigSaveDto> = {}): StatusPrefixConfigSaveDto {
  return {
    enabled: true,
    channelId: 'ch-1',
    prefixTemplate: '[{prefix}] {nickname}',
    buttons: [
      {
        label: '게임',
        emoji: null,
        prefix: '게임',
        type: StatusPrefixButtonType.PREFIX,
        sortOrder: 0,
      },
      {
        label: '초기화',
        emoji: null,
        prefix: null,
        type: StatusPrefixButtonType.RESET,
        sortOrder: 1,
      },
    ],
    ...overrides,
  };
}

describe('StatusPrefixConfigRepository (Integration)', () => {
  let module: TestingModule;
  let repository: StatusPrefixConfigRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [StatusPrefixConfigOrm, StatusPrefixButtonOrm],
      providers: [StatusPrefixConfigRepository],
      withRedis: false,
    }).compile();

    repository = module.get(StatusPrefixConfigRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('findByGuildId', () => {
    it('존재하는 설정을 buttons 관계 포함하여 반환한다', async () => {
      await repository.upsert('guild-1', makeDto());

      const result = await repository.findByGuildId('guild-1');

      expect(result).not.toBeNull();
      expect(result.guildId).toBe('guild-1');
      expect(result.enabled).toBe(true);
      expect(result.buttons).toHaveLength(2);
      expect(result.buttons[0].sortOrder).toBeLessThanOrEqual(result.buttons[1].sortOrder);
    });

    it('존재하지 않는 guildId이면 null을 반환한다', async () => {
      const result = await repository.findByGuildId('guild-no-exist');

      expect(result).toBeNull();
    });

    it('buttons가 sortOrder ASC 순서로 정렬된다', async () => {
      await repository.upsert(
        'guild-1',
        makeDto({
          buttons: [
            {
              label: '나중',
              emoji: null,
              prefix: 'Z',
              type: StatusPrefixButtonType.PREFIX,
              sortOrder: 2,
            },
            {
              label: '처음',
              emoji: null,
              prefix: 'A',
              type: StatusPrefixButtonType.PREFIX,
              sortOrder: 0,
            },
            {
              label: '중간',
              emoji: null,
              prefix: 'M',
              type: StatusPrefixButtonType.PREFIX,
              sortOrder: 1,
            },
          ],
        }),
      );

      const result = await repository.findByGuildId('guild-1');

      expect(result.buttons[0].label).toBe('처음');
      expect(result.buttons[1].label).toBe('중간');
      expect(result.buttons[2].label).toBe('나중');
    });
  });

  describe('upsert — 신규 생성', () => {
    it('버튼과 함께 신규 설정을 생성한다', async () => {
      const dto = makeDto();
      const result = await repository.upsert('guild-1', dto);

      expect(result.id).toBeGreaterThan(0);
      expect(result.guildId).toBe('guild-1');
      expect(result.channelId).toBe('ch-1');
      expect(result.prefixTemplate).toBe('[{prefix}] {nickname}');
      expect(result.messageId).toBeNull();
      expect(result.buttons).toHaveLength(2);
    });

    it('버튼이 없는 설정도 생성된다', async () => {
      const result = await repository.upsert('guild-1', makeDto({ buttons: [] }));

      expect(result.buttons).toHaveLength(0);
    });

    it('optional 필드(embedTitle, embedDescription, embedColor)가 저장된다', async () => {
      const result = await repository.upsert(
        'guild-1',
        makeDto({
          embedTitle: '상태 설정',
          embedDescription: '설명',
          embedColor: '#ff0000',
        }),
      );

      expect(result.embedTitle).toBe('상태 설정');
      expect(result.embedDescription).toBe('설명');
      expect(result.embedColor).toBe('#ff0000');
    });
  });

  describe('upsert — 기존 업데이트', () => {
    it('같은 guildId로 upsert하면 기존 레코드를 업데이트한다', async () => {
      await repository.upsert('guild-1', makeDto({ enabled: true }));
      const updated = await repository.upsert('guild-1', makeDto({ enabled: false }));

      expect(updated.enabled).toBe(false);

      const allConfigs = await dataSource.getRepository(StatusPrefixConfigOrm).find({
        where: { guildId: 'guild-1' },
      });
      expect(allConfigs).toHaveLength(1);
    });

    it('기존 버튼을 삭제하고 새 버튼으로 교체한다', async () => {
      await repository.upsert(
        'guild-1',
        makeDto({
          buttons: [
            {
              label: '구버튼',
              emoji: null,
              prefix: 'old',
              type: StatusPrefixButtonType.PREFIX,
              sortOrder: 0,
            },
          ],
        }),
      );

      const updated = await repository.upsert(
        'guild-1',
        makeDto({
          buttons: [
            {
              label: '신버튼1',
              emoji: null,
              prefix: 'new1',
              type: StatusPrefixButtonType.PREFIX,
              sortOrder: 0,
            },
            {
              label: '신버튼2',
              emoji: null,
              prefix: null,
              type: StatusPrefixButtonType.RESET,
              sortOrder: 1,
            },
          ],
        }),
      );

      expect(updated.buttons).toHaveLength(2);
      expect(updated.buttons.map((b) => b.label)).toContain('신버튼1');
      expect(updated.buttons.map((b) => b.label)).toContain('신버튼2');

      const allButtons = await dataSource.getRepository(StatusPrefixButtonOrm).find();
      expect(allButtons.map((b) => b.label)).not.toContain('구버튼');
    });

    it('upsert 후 messageId는 보존된다', async () => {
      await repository.upsert('guild-1', makeDto());
      await repository.updateMessageId('guild-1', 'msg-123', new Date());

      await repository.upsert('guild-1', makeDto({ prefixTemplate: '[new] {nickname}' }));

      const config = await repository.findByGuildId('guild-1');
      expect(config.messageId).toBe('msg-123');
    });
  });

  describe('findButtonById', () => {
    it('버튼 단건 조회 시 config 관계가 포함된다', async () => {
      const created = await repository.upsert('guild-1', makeDto());
      const buttonId = created.buttons[0].id;

      const result = await repository.findButtonById(buttonId);

      expect(result).not.toBeNull();
      expect(result.id).toBe(buttonId);
      expect(result.config).toBeDefined();
      expect(result.config.guildId).toBe('guild-1');
    });

    it('존재하지 않는 버튼 ID이면 null을 반환한다', async () => {
      const NONEXISTENT_BUTTON_ID = 99999;
      const result = await repository.findButtonById(NONEXISTENT_BUTTON_ID);

      expect(result).toBeNull();
    });

    it('버튼의 type과 prefix가 올바르게 저장된다', async () => {
      const created = await repository.upsert('guild-1', makeDto());
      const resetButton = created.buttons.find((b) => b.type === StatusPrefixButtonType.RESET);

      const result = await repository.findButtonById(resetButton.id);

      expect(result.type).toBe(StatusPrefixButtonType.RESET);
      expect(result.prefix).toBeNull();
    });
  });

  describe('updateMessageId', () => {
    it('messageId를 갱신한다', async () => {
      await repository.upsert('guild-1', makeDto());

      await repository.updateMessageId('guild-1', 'msg-abc', new Date());

      const config = await repository.findByGuildId('guild-1');
      expect(config.messageId).toBe('msg-abc');
    });

    it('messageId를 다시 갱신하면 최신값으로 덮어쓴다', async () => {
      await repository.upsert('guild-1', makeDto());
      await repository.updateMessageId('guild-1', 'msg-first', new Date());
      await repository.updateMessageId('guild-1', 'msg-second', new Date());

      const config = await repository.findByGuildId('guild-1');
      expect(config.messageId).toBe('msg-second');
    });
  });
});
