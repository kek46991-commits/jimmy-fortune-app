import type { Config } from '@netlify/functions';
import { getConfigResponse } from '../../api/config';

export default function handler(request: Request) {
  return getConfigResponse(request.method);
}

export const config: Config = { path: '/api/config' };
