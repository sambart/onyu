/**
 * voice-dashboard-api.ts 유닛 테스트
 *
 * 자동방 채널 통계 그룹핑 기능(F-VOICE-037)에서 추가된
 * 집계 함수들의 순수 로직을 검증한다.
 *
 * 검증 대상:
 * - computeAutoChannelGroupStats(): button 단위 그룹핑, instanceCount 정확성
 * - computeChannelStats(records, 'auto_grouped'): 자동방 합산, 상설 채널 유지
 *   - buttonId가 있으면 'auto:btn:{buttonId}' 키 사용
 *   - buttonId가 없으면 'auto:cfg:{configId}' 폴백
 * - computeChannelStats(records, 'individual'): 기존 동작 보존
 * - computeSummary(): uniqueChannels가 자동방 button 단위로 카운트되는지
 * - filterRecordsByChannelType(): 각 필터 옵션(all/permanent/auto) 정상 동작, GLOBAL 레코드 항상 유지
 * - 하위 호환성: channelType/autoChannelConfigId undefined 레코드에서 정상 동작
 */

import { describe, expect, it } from 'vitest';

import {
  computeAutoChannelGroupStats,
  computeChannelStats,
  computeSummary,
  filterRecordsByChannelType,
  type VoiceDailyRecord,
} from '../voice-dashboard-api';

// ─── 픽스처 헬퍼 ──────────────────────────────────────────────────────────────

/** VoiceDailyRecord 기본 필드를 공유하는 기반 객체 */
const BASE_RECORD: Omit<VoiceDailyRecord, 'channelId' | 'channelName' | 'channelDurationSec'> = {
  guildId: 'guild-test',
  userId: 'user-01',
  date: '20240101',
  userName: 'Alice',
  categoryId: null,
  categoryName: null,
  micOnSec: 0,
  micOffSec: 0,
  aloneSec: 0,
};

function makeRecord(
  overrides: Partial<VoiceDailyRecord> & {
    channelId: string;
    channelName: string;
    channelDurationSec: number;
  },
): VoiceDailyRecord {
  return { ...BASE_RECORD, ...overrides };
}

/** GLOBAL 레코드 */
const GLOBAL_RECORD: VoiceDailyRecord = makeRecord({
  channelId: 'GLOBAL',
  channelName: 'GLOBAL',
  channelDurationSec: 0,
  micOnSec: 600,
  micOffSec: 300,
  aloneSec: 120,
});

/** 상설 채널 레코드 */
const PERMANENT_CH1: VoiceDailyRecord = makeRecord({
  channelId: 'ch-001',
  channelName: '일반 채널',
  channelDurationSec: 1800,
  channelType: 'permanent',
  autoChannelConfigId: null,
  autoChannelConfigName: null,
});

const PERMANENT_CH2: VoiceDailyRecord = makeRecord({
  channelId: 'ch-002',
  channelName: '스터디 채널',
  channelDurationSec: 900,
  channelType: 'permanent',
  autoChannelConfigId: null,
  autoChannelConfigName: null,
});

/** 자동방 레코드 - config 1, buttonId 없음 (auto:cfg:1 폴백) */
const AUTO_CONFIG1_INSTANCE1: VoiceDailyRecord = makeRecord({
  channelId: 'auto-ch-101',
  channelName: '방 #1',
  channelDurationSec: 600,
  channelType: 'auto_select',
  autoChannelConfigId: 1,
  autoChannelConfigName: '자유 채팅방',
  autoChannelButtonId: null,
  autoChannelButtonLabel: null,
});

const AUTO_CONFIG1_INSTANCE2: VoiceDailyRecord = makeRecord({
  channelId: 'auto-ch-102',
  channelName: '방 #2',
  channelDurationSec: 1200,
  channelType: 'auto_select',
  autoChannelConfigId: 1,
  autoChannelConfigName: '자유 채팅방',
  autoChannelButtonId: null,
  autoChannelButtonLabel: null,
});

const AUTO_CONFIG1_INSTANCE3: VoiceDailyRecord = makeRecord({
  channelId: 'auto-ch-103',
  channelName: '방 #3',
  channelDurationSec: 300,
  channelType: 'auto_select',
  autoChannelConfigId: 1,
  autoChannelConfigName: '자유 채팅방',
  autoChannelButtonId: null,
  autoChannelButtonLabel: null,
});

/** 자동방 레코드 - config 2, buttonId 없음 (auto:cfg:2 폴백) */
const AUTO_CONFIG2_INSTANCE1: VoiceDailyRecord = makeRecord({
  channelId: 'auto-ch-201',
  channelName: '게임방 #1',
  channelDurationSec: 3600,
  channelType: 'auto_instant',
  autoChannelConfigId: 2,
  autoChannelConfigName: '게임 채널',
  autoChannelButtonId: null,
  autoChannelButtonLabel: null,
});

