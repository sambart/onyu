import { type NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/auth/',
  '/api/',
  '/_next/',
  '/favicon.ico',
  '/discord_onyu_logo_03.png',
  '/privacy',
  '/terms',
  '/landing/',
];
const LOCALE_COOKIE = 'NEXT_LOCALE';
const SUPPORTED_LOCALES = ['ko', 'en'];
const DEFAULT_LOCALE = 'en';

function detectLocale(request: NextRequest): string {
  const acceptLang = request.headers.get('accept-language') ?? '';
  const segments = acceptLang.split(',');
  for (const segment of segments) {
    const lang = segment.split(';')[0].trim().toLowerCase().slice(0, 2);
    if (SUPPORTED_LOCALES.includes(lang)) return lang;
  }
  return DEFAULT_LOCALE;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. locale 쿠키가 없으면 Accept-Language로 감지하여 설정
  const localeCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!localeCookie) {
    const detected = detectLocale(request);
    const response = NextResponse.next();
    response.cookies.set(LOCALE_COOKIE, detected, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });

    // public 경로나 홈은 locale만 설정하고 통과
    const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
    if (isPublic || pathname === '/') return response;

    // 인증 확인
    const token = request.cookies.get('token')?.value;
    if (token) return response;

    const loginUrl = new URL('/auth/discord', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. locale 쿠키 있는 경우 — 기존 auth 로직
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic || pathname === '/') {
    return NextResponse.next();
  }

  const token = request.cookies.get('token')?.value;
  if (token) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/auth/discord', request.url);
  loginUrl.searchParams.set('returnTo', pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
