/**
 * open-redirect 방어 유틸리티.
 *
 * returnTo 파라미터를 쿠키에 저장하거나 리다이렉트 경로로 사용하기 전
 * 반드시 이 함수로 검증해야 한다.
 */

/** ASCII 제어문자(코드포인트 < 0x20) 포함 여부. */
function hasControlChar(value: string): boolean {
  const CONTROL_CHAR_MAX = 0x20;
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) < CONTROL_CHAR_MAX) {
      return true;
    }
  }
  return false;
}

/**
 * returnTo 가 사이트 내부 절대경로인지 검증한다(open-redirect 방어).
 * '//' / '/\' 는 프로토콜-상대 URL 로 외부 호스트로 빠질 수 있어 거부한다.
 * 제어문자(탭/개행 등) 포함 경로도 브라우저 URL 파서가 이를 제거해 '//evil.com' 우회에 악용되므로 거부한다.
 */
export function isSafeReturnPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (hasControlChar(path)) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//') || path.startsWith('/\\')) return false;
  return true;
}
