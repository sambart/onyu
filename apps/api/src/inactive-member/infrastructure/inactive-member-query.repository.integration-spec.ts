import type { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { VoiceDailyOrm } from '../../channel/voice/infrastructure/voice-daily.orm-entity';
import { createIntegrationModuleBuilder } from '../../test-utils/create-integration-module';
import { cleanDatabase } from '../../test-utils/db-cleaner';
import { InactiveMemberGrade } from '../domain/inactive-member.types';
import { InactiveMemberActionLogOrm } from './inactive-member-action-log.orm-entity';
import { InactiveMemberQueryRepository } from './inactive-member-query.repository';
import { InactiveMemberRecordOrm } from './inactive-member-record.orm-entity';
import { InactiveMemberTrendDailyOrm } from './inactive-member-trend-daily.orm-entity';

describe('InactiveMemberQueryRepository (Integration)', () => {
  let module: TestingModule;
  let repository: InactiveMemberQueryRepository;
  let dataSource: DataSource;

  beforeAll(async () => {
    module = await createIntegrationModuleBuilder({
      entities: [
        InactiveMemberRecordOrm,
        InactiveMemberActionLogOrm,
        VoiceDailyOrm,
        InactiveMemberTrendDailyOrm,
      ],
      providers: [InactiveMemberQueryRepository],
      withRedis: false,
    }).compile();

    repository = module.get(InactiveMemberQueryRepository);
    dataSource = module.get(DataSource);
  }, 60_000);

  afterEach(async () => {
    await cleanDatabase(dataSource);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('sumVoiceDurationByUser', () => {
    it('기간 내 사용자별 음성 시간을 합산하고 GLOBAL 채널을 제외한다', async () => {
      const voiceDailyRepo = dataSource.getRepository(VoiceDailyOrm);

      // 개별 채널 레코드 (합산 대상)
      await voiceDailyRepo.save([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          date: '20260310',
          channelId: 'ch-1',
          channelName: 'General',
          userName: 'Alice',
          channelDurationSec: 3600,
          micOnSec: 0,
          micOffSec: 0,
          aloneSec: 0,
          streamingSec: 0,
          videoOnSec: 0,
          deafSec: 0,
          recordedAt: null,
        },
        {
          guildId: 'guild-1',
          userId: 'user-1',
          date: '20260315',
          channelId: 'ch-1',
          channelName: 'General',
          userName: 'Alice',
          channelDurationSec: 1800,
          micOnSec: 0,
          micOffSec: 0,
          aloneSec: 0,
          streamingSec: 0,
          videoOnSec: 0,
          deafSec: 0,
          recordedAt: null,
        },
        // GLOBAL 채널 레코드 (제외 대상)
        {
          guildId: 'guild-1',
          userId: 'user-1',
          date: '20260315',
          channelId: 'GLOBAL',
          channelName: '',
          userName: 'Alice',
          channelDurationSec: 99999,
          micOnSec: 1800,
          micOffSec: 0,
          aloneSec: 0,
          streamingSec: 0,
          videoOnSec: 0,
          deafSec: 0,
          recordedAt: null,
        },
        // 기간 밖 레코드 (제외 대상)
        {
          guildId: 'guild-1',
          userId: 'user-1',
          date: '20260301',
          channelId: 'ch-1',
          channelName: 'General',
          userName: 'Alice',
          channelDurationSec: 7200,
          micOnSec: 0,
          micOffSec: 0,
          aloneSec: 0,
          streamingSec: 0,
          videoOnSec: 0,
          deafSec: 0,
          recordedAt: null,
        },
      ]);

      const result = await repository.sumVoiceDurationByUser('guild-1', '20260305', '20260318');

      expect(result.has('user-1')).toBe(true);
      // GLOBAL 제외, 기간 내 개별 채널만 합산: 3600 + 1800 = 5400
      expect(result.get('user-1')).toBe(5400);
    });

    it('기간 내 데이터가 없으면 빈 Map을 반환한다', async () => {
      const result = await repository.sumVoiceDurationByUser('guild-1', '20260301', '20260318');

      expect(result.size).toBe(0);
    });
  });

  describe('findLastVoiceDateByUser', () => {
    it('기간 내 마지막 음성 활동 날짜를 사용자별로 반환한다', async () => {
      const voiceDailyRepo = dataSource.getRepository(VoiceDailyOrm);

      await voiceDailyRepo.save([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          date: '20260310',
          channelId: 'ch-1',
          channelName: 'General',
          userName: 'Alice',
          channelDurationSec: 100,
          micOnSec: 0,
          micOffSec: 0,
          aloneSec: 0,
          streamingSec: 0,
          videoOnSec: 0,
          deafSec: 0,
          recordedAt: null,
        },
        {
          guildId: 'guild-1',
          userId: 'user-1',
          date: '20260318',
          channelId: 'ch-1',
          channelName: 'General',
          userName: 'Alice',
          channelDurationSec: 200,
          micOnSec: 0,
          micOffSec: 0,
          aloneSec: 0,
          streamingSec: 0,
          videoOnSec: 0,
          deafSec: 0,
          recordedAt: null,
        },
        // GLOBAL 채널은 lastVoiceDate 집계에서 제외됨
        {
          guildId: 'guild-1',
          userId: 'user-1',
          date: '20260319',
          channelId: 'GLOBAL',
          channelName: '',
          userName: 'Alice',
          channelDurationSec: 0,
          micOnSec: 500,
          micOffSec: 0,
          aloneSec: 0,
          streamingSec: 0,
          videoOnSec: 0,
          deafSec: 0,
          recordedAt: null,
        },
        {
          guildId: 'guild-1',
          userId: 'user-2',
          date: '20260312',
          channelId: 'ch-2',
          channelName: 'Gaming',
          userName: 'Bob',
          channelDurationSec: 300,
          micOnSec: 0,
          micOffSec: 0,
          aloneSec: 0,
          streamingSec: 0,
          videoOnSec: 0,
          deafSec: 0,
          recordedAt: null,
        },
      ]);

      const result = await repository.findLastVoiceDateByUser('guild-1', '20260305');

      expect(result.has('user-1')).toBe(true);
      // GLOBAL 제외, 개별 채널 중 최대 날짜: 20260318
      expect(result.get('user-1')).toBe('20260318');

      expect(result.has('user-2')).toBe(true);
      expect(result.get('user-2')).toBe('20260312');
    });
  });

  describe('findRecordList', () => {
    it('guildId에 해당하는 레코드를 페이징하여 반환한다', async () => {
      const recordRepo = dataSource.getRepository(InactiveMemberRecordOrm);
      const classifiedAt = new Date('2026-03-18T00:00:00Z');

      await recordRepo.save([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          grade: InactiveMemberGrade.FULLY_INACTIVE,
          totalMinutes: 0,
          prevTotalMinutes: 0,
          lastVoiceDate: '2026-03-01',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
        {
          guildId: 'guild-1',
          userId: 'user-2',
          grade: InactiveMemberGrade.LOW_ACTIVE,
          totalMinutes: 20,
          prevTotalMinutes: 40,
          lastVoiceDate: '2026-03-10',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
        {
          guildId: 'guild-1',
          userId: 'user-3',
          grade: InactiveMemberGrade.DECLINING,
          totalMinutes: 30,
          prevTotalMinutes: 60,
          lastVoiceDate: '2026-03-15',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
      ]);

      const result = await repository.findRecordList('guild-1', { page: 1, limit: 2 });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
      // prevTotalMinutes 필드가 응답 items에 포함되는지 검증 (PRD F-INACTIVE-002 응답 스키마)
      expect(typeof result.items[0].prevTotalMinutes).toBe('number');
    });

    it('grade 필터를 적용하면 해당 등급만 반환한다', async () => {
      const recordRepo = dataSource.getRepository(InactiveMemberRecordOrm);
      const classifiedAt = new Date('2026-03-18T00:00:00Z');

      await recordRepo.save([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          grade: InactiveMemberGrade.FULLY_INACTIVE,
          totalMinutes: 0,
          prevTotalMinutes: 0,
          lastVoiceDate: null,
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
        {
          guildId: 'guild-1',
          userId: 'user-2',
          grade: InactiveMemberGrade.LOW_ACTIVE,
          totalMinutes: 20,
          prevTotalMinutes: 40,
          lastVoiceDate: '2026-03-10',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
      ]);

      const result = await repository.findRecordList('guild-1', {
        grade: InactiveMemberGrade.FULLY_INACTIVE,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].userId).toBe('user-1');
      expect(result.items[0].grade).toBe(InactiveMemberGrade.FULLY_INACTIVE);
    });

    it('grade 필터 없이 조회하면 grade가 NULL인 레코드는 제외한다', async () => {
      const recordRepo = dataSource.getRepository(InactiveMemberRecordOrm);
      const classifiedAt = new Date('2026-03-18T00:00:00Z');

      await recordRepo.save([
        {
          guildId: 'guild-1',
          userId: 'user-1',
          grade: InactiveMemberGrade.FULLY_INACTIVE,
          totalMinutes: 0,
          prevTotalMinutes: 0,
          lastVoiceDate: null,
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
        {
          guildId: 'guild-1',
          userId: 'user-2',
          grade: null,
          totalMinutes: 100,
          prevTotalMinutes: 90,
          lastVoiceDate: '2026-03-18',
          gradeChangedAt: null,
          classifiedAt,
        },
      ]);

      const result = await repository.findRecordList('guild-1', {});

      expect(result.total).toBe(1);
      expect(result.items[0].userId).toBe('user-1');
    });

    it('grade=DECLINING + sortBy=decreaseRate + DESC 시 감소율 큰 순으로 정렬한다', async () => {
      const recordRepo = dataSource.getRepository(InactiveMemberRecordOrm);
      const classifiedAt = new Date('2026-03-18T00:00:00Z');

      await recordRepo.save([
        // user-A: 100 → 60 (40% 감소)
        {
          guildId: 'guild-1',
          userId: 'user-A',
          grade: InactiveMemberGrade.DECLINING,
          totalMinutes: 60,
          prevTotalMinutes: 100,
          lastVoiceDate: '2026-03-15',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
        // user-B: 100 → 20 (80% 감소)
        {
          guildId: 'guild-1',
          userId: 'user-B',
          grade: InactiveMemberGrade.DECLINING,
          totalMinutes: 20,
          prevTotalMinutes: 100,
          lastVoiceDate: '2026-03-10',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
        // user-C: 100 → 50 (50% 감소)
        {
          guildId: 'guild-1',
          userId: 'user-C',
          grade: InactiveMemberGrade.DECLINING,
          totalMinutes: 50,
          prevTotalMinutes: 100,
          lastVoiceDate: '2026-03-12',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
      ]);

      const result = await repository.findRecordList('guild-1', {
        grade: InactiveMemberGrade.DECLINING,
        sortBy: 'decreaseRate',
        sortOrder: 'DESC',
      });

      // 감소율: user-B(80%) > user-C(50%) > user-A(40%) 순
      expect(result.items.map((r) => r.userId)).toEqual(['user-B', 'user-C', 'user-A']);
    });

    it('grade=DECLINING + sortBy=decreaseRate에서 prevTotalMinutes=0이면 감소율 0으로 처리되어 DESC 정렬 시 마지막에 위치한다', async () => {
      const recordRepo = dataSource.getRepository(InactiveMemberRecordOrm);
      const classifiedAt = new Date('2026-03-18T00:00:00Z');

      await recordRepo.save([
        // prevTotalMinutes=0 → CASE WHEN 표현식이 0을 반환 → DESC 정렬 시 끝
        {
          guildId: 'guild-1',
          userId: 'user-zero-prev',
          grade: InactiveMemberGrade.DECLINING,
          totalMinutes: 0,
          prevTotalMinutes: 0,
          lastVoiceDate: '2026-03-10',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
        // (100-10)/100 = 0.9 → DESC 정렬 시 앞
        {
          guildId: 'guild-1',
          userId: 'user-large-decline',
          grade: InactiveMemberGrade.DECLINING,
          totalMinutes: 10,
          prevTotalMinutes: 100,
          lastVoiceDate: '2026-03-12',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
      ]);

      const result = await repository.findRecordList('guild-1', {
        grade: InactiveMemberGrade.DECLINING,
        sortBy: 'decreaseRate',
        sortOrder: 'DESC',
      });

      expect(result.items.map((r) => r.userId)).toEqual(['user-large-decline', 'user-zero-prev']);
    });

    it('sortBy=decreaseRate이지만 grade가 DECLINING이 아닌 경우 lastVoiceDate ASC로 fallback한다', async () => {
      const recordRepo = dataSource.getRepository(InactiveMemberRecordOrm);
      const classifiedAt = new Date('2026-03-18T00:00:00Z');

      await recordRepo.save([
        {
          guildId: 'guild-1',
          userId: 'user-recent',
          grade: InactiveMemberGrade.LOW_ACTIVE,
          totalMinutes: 20,
          prevTotalMinutes: 50,
          lastVoiceDate: '2026-03-15',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
        {
          guildId: 'guild-1',
          userId: 'user-old',
          grade: InactiveMemberGrade.LOW_ACTIVE,
          totalMinutes: 10,
          prevTotalMinutes: 100,
          lastVoiceDate: '2026-03-05',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
      ]);

      // sortOrder='DESC'를 전달하지만 fallback 시 lastVoiceDate ASC로 강제됨
      const result = await repository.findRecordList('guild-1', {
        grade: InactiveMemberGrade.LOW_ACTIVE,
        sortBy: 'decreaseRate',
        sortOrder: 'DESC',
      });

      // lastVoiceDate ASC: 2026-03-05(user-old) < 2026-03-15(user-recent)
      expect(result.items.map((r) => r.userId)).toEqual(['user-old', 'user-recent']);
    });

    it('grade 미지정 + sortBy=decreaseRate → lastVoiceDate ASC fallback으로 정렬한다', async () => {
      const recordRepo = dataSource.getRepository(InactiveMemberRecordOrm);
      const classifiedAt = new Date('2026-03-18T00:00:00Z');

      await recordRepo.save([
        {
          guildId: 'guild-1',
          userId: 'user-fully',
          grade: InactiveMemberGrade.FULLY_INACTIVE,
          totalMinutes: 0,
          prevTotalMinutes: 0,
          lastVoiceDate: '2026-03-15',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
        {
          guildId: 'guild-1',
          userId: 'user-low',
          grade: InactiveMemberGrade.LOW_ACTIVE,
          totalMinutes: 10,
          prevTotalMinutes: 80,
          lastVoiceDate: '2026-03-01',
          gradeChangedAt: classifiedAt,
          classifiedAt,
        },
      ]);

      const result = await repository.findRecordList('guild-1', {
        // grade 미지정 → DECLINING이 아니므로 fallback
        sortBy: 'decreaseRate',
        sortOrder: 'DESC',
      });

      // lastVoiceDate ASC: 2026-03-01(user-low) < 2026-03-15(user-fully)
      expect(result.items.map((r) => r.userId)).toEqual(['user-low', 'user-fully']);
    });
  });
});
