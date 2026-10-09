export const GENDERS = ['女性', '男性', 'その他'] as const;
export type Gender = (typeof GENDERS)[number];
export type ImageKind = 'face' | 'right' | 'left';
export const IMAGE_KINDS: ImageKind[] = ['face', 'right', 'left'];
export interface Photo { data: string; preview: string; name: string }
export interface ReadingInput { gender: Gender; images: string[] }
export const MAX_PIXELS = 24_000_000;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_ENCODED_LENGTH = 1_000_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateInput(value: unknown): ReadingInput {
  if (!isRecord(value) || !GENDERS.includes(value.gender as Gender)) {
    throw new Error('性別を選択してください。');
  }
  if (!Array.isArray(value.images) || value.images.length !== 3 || value.images.some(
    (image: unknown) => typeof image !== 'string' || image.length < 4 ||
      image.length > MAX_ENCODED_LENGTH || !/^[A-Za-z0-9+/]+={0,2}$/.test(image),
  )) throw new Error('顔・右手・左手の写真を3枚選び直してください。');
  return { gender: value.gender as Gender, images: value.images as string[] };
}

export function imageDimensions(width: number, height: number): [number, number] {
  if (width <= 0 || height <= 0 || width * height > MAX_PIXELS) throw new Error('写真は2400万画素以下にしてください。');
  const scale = Math.min(1, 1280 / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

async function photoType(file: File): Promise<string> {
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte)) return 'image/png';
  const text = (start: number, end: number) => String.fromCharCode(...header.slice(start, end));
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  if (text(4, 8) === 'ftyp' && header.length >= 16) {
    const end = Math.min(new DataView(header.buffer).getUint32(0), header.length);
    const brands = [text(8, 12)];
    for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(text(offset, offset + 4));
    if (!brands.some(brand => ['avif', 'avis'].includes(brand)) &&
      brands.some(brand => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand))) {
      return 'image/heic';
    }
  }
  throw new Error('JPEG・PNG・WebP・HEICの写真を選択してください。');
}

async function loadPhoto(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('写真を読み込めませんでした。別の写真を選択してください。'));
      timer = setTimeout(() => {
        image.src = '';
        reject(new Error('写真の読み込みが時間切れになりました。小さい写真で再度お試しください。'));
      }, 30_000);
      image.src = url;
    });
    return image;
  } finally {
    clearTimeout(timer); image.onload = null; image.onerror = null;
    URL.revokeObjectURL(url);
  }
}

async function convertHeic(file: File): Promise<Blob> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      import('heic-to/csp').then(({ heicTo }) => heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 })),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), 45_000);
      }),
    ]);
  } catch {
    throw new Error('HEIC写真を変換できませんでした。JPEGの写真を選ぶか、Safari・Chromeで開いてお試しください。');
  } finally { clearTimeout(timer); }
}

export async function preparePhoto(file: File): Promise<Photo> {
  if (file.size > MAX_IMAGE_BYTES) throw new Error('写真は1枚20MB以下にしてください。');
  if (!file.size) throw new Error('写真が空です。写真を選び直してください。');
  const type = await photoType(file);
  let image: HTMLImageElement;
  try { image = await loadPhoto(new Blob([file], { type })); }
  catch (error) {
    if (type !== 'image/heic') throw error;
    image = await loadPhoto(await convertHeic(file));
  }
  const canvas = document.createElement('canvas');
  try {
    const [width, height] = imageDimensions(image.naturalWidth, image.naturalHeight);
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('このブラウザでは写真を処理できません。');
    context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const preview = canvas.toDataURL('image/jpeg', 0.82);
    const data = preview.split(',')[1];
    if (!data || data.length > MAX_ENCODED_LENGTH) throw new Error('写真が大きすぎます。小さくして再選択してください。');
    return { name: file.name, preview, data };
  } finally { canvas.width = 1; canvas.height = 1; }
}

export const SAMPLE_READING = `これは鑑定のサンプルです。写真の分析やGeminiとの通信は行っていません。

1. 本質と全体像
あんたの中には、「自分のペースを大切にしたい気持ち」と「新しい世界に飛び込みたい気持ち」が同居してるんちゃうかな。どっちかを捨てる必要はないで。小さな挑戦を、心地いい日常にひとつ混ぜてみる。それがあんたらしい一歩になる。

2. 人相鑑定
実際の鑑定では、写真に写った顔の特徴を人相学の象徴として読み解きます。容姿から性格や未来を事実として決めつけることはしません。顔を正面から、明るい場所で撮影すると特徴が伝わりやすくなります。

3. 手相鑑定
左手は生まれ持った可能性、右手はこれまでの選択の象徴として読むんや。実際の鑑定では、左右の見える線を区別して言葉にするで。手首から指先まで入れて、手のひらに影が落ちない写真を選んでな。

4. 星紡ぎからの直言
未来を変えるんは、占いの結果やなくて、あんた自身の小さな行動や。今日は「気になってたけど後回しにしてたこと」をひとつだけやってみて。完璧やなくてええ。星は、歩き出したあんたの味方やで。`;
