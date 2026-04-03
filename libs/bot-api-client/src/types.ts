/** Bot → API 요청/응답 DTO 타입 정의 */

// ── Voice ──

export interface VoiceStateUpdateDto {
  guildId: string;
  userId: string;
  channelId: string | null;
  oldChannelId: string | null;
  eventType:
    | 'join'
    | 'leave'
    | 'move'
    | 'mic_toggle'
    | 'streaming_toggle'
    | 'video_toggle'
    | 'deaf_toggle';

  // 기존 VoiceStateDto 대응 필드
  userName: string;
  channelName: string | null;
  oldChannelName: string | null;
  parentCategoryId: string | null;
  categoryName: string | null;
  oldParentCategoryId: string | null;
  oldCategoryName: string | null;
  micOn: boolean;
  avatarUrl: string | null;

  // 채널 멤버 정보 (alone 감지 + auto-channel empty 감지용)
  channelMemberCount: number;
  oldChannelMemberCount: number;
  channelMemberIds: string[];
  oldChannelMemberIds: string[];

  // Phase 1: VoiceState 추가 수집
  streaming?: boolean;
  selfVideo?: boolean;
  selfDeaf?: boolean;

  // Phase 2: 게임 활동 (optional — 게임 중이 아닐 수 있음)
  gameName?: string | null;
  gameApplicationId?: string | null;
}

// ── Newbie ──

export interface MemberJoinDto {
  guildId: string;
  memberId: string;
  displayName: string;
}

export interface MissionRefreshDto {
  guildId: string;
}

export interface MocoRankRequestDto {
  guildId: string;
  page: number;
}

export interface MocoMyHuntingRequestDto {
  guildId: string;
  userId: string;
}

export interface NewbieConfigDto {
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeContent: string | null;
  welcomeEmbedTitle: string | null;
  welcomeEmbedDescription: string | null;
  welcomeEmbedColor: string | null;
  welcomeEmbedThumbnailUrl: string | null;
  missionEnabled: boolean;
  roleEnabled: boolean;
  newbieRoleId: string | null;
  roleDurationDays: number | null;
}

export interface RoleAssignedDto {
  guildId: string;
  memberId: string;
}

// ── Guild ──

export interface MemberDisplayNameResponse {
  userId: string;
  displayName: string;
}

export interface RoleModifyDto {
  guildId: string;
  memberId: string;
  roleId: string;
}

export interface KickMemberDto {
  guildId: string;
  memberId: string;
  reason?: string;
}

// ── Status Prefix ──

export interface StatusPrefixApplyDto {
  guildId: string;
  memberId: string;
  buttonId: number;
  currentDisplayName: string;
}

export interface StatusPrefixResetDto {
  guildId: string;
  memberId: string;
}

export interface StatusPrefixApplyResult {
  success: boolean;
  newNickname?: string;
  message: string;
}

export interface StatusPrefixResetResult {
  success: boolean;
  originalNickname?: string;
  message: string;
}

// ── Auto Channel ──

export interface AutoChannelButtonClickDto {
  guildId: string;
  userId: string;
  buttonId: number;
  voiceChannelId: string | null;
  displayName: string;
}

export interface AutoChannelSubOptionDto {
  guildId: string;
  userId: string;
  subOptionId: number;
  voiceChannelId: string | null;
  displayName: string;
}

export interface AutoChannelSubOptionInfo {
  id: number;
  label: string;
  emoji: string | null;
}

export interface AutoChannelButtonResult {
  action: 'created' | 'error' | 'show_sub_options';
  channelId?: string;
  channelName?: string;
  message: string;
  subOptions?: AutoChannelSubOptionInfo[];
}

// ── Sticky Message ──

export interface MessageCreatedDto {
  guildId: string;
  channelId: string;
  authorId: string;
  isBot: boolean;
}

export interface StickyMessageConfigItem {
  channelId: string;
  embedTitle: string | null;
  enabled: boolean;
}

// ── Voice Analytics ──

export interface SelfDiagnosisResponse {
  ok: boolean;
  data: {
    result: SelfDiagnosisResultData;
    analysisDays: number;
    isCooldownEnabled: boolean;
    cooldownHours: number;
  } | null;
  reason?: 'not_enabled' | 'cooldown' | 'quota_exhausted';
  remainingSeconds?: number;
}

