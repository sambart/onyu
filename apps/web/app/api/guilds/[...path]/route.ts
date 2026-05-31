import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_INTERNAL_URL ?? 'http://api:3000';

/**
 * API 로 전달할 요청 헤더를 구성한다.
 * 클라이언트 IP(X-Real-IP / X-Forwarded-For)를 전달해야 API throttler 가
 * web 컨테이너 IP 하나로 집계하지 않는다 (nginx 가 $remote_addr 로 덮어쓰므로 신뢰 가능).
 */
function buildForwardHeaders(request: NextRequest, token: string | undefined): HeadersInit {
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    headers['X-Real-IP'] = realIp;
  }
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    headers['X-Forwarded-For'] = forwardedFor;
  }
  return headers;
}

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  const apiPath = `/api/guilds/${path.join('/')}`;
  const queryString = request.nextUrl.search;
  const url = `${API_BASE}${apiPath}${queryString}`;

  const headers = buildForwardHeaders(request, token);

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
    return NextResponse.json({ error: 'Backend API is unreachable' }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
