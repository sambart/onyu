/**
 * music-config-api.ts 유닛 테스트
 *
 * apiClient 레이어를 통과하는 네트워크 호출 로직을 검증한다.
 * fetch를 직접 모킹하여 ApiError 처리 분기(404 → null, 기타 에러 → throw)를 확인한다.
 * API 응답(buttonConfig)을 프론트엔드 형식(buttons)으로 변환하는 로직도 검증한다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  MusicChannelConfig,
  MusicChannelConfigSaveDto,
} from '../../../../../lib/music-config-api';
import {
  fetchMusicConfig,
  resetMusicConfig,
  saveMusicConfig,
} from '../../../../../lib/music-config-api';

// ─── 픽스처 ────────────────────────────────────────────────────────────────

const GUILD_ID = 'guild-abc';

const BUTTONS_FIXTURE = [
  { type: 'search' as const, label: '음악 검색하기', emoji: '🔍', enabled: true, row: 0 },
];

/** API가 실제로 반환하는 형태 (buttonConfig 중첩) */
const API_RESPONSE_FIXTURE = {
  id: 1,
  guildId: GUILD_ID,
  channelId: 'ch-001',
  messageId: 'msg-001',
  embedTitle: '음악 플레이어',
  embedDescription: '버튼을 눌러 음악을 재생하세요.',
  embedColor: '#5865F2',
  embedThumbnailUrl: null,
  buttonConfig: { buttons: BUTTONS_FIXTURE },
  enabled: true,
};

/** 프론트엔드가 기대하는 형태 (buttons 평탄화) */
const FRONTEND_CONFIG: MusicChannelConfig = {
  id: 1,
  guildId: GUILD_ID,
  channelId: 'ch-001',
  messageId: 'msg-001',
  embedTitle: '음악 플레이어',
  embedDescription: '버튼을 눌러 음악을 재생하세요.',
  embedColor: '#5865F2',
  embedThumbnailUrl: null,
  buttons: BUTTONS_FIXTURE,
  enabled: true,
};

const SAVE_DTO: MusicChannelConfigSaveDto = {
  channelId: 'ch-001',
  embedTitle: '음악 플레이어',
  embedDescription: '버튼을 눌러 음악을 재생하세요.',
  embedColor: '#5865F2',
  embedThumbnailUrl: null,
  buttons: BUTTONS_FIXTURE,
  enabled: true,
};

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

// ─── 테스트 ─────────────────────────────────────────────────────────────────

describe('fetchMusicConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('정상 응답(200) 시 buttonConfig를 buttons로 변환하여 반환한다', async () => {
    mockFetchOk(API_RESPONSE_FIXTURE);

    const result = await fetchMusicConfig(GUILD_ID);

    expect(result).toEqual(FRONTEND_CONFIG);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/guilds/${GUILD_ID}/music/config`,
      expect.objectContaining({}),
    );
  });

  it('404 응답 시 null을 반환한다 (설정이 없는 신규 서버)', async () => {
    mockFetchError(404, 'Not Found');

    const result = await fetchMusicConfig(GUILD_ID);

    expect(result).toBeNull();
  });

  it('500 응답 시 ApiError를 throw한다', async () => {
    mockFetchError(500, '서버 내부 오류');

    await expect(fetchMusicConfig(GUILD_ID)).rejects.toThrow('서버 내부 오류');
  });

  it('403 응답 시 ApiError를 throw한다 (권한 없음)', async () => {
    mockFetchError(403, '접근 권한이 없습니다.');

    await expect(fetchMusicConfig(GUILD_ID)).rejects.toThrow('접근 권한이 없습니다.');
  });
});

describe('saveMusicConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('PUT 메서드로 buttonConfig 형태로 변환하여 요청하고 결과를 buttons로 변환하여 반환한다', async () => {
    mockFetchOk(API_RESPONSE_FIXTURE);

    const result = await saveMusicConfig(GUILD_ID, SAVE_DTO);

    expect(result).toEqual(FRONTEND_CONFIG);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/guilds/${GUILD_ID}/music/config`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          channelId: SAVE_DTO.channelId,
          embedTitle: SAVE_DTO.embedTitle,
          embedDescription: SAVE_DTO.embedDescription,
          embedColor: SAVE_DTO.embedColor,
          embedThumbnailUrl: SAVE_DTO.embedThumbnailUrl,
          buttonConfig: { buttons: SAVE_DTO.buttons },
          enabled: SAVE_DTO.enabled,
        }),
      }),
    );
  });

  it('요청 바디에 Content-Type: application/json 헤더가 포함된다', async () => {
    mockFetchOk(API_RESPONSE_FIXTURE);

    await saveMusicConfig(GUILD_ID, SAVE_DTO);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('API 실패 시 에러 메시지와 함께 ApiError를 throw한다', async () => {
    mockFetchError(400, '채널을 찾을 수 없습니다.');

    await expect(saveMusicConfig(GUILD_ID, SAVE_DTO)).rejects.toThrow('채널을 찾을 수 없습니다.');
  });
});

describe('resetMusicConfig', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POST 메서드로 reset 엔드포인트를 호출하고 변환된 설정을 반환한다', async () => {
    const resetApiResponse = {
      ...API_RESPONSE_FIXTURE,
      embedTitle: null,
      embedDescription: null,
    };
    const expectedFrontend: MusicChannelConfig = {
      ...FRONTEND_CONFIG,
      embedTitle: null,
      embedDescription: null,
    };
    mockFetchOk(resetApiResponse);

    const result = await resetMusicConfig(GUILD_ID);

    expect(result).toEqual(expectedFrontend);
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/guilds/${GUILD_ID}/music/config/reset`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('API 실패 시 ApiError를 throw한다', async () => {
    mockFetchError(500, '초기화 중 오류가 발생했습니다.');

    await expect(resetMusicConfig(GUILD_ID)).rejects.toThrow('초기화 중 오류가 발생했습니다.');
  });
});
