import { useEffect, useRef } from 'react';

interface TurnstileApi {
  render: (element: HTMLElement, options: {
    sitekey: string; action: string; theme: string; callback: (token: string) => void;
    'expired-callback': () => void; 'error-callback': () => void;
  }) => string;
  remove: (id: string) => void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

export default function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | undefined;
    let stopped = false;
    const render = () => {
      if (stopped || !container.current || !window.turnstile) return;
      widget = window.turnstile.render(container.current, {
        sitekey: siteKey, action: 'fortune', theme: 'dark', callback: onToken,
        'expired-callback': () => onToken(''), 'error-callback': () => onToken(''),
      });
    };
    let script = document.querySelector<HTMLScriptElement>('#turnstile-script');
    if (window.turnstile) render();
    else {
      if (!script) {
        script = document.createElement('script'); script.id = 'turnstile-script'; script.async = true;
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        document.head.append(script);
      }
      script.addEventListener('load', render);
    }
    return () => {
      stopped = true; script?.removeEventListener('load', render);
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey, onToken]);
  return <div ref={container} className="turnstile" />;
}
