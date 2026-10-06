import { isRecord, validateInput, type ReadingInput } from './fortune';

export async function getReadingConfiguration(signal?: AbortSignal): Promise<{ siteKey: string }> {
  const response = await fetch('/api/config', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('鑑定サービスの準備中です。');
  const body: unknown = await response.json();
  if (!isRecord(body) || typeof body.siteKey !== 'string' || !body.siteKey.trim()) {
    throw new Error('鑑定サービスの準備中です。');
  }
  return { siteKey: body.siteKey };
}

export async function requestReading(input: ReadingInput, token: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch('/api/fortune', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...validateInput(input), consent: true, token }), signal,
  });
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error('鑑定サービスに接続できませんでした。時間をおいてお試しください。'); }
  if (!response.ok || !isRecord(body) || typeof body.reading !== 'string' || !body.reading.trim()) {
    throw new Error(isRecord(body) && typeof body.error === 'string' ? body.error : '鑑定を完了できませんでした。');
  }
  return body.reading;
}