/** 다중 유저, 다중 날짜 픽스처 */
const MULTI_USER_RECORDS: VoiceDailyRecord[] = [
  makeRecord({
    channelId: 'GLOBAL',
    channelName: 'GLOBAL',
    channelDurationSec: 0,
    userId: 'user-01',
    micOnSec: 300,
    micOffSec: 100,
    aloneSec: 60,
  }),
  makeRecord({
    channelId: 'GLOBAL',
    channelName: 'GLOBAL',
    channelDurationSec: 0,
    userId: 'user-02',
    micOnSec: 200,
    micOffSec: 50,
    aloneSec: 30,
  }),
  makeRecord({
    channelId: 'ch-001',
    channelName: '일반',
    channelDurationSec: 1800,
    userId: 'user-01',
    channelType: 'permanent',
    autoChannelConfigId: null,
    autoChannelConfigName: null,
  }),
  makeRecord({
    channelId: 'ch-002',
    channelName: '게임',
    channelDurationSec: 900,
    userId: 'user-02',
    channelType: 'permanent',
    autoChannelConfigId: null,
    autoChannelConfigName: null,
  }),
  makeRecord({
    channelId: 'auto-ch-101',
    channelName: '방#1',
    channelDurationSec: 600,
    userId: 'user-01',
    channelType: 'auto_select',
    autoChannelConfigId: 10,
    autoChannelConfigName: '자유방',
  }),
  makeRecord({
    channelId: 'auto-ch-102',
    channelName: '방#2',
    channelDurationSec: 400,
    userId: 'user-02',
    channelType: 'auto_select',
    autoChannelConfigId: 10,
    autoChannelConfigName: '자유방',
  }),
];

// ─── computeAutoChannelGroupStats ────────────────────────────────────────────

describe('computeAutoChannelGroupStats', () => {
  it('autoChannelConfigId가 없는 레코드(GLOBAL, 상설 채널)는 무시한다', () => {
    const records = [GLOBAL_RECORD, PERMANENT_CH1, PERMANENT_CH2];

    const result = computeAutoChannelGroupStats(records);

    expect(result).toHaveLength(0);
  });

  it('동일 configId의 인스턴스들을 하나의 그룹으로 집계한다', () => {
    const records = [
      GLOBAL_RECORD,
      AUTO_CONFIG1_INSTANCE1,
      AUTO_CONFIG1_INSTANCE2,
      AUTO_CONFIG1_INSTANCE3,
    ];

    const result = computeAutoChannelGroupStats(records);

    expect(result).toHaveLength(1);
    expect(result[0].autoChannelConfigId).toBe(1);
    expect(result[0].autoChannelConfigName).toBe('자유 채팅방');
  });

  it('config 1의 totalDurationSec이 인스턴스들의 합산이다', () => {
    const records = [AUTO_CONFIG1_INSTANCE1, AUTO_CONFIG1_INSTANCE2, AUTO_CONFIG1_INSTANCE3];
    const expected = 600 + 1200 + 300; // 2100

    const result = computeAutoChannelGroupStats(records);

    expect(result[0].totalDurationSec).toBe(expected);
  });

  it('instanceCount가 고유 channelId 수와 일치한다', () => {
    const records = [
      AUTO_CONFIG1_INSTANCE1, // auto-ch-101
      AUTO_CONFIG1_INSTANCE2, // auto-ch-102
      AUTO_CONFIG1_INSTANCE3, // auto-ch-103
    ];

    const result = computeAutoChannelGroupStats(records);

    expect(result[0].instanceCount).toBe(3);
  });

  it('동일 channelId가 여러 날짜에 걸쳐 등장해도 instanceCount는 고유 채널 수로 계산한다', () => {
    const day1 = makeRecord({
      channelId: 'auto-ch-101',
      channelName: '방#1',
      channelDurationSec: 600,
      date: '20240101',
      channelType: 'auto_select',
      autoChannelConfigId: 1,
      autoChannelConfigName: '자유방',
    });
    const day2 = makeRecord({
      channelId: 'auto-ch-101',
      channelName: '방#1',
      channelDurationSec: 400,
      date: '20240102',
      channelType: 'auto_select',
      autoChannelConfigId: 1,
      autoChannelConfigName: '자유방',
    });

    const result = computeAutoChannelGroupStats([day1, day2]);

    // 동일 channelId가 2번 나타나도 고유 채널은 1개
    expect(result[0].instanceCount).toBe(1);
    expect(result[0].totalDurationSec).toBe(1000);
  });

  it('서로 다른 configId의 그룹을 각각 독립적으로 집계한다', () => {
    const records = [AUTO_CONFIG1_INSTANCE1, AUTO_CONFIG1_INSTANCE2, AUTO_CONFIG2_INSTANCE1];

    const result = computeAutoChannelGroupStats(records);

    expect(result).toHaveLength(2);

    const config1 = result.find((r) => r.autoChannelConfigId === 1);
    const config2 = result.find((r) => r.autoChannelConfigId === 2);

    expect(config1).toBeDefined();
    expect(config2).toBeDefined();
    expect(config1?.totalDurationSec).toBe(1800); // 600 + 1200
    expect(config2?.totalDurationSec).toBe(3600);
  });

  it('totalDurationSec 내림차순으로 정렬된다', () => {
    const records = [
      AUTO_CONFIG1_INSTANCE1, // config1 총합: 600
      AUTO_CONFIG2_INSTANCE1, // config2 총합: 3600
    ];

    const result = computeAutoChannelGroupStats(records);

    expect(result[0].autoChannelConfigId).toBe(2); // 3600 > 600
    expect(result[1].autoChannelConfigId).toBe(1);
  });

  it('channelType이 auto_instant인 레코드는 channelType을 auto_instant로 설정한다', () => {
    const records = [AUTO_CONFIG2_INSTANCE1]; // channelType: 'auto_instant'

    const result = computeAutoChannelGroupStats(records);

    expect(result[0].channelType).toBe('auto_instant');
  });

  it('channelType이 auto_select인 레코드는 channelType을 auto_select로 설정한다', () => {
    const records = [AUTO_CONFIG1_INSTANCE1]; // channelType: 'auto_select'

    const result = computeAutoChannelGroupStats(records);

    expect(result[0].channelType).toBe('auto_select');
  });

  it('autoChannelConfigName이 없으면 Config-{configId} 형식의 이름을 사용한다', () => {
    const recordWithoutName = makeRecord({
      channelId: 'auto-ch-999',
      channelName: '방',
      channelDurationSec: 300,
      channelType: 'auto_select',
      autoChannelConfigId: 99,
      autoChannelConfigName: null,
    });

    const result = computeAutoChannelGroupStats([recordWithoutName]);

    expect(result[0].autoChannelConfigName).toBe('Config-99');
  });

  it('빈 배열 입력 시 빈 배열을 반환한다', () => {
    expect(computeAutoChannelGroupStats([])).toEqual([]);
  });
});

