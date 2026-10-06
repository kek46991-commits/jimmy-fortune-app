import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, Copy, Download, Fingerprint, Hand, LoaderCircle, LockKeyhole, Moon, Orbit, ScanFace, Share2, ShieldCheck, Sparkles, Star, Trash2, Upload, X } from 'lucide-react';
import { CelestialArt, FaceArt, PalmArt } from './components/Illustrations';
import Turnstile from './components/Turnstile';
import { GENDERS, IMAGE_KINDS, preparePhoto, SAMPLE_READING, type Gender, type ImageKind, type Photo } from './lib/fortune';
import { getReadingConfiguration, requestReading } from './lib/api';

const PHOTO_INFO = {
  face: { label: '顔写真', english: 'FACE READING', hint: '正面から、明るい場所で', description: '表情に宿る、あなたらしさ', icon: ScanFace },
  right: { label: '右手の手相', english: 'RIGHT PALM', hint: '指先から手首まで入れて', description: '今のあなたと、これからの道', icon: Hand },
  left: { label: '左手の手相', english: 'LEFT PALM', hint: '手のひらの線が見えるように', description: '生まれ持った、まだ眠る可能性', icon: Fingerprint },
};
const emptyPhotos = (): Record<ImageKind, Photo | null> => ({ face: null, right: null, left: null });

