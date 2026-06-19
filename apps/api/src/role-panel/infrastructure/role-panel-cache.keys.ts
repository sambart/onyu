export const RolePanelKeys = {
  /**
   * 설정 캐시: role_panel:config:{guildId}
   * TTL 1시간 (패널 생성/수정/삭제/게시 시 즉시 DEL)
   */
  config: (guildId: string) => `role_panel:config:${guildId}`,
} as const;