// ─── computeChannelStats (auto_grouped 모드) ──────────────────────────────────

describe('computeChannelStats - auto_grouped 모드', () => {
  it('GLOBAL 레코드는 집계에서 제외된다', () => {
    const records = [GLOBAL_RECORD, AUTO_CONFIG1_INSTANCE1];

    const result = computeChannelStats(records, 'auto_grouped');

    expect(result.every((r) => r.channelId !== 'GLOBAL')).toBe(true);
  });

  it('동일 configId의 자동방 레코드를 하나의 항목으로 합산한다 (buttonId 없으면 auto:cfg:{configId})', () => {
    const records = [AUTO_CONFIG1_INSTANCE1, AUTO_CONFIG1_INSTANCE2];

    const result = computeChannelStats(records, 'auto_grouped');

    const autoGroup = result.find((r) => r.channelId === 'auto:cfg:1');
    expect(autoGroup).toBeDefined();
    expect(autoGroup?.totalDurationSec).toBe(1800); // 600 + 1200
  });

  it('합산된 자동방 항목의 channelId가 "auto:cfg:{configId}" 형식이다 (buttonId 없는 경우)', () => {
    const records = [AUTO_CONFIG1_INSTANCE1, AUTO_CONFIG2_INSTANCE1];

    const result = computeChannelStats(records, 'auto_grouped');

    expect(result.some((r) => r.channelId === 'auto:cfg:1')).toBe(true);
    expect(result.some((r) => r.channelId === 'auto:cfg:2')).toBe(true);
  });

  it('합산된 자동방 항목의 channelName이 autoChannelConfigName을 사용한다 (buttonLabel 없는 경우)', () => {
    const records = [AUTO_CONFIG1_INSTANCE1];

    const result = computeChannelStats(records, 'auto_grouped');

    const autoGroup = result.find((r) => r.channelId === 'auto:cfg:1');
    expect(autoGroup?.channelName).toBe('자유 채팅방');
  });

  it('상설 채널(autoChannelConfigId null)은 기존 channelId 단위로 유지된다', () => {
    const records = [PERMANENT_CH1, PERMANENT_CH2, AUTO_CONFIG1_INSTANCE1];

    const result = computeChannelStats(records, 'auto_grouped');

    expect(result.some((r) => r.channelId === 'ch-001')).toBe(true);
    expect(result.some((r) => r.channelId === 'ch-002')).toBe(true);
  });

  it('상설 채널과 자동방 그룹이 함께 존재할 때 각각 독립적으로 집계된다', () => {
    const records = [PERMANENT_CH1, AUTO_CONFIG1_INSTANCE1, AUTO_CONFIG1_INSTANCE2];

    const result = computeChannelStats(records, 'auto_grouped');

    const permanent = result.find((r) => r.channelId === 'ch-001');
    const autoGroup = result.find((r) => r.channelId === 'auto:cfg:1');

    expect(permanent?.totalDurationSec).toBe(1800);
    expect(autoGroup?.totalDurationSec).toBe(1800); // 600 + 1200
  });

  it('micOnSec, micOffSec, aloneSec도 합산된다', () => {
    const r1 = makeRecord({
      channelId: 'auto-ch-101',
      channelName: '방#1',
      channelDurationSec: 600,
      channelType: 'auto_select',
      autoChannelConfigId: 1,
      autoChannelConfigName: '자유방',
      autoChannelButtonId: null,
      autoChannelButtonLabel: null,
      micOnSec: 100,
      micOffSec: 50,
      aloneSec: 20,
    });
    const r2 = makeRecord({
      channelId: 'auto-ch-102',
      channelName: '방#2',
      channelDurationSec: 400,
      channelType: 'auto_select',
      autoChannelConfigId: 1,
      autoChannelConfigName: '자유방',
      autoChannelButtonId: null,
      autoChannelButtonLabel: null,
      micOnSec: 200,
      micOffSec: 80,
      aloneSec: 30,
    });

    const result = computeChannelStats([r1, r2], 'auto_grouped');

    const autoGroup = result.find((r) => r.channelId === 'auto:cfg:1');
    expect(autoGroup?.micOnSec).toBe(300);
    expect(autoGroup?.micOffSec).toBe(130);
    expect(autoGroup?.aloneSec).toBe(50);
  });

  it('totalDurationSec 내림차순으로 정렬된다', () => {
    const records = [PERMANENT_CH2, AUTO_CONFIG2_INSTANCE1, PERMANENT_CH1];
    // AUTO_CONFIG2: 3600, PERMANENT_CH1: 1800, PERMANENT_CH2: 900

    const result = computeChannelStats(records, 'auto_grouped');

    expect(result[0].totalDurationSec).toBeGreaterThanOrEqual(result[1].totalDurationSec);
    expect(result[1].totalDurationSec).toBeGreaterThanOrEqual(result[2].totalDurationSec);
  });

  it('빈 배열 입력 시 빈 배열을 반환한다', () => {
    expect(computeChannelStats([], 'auto_grouped')).toEqual([]);
  });
});