export default function App() {
  const [photos, setPhotos] = useState(emptyPhotos);
  const [gender, setGender] = useState<Gender | ''>('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<ImageKind[]>([]);
  const [reading, setReading] = useState('');
  const [isSample, setIsSample] = useState(false);
  const [toast, setToast] = useState('');
  const [siteKey, setSiteKey] = useState('');
  const [token, setToken] = useState('');
  const [challenge, setChallenge] = useState(0);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const requests = useRef(0);
  const selection = useRef({ face: 0, right: 0, left: 0 });
  const controller = useRef<AbortController | null>(null);
  const result = useRef<HTMLElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  const selectedCount = IMAGE_KINDS.filter(kind => photos[kind]).length;
  const onToken = useCallback((value: string) => setToken(value), []);

  useEffect(() => {
    const abort = new AbortController();
    getReadingConfiguration(abort.signal).then(config => {
      setSiteKey(config.siteKey);
    }).catch(() => { if (!abort.signal.aborted) setServiceUnavailable(true); });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (reading) result.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }, [reading]);
  useEffect(() => {
    if (!error) return;
    errorBox.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => () => { controller.current?.abort(); }, []);

  async function choosePhoto(kind: ImageKind, file?: File) {
    if (!file || busy) return;
    const id = ++selection.current[kind];
    setError(''); setPending(previous => [...previous.filter(value => value !== kind), kind]);
    try {
      const photo = await preparePhoto(file);
      if (selection.current[kind] === id) setPhotos(previous => ({ ...previous, [kind]: photo }));
    } catch (reason) {
      if (selection.current[kind] === id) setError(reason instanceof Error ? reason.message : '写真を読み込めませんでした。');
    } finally {
      if (selection.current[kind] === id) setPending(previous => previous.filter(value => value !== kind));
    }
  }

  function clear() {
    controller.current?.abort(); requests.current++;
    IMAGE_KINDS.forEach(kind => selection.current[kind]++);
    setPhotos(emptyPhotos()); setGender(''); setConsent(false); setReading('');
    setError(''); setPending([]); setBusy(false); setIsSample(false); setToken(''); setChallenge(value => value + 1);
    setToast('写真・鑑定結果を消去しました');
  }

  async function analyze() {
    if (busy || pending.length) return;
    setError('');
    if (!gender) { setError('まず、性別を選択してください。'); return; }
    if (selectedCount !== 3) { setError('顔・右手・左手の写真を3枚選択してください。'); return; }
    if (!consent) { setError('写真の送信と、娯楽の鑑定であることへの同意が必要です。'); return; }
    if (serviceUnavailable || !siteKey) { setError('鑑定サービスの準備中です。サンプル鑑定をお楽しみください。'); return; }
    if (!token) { setError('人間であることの確認を完了してください。'); return; }
    const request = ++requests.current;
    const abort = new AbortController(); controller.current = abort;
    const timeout = window.setTimeout(() => abort.abort(), 60_000);
    const input = { gender, images: IMAGE_KINDS.map(kind => photos[kind]!.data) };
    setBusy(true); setReading(''); setIsSample(false);
    try {
      const text = await requestReading(input, token, abort.signal);
      if (requests.current === request) setReading(text);
    } catch (reason) {
      if (requests.current === request) {
        setError(abort.signal.aborted ? '通信が時間切れになりました。もう一度お試しください。' : reason instanceof Error ? reason.message : '通信に失敗しました。');
      }
    } finally {
      window.clearTimeout(timeout);
      if (requests.current === request) { setBusy(false); setToken(''); setChallenge(value => value + 1); }
    }
  }

  function sample() { if (!busy) { setIsSample(true); setReading(SAMPLE_READING); setError(''); } }
  async function share() {
    const shareData = { title: '星紡ぎ — AI手相・人相鑑定', text: '手のひらから、あなたの物語を。星紡ぎ', url: location.origin };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(shareData.url); setToast('リンクをコピーしました。Instagramのプロフィールなどに貼り付けられます'); }
    } catch { setToast('共有をキャンセルしました。アドレスバーのURLからも共有できます'); }
  }
  async function copyReading() {
    try { await navigator.clipboard.writeText(reading); setToast('鑑定結果をコピーしました'); }
    catch { setToast('コピーできませんでした。結果のテキストを選択してコピーしてください'); }
  }
  function downloadReading() {
    const url = URL.createObjectURL(new Blob(['\uFEFF星紡ぎ — ' + (isSample ? '鑑定サンプル' : 'AI鑑定結果') + '\n\n' + reading], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'hoshitsumugi-reading.txt'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>
    <div className="night-sky" aria-hidden="true" />
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#top" aria-label="星紡ぎ トップ"><span className="brand-symbol"><Sparkles size={24} /></span><span>星紡ぎ<small>HOSHITSUMUGI</small></span></a>
      <nav aria-label="メインナビゲーション"><a href="#about">星紡ぎについて</a><a href="#how">鑑定の流れ</a><a href="#faq">よくある質問</a></nav>
      <a className="nav-cta" href="#reading">鑑定をはじめる <ArrowRight size={15} /></a>
    </div></header>
    <main id="top">
      <section className="hero container">
        <div className="hero-copy"><p className="eyebrow"><span /> THE UNIVERSE WITHIN YOU</p>
          <h1>その手のひらに、<br />まだ知らない<br /><em>あなたがいる。</em></h1>
          <p className="hero-description">手に刻まれた線。表情に宿る光。<br />AIがひもとく、あなただけの星の物語。<br />やさしいだけじゃない、本音の言葉を。</p>
          <div className="hero-actions"><a className="button gold-button" href="#reading">あなたの物語をひもとく <ArrowRight size={17} /></a><button className="text-button" onClick={sample} disabled={busy}>サンプル鑑定を見る <ArrowRight size={14} /></button></div>
          <div className="hero-notes"><span><ShieldCheck size={14} /> 写真は保存しません</span><span><Moon size={14} /> 登録不要</span><span><Sparkles size={14} /> AIによる鑑定</span></div>
        </div>
        <CelestialArt />
        <a className="scroll-cue" href="#about"><span>DISCOVER YOUR STORY</span><ArrowDown size={13} /></a>
      </section>

      <div className="whisper"><span>✧</span><p>未来を決めるのではなく、<em>あなたの可能性に光を。</em></p><span>✧</span></div>

      <section id="about" className="about-section container">
        <div className="section-heading"><p className="eyebrow">A NEW KIND OF SELF-DISCOVERY</p><h2>星を読むように、<br className="mobile-only" />あなたを読み解く。</h2><p>古くから伝わる手相・人相の知恵に、AIの新しい視点を。<br />自分を見つめ直す、小さなきっかけをお届けします。</p></div>
        <div className="feature-grid">
          <article><span className="feature-icon"><Hand size={24} strokeWidth={1.3} /></span><span className="feature-number">01</span><h3>両手が語る、ふたつの物語</h3><p>左手は秘めた可能性。右手は今のあなた。<br />ふたつの手のひらから、個性をひもときます。</p></article>
          <article><span className="feature-icon"><ScanFace size={24} strokeWidth={1.3} /></span><span className="feature-number">02</span><h3>表情に宿る、あなたらしさ</h3><p>顔の特徴を人相学の象徴として読み解き、<br />まだ気づいていない魅力に光をあてます。</p></article>
          <article><span className="feature-icon"><Orbit size={24} strokeWidth={1.3} /></span><span className="feature-number">03</span><h3>本音だから、心に届く</h3><p>背中を押す、親しみある関西弁の直言。<br />今日から試せる、小さな開運アクションも。</p></article>
        </div>
      </section>

      <section id="reading" className="reading-section container">
        <div className="section-heading"><p className="eyebrow"><Star size={12} /> YOUR READING BEGINS HERE</p><h2>あなたの星の物語を、<br className="mobile-only" />ひもとく。</h2><p>必要なのは、あなたの顔と両手の写真だけ。<br />ありのままのあなたで、はじめてください。</p></div>
        <div className="reading-panel">
          <div className="panel-top"><span><span className="live-dot" /> AI手相・人相鑑定</span><small>登録不要のAI鑑定 · Gemini 2.5 Flash</small></div>
          <div className="form-step"><div className="step-title"><span>01</span><h3>あなたについて</h3><small>鑑定の言葉選びに使います</small></div>
            <fieldset className="gender-field"><legend className="sr-only">性別を選択</legend>{GENDERS.map(value => <button key={value} type="button" className={`gender-button ${gender === value ? 'selected' : ''}`} aria-pressed={gender === value} disabled={busy} onClick={() => setGender(value)}>{value}{gender === value && <Check size={14} />}</button>)}</fieldset>
          </div>
          <div className="form-step photos-step"><div className="step-title"><span>02</span><h3>写真を選択</h3><small>{selectedCount} / 3 枚選択済み</small></div>
            <div className="photo-grid">{IMAGE_KINDS.map((kind, index) => {
              const info = PHOTO_INFO[kind]; const photo = photos[kind]; const Icon = info.icon;
              return <div className={`photo-card ${photo ? 'has-photo' : ''}`} key={kind}>
                <div className="photo-card-heading"><span>0{index + 1}</span><small>{info.english}</small>{photo && <Check size={15} />}</div>
                <label className="photo-input-label" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void choosePhoto(kind, event.dataTransfer.files[0]); }}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`${info.label}を選択`} disabled={busy || pending.includes(kind)} onChange={event => { void choosePhoto(kind, event.target.files?.[0]); event.target.value = ''; }} />
                  <div className="photo-illustration">{pending.includes(kind) ? <LoaderCircle className="spin" size={30} /> : photo ? <img src={photo.preview} alt={`選択した${info.label}`} /> : kind === 'face' ? <FaceArt /> : <PalmArt mirrored={kind === 'left'} />}</div>
                  <h4>{info.label}</h4><p>{info.description}</p><span className="upload-button"><Upload size={13} />{photo ? '写真を変更' : '写真を選ぶ'}</span><small className="photo-hint">{photo ? photo.name : info.hint}</small>
                </label>
                {photo && <button type="button" className="remove-photo" aria-label={`${info.label}を削除`} disabled={busy} onClick={() => { selection.current[kind]++; setPhotos(previous => ({ ...previous, [kind]: null })); }}><X size={14} /></button>}
                <span className="photo-corner"><Icon size={14} /></span>
              </div>;
            })}</div>
            <p className="photo-format">JPEG・PNG・WebP ／ 1枚20MB・2400万画素まで <span>写真は端末内で縮小し、位置情報などのメタデータを除去します。</span></p>
          </div>
          <div className="consent-area"><label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} /><span>本人または許可を得た写真をGoogle Geminiへ送信することと、<br className="desktop-only" />鑑定が娯楽目的であり、性格や未来を確定するものではないことに同意します。</span></label><a href="#privacy">写真とプライバシーについて <ArrowRight size={12} /></a></div>
          {siteKey && <Turnstile key={challenge} siteKey={siteKey} onToken={onToken} />}
          {serviceUnavailable && <p className="form-error" role="status">鑑定サービスは準備中です。サンプル鑑定はそのままお楽しみいただけます。</p>}
          {error && <div className="form-error" role="alert" ref={errorBox} tabIndex={-1}>{error}</div>}
          <div className="submit-area"><button className="button gold-button submit-button" type="button" onClick={() => void analyze()} disabled={busy || pending.length > 0}>{busy ? <><LoaderCircle className="spin" size={19} /> 星の物語を読み解いています…</> : <><Sparkles size={18} /> AI鑑定をはじめる <ArrowRight size={18} /></>}</button><p><LockKeyhole size={12} /> 写真・結果はブラウザに保存しません</p>
            {busy && <div className="loading-details"><span className="loading-line" /><p>鑑定には最大1分ほどかかります。画面を閉じずにお待ちください。</p><button className="text-button" onClick={clear}>鑑定を中止してデータを消去</button></div>}
            {!busy && <div className="form-secondary"><button className="text-button" onClick={sample}>まずはサンプル鑑定を体験 <ArrowRight size={13} /></button><button className="text-button muted" onClick={clear}><Trash2 size={13} /> データを消去</button></div>}
          </div>
        </div>
        <p className="reading-disclaimer">占いは、未来を決めるものではありません。あなた自身の選択を大切にしてください。</p>
      </section>

      {reading && <section id="result" ref={result} className="result-section container"><div className="section-heading"><p className="eyebrow">YOUR CONSTELLATION</p><h2>{isSample ? '星紡ぎの鑑定サンプル' : 'あなたの星の物語'}</h2><p>{isSample ? 'こちらは体験用の固定サンプルです。写真の分析やAI通信は行っていません。' : 'Geminiが写真をもとに紡いだ、娯楽の鑑定結果です。'}</p></div><article className="result-card"><span className="result-tag"><Sparkles size={13} />{isSample ? 'SAMPLE · AI鑑定ではありません' : 'AI READING · 娯楽目的'}</span><div className="reading-text">{reading.split(/\n(?=[1-4][.．、]\s*)/).map((section, index) => {
        const [heading, ...body] = section.trim().split('\n');
        return index === 0 ? <p className="result-intro" key={index}>{section}</p> : <section key={index}><h3>{heading}</h3><p>{body.join('\n').trim()}</p></section>;
      })}</div><div className="result-actions"><button className="outline-button" onClick={() => void copyReading()}><Copy size={14} /> 結果をコピー</button><button className="outline-button" onClick={downloadReading}><Download size={14} /> テキストで保存</button><button className="text-button" onClick={() => void share()}><Share2 size={14} /> 星紡ぎをシェア</button></div></article></section>}

      <section id="how" className="how-section container"><div className="section-heading"><p className="eyebrow">THREE SIMPLE STEPS</p><h2>自分と向き合う、<br className="mobile-only" />ほんの数分。</h2></div><div className="how-grid">{[
        ['01', '写真を3枚選ぶ', '顔・右手・左手の写真をアップロード。明るい場所で撮った写真がおすすめです。'],
        ['02', 'AIが物語をひもとく', 'Google Geminiが、人相と両手の手相を伝統的な占いの観点で読み解きます。'],
        ['03', '本音の言葉を受け取る', '4つの視点からの鑑定と、今日からできる開運アクションをお届けします。'],
      ].map(([number, title, text]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>

      <section id="faq" className="faq-section container"><div><p className="eyebrow">A LITTLE MORE TO KNOW</p><h2>気になること、<br />お答えします。</h2><Moon size={45} strokeWidth={.7} /></div><div className="faq-list">
        <details><summary>無料で使えますか？<ChevronDown size={16} /></summary><p>サンプル鑑定は登録なし・無料で体験できます。実際のAI鑑定も、ご自身でキーを用意する必要はありません。公開サービスの利用枠内でご利用いただけます。上限に達した場合は時間をおいてお試しください。アプリ自体に決済や課金機能はありません。</p></details>
        <details id="privacy"><summary>写真や鑑定結果は保存されますか？<ChevronDown size={16} /></summary><p>写真は端末内で縮小してメタデータを除去し、同意後に運営サーバーを経由してGoogleへ送信します。写真や鑑定結果をストレージやデータベースに保存しません。不正利用対策には匿名化したIP識別子と回数のみを一時保存し、Cloudflareによる認証を利用します。ページを閉じるか「データを消去」でアプリのメモリから消去できます。保存・コピーを選んだ鑑定結果はご自身で管理してください。Google側の利用・保存方針は<a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer">Gemini APIの規約</a>をご確認ください。</p></details>
        <details><summary>どんな写真を選べばいいですか？<ChevronDown size={16} /></summary><p>顔は正面から、両手は手首から指先まで写るように撮影してください。明るい場所で、手のひらの線が見える写真がおすすめです。JPEG・PNG・WebP形式に対応しています。HEICは先にJPEGへ変換してください。</p></details>
        <details><summary>鑑定結果は科学的な診断ですか？<ChevronDown size={16} /></summary><p>いいえ。伝統的な占いを題材にした娯楽です。写真から性格、未来、健康を確定するものではなく、医療・法律・金融などの判断には利用しないでください。</p></details>
      </div></section>
      <section className="closing container"><Sparkles size={25} strokeWidth={1} /><h2>あなたの物語は、<br />まだ、続いている。</h2><p>その一歩を、星紡ぎと。</p><a className="text-button" href="#reading">自分の可能性を見つける <ArrowRight size={16} /></a></section>
    </main>
    <footer className="site-footer container"><a className="brand" href="#top"><Sparkles size={22} /><span>星紡ぎ<small>HOSHITSUMUGI</small></span></a><p>手のひらから、あなたの物語を。</p><div><a href="#privacy">プライバシー</a><button className="text-button" onClick={() => void share()}><Share2 size={13} /> リンクを共有</button><small>© {new Date().getFullYear()} HOSHITSUMUGI</small></div></footer>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
  </>;
}
