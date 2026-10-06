import type { IncomingMessage, ServerResponse } from 'node:http';

export type ApiRequest = IncomingMessage & { body?: unknown };
export type ApiResponse = ServerResponse;

export function isSharedReady(): boolean {
  return ['GEMINI_API_KEY', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY',
    'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'].every(key => Boolean(process.env[key]?.trim()));
}

export function sameOrigin(request: Pick<ApiRequest, 'headers'>): boolean {
  const origin = request.headers.origin;
  if (!origin || !request.headers.host) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.host === request.headers.host;
  } catch { return false; }
}

export function webJson(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

export function toWebRequest(request: ApiRequest): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
  }
  const method = request.method ?? 'GET';
  return new Request(`https://${request.headers.host ?? 'invalid.local'}/api/fortune`, {
    method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(request.body),
  });
}

export async function sendWebResponse(output: Response, response: ApiResponse) {
  response.statusCode = output.status;
  output.headers.forEach((value, key) => response.setHeader(key, value));
  response.end(await output.text());
}
