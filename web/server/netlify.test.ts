import type { Context } from '@netlify/functions';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import configHandler, { config as configRoute } from '../netlify/functions/config';
import handler, { config as fortuneRoute } from '../netlify/functions/fortune';
import { MAX_REQUEST_BYTES } from './fortune';
import { allowReading, verifyChallenge } from './safety';

vi.mock('./safety', () => ({ verifyChallenge: vi.fn(), allowReading: vi.fn() }));
const context = { ip: '192.0.2.5' } as Context;
const payload = { gender: 'その他', images: ['YWJj', 'YWJj', 'YWJj'], consent: true, token: 'verified-token' };
const request = (body: unknown = payload, options: RequestInit = {}) => new Request('https://example.com/api/fortune', {
  method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' },
  body: JSON.stringify(body), ...options,
});

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ['GEMINI_API_KEY', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
    vi.stubEnv(key, key === 'GEMINI_API_KEY' ? 'private-operator-key' : 'configured-test-value');
  }
  vi.mocked(verifyChallenge).mockResolvedValue(true);
  vi.mocked(allowReading).mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Netlify server-funded functions', () => {
  it('routes both APIs and exposes only the public challenge site key', async () => {
    expect(configRoute.path).toBe('/api/config');
    expect(fortuneRoute.path).toBe('/api/fortune');
    const response = configHandler(new Request('https://example.com/api/config'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ siteKey: 'configured-test-value' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('rejects unsupported configuration methods', () => {
    const response = configHandler(new Request('https://example.com/api/config', { method: 'POST' }));
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('GET');
  });
  it.each(['GEMINI_API_KEY', 'TURNSTILE_SECRET_KEY', 'UPSTASH_REDIS_REST_TOKEN'])('stops before Google if %s is missing', async variable => {
    vi.stubEnv(variable, '');
    expect(configHandler(new Request('https://example.com/api/config')).status).toBe(503);
    expect((await handler(request(), context)).status).toBe(503);
    expect(verifyChallenge).not.toHaveBeenCalled();
  });
  it('uses the environment credential and real normalized photos, ignoring client-provided credentials', async () => {
    const png = await sharp({ create: { width: 8, height: 10, channels: 4, background: '#11223300' } }).png().toBuffer();
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{
      finishReason: 'STOP', content: { parts: [{ text: '1. 本質と全体像\nサーバーからの鑑定結果' }] },
    }] })));
    vi.stubGlobal('fetch', fetcher);
    const response = await handler(request({ ...payload, images: Array(3).fill(png.toString('base64')), apiKey: 'untrusted-client-key' }), context);
    expect(response.status).toBe(200);
    const output = await response.text();
    expect(JSON.parse(output)).toEqual({ reading: '1. 本質と全体像\nサーバーからの鑑定結果' });
    expect(output).not.toContain('private-operator-key');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toContain('gemini-3.5-flash-lite:generateContent');
    expect(url).not.toContain('private-operator-key');
    expect(options.headers['x-goog-api-key']).toBe('private-operator-key');
    expect(JSON.stringify(options)).not.toContain('untrusted-client-key');
    const geminiPayload = JSON.parse(options.body);
    expect(geminiPayload.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' });
    const parts = geminiPayload.contents[0].parts;
    const images = parts.filter((part: { inlineData?: { data: string } }) => part.inlineData);
    expect(images).toHaveLength(3);
    const meta = await sharp(Buffer.from(images[0].inlineData.data, 'base64')).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.exif).toBeUndefined();
    expect(verifyChallenge).toHaveBeenCalledWith('verified-token', 'example.com', context.ip, expect.any(AbortSignal));
    expect(allowReading).toHaveBeenCalledWith(context.ip, expect.any(AbortSignal));
  });
  it('trusts Netlify context IP, not a client-supplied forwarded header', async () => {
    await handler(request(payload, { headers: { Origin: 'https://example.com', 'Content-Type': 'application/json', 'X-Forwarded-For': 'attacker-ip' } }), context);
    expect(allowReading).toHaveBeenCalledWith(context.ip, expect.any(AbortSignal));
  });
  it('rejects wrong origins, absent client IP, unsupported content types, invalid consent, and malformed JSON', async () => {
    expect((await handler(request(payload, { headers: { Origin: 'https://other.com' } }), context)).status).toBe(403);
    expect((await handler(request(), { ip: '' } as Context)).status).toBe(503);
    expect((await handler(request(payload, { headers: { Origin: 'https://example.com', 'Content-Type': 'text/plain' } }), context)).status).toBe(415);
    expect((await handler(request({ ...payload, consent: false }), context)).status).toBe(400);
    expect((await handler(request(payload, { body: '{bad json' }), context)).status).toBe(400);
    expect(verifyChallenge).not.toHaveBeenCalled();
  });
  it('enforces the actual body size even when Content-Length is omitted or misleading', async () => {
    const headers = { Origin: 'https://example.com', 'Content-Type': 'application/json' };
    expect((await handler(request(payload, { headers: { ...headers, 'Content-Length': String(MAX_REQUEST_BYTES + 1) } }), context)).status).toBe(413);
    expect((await handler(request(payload, { body: 'a'.repeat(MAX_REQUEST_BYTES + 1) }), context)).status).toBe(413);
    expect((await handler(request(payload, { headers: { ...headers, 'Content-Length': '1' }, body: 'a'.repeat(MAX_REQUEST_BYTES + 1) }), context)).status).toBe(413);
    expect(verifyChallenge).not.toHaveBeenCalled();
  });
  it('rejects bot verification and quotas without contacting Google', async () => {
    vi.mocked(verifyChallenge).mockResolvedValue(false);
    expect((await handler(request(), context)).status).toBe(403);
    vi.mocked(verifyChallenge).mockResolvedValue(true);
    vi.mocked(allowReading).mockResolvedValue(false);
    expect((await handler(request(), context)).status).toBe(429);
    vi.mocked(allowReading).mockRejectedValue(new Error('private-operator-key'));
    const response = await handler(request(), context);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private-operator-key');
  });
  it('does not return a Google error or leak the operator key', async () => {
    const jpeg = await sharp({ create: { width: 8, height: 10, channels: 3, background: '#334455' } }).jpeg().toBuffer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private-operator-key', { status: 403 })));
    const response = await handler(request({ ...payload, images: Array(3).fill(jpeg.toString('base64')) }), context);
    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).not.toContain('private-operator-key');
    expect(body).not.toContain('APIキー');
  });
  it('stops before Google when the request has already timed out or been cancelled', async () => {
    const jpeg = await sharp({ create: { width: 8, height: 10, channels: 3, background: '#334455' } }).jpeg().toBuffer();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const response = await handler(request({ ...payload, images: Array(3).fill(jpeg.toString('base64')) }, { signal: AbortSignal.abort() }), context);
    expect(response.status).toBe(504);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
