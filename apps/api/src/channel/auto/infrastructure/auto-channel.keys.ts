export const AutoChannelKeys = {
  /** 확정방 메타데이터: auto_channel:confirmed:{channelId} */
  confirmed: (channelId: string) => `auto_channel:confirmed:${channelId}`,
  /** 확정방 메타데이터 SCAN 패턴 */
  confirmedPattern: () => 'auto_channel:confirmed:*',
  /** 삭제 실패한 확정방 ID Set: auto_channel:pending_delete */
  pendingDelete: () => 'auto_channel:pending_delete',
};
