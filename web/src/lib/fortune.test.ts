import { afterEach, describe, expect, it, vi } from 'vitest';
import { imageDimensions, SAMPLE_READING, validateInput } from './fortune';
import { buildPayload, extractReading, generateReading, MODEL } from '../../server/gemini';

const input = { gender: 'その他' as const, images: ['YWJj', 'ZGVm', 'Z2hp'] };
afterEach(() => vi.unstubAllGlobals());

describe('reading input', () => {
  it('requires a selected gender and exactly three bounded base64 images', () => {
    expect(validateInput(input)).toEqual(input);
    for (const invalid of [null, {}, { ...input, gender: 'unknown' }, { ...input, images: [] },
      { ...input, images: ['YWJj', 'ZGVm', 8] }, { ...input, images: ['!!!!', 'ZGVm', 'Z2hp'] },
      { ...input, images: ['a'.repeat(1_000_001), 'ZGVm', 'Z2hp'] }]) {
      expect(() => validateInput(invalid)).toThrow();
    }
  });
  it('keeps face/right/left ordering and sends the safety instruction', () => {
    const payload = buildPayload(input);
    expect(payload.contents[0].parts.slice(1)).toEqual([
      { text: '顔写真' }, { inlineData: { mimeType: 'image/jpeg', data: 'YWJj' } },
      { text: '右手の手相' }, { inlineData: { mimeType: 'image/jpeg', data: 'ZGVm' } },
      { text: '左手の手相' }, { inlineData: { mimeType: 'image/jpeg', data: 'Z2hp' } },
    ]);
    expect(payload.systemInstruction.parts[0].text).toContain('センシティブ');
    expect(payload.systemInstruction.parts[0].text).toContain('娯楽');
  });
});
describe('image bounds', () => {
  it('shrinks landscape and portrait images without upscaling', () => {
    expect(imageDimensions(4000, 3000)).toEqual([1280, 960]);
    expect(imageDimensions(3000, 4000)).toEqual([960, 1280]);
    expect(imageDimensions(100, 50)).toEqual([100, 50]);
  });
  it('rejects zero dimensions and decompression-size bounds', () => {
    expect(() => imageDimensions(0, 12)).toThrow();
    expect(() => imageDimensions(5000, 5000)).toThrow();
  });
});
describe('Gemini response', () => {
  it('returns completed text and does not expose thought content', () => {
    expect(extractReading({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { text: 'private chain', thought: true }, { text: '鑑定結果' }, { inlineData: {} },
    ] } }] })).toBe('鑑定結果');
  });
  it.each([null, {}, { candidates: [] }, { candidates: ['invalid'] },
    { candidates: [{ finishReason: 'MAX_TOKENS' }] },
    { candidates: [{ finishReason: 'SAFETY' }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '  ' }] } }] },
  ])('rejects empty, blocked and truncated responses: %j', value => {
    expect(() => extractReading(value)).toThrow();
  });
  it('uses the API header, not a query-string key', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [{
      finishReason: 'STOP', content: { parts: [{ text: '鑑定結果' }] },
    }] })));
    vi.stubGlobal('fetch', fetcher);
    expect(await generateReading(input, 'test-credential')).toBe('鑑定結果');
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toContain(MODEL); expect(url).not.toContain('test-credential');
    expect(options.headers['x-goog-api-key']).toBe('test-credential');
  });
  it.each([400, 401, 403, 404, 429, 500])('sanitizes HTTP %i and upstream secrets', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('credential-leak', { status })));
    await expect(generateReading(input, 'credential-leak')).rejects.not.toThrow('credential-leak');
  });
  it('sanitizes network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('test-credential')));
    await expect(generateReading(input, 'test-credential')).rejects.toThrow('通信');
  });
  it('handles malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>oops</html>')));
    await expect(generateReading(input, 'test-credential')).rejects.toThrow('読み込めません');
  });
  it('labels demo content honestly', () => {
    expect(SAMPLE_READING).toContain('写真の分析やGeminiとの通信は行っていません');
    expect(SAMPLE_READING).toContain('4. 星紡ぎからの直言');
  });
});
