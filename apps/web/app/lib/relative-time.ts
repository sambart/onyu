/**
 * 상대 시각 포맷 유틸리티.
 *
 * ISO 8601 문자열(또는 Date)을 현재 시각 기준 상대 표현으로 변환한다.
 * 로케일은 Intl.RelativeTimeFormat을 통해 ko/en을 지원한다.
 *
 * 사용 예:
 *   formatRelativeTime('2026-06-21T10:00:00Z', 'ko') → "방금 전"
 *   formatRelativeTime('2026-06-20T10:00:00Z', 'en') → "1 day ago"
 */

const MINUTE_SEC = 60;
const HOUR_SEC = 60 * MINUTE_SEC;
const DAY_SEC = 24 * HOUR_SEC;

/**
 * ISO 8601 날짜 문자열 또는 Date를 현재 기준 상대 시각 문자열로 반환한다.
 *
 * @param dateInput ISO 8601 문자열 또는 Date 객체
 * @param locale BCP 47 로케일 코드 (예: 'ko', 'en'). 기본값 'ko'
 * @returns 상대 시각 문자열 (예: "방금 전", "3분 전", "2시간 전", "2026. 6. 20.")
 */
export function formatRelativeTime(dateInput: string | Date, locale: string = 'ko'): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffSec < MINUTE_SEC) {
    // 방금 전 / just now
    return locale === 'ko' ? '방금 전' : 'just now';
  }

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffSec < HOUR_SEC) {
    const minutes = Math.floor(diffSec / MINUTE_SEC);
    return rtf.format(-minutes, 'minute');
  }

  if (diffSec < DAY_SEC) {
    const hours = Math.floor(diffSec / HOUR_SEC);
    return rtf.format(-hours, 'hour');
  }

  // 하루 이상: 날짜 표기
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
