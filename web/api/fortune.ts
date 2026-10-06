import { handleFortune } from '../server/fortune';
import { sendWebResponse, toWebRequest, type ApiRequest, type ApiResponse } from '../server/http';

export default function handler(request: ApiRequest, response: ApiResponse) {
  const forwarded = request.headers['x-vercel-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : request.socket.remoteAddress) ?? '';
  return handleFortune(toWebRequest(request), ip).then(output => sendWebResponse(output, response));
}
