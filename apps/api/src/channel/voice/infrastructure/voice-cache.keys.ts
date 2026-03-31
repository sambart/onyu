export const VoiceKeys = {
  session: (guild: string, user: string) => `voice:session:${guild}:${user}`,

  channelDuration: (guild: string, user: string, date: string, channel: string) =>
    `voice:duration:channel:${guild}:${user}:${date}:${channel}`,

  micDuration: (guild: string, user: string, date: string, state: 'on' | 'off') =>
    `voice:duration:mic:${guild}:${user}:${date}:${state}`,

  aloneDuration: (guild: string, user: string, date: string) =>
    `voice:duration:alone:${guild}:${user}:${date}`,

  streamingDuration: (guild: string, user: string, date: string) =>
    `voice:duration:streaming:${guild}:${user}:${date}`,

  videoDuration: (guild: string, user: string, date: string) =>
    `voice:duration:video:${guild}:${user}:${date}`,

  deafDuration: (guild: string, user: string, date: string) =>
    `voice:duration:deaf:${guild}:${user}:${date}`,

  channelName: (guild: string, channel: string) => `voice:channel:name:${guild}:${channel}`,

  categoryInfo: (guild: string, channel: string) => `voice:channel:category:${guild}:${channel}`,

  /** 자동방 메타데이터 캐시: voice:channel:auto:{guildId}:{channelId} — TTL 7일 */
  autoChannelInfo: (guild: string, channel: string) => `voice:channel:auto:${guild}:${channel}`,

  userName: (guild: string, user: string) => `voice:user:name:${guild}:${user}`,

  /** 제외 채널 목록 캐시: voice:excluded:{guildId} — TTL 1시간 */
  excludedChannels: (guildId: string) => `voice:excluded:${guildId}`,

  /** 길드별 현재 음성 접속자 수: voice:user-count:{guildId} — TTL 120초 */
  userCount: (guildId: string) => `voice:user-count:${guildId}`,
};
