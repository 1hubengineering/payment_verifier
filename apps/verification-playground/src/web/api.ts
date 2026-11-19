export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createApi(onUnauthorized: () => void) {
  return async function api<T>(
    path: string,
    method = 'GET',
    payload?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await fetch(`/api/${path}`, {
      method,
      headers: {
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
    if (response.status === 204) return undefined as T;
    if (response.status === 401 && !path.startsWith('auth/')) onUnauthorized();
    const body: unknown = await response.json();
    if (
      !response.ok &&
      !(response.status === 503 && body && typeof body === 'object' && 'result' in body)
    ) {
      const failure = body as { code?: string; message?: string } | null;
      throw new ApiError(
        response.status,
        failure?.code ?? 'REQUEST_FAILED',
        failure?.message ?? 'The server rejected the request.',
      );
    }
    return body as T;
  };
}
export type Api = ReturnType<typeof createApi>;
