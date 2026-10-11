import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('key-free public interface', () => {
  it('shows photo selection and the reading button without credential fields or acquisition links', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('AI鑑定をはじめる');
    expect(html).toContain('顔写真を選択');
    expect(html).toContain('右手の手相を選択');
    expect(html).toContain('左手の手相を選択');
    expect(html.match(/accept="image\/\*,\.heic,\.heif"/g)).toHaveLength(3);
    expect(html).toContain('HEICは端末内でJPEGへ変換します');
    expect(html).toContain('外部ブラウザーで開く');
    expect(html).toContain('Gemini 3.5 Flash-Lite');
    expect(html).not.toContain('Gemini 2.5 Flash');
    for (const removed of ['Gemini APIキー設定', 'Google AI Studio', 'aistudio.google.com', 'type="password"', '個人APIキー', 'id="api-key"']) {
      expect(html).not.toContain(removed);
    }
  });
});
