import type { IncomingMessage, ServerResponse } from 'node:http';

export type ApiRequest = IncomingMessage & { body?: unknown };
export type ApiResponse = ServerResponse;

export function json(response: ApiResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(body));
}

export function isSharedReady(): boolean {
  return ['GEMINI_API_KEY', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY',
    'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'].every(key => Boolean(process.env[key]?.trim()));
}

export function sameOrigin(request: ApiRequest): boolean {
  const origin = request.headers.origin;
  if (!origin || !request.headers.host) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.host === request.headers.host;
  } catch { return false; }
}
