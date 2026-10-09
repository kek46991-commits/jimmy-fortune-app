export function PalmArt({ mirrored = false, hero = false }: { mirrored?: boolean; hero?: boolean }) {
  return <svg viewBox="0 0 180 220" fill="none" aria-hidden="true" className={hero ? 'palm-art hero-palm' : 'palm-art'}>
    <g transform={mirrored ? 'translate(180 0) scale(-1 1)' : undefined} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M66 197c-1-16-8-30-17-45L28 117c-7-13 6-23 15-10l18 24-8-78c-2-16 15-19 17-3l10 60-2-86c0-15 18-15 18 0l2 83 8-68c2-15 18-12 16 2l-6 72 13-50c4-14 18-9 14 4l-12 63c-2 26-4 46-12 64l-3 23" />
      <path d="M64 124c17-22 30-17 51-23M76 115c-11 24-6 44 10 59M68 140c19-9 26-12 48-17M88 173c7-16 8-31 7-47M66 187c16-5 33-5 52 0" opacity=".7" />
      <circle cx="88" cy="139" r="3" fill="currentColor" stroke="none" />
      {hero && <><path d="M33 73h-17m8-8v16M142 165h18m-9-9v18" /><circle cx="134" cy="30" r="2" fill="currentColor" /><circle cx="38" cy="182" r="2" fill="currentColor" /></>}
    </g>
  </svg>;
}

export function FaceArt() {
  return <svg viewBox="0 0 180 220" fill="none" className="palm-art" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <path d="M50 91c-5-30 5-56 40-56s45 26 40 56c10-7 15 16 3 26-4 24-15 48-43 54-28-6-39-30-43-54-12-10-7-33 3-26Z" />
      <path d="M51 80c15-5 29-14 39-30 9 16 26 26 39 30M62 96c6-5 15-5 20-1M99 95c6-4 13-4 19 1M74 106h4m26 0h4M91 105l-5 21h10M76 141c9 5 20 5 29 0M70 164l-5 23-24 14M110 164l5 23 24 14" />
      <path d="m90 74 4 8-4 8-4-8zM33 51h14m-7-7v14M136 168h14m-7-7v14" opacity=".6" />
    </g>
  </svg>;
}

export function CelestialArt() {
  return <div className="celestial" aria-hidden="true">
    <div className="celestial-aura" /><div className="orbit orbit-one" /><div className="orbit orbit-two" />
    <svg className="celestial-chart" viewBox="0 0 500 500" fill="none">
      <circle cx="250" cy="250" r="197" stroke="currentColor" strokeWidth=".6" />
      <circle cx="250" cy="250" r="181" stroke="currentColor" strokeWidth=".6" strokeDasharray="1 8" />
      <circle cx="250" cy="250" r="153" stroke="currentColor" strokeWidth=".5" />
      <path d="m250 53 170 296H80L250 53Zm0 394L80 151h340L250 447Z" stroke="currentColor" strokeWidth=".4" opacity=".35" />
      {Array.from({ length: 12 }, (_, i) => <g key={i} transform={`rotate(${i * 30} 250 250)`}>
        <path d="M250 39v28M250 81v14" stroke="currentColor" strokeWidth=".7" />
        <circle cx="250" cy="53" r={i % 3 === 0 ? 3 : 1.5} fill="currentColor" />
      </g>)}
      <path d="m398 87 4 13 13 4-13 4-4 13-4-13-13-4 13-4Zm-318 245 4 13 13 4-13 4-4 13-4-13-13-4 13-4Z" fill="currentColor" />
    </svg>
    <PalmArt hero />
    <span className="chart-label chart-top">AS ABOVE, SO BELOW</span>
    <span className="chart-label chart-bottom">YOUR HANDS. YOUR UNIVERSE.</span>
    <span className="chart-star star-a">✧</span><span className="chart-star star-b">✦</span>
    <span className="chart-coordinate">35° N · 139° E</span>
  </div>;
}