// ─── computeChannelStats (individual 모드) ────────────────────────────────────

describe('computeChannelStats - individual 모드 (기존 동작 보존)', () => {
  it('GLOBAL 레코드는 집계에서 제외된다', () => {
    const records = [GLOBAL_RECORD, PERMANENT_CH1];

    const result = computeChannelStats(records, 'individual');

    expect(result.every((r) => r.channelId !== 'GLOBAL')).toBe(true);
  });

  it('동일 channelId의 레코드를 합산한다', () => {
    const day1 = makeRecord({
      channelId: 'ch-001',
      channelName: '일반',
      channelDurationSec: 1000,
      date: '20240101',
    });
    const day2 = makeRecord({
      channelId: 'ch-001',
      channelName: '일반',
      channelDurationSec: 800,
      date: '20240102',
    });

    const result = computeChannelStats([day1, day2], 'individual');

    expect(result).toHaveLength(1);
    expect(result[0].totalDurationSec).toBe(1800);
  });

  it('자동방 레코드도 개별 channelId로 분리된다 (그룹핑 없음)', () => {
    const records = [AUTO_CONFIG1_INSTANCE1, AUTO_CONFIG1_INSTANCE2];

    const result = computeChannelStats(records, 'individual');

    // 같은 configId이지만 individual 모드에서는 별도 항목으로 유지
    expect(result).toHaveLength(2);
    expect(result.some((r) => r.channelId === 'auto-ch-101')).toBe(true);
    expect(result.some((r) => r.channelId === 'auto-ch-102')).toBe(true);
  });

  it('totalDurationSec 내림차순으로 정렬된다', () => {
    const records = [PERMANENT_CH2, PERMANENT_CH1]; // 900, 1800

    const result = computeChannelStats(records, 'individual');

    expect(result[0].channelId).toBe('ch-001'); // 1800 > 900
    expect(result[1].channelId).toBe('ch-002');
  });

  it('groupMode 기본값(파라미터 미전달)은 individual 모드로 동작한다', () => {
    const records = [AUTO_CONFIG1_INSTANCE1, AUTO_CONFIG1_INSTANCE2];

    const resultDefault = computeChannelStats(records);
    const resultIndividual = computeChannelStats(records, 'individual');

    expect(resultDefault).toEqual(resultIndividual);
  });
});

// ─── computeSummary ───────────────────────────────────────────────────────────

describe('computeSummary', () => {
  it('상설 채널만 있을 때 uniqueChannels가 channelId 단위로 카운트된다', () => {
    const records = [GLOBAL_RECORD, PERMANENT_CH1, PERMANENT_CH2];

    const summary = computeSummary(records);

    expect(summary.uniqueChannels).toBe(2);
  });

  it('자동방만 있을 때 uniqueChannels가 configId 단위로 카운트된다', () => {
    const records = [
      GLOBAL_RECORD,
      AUTO_CONFIG1_INSTANCE1, // configId: 1
      AUTO_CONFIG1_INSTANCE2, // configId: 1 (동일 config)
      AUTO_CONFIG1_INSTANCE3, // configId: 1 (동일 config)
      AUTO_CONFIG2_INSTANCE1, // configId: 2
    ];

    const summary = computeSummary(records);

    // configId 1과 2 = 2개 (인스턴스 4개가 아닌 config 단위)
    expect(summary.uniqueChannels).toBe(2);
  });

  it('상설 채널과 자동방이 혼합될 때 각각의 기준으로 합산한다', () => {
    const records = [
      GLOBAL_RECORD,
      PERMANENT_CH1, // 상설: ch-001
      PERMANENT_CH2, // 상설: ch-002
      AUTO_CONFIG1_INSTANCE1, // 자동방 config: 1
      AUTO_CONFIG1_INSTANCE2, // 자동방 config: 1 (중복)
      AUTO_CONFIG2_INSTANCE1, // 자동방 config: 2
    ];

    const summary = computeSummary(records);

    // 상설 2개 + 자동방 config 2개 = 4
    expect(summary.uniqueChannels).toBe(4);
  });

  it('GLOBAL 레코드에서 마이크 통계를 집계한다', () => {
    const records = [
      makeRecord({
        channelId: 'GLOBAL',
        channelName: 'GLOBAL',
        channelDurationSec: 0,
        userId: 'user-01',
        micOnSec: 300,
        micOffSec: 100,
        aloneSec: 60,
      }),
      makeRecord({
        channelId: 'GLOBAL',
        channelName: 'GLOBAL',
        channelDurationSec: 0,
        userId: 'user-02',
        micOnSec: 200,
        micOffSec: 50,
        aloneSec: 30,
      }),
    ];

    const summary = computeSummary(records);

    expect(summary.totalMicOnSec).toBe(500);
    expect(summary.totalMicOffSec).toBe(150);
    expect(summary.totalAloneSec).toBe(90);
  });

  it('totalDurationSec은 채널 레코드의 channelDurationSec 합산이다', () => {
    const records = [GLOBAL_RECORD, PERMANENT_CH1, PERMANENT_CH2];

    const summary = computeSummary(records);

    expect(summary.totalDurationSec).toBe(1800 + 900);
  });

  it('uniqueUsers는 GLOBAL 레코드의 고유 userId 수로 집계된다', () => {
    const records = MULTI_USER_RECORDS;

    const summary = computeSummary(records);

    expect(summary.uniqueUsers).toBe(2); // user-01, user-02
  });

  it('빈 배열 입력 시 모든 값이 0인 요약을 반환한다', () => {
    const summary = computeSummary([]);

    expect(summary.totalDurationSec).toBe(0);
    expect(summary.totalMicOnSec).toBe(0);
    expect(summary.totalMicOffSec).toBe(0);
    expect(summary.totalAloneSec).toBe(0);
    expect(summary.uniqueUsers).toBe(0);
    expect(summary.uniqueChannels).toBe(0);
  });
});

