/**
 * 포맷 유틸리티.
 *
 * - 로케일 독립 포맷 함수 (formatMinutes, formatShortDate, formatDuration)
 * - 로케일 기반 포맷 함수: useTranslations hook을 사용할 수 없는 유틸 함수에서
 *   번역 함수(t)를 파라미터로 받아 로컬라이징된 문자열을 반환한다.
 *
 * 사용 예:
 *   const t = useTranslations('common');
 *   formatMinutesI18n(90, t) → "1시간 30분" (ko) / "1h 30m" (en)
 */

// ─── 로케일 독립 포맷 함수 ────────────────────────────────────────────────────

/**
 * 분 → "X시간 Y분" 또는 "Y분" 형식으로 변환한다.
 * @param totalMinutes 총 분 수
 */
export function formatMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0분';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

/**
 * 날짜 문자열 → 'MM/DD' 형식으로 변환한다.
 * 'YYYYMMDD', 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ss' 형식을 모두 지원한다.
 * @param dateStr 날짜 문자열
 */
export function formatShortDate(dateStr: string): string {
  if (dateStr.length === 8) {
    return `${dateStr.slice(4, 6)}/${dateStr.slice(6, 8)}`;
  }
  const dateOnly = dateStr.slice(0, 10);
  const parts = dateOnly.split('-');
  if (parts.length < 3) return dateStr;
  return `${parts[1]}/${parts[2]}`;
}

/**
 * 초 → "X시간 Y분" 또는 "Y분" 형식으로 변환한다.
 * @param totalSec 총 초 수
 */
export function formatDuration(totalSec: number): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

/** {@link formatDuration}의 별칭 — 기존 코드 호환용 */
export const formatDurationSec = formatDuration;

// ─── 로케일 기반 포맷 함수 ────────────────────────────────────────────────────

type TFunc = (key: string, params?: Record<string, string | number>) => string;

/** 분 → 로컬라이징된 "X시간 Y분" 형식 */
export function formatMinutesI18n(totalMinutes: number, t: TFunc): string {
  if (totalMinutes <= 0) return t('time.minutes', { minutes: 0 });
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return t('time.minutes', { minutes });
  if (minutes === 0) return t('time.hours', { hours });
  return t('time.hoursMinutes', { hours, minutes });
}

/** 초 → 로컬라이징된 "X시간 Y분" 형식 */
export function formatDurationSecI18n(totalSec: number, t: TFunc): string {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return t('time.hoursMinutes', { hours, minutes });
  return t('time.minutes', { minutes });
}

/** 밀리초 → 로컬라이징된 "N일 M시간 P분" 형식 (업타임용) */
export function formatUptimeI18n(ms: number, t: TFunc): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(t('time.days', { days }));
  if (hours > 0) parts.push(t('time.hours', { hours }));
  parts.push(t('time.minutes', { minutes }));
  return parts.join(' ');
}

const GRADE_KEY_MAP: Record<string, string> = {
  FULLY_INACTIVE: 'fullyInactive',
  LOW_ACTIVE: 'lowActive',
  DECLINING: 'declining',
};

/** 비활동 등급 enum → 로컬라이징된 레이블 */
export function gradeLabelI18n(
  grade: 'FULLY_INACTIVE' | 'LOW_ACTIVE' | 'DECLINING',
  t: TFunc,
): string {
  const key = GRADE_KEY_MAP[grade] ?? grade;
  return t(key);
}

// ─── 날짜/숫자 포맷 (로케일 인지, Intl 기반) ─────────────────────────────────
//
// useTranslations 훅과 무관하게 next-intl의 useLocale()로 얻은 locale 문자열을
// 인자로 받아 Intl.DateTimeFormat / Intl.NumberFormat으로 포맷한다.

const INVALID_DATE_FALLBACK = '—';

function toDate(input: string | Date): Date {
  return typeof input === 'string' ? new Date(input) : input;
}

/** 날짜 → 로케일 인지 짧은 날짜 (ko: 2026. 7. 2. / en: Jul 2, 2026) */
export function formatDate(input: string | Date, locale: string): string {
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return INVALID_DATE_FALLBACK;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

/** 날짜+시각 → 로케일 인지 (ko: 2026. 7. 2. 오후 3:04 / en: Jul 2, 2026, 3:04 PM) */
export function formatDateTime(input: string | Date, locale: string): string {
  const date = toDate(input);
  if (Number.isNaN(date.getTime())) return INVALID_DATE_FALLBACK;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).format(date);
}

/** 숫자 → 로케일 천단위 구분 (ko/en 공통 1,234) */
export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}
