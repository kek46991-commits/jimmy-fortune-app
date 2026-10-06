import { isSharedReady, json, type ApiRequest, type ApiResponse } from '../server/http';

export default function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return json(response, 405, { error: 'GETのみ利用できます。' }); }
  if (!isSharedReady()) return json(response, 503, { error: '公開鑑定の準備中です。' });
  return json(response, 200, { siteKey: process.env.TURNSTILE_SITE_KEY });
}