// ─── filterRecordsByChannelType ───────────────────────────────────────────────

describe('filterRecordsByChannelType', () => {
  const ALL_RECORDS = [
    GLOBAL_RECORD,
    PERMANENT_CH1,
    PERMANENT_CH2,
    AUTO_CONFIG1_INSTANCE1,
    AUTO_CONFIG2_INSTANCE1,
  ];

  describe('"all" 필터', () => {
    it('모든 레코드를 그대로 반환한다', () => {
      const result = filterRecordsByChannelType(ALL_RECORDS, 'all');

      expect(result).toHaveLength(ALL_RECORDS.length);
      expect(result).toBe(ALL_RECORDS); // 참조 동일성 확인 (최적화)
    });
  });

  describe('"permanent" 필터', () => {
    it('GLOBAL 레코드는 항상 포함된다', () => {
      const result = filterRecordsByChannelType(ALL_RECORDS, 'permanent');

      expect(result.some((r) => r.channelId === 'GLOBAL')).toBe(true);
    });

    it('channelType이 permanent인 레코드만 포함된다', () => {
      const result = filterRecordsByChannelType(ALL_RECORDS, 'permanent');

      const channelRecords = result.filter((r) => r.channelId !== 'GLOBAL');
      expect(channelRecords.every((r) => r.channelType === 'permanent')).toBe(true);
    });

    it('자동방 레코드(auto_select, auto_instant)는 제외된다', () => {
      const result = filterRecordsByChannelType(ALL_RECORDS, 'permanent');

      expect(result.some((r) => r.channelId === 'auto-ch-101')).toBe(false);
      expect(result.some((r) => r.channelId === 'auto-ch-201')).toBe(false);
    });

    it('상설 채널 레코드 수가 정확하다', () => {
      const result = filterRecordsByChannelType(ALL_RECORDS, 'permanent');

      // GLOBAL 1 + 상설 채널 2개 = 3
      expect(result).toHaveLength(3);
    });
  });

  describe('"auto" 필터', () => {
    it('GLOBAL 레코드는 항상 포함된다', () => {
      const result = filterRecordsByChannelType(ALL_RECORDS, 'auto');

      expect(result.some((r) => r.channelId === 'GLOBAL')).toBe(true);
    });

    it('channelType이 permanent인 상설 채널은 제외된다', () => {
      const result = filterRecordsByChannelType(ALL_RECORDS, 'auto');

      expect(result.some((r) => r.channelId === 'ch-001')).toBe(false);
      expect(result.some((r) => r.channelId === 'ch-002')).toBe(false);
    });

    it('자동방 레코드(auto_select, auto_instant)는 포함된다', () => {
      const result = filterRecordsByChannelType(ALL_RECORDS, 'auto');

      expect(result.some((r) => r.channelId === 'auto-ch-101')).toBe(true);
      expect(result.some((r) => r.channelId === 'auto-ch-201')).toBe(true);
    });

    it('자동방 레코드 수가 정확하다', () => {
      const result = filterRecordsByChannelType(ALL_RECORDS, 'auto');

      // GLOBAL 1 + 자동방 2개 = 3
      expect(result).toHaveLength(3);
    });
  });

  describe('GLOBAL 레코드 항상 유지', () => {
    it('GLOBAL 레코드만 있을 때 permanent 필터 적용 시 GLOBAL이 반환된다', () => {
      const result = filterRecordsByChannelType([GLOBAL_RECORD], 'permanent');

      expect(result).toHaveLength(1);
      expect(result[0].channelId).toBe('GLOBAL');
    });

    it('GLOBAL 레코드만 있을 때 auto 필터 적용 시 GLOBAL이 반환된다', () => {
      const result = filterRecordsByChannelType([GLOBAL_RECORD], 'auto');

      expect(result).toHaveLength(1);
      expect(result[0].channelId).toBe('GLOBAL');
    });

    it('여러 유저의 GLOBAL 레코드가 모두 유지된다', () => {
      const global1 = makeRecord({
        channelId: 'GLOBAL',
        channelName: 'GLOBAL',
        channelDurationSec: 0,
        userId: 'user-01',
      });
      const global2 = makeRecord({
        channelId: 'GLOBAL',
        channelName: 'GLOBAL',
        channelDurationSec: 0,
        userId: 'user-02',
      });

      const result = filterRecordsByChannelType([global1, global2, PERMANENT_CH1], 'auto');

      // GLOBAL 2개는 유지, 상설 채널 1개는 제외
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.channelId === 'GLOBAL')).toBe(true);
    });
  });

  it('빈 배열 입력 시 모든 필터에서 빈 배열을 반환한다', () => {
    expect(filterRecordsByChannelType([], 'all')).toEqual([]);
    expect(filterRecordsByChannelType([], 'permanent')).toEqual([]);
    expect(filterRecordsByChannelType([], 'auto')).toEqual([]);
  });
});

