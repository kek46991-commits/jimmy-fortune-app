import sharp from 'sharp';
import { isRecord, MAX_ENCODED_LENGTH, MAX_PIXELS, validateInput } from '../src/lib/fortune';
import { generateReading } from './gemini';
import { isSharedReady, sameOrigin, webJson } from './http';
import { allowReading, verifyChallenge } from './safety';

export const MAX_REQUEST_BYTES = 3_100_000;

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Invalid JSON');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RangeError('Request too large');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export async function handleFortune(request: Request, ip: string): Promise<Response> {
  if (request.method !== 'POST') return webJson(405, { error: 'POSTのみ利用できます。' }, { Allow: 'POST' });
  if (!isSharedReady()) return webJson(503, { error: '鑑定サービスの準備中です。サンプルをお楽しみください。' });
  const url = new URL(request.url);
  if (!sameOrigin({ headers: { host: url.host, origin: request.headers.get('origin') ?? undefined } })) {
    return webJson(403, { error: '鑑定ページから送信してください。' });
  }
  if (!ip.trim()) return webJson(503, { error: '鑑定サービスを利用できません。時間をおいてお試しください。' });
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) return webJson(413, { error: '写真が大きすぎます。' });
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return webJson(415, { error: '鑑定ページから写真を送信してください。' });
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(50_000)]);
  let body: unknown;
  try { body = await readBody(request); }
  catch (error) {
    return webJson(error instanceof RangeError ? 413 : 400, { error: '写真を読み込めませんでした。写真3枚を選び直してください。' });
  }
  if (!isRecord(body) || body.consent !== true || typeof body.token !== 'string' ||
      !body.token || body.token.length > 2048) return webJson(400, { error: '写真送信への同意と認証が必要です。' });
  let input;
  try { input = validateInput(body); }
  catch { return webJson(400, { error: '性別と写真3枚を確認してください。' }); }
  if (!await verifyChallenge(body.token, url.hostname, ip, signal)) {
    return webJson(403, { error: '認証が失敗しました。もう一度人間であることを確認してください。' });
  }
  try {
    if (!await allowReading(ip, signal)) return webJson(429, { error: '鑑定の利用上限に達しました。時間をおいてお試しください。' });
  } catch { return webJson(503, { error: '利用回数の確認ができません。時間をおいてお試しください。' }); }
  const images: string[] = [];
  try {
    for (const data of input.images) {
      const image = sharp(Buffer.from(data, 'base64'), { limitInputPixels: MAX_PIXELS });
      const meta = await image.metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '')) throw new Error();
      const cleaned = await image.rotate().flatten({ background: '#fff' }).resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      const encoded = cleaned.toString('base64');
      if (encoded.length > MAX_ENCODED_LENGTH) throw new Error();
      images.push(encoded);
    }
  } catch { return webJson(400, { error: '写真を読み込めませんでした。JPEG・PNG・WebPで選び直してください。' }); }
  try {
    signal.throwIfAborted();
    const reading = await generateReading({ gender: input.gender, images }, process.env.GEMINI_API_KEY!.trim(), signal);
    return webJson(200, { reading });
  } catch {
    return webJson(signal.aborted ? 504 : 502, { error: signal.aborted
      ? '鑑定に時間がかかりすぎました。時間をおいてお試しください。'
      : '鑑定を完了できませんでした。時間をおいてお試しください。' });
  }
}
