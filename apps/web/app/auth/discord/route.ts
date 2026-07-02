import { type NextRequest, NextResponse } from 'next/server';

import { isSafeReturnPath } from '@/app/lib/safe-redirect';

export async function GET(request: NextRequest) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  const returnTo = request.nextUrl.searchParams.get('returnTo');

  const response = NextResponse.redirect(`${apiUrl}/auth/discord`);

  if (isSafeReturnPath(returnTo)) {
    response.cookies.set('returnTo', returnTo, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutes
      path: '/',
    });
  }

  return response;
}