export interface ServerDiagnosisResponse {
  ok: boolean;
  data: {
    totalStats: {
      totalUsers: number;
      totalVoiceTime: number;
      totalMicOnTime: number;
      avgDailyActiveUsers: number;
    };
    topUsers: Array<{
      rank: number;
      userId: string;
      nickName: string;
      avatarUrl: string | null;
      totalSec: number;
      micOnSec: number;
      activeDays: number;
    }>;
    aiSummary: string | null;
    days: number;
  } | null;
}

export interface SelfDiagnosisResultData {
  totalMinutes: number;
  activeDays: number;
  totalDays: number;
  activeDaysRatio: number;
  avgDailyMinutes: number;
  activityRank: number;
  activityTotalUsers: number;
  activityTopPercent: number;
  peerCount: number;
  hhiScore: number;
  topPeers: Array<{ userId: string; userName: string; minutes: number; ratio: number }>;
  hasMocoActivity: boolean;
  mocoScore: number;
  mocoRank: number;
  mocoTotalUsers: number;
  mocoTopPercent: number;
  mocoHelpedNewbies: number;
  micUsageRate: number;
  aloneRatio: number;
  verdicts: Array<{ category: string; isPassed: boolean; criterion: string; actual: string }>;
  badges: string[];
  badgeGuides: Array<{
    code: string;
    name: string;
    icon: string;
    isEarned: boolean;
    criterion: string;
    current: string;
  }>;
  llmSummary?: string;
}

export interface LlmSummaryResponse {
  ok: boolean;
  data: { llmSummary: string } | null;
  reason?: 'quota_exhausted';
}

export interface MeProfileResponse {
  ok: boolean;
  data: { imageBase64: string } | null;
  days: number;
}

// ── Voice Sync (봇 시작 시 기존 음성 채널 사용자 동기화) ──

export interface VoiceSyncUser {
  userId: string;
  channelId: string;
  channelName: string;
  parentCategoryId: string | null;
  categoryName: string | null;
  userName: string;
  avatarUrl: string | null;
  micOn: boolean;
  streaming: boolean;
  selfVideo: boolean;
  selfDeaf: boolean;
  gameName: string | null;
  gameApplicationId: string | null;
}

export interface VoiceSyncDto {
  guildId: string;
  users: VoiceSyncUser[];
}

// ── Voice User Count ──

export interface GuildVoiceUserCount {
  guildId: string;
  count: number;
}

// ── Co-Presence ──

export interface CoPresenceSnapshot {
  guildId: string;
  channelId: string;
  userIds: string[];
  /** Phase 2: 멤버별 게임 활동 정보 (optional, 하위 호환) */
  memberActivities?: CoPresenceMemberActivity[];
}

export interface CoPresenceMemberActivity {
  userId: string;
  gameName: string | null;
  applicationId: string | null;
}

// ── Music Channel ──

export interface MusicButtonConfigItem {
  type: string;
  label: string;
  emoji: string;
  enabled: boolean;
  row: number;
}

export interface MusicChannelConfigResponse {
  id: number;
  guildId: string;
  channelId: string;
  messageId: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  embedColor: string | null;
  embedThumbnailUrl: string | null;
  buttonConfig: { buttons: MusicButtonConfigItem[] };
  enabled: boolean;
}

// ── Moco Canvas ──

export interface MocoRankEmbedResponse {
  mode: 'EMBED';
  embeds: Record<string, unknown>[];
  components: Record<string, unknown>[];
}

export interface MocoRankCanvasResponse {
  mode: 'CANVAS';
  imageBase64: string;
  components: Record<string, unknown>[];
}

export type MocoRankResponse = MocoRankEmbedResponse | MocoRankCanvasResponse;

export interface MocoMyEmbedResponse {
  ok: boolean;
  mode: 'EMBED';
  data: string;
}

export interface MocoMyCanvasResponse {
  ok: boolean;
  mode: 'CANVAS';
  imageBase64: string;
}

export type MocoMyResponse = MocoMyEmbedResponse | MocoMyCanvasResponse;

// ── Guild Member ──

export interface GuildMemberUpsertDto {
  guildId: string;
  userId: string;
  displayName: string;
  username: string;
  nick: string | null;
  avatarUrl: string | null;
  isBot: boolean;
  joinedAt: string | null; // ISO 8601
}

export interface GuildMemberBulkUpsertDto {
  guildId: string;
  members: GuildMemberUpsertDto[];
}

export interface GuildMemberDeactivateDto {
  guildId: string;
  userId: string;
}

export interface GuildMemberUserUpdateDto {
  userId: string;
  /** discord globalName ?? username — Bot 측에서 변환하여 전달 */
  displayName: string;
  username: string;
}

// ── Common ──

export interface BotApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
