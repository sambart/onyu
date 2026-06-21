import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../../test-utils/create-integration-module';
import { cleanDatabase } from '../../../test-utils/db-cleaner';
import type { AutoChannelSaveDto } from '../dto/auto-channel-save.dto';
import { AutoChannelButtonOrm } from './auto-channel-button.orm-entity';
import { AutoChannelConfigOrm } from './auto-channel-config.orm-entity';
import { AutoChannelConfigRepository } from './auto-channel-config.repository';
import { AutoChannelSubOptionOrm } from './auto-channel-sub-option.orm-entity';

function makeDto(overrides: Partial<AutoChannelSaveDto> = {}): AutoChannelSaveDto {
  return {
    name: '테스트 설정',
    triggerChannelId: 'trigger-ch-1',
    guideChannelId: 'guide-ch-1',
    guideMessage: '안내 메시지입니다.',
    buttons: [
      {
        label: '일반방',
        targetCategoryId: 'cat-1',
        sortOrder: 0,
        subOptions: [
          {
            label: '옵션 A',
            channelNameTemplate: '{user}의 방',
            sortOrder: 0,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('AutoChannelConfigRepository (Integration)', () => {
  let module: TestingModule;
  let repository: AutoChannelConfigRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [AutoChannelConfigOrm, AutoChannelButtonOrm, AutoChannelSubOptionOrm],
      providers: [AutoChannelConfigRepository],
      withRedis: false,
    }).compile();

    repository = module.get(AutoChannelConfigRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  describe('upsert — 신규 설정 생성', () => {
    it('버튼과 하위 선택지를 포함한 신규 설정을 생성한다', async () => {
      const dto = makeDto();
      const result = await repository.upsert('guild-1', dto);

      expect(result.id).toBeGreaterThan(0);
      expect(result.guildId).toBe('guild-1');
      expect(result.name).toBe('테스트 설정');
      expect(result.triggerChannelId).toBe('trigger-ch-1');
      expect(result.guideMessageId).toBeNull();

      expect(result.buttons).toHaveLength(1);
      expect(result.buttons[0].label).toBe('일반방');
      expect(result.buttons[0].subOptions).toHaveLength(1);
      expect(result.buttons[0].subOptions[0].label).toBe('옵션 A');
    });

    it('버튼이 없는 설정도 생성된다', async () => {
      const dto = makeDto({ buttons: [] });
      const result = await repository.upsert('guild-1', dto);

      expect(result.buttons).toHaveLength(0);
    });

    it('옵션 필드(embedTitle, embedColor, waitingRoomTemplate)가 저장된다', async () => {
      const dto = makeDto({
        embedTitle: '제목',
        embedColor: '#ff0000',
        waitingRoomTemplate: '대기실-{user}',
      });
      const result = await repository.upsert('guild-1', dto);

      expect(result.embedTitle).toBe('제목');
      expect(result.embedColor).toBe('#ff0000');
      expect(result.waitingRoomTemplate).toBe('대기실-{user}');
    });
  });

  describe('upsert — 기존 설정 업데이트', () => {
    it('동일한 (guildId, triggerChannelId)로 upsert하면 기존 레코드를 업데이트한다', async () => {
      await repository.upsert('guild-1', makeDto({ name: '초기 이름' }));

      const updated = await repository.upsert('guild-1', makeDto({ name: '변경된 이름' }));

      expect(updated.name).toBe('변경된 이름');

      const allConfigs = await dataSource.getRepository(AutoChannelConfigOrm).find({
        where: { guildId: 'guild-1' },
      });
      expect(allConfigs).toHaveLength(1);
    });

    it('기존 버튼을 삭제하고 새 버튼으로 교체한다', async () => {
      await repository.upsert(
        'guild-1',
        makeDto({
          buttons: [{ label: '구버튼', targetCategoryId: 'cat-old', sortOrder: 0, subOptions: [] }],
        }),
      );

      const updated = await repository.upsert(
        'guild-1',
        makeDto({
          buttons: [
            { label: '신버튼1', targetCategoryId: 'cat-new-1', sortOrder: 0, subOptions: [] },
            { label: '신버튼2', targetCategoryId: 'cat-new-2', sortOrder: 1, subOptions: [] },
          ],
        }),
      );

      expect(updated.buttons).toHaveLength(2);
      expect(updated.buttons.map((b) => b.label)).toContain('신버튼1');
      expect(updated.buttons.map((b) => b.label)).toContain('신버튼2');

      // 구버튼이 DB에서 삭제되었는지 확인
      const allButtons = await dataSource.getRepository(AutoChannelButtonOrm).find();
      expect(allButtons.map((b) => b.label)).not.toContain('구버튼');
    });

    it('버튼 교체 시 기존 subOptions도 CASCADE 삭제된다', async () => {
      await repository.upsert(
        'guild-1',
        makeDto({
          buttons: [
            {
              label: '구버튼',
              targetCategoryId: 'cat-1',
              sortOrder: 0,
              subOptions: [{ label: '구옵션', channelNameTemplate: '{user}', sortOrder: 0 }],
            },
          ],
        }),
      );

      await repository.upsert('guild-1', makeDto({ buttons: [] }));

      const allSubOptions = await dataSource.getRepository(AutoChannelSubOptionOrm).find();
      expect(allSubOptions).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('ID로 설정을 조회하고 buttons, subOptions 관계를 포함한다', async () => {
      const created = await repository.upsert('guild-1', makeDto());

      const result = await repository.findById(created.id);

      expect(result).not.toBeNull();
      expect(result.id).toBe(created.id);
      expect(result.buttons).toHaveLength(1);
      expect(result.buttons[0].subOptions).toHaveLength(1);
    });

    it('존재하지 않는 ID이면 null을 반환한다', async () => {
      const NONEXISTENT_ID = 99999;
      const result = await repository.findById(NONEXISTENT_ID);
      expect(result).toBeNull();
    });

    it('여러 버튼과 선택지가 모두 조회된다', async () => {
      const dto = makeDto({
        buttons: [
          {
            label: '버튼1',
            targetCategoryId: 'cat-1',
            sortOrder: 0,
            subOptions: [
              { label: 'Sub1', channelNameTemplate: '{user}-1', sortOrder: 0 },
              { label: 'Sub2', channelNameTemplate: '{user}-2', sortOrder: 1 },
            ],
          },
          {
            label: '버튼2',
            targetCategoryId: 'cat-2',
            sortOrder: 1,
            subOptions: [],
          },
        ],
      });
      const created = await repository.upsert('guild-1', dto);

      const result = await repository.findById(created.id);

      expect(result.buttons).toHaveLength(2);
      const btn1 = result.buttons.find((b) => b.label === '버튼1');
      expect(btn1?.subOptions).toHaveLength(2);
    });
  });

  describe('findByTriggerChannel', () => {
    it('트리거 채널 ID로 설정을 조회한다', async () => {
      await repository.upsert('guild-1', makeDto({ triggerChannelId: 'trigger-ch-1' }));

      const result = await repository.findByTriggerChannel('guild-1', 'trigger-ch-1');

      expect(result).not.toBeNull();
      expect(result.triggerChannelId).toBe('trigger-ch-1');
    });

    it('다른 guildId이면 조회되지 않는다', async () => {
      await repository.upsert('guild-1', makeDto({ triggerChannelId: 'trigger-ch-1' }));

      const result = await repository.findByTriggerChannel('guild-999', 'trigger-ch-1');

      expect(result).toBeNull();
    });

    it('존재하지 않는 트리거 채널이면 null을 반환한다', async () => {
      const result = await repository.findByTriggerChannel('guild-1', 'non-existent-channel');
      expect(result).toBeNull();
    });

    it('조회 결과에 buttons와 subOptions 관계가 포함된다', async () => {
      await repository.upsert('guild-1', makeDto());

      const result = await repository.findByTriggerChannel('guild-1', 'trigger-ch-1');

      expect(result.buttons).toHaveLength(1);
      expect(result.buttons[0].subOptions).toHaveLength(1);
    });

    it('같은 서버 내 다른 트리거 채널은 독립적으로 조회된다', async () => {
      await repository.upsert(
        'guild-1',
        makeDto({ triggerChannelId: 'trigger-ch-1', name: '설정1' }),
      );
      await repository.upsert(
        'guild-1',
        makeDto({ triggerChannelId: 'trigger-ch-2', name: '설정2' }),
      );

      const result1 = await repository.findByTriggerChannel('guild-1', 'trigger-ch-1');
      const result2 = await repository.findByTriggerChannel('guild-1', 'trigger-ch-2');

      expect(result1.name).toBe('설정1');
      expect(result2.name).toBe('설정2');
    });
  });
});
