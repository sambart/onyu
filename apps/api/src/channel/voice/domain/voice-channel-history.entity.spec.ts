import { VoiceChannelHistoryOrm } from '../infrastructure/voice-channel-history.orm-entity';

const THIRTY_MINUTES_SEC = 1800; // 30분 = 1800초

describe('VoiceChannelHistoryOrm', () => {
  function createHistory(joinedAt: Date, leftAt: Date | null): VoiceChannelHistoryOrm {
    const h = new VoiceChannelHistoryOrm();
    h.joinedAt = joinedAt;
    h.leftAt = leftAt;
    return h;
  }

  describe('duration getter', () => {
    it('정상적인 입퇴장 시 초 단위 duration을 반환한다', () => {
      const joined = new Date('2026-01-01T10:00:00Z');
      const left = new Date('2026-01-01T10:30:00Z');
      const history = createHistory(joined, left);

      expect(history.duration).toBe(THIRTY_MINUTES_SEC); // 30분 = 1800초
    });

    it('leftAt이 null이면 null을 반환한다 (아직 접속 중)', () => {
      const history = createHistory(new Date('2026-01-01T10:00:00Z'), null);
      expect(history.duration).toBeNull();
    });

    it('1초 미만의 차이는 0으로 내림한다', () => {
      const joined = new Date('2026-01-01T10:00:00.000Z');
      const left = new Date('2026-01-01T10:00:00.999Z');
      const history = createHistory(joined, left);

      expect(history.duration).toBe(0);
    });

    it('정확히 1시간 체류 시 3600을 반환한다', () => {
      const joined = new Date('2026-01-01T10:00:00Z');
      const left = new Date('2026-01-01T11:00:00Z');
      const history = createHistory(joined, left);

      expect(history.duration).toBe(3600);
    });
  });
});
