import { afterEach, describe, expect, it, vi } from 'vitest';
import { allowReading, verifyChallenge } from './safety';
import { isSharedReady, sameOrigin, type ApiRequest } from './http';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const request = (origin: string, host: string) => ({ headers: { origin, host } }) as ApiRequest;
describe('shared API safety', () => {
  it('fails closed until all server secrets and site key are configured', () => {
    for (const key of ['GEMINI_API_KEY', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(key, '');
    expect(isSharedReady()).toBe(false);
    for (const key of ['GEMINI_API_KEY', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(key, 'mock');
    expect(isSharedReady()).toBe(true);
    vi.stubEnv('TURNSTILE_SECRET_KEY', ''); expect(isSharedReady()).toBe(false);
  });
  it('requires HTTPS same-origin submissions', () => {
    expect(sameOrigin(request('https://example.com', 'example.com'))).toBe(true);
    expect(sameOrigin(request('https://attacker.test', 'example.com'))).toBe(false);
    expect(sameOrigin(request('http://example.com', 'example.com'))).toBe(false);
    expect(sameOrigin(request('', 'example.com'))).toBe(false);
  });
  it('checks challenge success, hostname and action', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'private-test');
    for (const value of [{ success: false }, { success: true, hostname: 'evil.test', action: 'fortune' },
      { success: true, hostname: 'example.com', action: 'other' }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value))));
      expect(await verifyChallenge('token', 'example.com', '1.2.3.4')).toBe(false);
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: 'example.com', action: 'fortune' }))));
    expect(await verifyChallenge('token', 'example.com', '1.2.3.4')).toBe(true);
  });
  it('fails closed on challenge outages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('outage')));
    expect(await verifyChallenge('token', 'example.com', '1.2.3.4')).toBe(false);
  });
  it('atomically applies hourly and global quotas, without storing raw IP addresses', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'private-test');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'redis-test');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: 1 })));
    vi.stubGlobal('fetch', fetcher);
    expect(await allowReading('1.2.3.4')).toBe(true);
    const [, options] = fetcher.mock.calls[0];
    expect(options.body).toContain('EVAL'); expect(options.body).not.toContain('1.2.3.4');
    expect(JSON.parse(options.body).slice(-2)).toEqual(['5', '100']);
  });
  it('refuses exhausted quotas and fails closed on malformed quota responses', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'private-test');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"result":0}')));
    expect(await allowReading('1.2.3.4')).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"private-test"}')));
    await expect(allowReading('1.2.3.4')).rejects.toThrow('unavailable');
  });
});
