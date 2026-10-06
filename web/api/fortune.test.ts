import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import handler from './fortune';
import configHandler from './config';

vi.mock('../server/safety', () => ({ verifyChallenge: vi.fn(), allowReading: vi.fn() }));
vi.mock('../server/gemini', async importOriginal => {
  const original = await importOriginal<typeof import('../server/gemini')>();
  return { ...original, generateReading: vi.fn() };
});
import { verifyChallenge, allowReading } from '../server/safety';
import { generateReading } from '../server/gemini';

function response() {
  let output: unknown;
  const res = { statusCode: 0, setHeader: vi.fn(), end: (text: string) => { output = JSON.parse(text); } };
  return { res: res as unknown as ServerResponse, output: () => output };
}
const request = (body: unknown, method = 'POST') => ({
  method, body, headers: { host: 'example.com', origin: 'https://example.com', 'content-type': 'application/json', 'x-vercel-forwarded-for': '1.2.3.4' },
  socket: { remoteAddress: '1.2.3.4' },
}) as unknown as IncomingMessage & { body: unknown };

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ['GEMINI_API_KEY', 'TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) vi.stubEnv(key, 'test-only');
  vi.mocked(verifyChallenge).mockResolvedValue(true);
  vi.mocked(allowReading).mockResolvedValue(true);
  vi.mocked(generateReading).mockResolvedValue('鑑定結果');
});

describe('public Vercel functions', () => {
  it('exposes only the public site key', async () => {
    const { res, output } = response(); await configHandler(request({}, 'GET'), res);
    expect(res.statusCode).toBe(200); expect(output()).toEqual({ siteKey: 'test-only' });
    expect(res.setHeader).toHaveBeenCalledWith('cache-control', 'no-store');
  });
  it('rejects non-POST requests and missing credentials', async () => {
    let output = response(); await handler(request({}, 'GET'), output.res); expect(output.res.statusCode).toBe(405);
    vi.stubEnv('GEMINI_API_KEY', ''); output = response(); await handler(request({}), output.res); expect(output.res.statusCode).toBe(503);
    expect(generateReading).not.toHaveBeenCalled();
  });
  it('rejects other origins and missing consent', async () => {
    let output = response(); const req = request({}); req.headers.origin = 'https://other.test';
    await handler(req, output.res); expect(output.res.statusCode).toBe(403);
    output = response(); await handler(request({ gender: '男性', images: ['YWJj', 'YWJj', 'YWJj'], token: 'mock' }), output.res);
    expect(output.res.statusCode).toBe(400); expect(verifyChallenge).not.toHaveBeenCalled();
  });
  it('rejects invalid captcha and exhausted quotas before calling Gemini', async () => {
    const body = { gender: '男性', images: ['YWJj', 'YWJj', 'YWJj'], token: 'mock', consent: true };
    vi.mocked(verifyChallenge).mockResolvedValue(false);
    let output = response(); await handler(request(body), output.res); expect(output.res.statusCode).toBe(403);
    vi.mocked(verifyChallenge).mockResolvedValue(true); vi.mocked(allowReading).mockResolvedValue(false);
    output = response(); await handler(request(body), output.res); expect(output.res.statusCode).toBe(429);
    expect(generateReading).not.toHaveBeenCalled();
  });
  it('fails closed if quota storage is unavailable', async () => {
    vi.mocked(allowReading).mockRejectedValue(new Error('test-only'));
    const output = response(); await handler(request({ gender: '男性', images: ['YWJj', 'YWJj', 'YWJj'], token: 'mock', consent: true }), output.res);
    expect(output.res.statusCode).toBe(503); expect(JSON.stringify(output.output())).not.toContain('test-only');
  });
  it('validates actual image bytes, not just MIME labels', async () => {
    const output = response(); await handler(request({ gender: '男性', images: ['YWJj', 'YWJj', 'YWJj'], token: 'mock', consent: true }), output.res);
    expect(output.res.statusCode).toBe(400); expect(generateReading).not.toHaveBeenCalled();
  });
  it('normalizes image data and returns real model text', async () => {
    const png = await sharp({ create: { width: 10, height: 12, channels: 4, background: '#ab667700' } }).png().toBuffer();
    const output = response(); await handler(request({ gender: 'その他', images: Array(3).fill(png.toString('base64')), token: 'mock', consent: true }), output.res);
    expect(output.res.statusCode).toBe(200); expect(output.output()).toEqual({ reading: '鑑定結果' });
    const [input, credential] = vi.mocked(generateReading).mock.calls[0];
    expect(credential).toBe('test-only'); expect(input.gender).toBe('その他');
    expect(input.images).toHaveLength(3);
    const meta = await sharp(Buffer.from(input.images[0], 'base64')).metadata();
    expect(meta.format).toBe('jpeg'); expect(meta.exif).toBeUndefined();
  });
});
