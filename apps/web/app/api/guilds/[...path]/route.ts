import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://api:3000';

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  const apiPath = `/api/guilds/${path.join('/')}`;
  const queryString = request.nextUrl.search;
  const url = `${API_BASE}${apiPath}${queryString}`;

  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (request.headers.get('content-type')) {
    headers['Content-Type'] = request.headers.get('content-type')!;
  }

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const body = await request.text();
    fetchOptions.body = body;
    console.warn(`[PROXY] ${request.method} ${apiPath} body:`, body.substring(0, 500));
  }

  try {
    const res = await fetch(url, fetchOptions);
    const data = await res.text();

    console.warn(`[PROXY] ${request.method} ${apiPath} → ${res.status}`, data.substring(0, 200));

    return new NextResponse(data, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error(`[PROXY] ${request.method} ${apiPath} → connection failed`, error);
    return NextResponse.json(
      { error: 'Backend API is unreachable' },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