// ─── 하위 호환성: channelType undefined 레코드 ─────────────────────────────────

describe('하위 호환성 - channelType이 undefined인 레코드 (백엔드 미배포 상황)', () => {
  const LEGACY_RECORD: VoiceDailyRecord = makeRecord({
    channelId: 'ch-legacy',
    channelName: '레거시 채널',
    channelDurationSec: 500,
    // channelType, autoChannelConfigId, autoChannelConfigName 모두 미포함
  });

  it('computeChannelStats(individual)가 정상 동작한다', () => {
    const result = computeChannelStats([GLOBAL_RECORD, LEGACY_RECORD], 'individual');

    expect(result).toHaveLength(1);
    expect(result[0].channelId).toBe('ch-legacy');
    expect(result[0].totalDurationSec).toBe(500);
  });

  it('computeChannelStats(auto_grouped)가 정상 동작한다 (undefined configId는 상설 채널처럼 처리)', () => {
    const result = computeChannelStats([GLOBAL_RECORD, LEGACY_RECORD], 'auto_grouped');

    // autoChannelConfigId가 undefined(null)이므로 개별 channelId로 유지
    expect(result).toHaveLength(1);
    expect(result[0].channelId).toBe('ch-legacy');
  });

  it('computeAutoChannelGroupStats가 정상 동작한다 (레거시 레코드는 무시)', () => {
    const result = computeAutoChannelGroupStats([GLOBAL_RECORD, LEGACY_RECORD]);

    expect(result).toHaveLength(0);
  });

  it('computeSummary가 정상 동작한다 (레거시 채널은 상설 채널로 카운트)', () => {
    const records = [GLOBAL_RECORD, LEGACY_RECORD];

    const summary = computeSummary(records);

    // autoChannelConfigId가 undefined이므로 permanentChannelIds에 포함됨
    expect(summary.uniqueChannels).toBe(1);
    expect(summary.totalDurationSec).toBe(500);
  });

  it('filterRecordsByChannelType "permanent"가 channelType undefined 레코드를 상설 채널로 분류한다', () => {
    const result = filterRecordsByChannelType([GLOBAL_RECORD, LEGACY_RECORD], 'permanent');

    expect(result.some((r) => r.channelId === 'ch-legacy')).toBe(true);
  });

  it('filterRecordsByChannelType "auto"가 channelType undefined 레코드를 제외한다', () => {
    const result = filterRecordsByChannelType([GLOBAL_RECORD, LEGACY_RECORD], 'auto');

    // channelType이 undefined이면 'permanent'로 fallback → auto 필터에서 제외
    expect(result.some((r) => r.channelId === 'ch-legacy')).toBe(false);
    expect(result.some((r) => r.channelId === 'GLOBAL')).toBe(true);
  });
});

// ─── 하위 호환성: autoChannelConfigId가 null인 레코드 ────────────────────────

describe('하위 호환성 - autoChannelConfigId가 null인 레코드', () => {
  it('computeAutoChannelGroupStats가 null configId 레코드를 무시한다', () => {
    const records = [
      makeRecord({
        channelId: 'ch-001',
        channelName: '채널',
        channelDurationSec: 1000,
        channelType: 'permanent',
        autoChannelConfigId: null,
        autoChannelConfigName: null,
      }),
    ];

    const result = computeAutoChannelGroupStats(records);

    expect(result).toHaveLength(0);
  });

  it('computeChannelStats(auto_grouped)에서 null configId 레코드는 channelId를 키로 사용한다', () => {
    const records = [
      makeRecord({
        channelId: 'ch-null-config',
        channelName: '채널',
        channelDurationSec: 1000,
        channelType: 'permanent',
        autoChannelConfigId: null,
        autoChannelConfigName: null,
      }),
    ];

    const result = computeChannelStats(records, 'auto_grouped');

    expect(result[0].channelId).toBe('ch-null-config');
    // 'auto:null' 형식이 아니어야 함
    expect(result[0].channelId.startsWith('auto:')).toBe(false);
  });
});

// ─── 경계값 및 통합 시나리오 ───────────────────────────────────────────────────

describe('경계값 및 통합 시나리오', () => {
  it('단일 레코드로 각 함수가 정상 동작한다', () => {
    const records = [AUTO_CONFIG1_INSTANCE1];

    const autoStats = computeAutoChannelGroupStats(records);
    const channelStats = computeChannelStats(records, 'auto_grouped');

    expect(autoStats[0].instanceCount).toBe(1);
    // buttonId가 null이므로 configId 폴백: 'auto:cfg:{configId}'
    expect(channelStats[0].channelId).toBe('auto:cfg:1');
  });

  it('같은 유저가 다수 채널에 접속한 경우 computeSummary의 uniqueChannels가 정확하다', () => {
    const records = [
      GLOBAL_RECORD,
      PERMANENT_CH1, // ch-001
      PERMANENT_CH2, // ch-002
      AUTO_CONFIG1_INSTANCE1, // config 1
      AUTO_CONFIG1_INSTANCE2, // config 1 (중복)
    ];

    const summary = computeSummary(records);

    // 상설 2 + 자동방 config 1 = 3
    expect(summary.uniqueChannels).toBe(3);
  });

  it('computeChannelStats와 computeAutoChannelGroupStats의 자동방 totalDuration이 일치한다', () => {
    const records = [
      AUTO_CONFIG1_INSTANCE1, // 600
      AUTO_CONFIG1_INSTANCE2, // 1200
    ];

    const groupStats = computeAutoChannelGroupStats(records);
    const channelStats = computeChannelStats(records, 'auto_grouped');

    // buttonId가 null이므로 'auto:cfg:1' 키 사용
    const autoGroup = channelStats.find((r) => r.channelId === 'auto:cfg:1');
    expect(groupStats[0].totalDurationSec).toBe(autoGroup?.totalDurationSec);
  });
});

