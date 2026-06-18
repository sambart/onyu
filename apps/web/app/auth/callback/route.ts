import { type NextRequest, NextResponse } from 'next/server';

import { isSafeReturnPath } from '@/app/lib/safe-redirect';

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://api:3000';

function getOrigin(request: NextRequest): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  return host ? `${proto}://${host}` : request.url;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const origin = getOrigin(request);

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=no_code', origin));
  }

  let token: string;
  try {
    const res = await fetch(`${API_BASE}/auth/discord/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      return NextResponse.redirect(new URL('/login?error=exchange_failed', origin));
    }

    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      return NextResponse.redirect(new URL('/login?error=exchange_failed', origin));
    }

    token = data.token;
  } catch (error) {
    console.error('Discord token exchange failed:', error);
    return NextResponse.redirect(new URL('/login?error=exchange_failed', origin));
  }

  const returnTo = request.cookies.get('returnTo')?.value;
  const redirectPath = isSafeReturnPath(returnTo) ? returnTo : '/select-guild';
  const response = NextResponse.redirect(new URL(redirectPath, origin));
  response.cookies.set('token', token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 60 * 60, // 1h
    path: '/',
  });

  if (returnTo) {
    response.cookies.delete('returnTo');
  }

  return response;
}
