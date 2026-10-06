import sharp from 'sharp';
import { generateReading, isRecord, MAX_ENCODED_LENGTH, MAX_PIXELS, validateInput } from '../src/lib/fortune';
import { isSharedReady, json, sameOrigin, type ApiRequest, type ApiResponse } from '../server/http';
import { allowReading, verifyChallenge } from '../server/safety';

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return json(response, 405, { error: 'POSTのみ利用できます。' }); }
  if (!isSharedReady()) return json(response, 503, { error: '公開鑑定の準備中です。サンプルをお楽しみください。' });
  if (!sameOrigin(request)) return json(response, 403, { error: '鑑定ページから送信してください。' });
  if (Number(request.headers['content-length']) > 3_100_000) return json(response, 413, { error: '写真が大きすぎます。' });
  if (!isRecord(request.body) || request.body.consent !== true || typeof request.body.token !== 'string' ||
      !request.body.token || request.body.token.length > 2048) return json(response, 400, { error: '写真送信への同意と認証が必要です。' });
  let input;
  try { input = validateInput(request.body); }
  catch { return json(response, 400, { error: '性別と写真3枚を確認してください。' }); }
  const forwarded = request.headers['x-vercel-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.socket.remoteAddress) || 'unknown';
  if (!await verifyChallenge(request.body.token, request.headers.host!.split(':')[0], ip)) {
    return json(response, 403, { error: '認証が失敗しました。もう一度人間であることを確認してください。' });
  }
  try {
    if (!await allowReading(ip)) return json(response, 429, { error: '鑑定の利用上限に達しました。時間をおいてお試しください。' });
  } catch { return json(response, 503, { error: '利用回数の確認ができません。時間をおいてお試しください。' }); }
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
  } catch { return json(response, 400, { error: '写真を読み込めませんでした。JPEG・PNG・WebPで選び直してください。' }); }
  try {
    const reading = await generateReading({ gender: input.gender, images }, process.env.GEMINI_API_KEY!);
    return json(response, 200, { reading });
  } catch (error) {
    return json(response, 502, { error: error instanceof Error ? error.message : '鑑定を完了できませんでした。' });
  }
}
