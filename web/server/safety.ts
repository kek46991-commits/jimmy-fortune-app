import { createHmac } from 'node:crypto';
import { isRecord } from '../src/lib/fortune';

export async function verifyChallenge(token: string, hostname: string, ip: string): Promise<boolean> {
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return isRecord(result) && result.success === true && result.hostname === hostname && result.action === 'fortune';
  } catch { return false; }
}

export const RATE_SCRIPT = `
local ipCount = tonumber(redis.call('GET', KEYS[1]) or '0')
local dayCount = tonumber(redis.call('GET', KEYS[2]) or '0')
if ipCount >= tonumber(ARGV[1]) or dayCount >= tonumber(ARGV[2]) then return 0 end
local i = redis.call('INCR', KEYS[1])
if i == 1 then redis.call('EXPIRE', KEYS[1], 3600) end
local d = redis.call('INCR', KEYS[2])
if d == 1 then redis.call('EXPIRE', KEYS[2], 86400) end
return 1`;

export async function allowReading(ip: string): Promise<boolean> {
  const identifier = createHmac('sha256', process.env.TURNSTILE_SECRET_KEY!).update(ip).digest('hex');
  const configured = Number(process.env.DAILY_READING_LIMIT ?? 100);
  const daily = Number.isInteger(configured) && configured > 0 && configured <= 1000 ? configured : 100;
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  if (!url.startsWith('https://')) throw new Error('Rate limit service unavailable');
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['EVAL', RATE_SCRIPT, '2', `hoshitsumugi:{quota}:ip:${identifier}`, 'hoshitsumugi:{quota}:daily', '5', String(daily)]),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Rate limit service unavailable');
  const result: unknown = await response.json();
  if (!isRecord(result) || (result.result !== 0 && result.result !== 1)) throw new Error('Rate limit service unavailable');
  return result.result === 1;
}
