import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import type { NewbieMissionTemplateSaveDto } from '../presentation/dto/newbie-mission-template-save.dto';
import { NewbieMissionTemplateOrmEntity as NewbieMissionTemplate } from './newbie-mission-template.orm-entity';
import { NewbieMissionTemplateRepository } from './newbie-mission-template.repository';

function makeDto(
  overrides: Partial<NewbieMissionTemplateSaveDto> = {},
): NewbieMissionTemplateSaveDto {
  return {
    titleTemplate: null,
    headerTemplate: null,
    itemTemplate: null,
    footerTemplate: null,
    statusMapping: null,
    ...overrides,
  };
}

describe('NewbieMissionTemplateRepository (Integration)', () => {
  let module: TestingModule;
  let repository: NewbieMissionTemplateRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [NewbieMissionTemplate],
      providers: [NewbieMissionTemplateRepository],
      withRedis: false,
    }).compile();

    repository = module.get(NewbieMissionTemplateRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  afterAll(async () => {
    await module?.close();
  });

  describe('findByGuildId', () => {
    it('존재하는 guildId의 템플릿을 반환한다', async () => {
      await repository.upsert('guild-1', makeDto({ titleTemplate: '미션 {userName}' }));

      const result = await repository.findByGuildId('guild-1');

      expect(result).not.toBeNull();
      expect(result.guildId).toBe('guild-1');
      expect(result.titleTemplate).toBe('미션 {userName}');
    });

    it('존재하지 않는 guildId이면 null을 반환한다', async () => {
      const result = await repository.findByGuildId('guild-no-exist');

      expect(result).toBeNull();
    });
  });

  describe('upsert — 신규 생성', () => {
    it('기본 값 null로 새 템플릿을 생성한다', async () => {
      const result = await repository.upsert('guild-1', makeDto());

      expect(result.id).toBeGreaterThan(0);
      expect(result.guildId).toBe('guild-1');
      expect(result.titleTemplate).toBeNull();
      expect(result.headerTemplate).toBeNull();
      expect(result.itemTemplate).toBeNull();
      expect(result.footerTemplate).toBeNull();
      expect(result.statusMapping).toBeNull();
    });

    it('모든 템플릿 필드가 저장된다', async () => {
      const result = await repository.upsert(
        'guild-1',
        makeDto({
          titleTemplate: '미션 제목: {title}',
          headerTemplate: '**헤더**',
          itemTemplate: '- {item}',
          footerTemplate: '총 {count}건',
          statusMapping: { IN_PROGRESS: '진행중', COMPLETED: '완료', FAILED: '실패' },
        }),
      );

      expect(result.titleTemplate).toBe('미션 제목: {title}');
      expect(result.headerTemplate).toBe('**헤더**');
      expect(result.itemTemplate).toBe('- {item}');
      expect(result.footerTemplate).toBe('총 {count}건');
      expect(result.statusMapping).toEqual({
        IN_PROGRESS: '진행중',
        COMPLETED: '완료',
        FAILED: '실패',
      });
    });
  });

  describe('upsert — 기존 업데이트', () => {
    it('같은 guildId로 upsert하면 기존 레코드를 업데이트한다', async () => {
      await repository.upsert('guild-1', makeDto({ titleTemplate: '원래 제목' }));

      const updated = await repository.upsert('guild-1', makeDto({ titleTemplate: '변경된 제목' }));

      expect(updated.titleTemplate).toBe('변경된 제목');

      const allRecords = await dataSource.getRepository(NewbieMissionTemplate).find({
        where: { guildId: 'guild-1' },
      });
      expect(allRecords).toHaveLength(1);
    });

    it('필드를 null로 업데이트할 수 있다', async () => {
      await repository.upsert('guild-1', makeDto({ titleTemplate: '제목' }));

      const updated = await repository.upsert('guild-1', makeDto({ titleTemplate: null }));

      expect(updated.titleTemplate).toBeNull();
    });

    it('여러 guildId에 대해 독립적으로 레코드가 생성된다', async () => {
      await repository.upsert('guild-1', makeDto({ titleTemplate: 'Guild 1 Title' }));
      await repository.upsert('guild-2', makeDto({ titleTemplate: 'Guild 2 Title' }));

      const result1 = await repository.findByGuildId('guild-1');
      const result2 = await repository.findByGuildId('guild-2');

      expect(result1.titleTemplate).toBe('Guild 1 Title');
      expect(result2.titleTemplate).toBe('Guild 2 Title');
    });
  });
});
