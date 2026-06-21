import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import type { NewbieMocoTemplateSaveDto } from '../presentation/dto/newbie-moco-template-save.dto';
import { NewbieMocoTemplateOrmEntity as NewbieMocoTemplate } from './newbie-moco-template.orm-entity';
import { NewbieMocoTemplateRepository } from './newbie-moco-template.repository';

function makeDto(overrides: Partial<NewbieMocoTemplateSaveDto> = {}): NewbieMocoTemplateSaveDto {
  return {
    titleTemplate: null,
    bodyTemplate: null,
    itemTemplate: null,
    footerTemplate: null,
    scoringTemplate: null,
    ...overrides,
  };
}

describe('NewbieMocoTemplateRepository (Integration)', () => {
  let module: TestingModule;
  let repository: NewbieMocoTemplateRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [NewbieMocoTemplate],
      providers: [NewbieMocoTemplateRepository],
      withRedis: false,
    }).compile();

    repository = module.get(NewbieMocoTemplateRepository);
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
      await repository.upsert('guild-1', makeDto({ titleTemplate: '모코코 랭킹' }));

      const result = await repository.findByGuildId('guild-1');

      expect(result).not.toBeNull();
      expect(result.guildId).toBe('guild-1');
      expect(result.titleTemplate).toBe('모코코 랭킹');
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
      expect(result.bodyTemplate).toBeNull();
      expect(result.itemTemplate).toBeNull();
      expect(result.footerTemplate).toBeNull();
      expect(result.scoringTemplate).toBeNull();
    });

    it('모든 템플릿 필드가 저장된다', async () => {
      const result = await repository.upsert(
        'guild-1',
        makeDto({
          titleTemplate: '모코코 랭킹 {date}',
          bodyTemplate: '**헌터 랭킹**',
          itemTemplate: '{rank}. {name} - {score}점',
          footerTemplate: '총 {count}명 참여',
          scoringTemplate: '세션 1점 + 분당 0.5점',
        }),
      );

      expect(result.titleTemplate).toBe('모코코 랭킹 {date}');
      expect(result.bodyTemplate).toBe('**헌터 랭킹**');
      expect(result.itemTemplate).toBe('{rank}. {name} - {score}점');
      expect(result.footerTemplate).toBe('총 {count}명 참여');
      expect(result.scoringTemplate).toBe('세션 1점 + 분당 0.5점');
    });
  });

  describe('upsert — 기존 업데이트', () => {
    it('같은 guildId로 upsert하면 기존 레코드를 업데이트한다', async () => {
      await repository.upsert('guild-1', makeDto({ titleTemplate: '원래 제목' }));

      const updated = await repository.upsert('guild-1', makeDto({ titleTemplate: '변경된 제목' }));

      expect(updated.titleTemplate).toBe('변경된 제목');

      const allRecords = await dataSource.getRepository(NewbieMocoTemplate).find({
        where: { guildId: 'guild-1' },
      });
      expect(allRecords).toHaveLength(1);
    });

    it('필드를 null로 업데이트할 수 있다', async () => {
      await repository.upsert('guild-1', makeDto({ bodyTemplate: '기존 바디' }));

      const updated = await repository.upsert('guild-1', makeDto({ bodyTemplate: null }));

      expect(updated.bodyTemplate).toBeNull();
    });

    it('여러 guildId에 대해 독립적으로 레코드가 생성된다', async () => {
      await repository.upsert('guild-1', makeDto({ titleTemplate: 'Guild 1' }));
      await repository.upsert('guild-2', makeDto({ titleTemplate: 'Guild 2' }));

      const result1 = await repository.findByGuildId('guild-1');
      const result2 = await repository.findByGuildId('guild-2');

      expect(result1.titleTemplate).toBe('Guild 1');
      expect(result2.titleTemplate).toBe('Guild 2');
    });
  });
});
