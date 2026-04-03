/**
 * 허용 변수 목록 정의. 각 필드별로 허용 변수를 분리하여 관리한다.
 */
export const MISSION_ALLOWED_VARS = {
  titleTemplate: ['{totalCount}'],
  headerTemplate: [
    '{totalCount}',
    '{inProgressCount}',
    '{completedCount}',
    '{failedCount}',
    '{leftCount}',
  ],
  itemTemplate: [
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
  ],
  footerTemplate: ['{updatedAt}'],
} as const;

export const MOCO_ALLOWED_VARS = {
  titleTemplate: ['{rank}', '{hunterName}'],
  bodyTemplate: [
    '{totalMinutes}',
    '{mocoList}',
    '{score}',
    '{sessionCount}',
    '{uniqueNewbieCount}',
  ],
  itemTemplate: ['{newbieName}', '{newbieMention}', '{minutes}', '{sessions}'],
  footerTemplate: ['{currentPage}', '{totalPages}', '{interval}', '{periodStart}', '{periodEnd}'],
  scoringTemplate: ['{scorePerSession}', '{scorePerMinute}', '{scorePerUnique}', '{minCoPresence}'],
} as const;

/**
 * 템플릿 문자열에서 {변수명} 패턴을 추출한다.
 */
function extractVars(template: string): string[] {
  return [...template.matchAll(/\{[^}]+\}/g)].map((m) => m[0]);
}

/**
 * 템플릿 문자열에 허용되지 않는 변수가 포함되어 있으면
 * 허용되지 않는 변수 목록을 반환한다. 없으면 빈 배열.
 */
export function findInvalidVars(template: string, allowedVars: readonly string[]): string[] {
  const found = extractVars(template);
  return found.filter((v) => !allowedVars.includes(v));
}

/**
 * 미션 템플릿 필드별 유효성 검사.
 * 반환값: 필드명 → 허용되지 않는 변수 목록 맵.
 * 빈 맵이면 모두 유효.
 */
export function validateMissionTemplate(template: {
  titleTemplate: string | null;
  headerTemplate: string | null;
  itemTemplate: string | null;
  footerTemplate: string | null;
}): Map<string, string[]> {
  const errors = new Map<string, string[]>();

  const checks: Array<[string, string | null, readonly string[]]> = [
    ['titleTemplate', template.titleTemplate, MISSION_ALLOWED_VARS.titleTemplate],
    ['headerTemplate', template.headerTemplate, MISSION_ALLOWED_VARS.headerTemplate],
    ['itemTemplate', template.itemTemplate, MISSION_ALLOWED_VARS.itemTemplate],
    ['footerTemplate', template.footerTemplate, MISSION_ALLOWED_VARS.footerTemplate],
  ];

  for (const [field, value, allowed] of checks) {
    if (!value) continue;
    const invalid = findInvalidVars(value, allowed);
    if (invalid.length > 0) errors.set(field, invalid);
  }

  return errors;
}

/**
 * 모코코 템플릿 필드별 유효성 검사.
 */
export function validateMocoTemplate(template: {
  titleTemplate: string | null;
  bodyTemplate: string | null;
  itemTemplate: string | null;
  footerTemplate: string | null;
  scoringTemplate?: string | null;
}): Map<string, string[]> {
  const errors = new Map<string, string[]>();

  const checks: Array<[string, string | null, readonly string[]]> = [
    ['titleTemplate', template.titleTemplate, MOCO_ALLOWED_VARS.titleTemplate],
    ['bodyTemplate', template.bodyTemplate, MOCO_ALLOWED_VARS.bodyTemplate],
    ['itemTemplate', template.itemTemplate, MOCO_ALLOWED_VARS.itemTemplate],
    ['footerTemplate', template.footerTemplate, MOCO_ALLOWED_VARS.footerTemplate],
    ['scoringTemplate', template.scoringTemplate ?? null, MOCO_ALLOWED_VARS.scoringTemplate],
  ];

  for (const [field, value, allowed] of checks) {
    if (!value) continue;
    const invalid = findInvalidVars(value, allowed);
    if (invalid.length > 0) errors.set(field, invalid);
  }

  return errors;
}

// ─── 미리보기용 더미 데이터 ────────────────────────────────────────────────────

/** 미션 미리보기에 사용할 더미 변수 치환 맵 */
export const MISSION_PREVIEW_DUMMY: Record<string, string> = {
  '{totalCount}': '3',
  '{inProgressCount}': '1',
  '{completedCount}': '1',
  '{failedCount}': '1',
  '{leftCount}': '0',
  '{username}': '사용자1',
  '{mention}': '@사용자1',
  '{startDate}': '2025-03-01',
  '{endDate}': '2025-03-08',
  '{statusEmoji}': '🟡',
  '{statusText}': '진행중',
  '{playtimeHour}': '2',
  '{playtimeMin}': '30',
  '{playtimeSec}': '0',
  '{playtime}': '2시간 30분 0초',
  '{playCount}': '5',
  '{targetPlaytime}': '10시간',
  '{targetPlayCount}': '7',
  '{daysLeft}': '3',
  '{updatedAt}': '2025-03-08 12:00',
};

/** 모코코 미리보기에 사용할 더미 변수 치환 맵 */
export const MOCO_PREVIEW_DUMMY: Record<string, string> = {
  '{rank}': '1',
  '{hunterName}': '사냥꾼닉네임',
  '{hunterMention}': '@사냥꾼닉네임',
  '{totalMinutes}': '120',
  '{mocoList}': '– 신입1 🌱: 60분 (2회)\n– 신입2 🌱: 60분 (1회)',
  '{newbieName}': '신입1',
  '{newbieMention}': '@신입1',
  '{minutes}': '60',
  '{sessions}': '2',
  '{score}': '135',
  '{sessionCount}': '3',
  '{uniqueNewbieCount}': '3',
  '{currentPage}': '1',
  '{totalPages}': '5',
  '{interval}': '30',
  '{periodStart}': '2026-03-01',
  '{periodEnd}': '2026-03-31',
  '{scorePerSession}': '10',
  '{scorePerMinute}': '1',
  '{scorePerUnique}': '5',
  '{minCoPresence}': '10',
};

/**
 * 템플릿 문자열의 모든 변수를 더미 값으로 치환하여 미리보기 문자열을 반환한다.
 */
export function applyDummyVars(template: string, dummy: Record<string, string>): string {
  return template.replace(/\{[^}]+\}/g, (match) => dummy[match] ?? match);
}