// ─── 버튼 단위 그룹핑 신규 테스트 ────────────────────────────────────────────────

describe('button 단위 그룹핑 (buttonId 기준)', () => {
  /** config 1 안의 버튼 A (buttonId: 10) */
  const CONFIG1_BTN_A_INST1: VoiceDailyRecord = makeRecord({
    channelId: 'auto-ch-101',
    channelName: '방 #1',
    channelDurationSec: 600,
    channelType: 'auto_select',
    autoChannelConfigId: 1,
    autoChannelConfigName: '자유 채팅방',
    autoChannelButtonId: 10,
    autoChannelButtonLabel: '게임하기',
  });

  const CONFIG1_BTN_A_INST2: VoiceDailyRecord = makeRecord({
    channelId: 'auto-ch-102',
    channelName: '방 #2',
    channelDurationSec: 900,
    channelType: 'auto_select',
    autoChannelConfigId: 1,
    autoChannelConfigName: '자유 채팅방',
    autoChannelButtonId: 10,
    autoChannelButtonLabel: '게임하기',
  });

  /** config 1 안의 버튼 B (buttonId: 20) */
  const CONFIG1_BTN_B_INST1: VoiceDailyRecord = makeRecord({
    channelId: 'auto-ch-201',
    channelName: '방 #1',
    channelDurationSec: 1200,
    channelType: 'auto_select',
    autoChannelConfigId: 1,
    autoChannelConfigName: '자유 채팅방',
    autoChannelButtonId: 20,
    autoChannelButtonLabel: '공부하기',
  });

  describe('computeChannelStats - auto_grouped', () => {
    it('buttonId가 있으면 "auto:btn:{buttonId}" 키로 그룹핑된다', () => {
      const result = computeChannelStats([CONFIG1_BTN_A_INST1], 'auto_grouped');

      expect(result[0].channelId).toBe('auto:btn:10');
    });

    it('동일 buttonId를 가진 인스턴스들이 하나의 항목으로 합산된다', () => {
      const result = computeChannelStats(
        [CONFIG1_BTN_A_INST1, CONFIG1_BTN_A_INST2],
        'auto_grouped',
      );

      expect(result).toHaveLength(1);
      expect(result[0].channelId).toBe('auto:btn:10');
      expect(result[0].totalDurationSec).toBe(1500); // 600 + 900
    });

    it('동일 configId 내 서로 다른 buttonId는 별도 그룹으로 분리된다', () => {
      const result = computeChannelStats(
        [CONFIG1_BTN_A_INST1, CONFIG1_BTN_A_INST2, CONFIG1_BTN_B_INST1],
        'auto_grouped',
      );

      // 버튼 A와 버튼 B가 같은 configId(1)임에도 별도 그룹
      expect(result).toHaveLength(2);
      expect(result.some((r) => r.channelId === 'auto:btn:10')).toBe(true);
      expect(result.some((r) => r.channelId === 'auto:btn:20')).toBe(true);
    });

    it('channelName으로 buttonLabel이 사용된다', () => {
      const result = computeChannelStats([CONFIG1_BTN_A_INST1], 'auto_grouped');

      expect(result[0].channelName).toBe('게임하기');
    });

    it('buttonLabel이 null이면 configName을 channelName으로 사용한다', () => {
      const recordWithNullLabel = makeRecord({
        channelId: 'auto-ch-301',
        channelName: '방 #1',
        channelDurationSec: 500,
        channelType: 'auto_select',
        autoChannelConfigId: 5,
        autoChannelConfigName: '음악 방',
        autoChannelButtonId: 30,
        autoChannelButtonLabel: null,
      });

      const result = computeChannelStats([recordWithNullLabel], 'auto_grouped');

      expect(result[0].channelId).toBe('auto:btn:30');
      expect(result[0].channelName).toBe('음악 방');
    });

    it('buttonLabel과 configName 모두 null이면 "Config-{configId}" 형식의 이름을 사용한다', () => {
      const recordWithNoNames = makeRecord({
        channelId: 'auto-ch-401',
        channelName: '방',
        channelDurationSec: 300,
        channelType: 'auto_select',
        autoChannelConfigId: 7,
        autoChannelConfigName: null,
        autoChannelButtonId: 40,
        autoChannelButtonLabel: null,
      });

      const result = computeChannelStats([recordWithNoNames], 'auto_grouped');

      expect(result[0].channelName).toBe('Config-7');
    });

    it('buttonId가 null이면 "auto:cfg:{configId}" 키를 폴백으로 사용한다', () => {
      const recordWithNullButtonId = makeRecord({
        channelId: 'auto-ch-501',
        channelName: '방',
        channelDurationSec: 800,
        channelType: 'auto_select',
        autoChannelConfigId: 3,
        autoChannelConfigName: '일반 방',
        autoChannelButtonId: null,
        autoChannelButtonLabel: null,
      });

      const result = computeChannelStats([recordWithNullButtonId], 'auto_grouped');

      expect(result[0].channelId).toBe('auto:cfg:3');
    });

    it('buttonId가 있는 그룹과 없는 그룹(configId 폴백)이 함께 존재할 때 각각 독립적으로 집계된다', () => {
      const withButton = makeRecord({
        channelId: 'auto-ch-601',
        channelName: '방',
        channelDurationSec: 700,
        channelType: 'auto_select',
        autoChannelConfigId: 5,
        autoChannelConfigName: '혼합 방',
        autoChannelButtonId: 50,
        autoChannelButtonLabel: '옵션A',
      });
      const withoutButton = makeRecord({
        channelId: 'auto-ch-602',
        channelName: '방',
        channelDurationSec: 300,
        channelType: 'auto_select',
        autoChannelConfigId: 5,
        autoChannelConfigName: '혼합 방',
        autoChannelButtonId: null,
        autoChannelButtonLabel: null,
      });

      const result = computeChannelStats([withButton, withoutButton], 'auto_grouped');

      expect(result).toHaveLength(2);
      expect(result.some((r) => r.channelId === 'auto:btn:50')).toBe(true);
      expect(result.some((r) => r.channelId === 'auto:cfg:5')).toBe(true);
    });
  });

  describe('computeAutoChannelGroupStats - button 단위', () => {
    it('buttonId가 있으면 결과에 autoChannelButtonId와 autoChannelButtonLabel이 포함된다', () => {
      const result = computeAutoChannelGroupStats([CONFIG1_BTN_A_INST1]);

      expect(result[0].autoChannelButtonId).toBe(10);
      expect(result[0].autoChannelButtonLabel).toBe('게임하기');
    });

    it('buttonId가 null이면 autoChannelButtonId가 null이다', () => {
      const result = computeAutoChannelGroupStats([AUTO_CONFIG1_INSTANCE1]);

      expect(result[0].autoChannelButtonId).toBeNull();
      expect(result[0].autoChannelButtonLabel).toBeNull();
    });

    it('동일 configId 내 서로 다른 buttonId가 별도 그룹으로 집계된다', () => {
      const result = computeAutoChannelGroupStats([
        CONFIG1_BTN_A_INST1,
        CONFIG1_BTN_A_INST2,
        CONFIG1_BTN_B_INST1,
      ]);

      expect(result).toHaveLength(2);

      const btnA = result.find((r) => r.autoChannelButtonId === 10);
      const btnB = result.find((r) => r.autoChannelButtonId === 20);

      expect(btnA).toBeDefined();
      expect(btnB).toBeDefined();
      expect(btnA?.totalDurationSec).toBe(1500); // 600 + 900
      expect(btnB?.totalDurationSec).toBe(1200);
    });

    it('buttonLabel이 null이면 autoChannelButtonLabel이 null이다', () => {
      const recordWithNullLabel = makeRecord({
        channelId: 'auto-ch-701',
        channelName: '방',
        channelDurationSec: 400,
        channelType: 'auto_select',
        autoChannelConfigId: 8,
        autoChannelConfigName: '테스트 방',
        autoChannelButtonId: 60,
        autoChannelButtonLabel: null,
      });

      const result = computeAutoChannelGroupStats([recordWithNullLabel]);

      expect(result[0].autoChannelButtonId).toBe(60);
      expect(result[0].autoChannelButtonLabel).toBeNull();
    });

    it('같은 buttonId를 가진 인스턴스들의 instanceCount가 고유 channelId 수와 일치한다', () => {
      const result = computeAutoChannelGroupStats([CONFIG1_BTN_A_INST1, CONFIG1_BTN_A_INST2]);

      expect(result[0].instanceCount).toBe(2); // auto-ch-101, auto-ch-102
    });
  });

  describe('computeSummary - button 단위 uniqueChannels 카운트', () => {
    it('동일 configId 내 서로 다른 buttonId는 별도 채널로 카운트된다', () => {
      const records = [
        GLOBAL_RECORD,
        CONFIG1_BTN_A_INST1, // buttonId: 10
        CONFIG1_BTN_A_INST2, // buttonId: 10 (동일)
        CONFIG1_BTN_B_INST1, // buttonId: 20 (다름)
      ];

      const summary = computeSummary(records);

      // 버튼 단위: btn:10, btn:20 = 2
      expect(summary.uniqueChannels).toBe(2);
    });

    it('buttonId가 있는 레코드와 없는 레코드(configId 폴백)가 혼합될 때 각각 별도로 카운트된다', () => {
      const withButton = makeRecord({
        channelId: 'auto-ch-801',
        channelName: '방',
        channelDurationSec: 500,
        channelType: 'auto_select',
        autoChannelConfigId: 9,
        autoChannelConfigName: '혼합',
        autoChannelButtonId: 70,
        autoChannelButtonLabel: '선택A',
      });
      const withoutButton = makeRecord({
        channelId: 'auto-ch-802',
        channelName: '방',
        channelDurationSec: 300,
        channelType: 'auto_select',
        autoChannelConfigId: 9,
        autoChannelConfigName: '혼합',
        autoChannelButtonId: null,
        autoChannelButtonLabel: null,
      });

      const summary = computeSummary([GLOBAL_RECORD, withButton, withoutButton]);

      // btn:70, cfg:9 = 2
      expect(summary.uniqueChannels).toBe(2);
    });
  });
});
