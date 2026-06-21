import { type Mock } from 'vitest';

const STALE_LOCK_AGO_MS = 31_000; // 잠금 만료 기준(30초) 초과 시간

import { type StickyMessageConfigOrm } from '../infrastructure/sticky-message-config.orm-entity';
import { STICKY_FOOTER_MARKER } from '../sticky-message.constants';
import { StickyMessageRefreshService } from './sticky-message-refresh.service';

function makeConfig(overrides: Partial<StickyMessageConfigOrm> = {}): StickyMessageConfigOrm {
  return {
    id: 1,
    guildId: 'guild-1',
    channelId: 'ch-1',
    embedTitle: '공지',
    embedDescription: '내용',
    embedColor: '#5865F2',
    messageId: null,
    enabled: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAppliedAt: null,
    ...overrides,
  };
}

describe('StickyMessageRefreshService', () => {
  let service: StickyMessageRefreshService;
  let configRepo: {
    findByGuildAndChannel: Mock;
    updateMessageId: Mock;
  };
  let discordAdapter: {
    fetchMessages: Mock;
    getBotUserId: Mock;
    deleteMessage: Mock;
    sendMessage: Mock;
  };

  beforeEach(() => {
    configRepo = {
      findByGuildAndChannel: vi.fn(),
      updateMessageId: vi.fn(),
    };
    discordAdapter = {
      fetchMessages: vi.fn(),
      getBotUserId: vi.fn(),
      deleteMessage: vi.fn(),
      sendMessage: vi.fn(),
    };

    service = new StickyMessageRefreshService(configRepo as never, discordAdapter as never);
  });

  // ──────────────────────────────────────────────────────
  // isRefreshing
  // ──────────────────────────────────────────────────────
  describe('isRefreshing', () => {
    it('잠금이 없으면 false 반환', () => {
      expect(service.isRefreshing('ch-1')).toBe(false);
    });

    it('잠금 활성 상태(30초 이내)이면 true 반환', async () => {
      // refresh를 시작하지 않고 내부 Map에 직접 접근할 수 없으므로
      // refresh를 호출한 뒤 첫 번째 비동기 작업 중에 isRefreshing을 검사한다
      configRepo.findByGuildAndChannel.mockResolvedValue([makeConfig()]);
      discordAdapter.fetchMessages.mockResolvedValue([]);
      discordAdapter.getBotUserId.mockReturnValue('bot-id');
      discordAdapter.sendMessage.mockResolvedValue('new-msg-1');
      discordAdapter.deleteMessage.mockResolvedValue(undefined);
      configRepo.updateMessageId.mockResolvedValue(undefined);

      let capturedDuringRefresh = false;
      discordAdapter.sendMessage.mockImplementation(async () => {
        capturedDuringRefresh = service.isRefreshing('ch-1');
        return 'new-msg-1';
      });

      await service.refresh('guild-1', 'ch-1');

      // refresh 완료 후에는 false
      expect(service.isRefreshing('ch-1')).toBe(false);
      // 진행 중에는 true였어야 함
      expect(capturedDuringRefresh).toBe(true);
    });

    it('30초 초과된 stale 잠금이면 false 반환', () => {
      // private Map에 접근하기 위해 타입 단언 사용
      const map = (service as unknown as { refreshing: Map<string, number> }).refreshing;
      // 31초 전 타임스탬프 설정
      map.set('ch-1', Date.now() - STALE_LOCK_AGO_MS);

      expect(service.isRefreshing('ch-1')).toBe(false);
    });
  });

  // ──────────────────────────────────────────────────────
  // refresh
  // ──────────────────────────────────────────────────────
  describe('refresh', () => {
    it('이미 진행 중이면 스킵한다', async () => {
      const map = (service as unknown as { refreshing: Map<string, number> }).refreshing;
      map.set('ch-1', Date.now()); // 활성 잠금

      await service.refresh('guild-1', 'ch-1');

      expect(configRepo.findByGuildAndChannel).not.toHaveBeenCalled();
    });

    it('stale 잠금(30초 초과)은 강제 해제 후 실행한다', async () => {
      const map = (service as unknown as { refreshing: Map<string, number> }).refreshing;
      map.set('ch-1', Date.now() - STALE_LOCK_AGO_MS); // stale 잠금

      configRepo.findByGuildAndChannel.mockResolvedValue([]);

      await service.refresh('guild-1', 'ch-1');

      expect(configRepo.findByGuildAndChannel).toHaveBeenCalledWith('guild-1', 'ch-1');
    });

    it('설정이 없으면 즉시 반환한다', async () => {
      configRepo.findByGuildAndChannel.mockResolvedValue([]);

      await service.refresh('guild-1', 'ch-1');

      expect(discordAdapter.sendMessage).not.toHaveBeenCalled();
    });

    it('기존 메시지 삭제 → Embed 전송 → messageId 갱신', async () => {
      const config = makeConfig({ messageId: 'old-msg' });
      configRepo.findByGuildAndChannel.mockResolvedValue([config]);
      discordAdapter.fetchMessages.mockResolvedValue([]);
      discordAdapter.getBotUserId.mockReturnValue('bot-id');
      discordAdapter.deleteMessage.mockResolvedValue(undefined);
      discordAdapter.sendMessage.mockResolvedValue('new-msg');
      configRepo.updateMessageId.mockResolvedValue(undefined);

      await service.refresh('guild-1', 'ch-1');

      expect(discordAdapter.deleteMessage).toHaveBeenCalledWith('ch-1', 'old-msg');
      expect(discordAdapter.sendMessage).toHaveBeenCalled();
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(config.id, 'new-msg');
    });

    it('messageId가 없는 경우 삭제 없이 신규 전송', async () => {
      const config = makeConfig({ messageId: null });
      configRepo.findByGuildAndChannel.mockResolvedValue([config]);
      discordAdapter.fetchMessages.mockResolvedValue([]);
      discordAdapter.getBotUserId.mockReturnValue('bot-id');
      discordAdapter.sendMessage.mockResolvedValue('new-msg');
      configRepo.updateMessageId.mockResolvedValue(undefined);

      await service.refresh('guild-1', 'ch-1');

      expect(discordAdapter.deleteMessage).not.toHaveBeenCalled();
      expect(discordAdapter.sendMessage).toHaveBeenCalled();
    });

    it('전송 실패 시 error 로그 후 계속 진행한다', async () => {
      const config1 = makeConfig({ id: 1, messageId: null });
      const config2 = makeConfig({ id: 2, messageId: null, sortOrder: 1 });
      configRepo.findByGuildAndChannel.mockResolvedValue([config1, config2]);
      discordAdapter.fetchMessages.mockResolvedValue([]);
      discordAdapter.getBotUserId.mockReturnValue('bot-id');
      discordAdapter.sendMessage
        .mockRejectedValueOnce(new Error('전송 실패')) // config1 실패
        .mockResolvedValueOnce('new-msg-2'); // config2 성공
      configRepo.updateMessageId.mockResolvedValue(undefined);

      // 에러 throw 없이 완료되어야 함
      await expect(service.refresh('guild-1', 'ch-1')).resolves.not.toThrow();
      expect(configRepo.updateMessageId).toHaveBeenCalledWith(config2.id, 'new-msg-2');
    });

    it('refresh 완료 후 잠금 해제(finally)', async () => {
      configRepo.findByGuildAndChannel.mockResolvedValue([]);

      await service.refresh('guild-1', 'ch-1');

      expect(service.isRefreshing('ch-1')).toBe(false);
    });

    it('고아 메시지(footer 마커 있음, DB 미추적) 정리', async () => {
      const config = makeConfig({ messageId: 'tracked-msg', id: 1 });
      configRepo.findByGuildAndChannel.mockResolvedValue([config]);

      const orphanMsg = {
        id: 'orphan-msg',
        author: { id: 'bot-id' },
        embeds: [{ footer: { text: STICKY_FOOTER_MARKER } }],
      };
      const trackedMsg = {
        id: 'tracked-msg',
        author: { id: 'bot-id' },
        embeds: [{ footer: { text: STICKY_FOOTER_MARKER } }],
      };
      discordAdapter.fetchMessages.mockResolvedValue([orphanMsg, trackedMsg]);
      discordAdapter.getBotUserId.mockReturnValue('bot-id');
      discordAdapter.deleteMessage.mockResolvedValue(undefined);
      discordAdapter.sendMessage.mockResolvedValue('new-msg');
      configRepo.updateMessageId.mockResolvedValue(undefined);

      await service.refresh('guild-1', 'ch-1');

      // orphan-msg는 삭제됨 (tracked-msg는 정상 흐름에서 삭제)
      const deleteCalls = (discordAdapter.deleteMessage as Mock).mock.calls.map((c) => c[1]);
      expect(deleteCalls).toContain('orphan-msg');
    });

    it('footer 마커가 없는 메시지는 고아 정리 대상이 아님', async () => {
      const config = makeConfig({ messageId: null });
      configRepo.findByGuildAndChannel.mockResolvedValue([config]);

      const otherMsg = {
        id: 'other-msg',
        author: { id: 'bot-id' },
        embeds: [{ footer: { text: '다른 시스템 footer' } }],
      };
      discordAdapter.fetchMessages.mockResolvedValue([otherMsg]);
      discordAdapter.getBotUserId.mockReturnValue('bot-id');
      discordAdapter.sendMessage.mockResolvedValue('new-msg');
      configRepo.updateMessageId.mockResolvedValue(undefined);

      await service.refresh('guild-1', 'ch-1');

      // 다른 시스템 메시지는 삭제하지 않음
      const deleteCalls = (discordAdapter.deleteMessage as Mock).mock.calls.map((c) => c[1]);
      expect(deleteCalls).not.toContain('other-msg');
    });
  });
});
