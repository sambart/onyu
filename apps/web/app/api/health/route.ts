import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://api:3000';

/** GET /api/health — API 서버 health check 프록시 */
export async function GET(): Promise<NextResponse> {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
    const data = await res.text();

    return new NextResponse(data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 502 });
  }
}
