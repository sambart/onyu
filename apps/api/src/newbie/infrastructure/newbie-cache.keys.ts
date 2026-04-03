export const NewbieKeys = {
  /** 설정 캐시: newbie:config:{guildId} — TTL 1시간 */
  config: (guildId: string) => `newbie:config:${guildId}`,

  /** 진행중 미션 목록 캐시: newbie:mission:active:{guildId} — TTL 30분 */
  missionActive: (guildId: string) => `newbie:mission:active:${guildId}`,

  /** 신입기간 활성 멤버 집합: newbie:period:active:{guildId} — TTL 1시간 */
  periodActive: (guildId: string) => `newbie:period:active:${guildId}`,

  /** 사냥꾼별 신규사용자별 사냥 시간 Hash: newbie:moco:total:{guildId}:{hunterId} — TTL 없음 */
  mocoTotal: (guildId: string, hunterId: string) => `newbie:moco:total:${guildId}:${hunterId}`,

  /** 길드별 사냥꾼 순위 Sorted Set: newbie:moco:rank:{guildId} — TTL 없음 */
  mocoRank: (guildId: string) => `newbie:moco:rank:${guildId}`,

  /** 사냥꾼별 채널 기반 누적 시간(분): newbie:moco:channel-min:{guildId}:{hunterId} — TTL 없음 */
  mocoChannelMin: (guildId: string, hunterId: string) =>
    `newbie:moco:channel-min:${guildId}:${hunterId}`,

  /** 사냥꾼별 유효 세션 횟수: newbie:moco:sessions:{guildId}:{hunterId} — TTL 없음 */
  mocoSessionCount: (guildId: string, hunterId: string) =>
    `newbie:moco:sessions:${guildId}:${hunterId}`,

  /** 사냥꾼별 메타 정보 Hash: newbie:moco:meta:{guildId}:{hunterId} — TTL 없음 */
  mocoMeta: (guildId: string, hunterId: string) => `newbie:moco:meta:${guildId}:${hunterId}`,

  /** 사냥꾼별 모코코별 세션 횟수 Hash: newbie:moco:newbie-sessions:{guildId}:{hunterId} — TTL 없음 */
  mocoNewbieSessions: (guildId: string, hunterId: string) =>
    `newbie:moco:newbie-sessions:${guildId}:${hunterId}`,

  /** 멤버 디스플레이 이름 Hash: newbie:display-names:{guildId} — TTL 5분 */
  displayNames: (guildId: string) => `newbie:display-names:${guildId}`,

  /** Canvas 랭킹 보드 캐시: newbie:moco:canvas:{guildId}:rank:{page} — TTL 30초 */
  mocoCanvasRank: (guildId: string, page: number) => `newbie:moco:canvas:${guildId}:rank:${page}`,

  /** Canvas 개인 상세 캐시: newbie:moco:canvas:{guildId}:detail:{hunterId} — TTL 30초 */
  mocoCanvasDetail: (guildId: string, hunterId: string) =>
    `newbie:moco:canvas:${guildId}:detail:${hunterId}`,

  /** Canvas 캐시 무효화용 패턴: newbie:moco:canvas:{guildId}:* */
  mocoCanvasPattern: (guildId: string) => `newbie:moco:canvas:${guildId}:*`,

  /** 미션 Canvas 캐시: newbie:mission:canvas:{guildId}:page:{page} -- TTL 30초 */
  missionCanvasPage: (guildId: string, page: number) =>
    `newbie:mission:canvas:${guildId}:page:${page}`,

  /** 미션 Canvas 캐시 무효화용 패턴: newbie:mission:canvas:{guildId}:* */
  missionCanvasPattern: (guildId: string) => `newbie:mission:canvas:${guildId}:*`,
} as const;
