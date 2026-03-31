/**
 * VoiceDailyRepository — auto-channel 필드 단위 테스트
 * 대상: accumulateChannelDuration의 channelType/autoChannelConfigId/autoChannelConfigName 파라미터 처리 (F-VOICE-034)
 *
 * DB 연동 없이 쿼리 파라미터 바인딩만 검증한다.
 * 실제 UPSERT SQL 로직(CASE WHEN, COALESCE)은 통합 테스트(voice-daily.repository.integration-spec.ts)에서 다룬다.
 */

import { type Repository } from 'typeorm';

import { type VoiceDailyOrm } from './voice-daily.orm-entity';
import { VoiceDailyRepository } from './voice-daily.repository';

describe('VoiceDailyRepository.accumulateChannelDuration — auto-channel 파라미터', () => {
  let repository: VoiceDailyRepository;
  let mockRepo: { query: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockRepo = {
      query: vi.fn().mockResolvedValue(undefined),
    };
    repository = new VoiceDailyRepository(mockRepo as unknown as Repository<VoiceDailyOrm>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('auto-channel 파라미터 전달', () => {
    it('channelType=auto_select, autoChannelConfigId, autoChannelConfigName을 전달하면 쿼리 파라미터에 포함된다', async () => {
      await repository.accumulateChannelDuration({
        guildId: 'guild-1',
        userId: 'user-1',
        userName: 'Alice',
        date: '20260316',
        channelId: 'ch-1',
        channelName: '게임방-1호',
        durationSec: 300,
        categoryId: null,
        categoryName: null,
        channelType: 'auto_select',
        autoChannelConfigId: 1,
        autoChannelConfigName: '게임방',
      });

      expect(mockRepo.query).toHaveBeenCalledTimes(1);
      const [, params] = mockRepo.query.mock.calls[0] as [string, unknown[]];

      // $11 = channelType, $12 = autoChannelConfigId, $13 = autoChannelConfigName
      expect(params[10]).toBe('auto_select');
      expect(params[11]).toBe(1);
      expect(params[12]).toBe('게임방');
    });

    it('channelType=auto_instant이 쿼리 파라미터에 포함된다', async () => {
      await repository.accumulateChannelDuration({
        guildId: 'guild-1',
        userId: 'user-1',
        userName: 'Alice',
        date: '20260316',
        channelId: 'ch-2',
        channelName: '즉시방-1호',
        durationSec: 600,
        categoryId: null,
        categoryName: null,
        channelType: 'auto_instant',
        autoChannelConfigId: 42,
        autoChannelConfigName: '즉시생성방',
      });

      const [, params] = mockRepo.query.mock.calls[0] as [string, unknown[]];
      expect(params[10]).toBe('auto_instant');
      expect(params[11]).toBe(42);
      expect(params[12]).toBe('즉시생성방');
    });

    it('channelType을 생략하면 기본값 permanent가 적용된다', async () => {
      await repository.accumulateChannelDuration({
        guildId: 'guild-1',
        userId: 'user-1',
        userName: 'Alice',
        date: '20260316',
        channelId: 'ch-perm',
        channelName: '일반채널',
        durationSec: 100,
        categoryId: null,
        categoryName: null,
      });

      const [, params] = mockRepo.query.mock.calls[0] as [string, unknown[]];
      expect(params[10]).toBe('permanent');
      expect(params[11]).toBeNull();
      expect(params[12]).toBeNull();
    });

    it('autoChannelConfigId=null, autoChannelConfigName=null인 경우 null이 파라미터에 전달된다', async () => {
      await repository.accumulateChannelDuration({
        guildId: 'guild-1',
        userId: 'user-1',
        userName: 'Alice',
        date: '20260316',
        channelId: 'ch-perm',
        channelName: '일반채널',
        durationSec: 200,
        categoryId: null,
        categoryName: null,
        channelType: 'permanent',
        autoChannelConfigId: null,
        autoChannelConfigName: null,
      });

      const [, params] = mockRepo.query.mock.calls[0] as [string, unknown[]];
      expect(params[10]).toBe('permanent');
      expect(params[11]).toBeNull();
      expect(params[12]).toBeNull();
    });

    it('총 파라미터 개수가 13개다', async () => {
      await repository.accumulateChannelDuration({
        guildId: 'guild-1',
        userId: 'user-1',
        userName: 'Alice',
        date: '20260316',
        channelId: 'ch-1',
        channelName: '채널',
        durationSec: 100,
        categoryId: 'cat-1',
        categoryName: '카테고리',
        channelType: 'auto_select',
        autoChannelConfigId: 1,
        autoChannelConfigName: '설정이름',
      });

      const [, params] = mockRepo.query.mock.calls[0] as [string, unknown[]];
      expect(params).toHaveLength(13);
    });

    it('SQL에 channelType, autoChannelConfigId, autoChannelConfigName 컬럼이 포함된다', async () => {
      await repository.accumulateChannelDuration({
        guildId: 'guild-1',
        userId: 'user-1',
        userName: 'Alice',
        date: '20260316',
        channelId: 'ch-1',
        channelName: '채널',
        durationSec: 100,
        categoryId: null,
        categoryName: null,
        channelType: 'auto_select',
        autoChannelConfigId: 1,
        autoChannelConfigName: '방이름',
      });

      const [sql] = mockRepo.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('"channelType"');
      expect(sql).toContain('"autoChannelConfigId"');
      expect(sql).toContain('"autoChannelConfigName"');
    });

    it('SQL에 channelType CASE WHEN 패턴이 포함된다', async () => {
      await repository.accumulateChannelDuration({
        guildId: 'guild-1',
        userId: 'user-1',
        userName: 'Alice',
        date: '20260316',
        channelId: 'ch-1',
        channelName: '채널',
        durationSec: 100,
        categoryId: null,
        categoryName: null,
        channelType: 'permanent',
        autoChannelConfigId: null,
        autoChannelConfigName: null,
      });

      const [sql] = mockRepo.query.mock.calls[0] as [string, unknown[]];
      // CASE WHEN vd."channelType" != 'permanent' THEN vd."channelType" ELSE EXCLUDED."channelType"
      expect(sql).toContain('CASE');
      expect(sql).toContain('WHEN');
      expect(sql).toContain("'permanent'");
    });

    it('SQL에 autoChannelConfigId COALESCE(vd, EXCLUDED) 패턴이 포함된다', async () => {
      await repository.accumulateChannelDuration({
        guildId: 'guild-1',
        userId: 'user-1',
        userName: 'Alice',
        date: '20260316',
        channelId: 'ch-1',
        channelName: '채널',
        durationSec: 100,
        categoryId: null,
        categoryName: null,
        channelType: 'auto_select',
        autoChannelConfigId: 1,
        autoChannelConfigName: '방',
      });

      const [sql] = mockRepo.query.mock.calls[0] as [string, unknown[]];
      // COALESCE(vd."autoChannelConfigId", EXCLUDED."autoChannelConfigId")
      // vd가 EXCLUDED보다 앞에 와야 한다 (기존 값 우선)
      const coalesceMatch = sql.match(
        /COALESCE\(vd\."autoChannelConfigId"\s*,\s*EXCLUDED\."autoChannelConfigId"\)/,
      );
      expect(coalesceMatch).not.toBeNull();
    });
  });

  describe('기존 파라미터 (회귀 검증)', () => {
    it('guildId, userId, userName, date, channelId, channelName, durationSec이 올바른 순서로 전달된다', async () => {
      await repository.accumulateChannelDuration({
        guildId: 'guild-X',
        userId: 'user-X',
        userName: 'Charlie',
        date: '20260101',
        channelId: 'ch-X',
        channelName: '테스트방',
        durationSec: 999,
        categoryId: 'cat-X',
        categoryName: '카테고리X',
        channelType: 'permanent',
        autoChannelConfigId: null,
        autoChannelConfigName: null,
      });

      const [, params] = mockRepo.query.mock.calls[0] as [string, unknown[]];
      // $1~$9 기존 파라미터 순서 검증
      expect(params[0]).toBe('guild-X'); // $1 guildId
      expect(params[1]).toBe('user-X'); // $2 userId
      expect(params[2]).toBe('Charlie'); // $3 userName
      expect(params[3]).toBe('20260101'); // $4 date
      expect(params[4]).toBe('ch-X'); // $5 channelId
      expect(params[5]).toBe('테스트방'); // $6 channelName
      expect(params[6]).toBe(999); // $7 durationSec
      expect(params[7]).toBe('cat-X'); // $8 categoryId
      expect(params[8]).toBe('카테고리X'); // $9 categoryName
    });
  });
});
