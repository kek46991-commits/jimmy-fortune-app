import { isSharedReady, sendWebResponse, webJson, type ApiRequest, type ApiResponse } from '../server/http';

export function getConfigResponse(method: string): Response {
  if (method !== 'GET') return webJson(405, { error: 'GETのみ利用できます。' }, { Allow: 'GET' });
  if (!isSharedReady()) return webJson(503, { error: '鑑定サービスの準備中です。' });
  return webJson(200, { siteKey: process.env.TURNSTILE_SITE_KEY!.trim() });
}

export default function handler(request: ApiRequest, response: ApiResponse) {
  return sendWebResponse(getConfigResponse(request.method ?? 'GET'), response);
}
