/**
 * admin-api.ts 순수 함수 단위 테스트
 *
 * 대상: getGuildIconUrl, normalizeHealth (순수 로직, 사이드이펙트 없음)
 *
 * 검증 항목:
 * getGuildIconUrl
 * - icon=null 이면 null 반환
 * - icon 있으면 Discord CDN URL 반환
 *
 * normalizeHealth
 * - raw.status='ok' 이면 api='up'
 * - raw.status='error' 이면 api='up' (서버가 응답한 경우)
 * - raw.status 가 그 외 값이면 api='unknown'
 * - details 에서 database/redis/discord 상태 추출
 * - info 에서 상태 추출
 * - error 에서 상태 추출
 * - details 가 info/error 를 덮어쓴다 (merge 순서)
 * - 키가 없으면 'unknown' 반환
 * - status='up' 이면 'up', 그 외는 'down'
 */

import { describe, expect, it } from 'vitest';

import type { TerminusHealth } from '../admin-api';
import { getGuildIconUrl, normalizeHealth } from '../admin-api';

describe('getGuildIconUrl', () => {
  it('icon 이 null 이면 null 을 반환한다', () => {
    expect(getGuildIconUrl('123456789', null)).toBeNull();
  });

  it('icon 이 빈 문자열이면 null 을 반환한다', () => {
    expect(getGuildIconUrl('123456789', '')).toBeNull();
  });

  it('icon 이 있으면 Discord CDN URL 을 반환한다', () => {
    const result = getGuildIconUrl('111222333', 'abcdef01234');
    expect(result).toBe('https://cdn.discordapp.com/icons/111222333/abcdef01234.png?size=128');
  });
});

describe('normalizeHealth', () => {
  describe('api 상태 추출', () => {
    it('raw.status="ok" 이면 api="up" 이다', () => {
      const raw: TerminusHealth = { status: 'ok' };
      expect(normalizeHealth(raw).api).toBe('up');
    });

    it('raw.status="error" 이면 api="up" 이다 (서버가 응답한 경우)', () => {
      const raw: TerminusHealth = { status: 'error' };
      expect(normalizeHealth(raw).api).toBe('up');
    });

    it('raw.status 가 기타 값이면 api="unknown" 이다', () => {
      const raw: TerminusHealth = { status: 'unknown' };
      expect(normalizeHealth(raw).api).toBe('unknown');
    });
  });

  describe('details 에서 컴포넌트 상태 추출', () => {
    it('details.database.status="up" 이면 database="up" 이다', () => {
      const raw: TerminusHealth = {
        status: 'ok',
        details: { database: { status: 'up' } },
      };
      expect(normalizeHealth(raw).database).toBe('up');
    });

    it('details.redis.status="down" 이면 redis="down" 이다', () => {
      const raw: TerminusHealth = {
        status: 'ok',
        details: { redis: { status: 'down' } },
      };
      expect(normalizeHealth(raw).redis).toBe('down');
    });

    it('details.discord.status="up" 이면 bot="up" 이다', () => {
      const raw: TerminusHealth = {
        status: 'ok',
        details: { discord: { status: 'up' } },
      };
      expect(normalizeHealth(raw).bot).toBe('up');
    });
  });

  describe('info 에서 컴포넌트 상태 추출', () => {
    it('info.database.status="up" 이면 database="up" 이다', () => {
      const raw: TerminusHealth = {
        status: 'ok',
        info: { database: { status: 'up' }, redis: { status: 'up' } },
      };
      expect(normalizeHealth(raw).database).toBe('up');
    });
  });

  describe('error 에서 컴포넌트 상태 추출', () => {
    it('error.database.status="down" 이면 database="down" 이다', () => {
      const raw: TerminusHealth = {
        status: 'error',
        error: { database: { status: 'down' } },
      };
      expect(normalizeHealth(raw).database).toBe('down');
    });
  });

  describe('merge 우선순위 (details > error > info)', () => {
    it('details 가 info 보다 우선 적용된다', () => {
      const raw: TerminusHealth = {
        status: 'ok',
        info: { database: { status: 'down' } },
        details: { database: { status: 'up' } },
      };
      // spread 순서: { ...info, ...error, ...details } — details 가 마지막이므로 up 이 된다
      expect(normalizeHealth(raw).database).toBe('up');
    });
  });

  describe('키 없음 / 기본값', () => {
    it('details/info/error 어디에도 키가 없으면 "unknown" 을 반환한다', () => {
      const raw: TerminusHealth = { status: 'ok' };
      const result = normalizeHealth(raw);
      expect(result.database).toBe('unknown');
      expect(result.redis).toBe('unknown');
      expect(result.bot).toBe('unknown');
    });

    it('status 가 "up" 이 아닌 임의 값이면 "down" 을 반환한다', () => {
      const raw: TerminusHealth = {
        status: 'ok',
        details: { database: { status: 'degraded' } },
      };
      expect(normalizeHealth(raw).database).toBe('down');
    });
  });
});
