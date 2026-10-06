import type { Config, Context } from '@netlify/functions';
import { handleFortune } from '../../server/fortune';

export default function handler(request: Request, context: Context) {
  return handleFortune(request, context.ip);
}

export const config: Config = { path: '/api/fortune' };
