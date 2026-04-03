import { MissionStatus, type StatusMapping } from '../domain/newbie-mission.types';

// ---- 미션 템플릿 기본값 ----

export const DEFAULT_MISSION_TITLE_TEMPLATE = '🧑‍🌾 신입 미션 체크';

export const DEFAULT_MISSION_HEADER_TEMPLATE = '🧑‍🌾 뉴비 멤버 (총 인원: {totalCount}명)';

export const DEFAULT_MISSION_ITEM_TEMPLATE =
  '{mention} 🌱\n{startDate} ~ {endDate}\n{statusEmoji} {statusText} | 플레이타임: {playtime} | 플레이횟수: {playCount}회';

export const DEFAULT_MISSION_FOOTER_TEMPLATE = '마지막 갱신: {updatedAt}';

export const DEFAULT_STATUS_MAPPING: StatusMapping = {
  [MissionStatus.IN_PROGRESS]: { emoji: '🟡', text: '진행중' },
  [MissionStatus.COMPLETED]: { emoji: '✅', text: '완료' },
  [MissionStatus.FAILED]: { emoji: '❌', text: '실패' },
  [MissionStatus.LEFT]: { emoji: '🚪', text: '퇴장' },
};

// ---- 미션 템플릿 허용 변수 ----

export const MISSION_TITLE_ALLOWED_VARS = ['{totalCount}'] as const;

export const MISSION_HEADER_ALLOWED_VARS = [
  '{totalCount}',
  '{inProgressCount}',
  '{completedCount}',
  '{failedCount}',
  '{leftCount}',
] as const;

export const MISSION_ITEM_ALLOWED_VARS = [
  '{username}',
  '{mention}',
  '{startDate}',
  '{endDate}',
  '{statusEmoji}',
  '{statusText}',
  '{playtimeHour}',
  '{playtimeMin}',
  '{playtimeSec}',
  '{playtime}',
  '{playCount}',
  '{targetPlaytime}',
  '{targetPlayCount}',
  '{daysLeft}',
] as const;

export const MISSION_FOOTER_ALLOWED_VARS = ['{updatedAt}'] as const;

// ---- 모코코 템플릿 기본값 ----

export const DEFAULT_MOCO_TITLE_TEMPLATE = '🌱 모코코 사냥 #{rank} — {hunterName}';

export const DEFAULT_MOCO_BODY_TEMPLATE =
  '**🏆 {score}점**\n⏱️ {totalMinutes}분 · 🎮 {sessionCount}회 · 🌱 {uniqueNewbieCount}명\n\n{mocoList}';

export const DEFAULT_MOCO_ITEM_TEMPLATE = '🌱 **{newbieName}** — {minutes}분 ({sessions}회)';

export const DEFAULT_MOCO_FOOTER_TEMPLATE =
  '페이지 {currentPage}/{totalPages} | 자동 갱신 {interval}분';

export const DEFAULT_MOCO_FOOTER_TEMPLATE_NO_INTERVAL = '페이지 {currentPage}/{totalPages}';

// ---- 모코코 템플릿 허용 변수 ----

export const MOCO_TITLE_ALLOWED_VARS = ['{rank}', '{hunterName}'] as const;

export const MOCO_BODY_ALLOWED_VARS = [
  '{totalMinutes}',
  '{mocoList}',
  '{score}',
  '{sessionCount}',
  '{uniqueNewbieCount}',
] as const;

export const MOCO_ITEM_ALLOWED_VARS = [
  '{newbieName}',
  '{newbieMention}',
  '{minutes}',
  '{sessions}',
] as const;

export const MOCO_FOOTER_ALLOWED_VARS = [
  '{currentPage}',
  '{totalPages}',
  '{interval}',
  '{periodStart}',
  '{periodEnd}',
] as const;

// ---- 모코코 점수 산정 템플릿 ----

export const DEFAULT_MOCO_SCORING_TEMPLATE =
  '── 점수 산정 ──\n🎮 {scorePerSession}점/회 · ⏱️ {scorePerMinute}점/분 · 🌱 {scorePerUnique}점/명\n⏳ 최소 {minCoPresence}분 동시접속';

export const MOCO_SCORING_ALLOWED_VARS = [
  '{scorePerSession}',
  '{scorePerMinute}',
  '{scorePerUnique}',
  '{minCoPresence}',
] as const;
