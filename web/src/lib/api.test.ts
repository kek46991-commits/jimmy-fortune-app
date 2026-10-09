import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReadingConfiguration, requestReading } from './api';

const input = { gender: 'その他' as const, images: ['YWJj', 'ZGVm', 'Z2hp'] };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('server-funded browser requests', () => {
  it('requests only the public configuration, with no client credential', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ siteKey: 'public-site-key', ignored: 'value' })));
    vi.stubGlobal('fetch', fetcher);
    expect(await getReadingConfiguration()).toEqual({ siteKey: 'public-site-key' });
    expect(fetcher.mock.calls[0][0]).toBe('/api/config');
  });
  it('sends photos and consent to the same-origin API without an API key', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'server-only-test-key');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ reading: '本物の鑑定文' })));
    vi.stubGlobal('fetch', fetcher);
    const abort = new AbortController();
    expect(await requestReading(input, 'verification-token', abort.signal)).toBe('本物の鑑定文');
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/api/fortune');
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(options.signal).toBe(abort.signal);
    expect(JSON.parse(options.body)).toEqual({ ...input, consent: true, token: 'verification-token' });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('server-only-test-key');
  });
  it.each([{}, { siteKey: '' }, { siteKey: 123 }])('refuses malformed service configuration: %j', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(value))));
    await expect(getReadingConfiguration()).rejects.toThrow('準備中');
  });
  it('does not fall back to Google on a missing backend', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('<html>Not found</html>', { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(requestReading(input, 'token')).rejects.toThrow('接続');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/fortune');
  });
  it('shows unavailable and quota errors without producing a sample as a real reading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"利用上限です"}', { status: 429 })));
    await expect(requestReading(input, 'token')).rejects.toThrow('利用上限');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(getReadingConfiguration()).rejects.toThrow('準備中');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"reading":"  "}')));
    await expect(requestReading(input, 'token')).rejects.toThrow('完了できません');
  });
});
