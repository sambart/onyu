/**
 * 공통 API 클라이언트.
 * 모든 *-api.ts 파일에서 사용하는 fetch 래퍼.
 */

/** 백엔드가 반환하는 에러 응답 형태 */
export interface ApiErrorBody {
  statusCode: number;
  code?: string;
  message: string;
}

/** API 호출 실패 시 throw되는 에러 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** 실패 시 throw 대신 fallback 값 반환 */
  fallback?: never;
}

/**
 * JSON API 호출. 성공 시 파싱된 응답을 반환한다.
 * 실패 시 ApiError를 throw한다.
 */
export async function apiClient<T>(url: string, options?: RequestOptions): Promise<T> {
  const { body, ...rest } = options ?? {};

  const init: RequestInit = {
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...rest.headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };

  const res = await fetch(url, init);

  if (!res.ok) {
    let message = `요청 실패: ${res.status}`;
    let code: string | undefined;

    try {
      const errorBody = (await res.json()) as Partial<ApiErrorBody>;
      if (errorBody.message) message = errorBody.message;
      code = errorBody.code;
    } catch {
      // JSON 파싱 실패 시 기본 메시지 사용
    }

    throw new ApiError(res.status, message, code);
  }

  // 204 No Content 또는 빈 body
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;

  return JSON.parse(text) as T;
}

/**
 * 읽기 전용 GET 호출. 실패 시 fallback 값을 반환한다.
 * 조회 API에서 에러가 UI를 깨뜨리지 않도록 한다.
 */
export async function apiGet<T>(url: string, fallback: T): Promise<T> {
  try {
    return await apiClient<T>(url);
  } catch {
    return fallback;
  }
}
