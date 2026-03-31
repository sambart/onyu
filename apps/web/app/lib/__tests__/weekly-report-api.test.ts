/**
 * weekly-report-api.ts 유닛 테스트
 *
 * fetch를 직접 모킹하여 URL 생성, HTTP 메서드, 요청 바디,
 * 및 API 실패 시 동작을 검증한다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WeeklyReportConfigDto } from '../weekly-report-api';
import {
  DEFAULT_WEEKLY_REPORT_CONFIG,
  fetchWeeklyReportConfig,
  saveWeeklyReportConfig,
} from '../weekly-report-api';

// ─── fetch 모킹 헬퍼 ────────────────────────────────────────────────────────

function mockFetchOk(body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

function mockFetchError(status: number, message: string) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ message, statusCode: status }),
  } as Response);
}

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const GUILD_ID = 'guild-report-test';

const CONFIG_FIXTURE: WeeklyReportConfigDto = {
  isEnabled: true,
  channelId: 'ch-weekly-001',
  dayOfWeek: 1,
  hour: 9,
  timezone: 'Asia/Seoul',
};

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('DEFAULT_WEEKLY_REPORT_CONFIG', () => {
  it('기본값이 비활성화(isEnabled: false) 상태로 정의된다', () => {
    expect(DEFAULT_WEEKLY_REPORT_CONFIG.isEnabled).toBe(false);
  });

  it('기본 channelId가 null이다', () => {
    expect(DEFAULT_WEEKLY_REPORT_CONFIG.channelId).toBeNull();
  });

  it('기본 dayOfWeek이 1(월요일)이다', () => {
    expect(DEFAULT_WEEKLY_REPORT_CONFIG.dayOfWeek).toBe(1);
  });

  it('기본 hour이 9시이다', () => {
    expect(DEFAULT_WEEKLY_REPORT_CONFIG.hour).toBe(9);
  });

  it('기본 timezone이 Asia/Seoul이다', () => {
    expect(DEFAULT_WEEKLY_REPORT_CONFIG.timezone).toBe('Asia/Seoul');
  });
});

describe('fetchWeeklyReportConfig', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('정상 응답(200) 시 설정 객체를 반환한다', async () => {
    mockFetchOk(CONFIG_FIXTURE);

    const result = await fetchWeeklyReportConfig(GUILD_ID);

    expect(result).toEqual(CONFIG_FIXTURE);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/guilds/${GUILD_ID}/weekly-report/config`,
      expect.anything(),
    );
  });

  it('API 실패 시 fallback 기본값(DEFAULT_WEEKLY_REPORT_CONFIG)을 반환한다', async () => {
    mockFetchError(500, '서버 오류');

    const result = await fetchWeeklyReportConfig(GUILD_ID);

    expect(result).toEqual(DEFAULT_WEEKLY_REPORT_CONFIG);
  });

  it('404 응답 시 fallback 기본값을 반환한다 (설정이 없는 신규 서버)', async () => {
    mockFetchError(404, 'Not Found');

    const result = await fetchWeeklyReportConfig(GUILD_ID);

    expect(result).toEqual(DEFAULT_WEEKLY_REPORT_CONFIG);
  });

  it('guildId가 URL에 올바르게 포함된다', async () => {
    mockFetchOk(CONFIG_FIXTURE);

    await fetchWeeklyReportConfig(GUILD_ID);

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining(GUILD_ID), expect.anything());
  });
});

describe('saveWeeklyReportConfig', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('POST 메서드로 설정 엔드포인트를 호출하고 저장된 설정을 반환한다', async () => {
    mockFetchOk(CONFIG_FIXTURE);

    const result = await saveWeeklyReportConfig(GUILD_ID, CONFIG_FIXTURE);

    expect(result).toEqual(CONFIG_FIXTURE);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/guilds/${GUILD_ID}/weekly-report/config`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('요청 바디에 설정 객체가 JSON으로 직렬화되어 포함된다', async () => {
    mockFetchOk(CONFIG_FIXTURE);

    await saveWeeklyReportConfig(GUILD_ID, CONFIG_FIXTURE);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(CONFIG_FIXTURE),
      }),
    );
  });

  it('요청 헤더에 Content-Type: application/json이 포함된다', async () => {
    mockFetchOk(CONFIG_FIXTURE);

    await saveWeeklyReportConfig(GUILD_ID, CONFIG_FIXTURE);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('API 실패(400) 시 ApiError를 throw한다', async () => {
    mockFetchError(400, '잘못된 채널 ID입니다.');

    await expect(saveWeeklyReportConfig(GUILD_ID, CONFIG_FIXTURE)).rejects.toThrow(
      '잘못된 채널 ID입니다.',
    );
  });

  it('API 실패(500) 시 ApiError를 throw한다', async () => {
    mockFetchError(500, '서버 내부 오류');

    await expect(saveWeeklyReportConfig(GUILD_ID, CONFIG_FIXTURE)).rejects.toThrow(
      '서버 내부 오류',
    );
  });

  it('isEnabled: false 설정도 그대로 저장 요청한다', async () => {
    const disabledConfig: WeeklyReportConfigDto = { ...CONFIG_FIXTURE, isEnabled: false };
    mockFetchOk(disabledConfig);

    const result = await saveWeeklyReportConfig(GUILD_ID, disabledConfig);

    expect(result.isEnabled).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(disabledConfig),
      }),
    );
  });
});
