// ────────────────────────────────────────────────────────────────────────────
// 베스트 프렌드 / 친밀도 카드 렌더러 입력 타입 정의
// ────────────────────────────────────────────────────────────────────────────

/** 단일 peer 항목 */
export interface TopPeerItem {
  /** peer의 Discord userId */
  userId: string;
  /** GuildMember.displayName. 익명화 시 '???' */
  displayName: string;
  /** 아바타 URL. 익명화 시 null */
  avatarUrl: string | null;
  /** 기간 내 총 동시접속 시간(분) */
  totalMinutes: number;
  /** 기간 내 세션 수 */
  sessionCount: number;
  /** UserPrivacyConfig.disableRelationshipShare = true */
  isAnonymous: boolean;
}

/** 베스트 프렌드 카드 입력 데이터 */
export interface BestFriendCardData {
  /** 본인 닉네임 */
  selfDisplayName: string;
  /** 본인 아바타 URL */
  selfAvatarUrl: string;
  /** 집계 기간(일) */
  period: 7 | 30 | 90;
  /** 상위 peer 목록 */
  peers: TopPeerItem[];
  /** AI 한 줄 코멘트. null 이면 카드에서 생략 */
  aiComment: string | null;
  /** 통계 제외 채널 목록 (푸터 표기용, 옵션) */
  excludedChannels?: { name: string }[];
}
