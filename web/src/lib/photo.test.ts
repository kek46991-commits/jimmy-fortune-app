import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ENCODED_LENGTH, MAX_IMAGE_BYTES, preparePhoto } from './fortune';

const { heicTo } = vi.hoisted(() => ({ heicTo: vi.fn() }));
vi.mock('heic-to/csp', () => ({ heicTo }));

const jpeg = [0xff, 0xd8, 0xff, 0xe0];
const png = [137, 80, 78, 71, 13, 10, 26, 10];
const webp = [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')];
function heif(brand = 'heic', compatible = 'mif1') {
  return [0, 0, 0, 20, ...Buffer.from('ftyp' + brand), 0, 0, 0, 0, ...Buffer.from(compatible)];
}
function file(bytes: number[], type = '', name = 'camera-photo') {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('local photo preparation', () => {
  let failures: number;
  let neverLoads: boolean;
  let imageWidth: number;
  let imageHeight: number;
  let canvas: { width: number; height: number; getContext: ReturnType<typeof vi.fn>; toDataURL: ReturnType<typeof vi.fn> };
  let drawImage: ReturnType<typeof vi.fn>;
  let createUrl: ReturnType<typeof vi.spyOn>;
  let revokeUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    failures = 0; neverLoads = false; imageWidth = 4000; imageHeight = 3000;
    heicTo.mockReset().mockResolvedValue(new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }));
    drawImage = vi.fn();
    canvas = {
      width: 0, height: 0,
      getContext: vi.fn().mockReturnValue({ fillStyle: '', fillRect: vi.fn(), drawImage }),
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,/9j/AA=='),
    };
    vi.stubGlobal('document', { createElement: vi.fn().mockReturnValue(canvas) });
    vi.stubGlobal('Image', class {
      naturalWidth = imageWidth;
      naturalHeight = imageHeight;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        if (!value || neverLoads) return;
        const failed = failures-- > 0;
        queueMicrotask(() => failed ? this.onerror?.() : this.onload?.());
      }
    });
    createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:photo');
    revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each([
    [jpeg, '', 'camera'], [jpeg, 'application/octet-stream', 'photo.jpg'],
    [png, '', 'photo.png'], [webp, '', 'photo.webp'], [jpeg, 'image/jpg', 'photo.jpeg'],
  ])('accepts actual image bytes despite missing or unusual MIME information (%s, %s)', async (bytes, mime, name) => {
    const photo = await preparePhoto(file(bytes, mime, name));
    expect(photo).toEqual({ name, preview: 'data:image/jpeg;base64,/9j/AA==', data: '/9j/AA==' });
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.82);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 960);
    expect(heicTo).not.toHaveBeenCalled();
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    expect(canvas.width).toBe(1);
  });

  it('uses native HEIC decoding when available without downloading the converter', async () => {
    await preparePhoto(file(heif(), 'image/heic', 'face.heic'));
    expect(heicTo).not.toHaveBeenCalled();
  });

  it.each(['heic', 'heix', 'mif1', 'msf1'])('locally converts %s when native decoding fails', async brand => {
    failures = 1;
    const source = file(heif(brand), '', 'face.heif');
    expect((await preparePhoto(source)).name).toBe('face.heif');
    expect(heicTo).toHaveBeenCalledWith({ blob: source, type: 'image/jpeg', quality: 0.9 });
    expect(createUrl).toHaveBeenCalledTimes(2);
    expect(revokeUrl).toHaveBeenCalledTimes(2);
  });

  it('rejects spoofed image MIME types and extensions before decoding', async () => {
    await expect(preparePhoto(file([...Buffer.from('<html>not a photo</html>')], 'image/jpeg', 'photo.jpg'))).rejects.toThrow('写真を選択');
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('does not mistake AVIF with a generic HEIF brand for HEIC', async () => {
    await expect(preparePhoto(file(heif('mif1', 'avif')))).rejects.toThrow('写真を選択');
    expect(heicTo).not.toHaveBeenCalled();
  });

  it('rejects empty files', async () => {
    await expect(preparePhoto(file([]))).rejects.toThrow('写真が空');
  });

  it('checks the source file byte limit before reading or decoding', async () => {
    const source = file(jpeg);
    Object.defineProperty(source, 'size', { value: MAX_IMAGE_BYTES + 1 });
    await expect(preparePhoto(source)).rejects.toThrow('20MB');
    expect(createUrl).not.toHaveBeenCalled();
  });

  it('preserves the decoded pixel limit and releases canvas memory after failure', async () => {
    imageWidth = 5000; imageHeight = 5000;
    await expect(preparePhoto(file(jpeg))).rejects.toThrow('2400万画素');
    expect(drawImage).not.toHaveBeenCalled();
    expect(canvas.width).toBe(1);
    expect(revokeUrl).toHaveBeenCalled();
  });

  it('rejects oversized encoded results', async () => {
    canvas.toDataURL.mockReturnValue('data:image/jpeg;base64,' + 'a'.repeat(MAX_ENCODED_LENGTH + 1));
    await expect(preparePhoto(file(jpeg))).rejects.toThrow('大きすぎ');
  });

  it('cleans up object URLs on a failed image load', async () => {
    failures = 1;
    await expect(preparePhoto(file(jpeg))).rejects.toThrow('写真を読み込めません');
    expect(revokeUrl).toHaveBeenCalled();
  });

  it('sanitizes HEIC conversion errors', async () => {
    failures = 1;
    heicTo.mockRejectedValue(new Error('internal decoder details'));
    await expect(preparePhoto(file(heif()))).rejects.toThrow('HEIC写真を変換できません');
  });

  it('times out a stalled file load instead of leaving the picker disabled', async () => {
    vi.useFakeTimers(); neverLoads = true;
    const assertion = expect(preparePhoto(file(jpeg))).rejects.toThrow('時間切れ');
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(revokeUrl).toHaveBeenCalled();
  });

  it('times out a stalled HEIC conversion', async () => {
    vi.useFakeTimers(); failures = 1;
    heicTo.mockReturnValue(new Promise(() => {}));
    const assertion = expect(preparePhoto(file(heif()))).rejects.toThrow('HEIC写真を変換できません');
    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
  });
});
