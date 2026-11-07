// An illustrated cover for a tour, drawn in SVG so every tour has one before
// the guide uploads photos. The sky follows the departure time (dawn, day,
// golden hour, night), the landmark follows what the tour is about, and the
// streets behind it are generated from the tour's name, so no two look alike.

type Theme = "history" | "food" | "art" | "family" | "city";
type Sky = { top: string; bottom: string; sun: string; back: string; mid: string; front: string; accent: string; night?: boolean };
type SkyName = "dawn" | "day" | "golden" | "night";

const SKIES: Record<SkyName, Sky[]> = {
  dawn: [
    { top: "#f6b9a8", bottom: "#fde7cf", sun: "#fffaf0", back: "#e8b9b5", mid: "#c393a9", front: "#5b4672", accent: "#f2a91f" },
    { top: "#d9b8e6", bottom: "#fbe3d2", sun: "#fffaf0", back: "#d3b4cf", mid: "#a98bb5", front: "#4c3f6e", accent: "#f2a91f" },
  ],
  day: [
    { top: "#7fc0ee", bottom: "#e2f2fc", sun: "#fff4c2", back: "#b3cfe4", mid: "#7ea6c6", front: "#2b4a75", accent: "#f2a91f" },
    { top: "#6fcad0", bottom: "#e4f6f2", sun: "#fff4c2", back: "#a9d4d2", mid: "#6ea9ad", front: "#1f4f5c", accent: "#eb6834" },
    { top: "#9db4f2", bottom: "#eef0fd", sun: "#fff4c2", back: "#bcc6ea", mid: "#8b98cf", front: "#33407a", accent: "#e87ba4" },
  ],
  golden: [
    { top: "#ee8f4a", bottom: "#fbd98c", sun: "#fff3c4", back: "#eba175", mid: "#c06650", front: "#5a2d3b", accent: "#14224a" },
    { top: "#e8766b", bottom: "#f9c98a", sun: "#fff3c4", back: "#e59a87", mid: "#b35a5c", front: "#4f2a43", accent: "#14224a" },
  ],
  night: [
    { top: "#0f1a3c", bottom: "#2d417b", sun: "#f6efd2", back: "#2a3a6c", mid: "#1d2a55", front: "#0c1330", accent: "#ffd27a", night: true },
    { top: "#1b1440", bottom: "#4a3a7c", sun: "#f6efd2", back: "#3a3270", mid: "#29235a", front: "#120e2e", accent: "#ffd27a", night: true },
  ],
};

export function skyFor(time: string | null | undefined): SkyName {
  const h = time ? Number(time.slice(0, 2)) : 11;
  return h < 9 ? "dawn" : h < 16 ? "day" : h < 20 ? "golden" : "night";
}

export function themeFor(text: string): Theme {
  const s = text.toLowerCase();
  if (/famil|peque|niñ|kid|child/.test(s)) return "family";
  if (/tapa|gastr|food|vino|wine|mercado|market|cervez|beer|cocina|churro/.test(s)) return "food";
  if (/arte|art\b|museo|museum|prado|pintur|letras|literat/.test(s)) return "art";
  if (/histor|austria|real|palac|castill|catedral|medieval|legend|leyenda|fantasma|ghost|plaza mayor/.test(s)) return "history";
  return "city";
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
function rng(seed: number) { let x = seed || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** A row of buildings across the frame, with flat, gabled or chimney roofs. */
function street(rand: () => number, base: number, minH: number, maxH: number) {
  const blocks: { x: number; w: number; h: number }[] = [];
  const parts: string[] = [];
  for (let x = -10; x < 410;) {
    const w = 22 + Math.floor(rand() * 30), h = minH + Math.floor(rand() * (maxH - minH)), roof = Math.floor(rand() * 4), top = base - h;
    blocks.push({ x, w, h });
    parts.push(roof === 1 ? `M${x},${base} V${top} l${w / 2},-10 l${w / 2},10 V${base} Z`
      : roof === 2 ? `M${x},${base} V${top} h${w * 0.6} v-8 h6 v8 h${w * 0.4 - 6} V${base} Z`
      : `M${x},${base} V${top} h${w} V${base} Z`);
    x += w;
  }
  return { d: parts.join(" "), blocks };
}

function landmark(theme: Theme, cx: number, g: number, sky: Sky) {
  const f = sky.front, a = sky.accent;
  switch (theme) {
    case "history": // a domed palace church between two towers with spires, arcade below
      return (<g fill={f}>
        <rect x={cx - 70} y={g - 60} width={140} height={60} />
        <rect x={cx - 34} y={g - 86} width={68} height={28} />
        <path d={`M${cx - 34},${g - 86} a34,34 0 0 1 68,0 Z`} />
        <rect x={cx - 5} y={g - 132} width={10} height={16} /><path d={`M${cx - 7},${g - 132} l7,-12 l7,12 Z`} />
        {[-92, 76].map((dx) => (<g key={dx}><rect x={cx + dx} y={g - 104} width={16} height={104} /><path d={`M${cx + dx - 2},${g - 104} l10,-26 l10,26 Z`} /></g>))}
        {[-52, -26, 0, 26].map((dx) => <path key={dx} d={`M${cx + dx + 4},${g} v-22 a9,9 0 0 1 18,0 v22 Z`} fill={sky.mid} />)}
      </g>);
    case "food": // a market hall with a striped awning and street lamps
      return (<g>
        <path d={`M${cx - 86},${g} V${g - 52} Q${cx},${g - 96} ${cx + 86},${g - 52} V${g} Z`} fill={f} />
        <path d={`M${cx - 60},${g - 58} Q${cx},${g - 86} ${cx + 60},${g - 58} V${g - 50} H${cx - 60} Z`} fill={sky.mid} />
        {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${cx - 80 + i * 20},${g - 40} h20 v12 a10,10 0 0 1 -20,0 Z`} fill={i % 2 ? "#ffffff" : a} />)}
        {[-120, 112].map((dx) => (<g key={dx} fill={f}><rect x={cx + dx} y={g - 70} width={4} height={70} /><circle cx={cx + dx + 2} cy={g - 74} r={7} fill={sky.night ? "#ffd27a" : f} /></g>))}
      </g>);
    case "art": // a museum front with columns, pediment and a round tree
      return (<g fill={f}>
        <path d={`M${cx - 96},${g - 62} L${cx},${g - 100} L${cx + 96},${g - 62} Z`} />
        <rect x={cx - 90} y={g - 62} width={180} height={8} />
        {Array.from({ length: 7 }, (_, i) => <rect key={i} x={cx - 82 + i * 26} y={g - 54} width={10} height={44} />)}
        <rect x={cx - 100} y={g - 10} width={200} height={10} />
        <circle cx={cx + 140} cy={g - 52} r={28} fill={sky.mid} /><rect x={cx + 137} y={g - 30} width={6} height={30} />
      </g>);
    case "family": // a carousel with balloons
      return (<g>
        <path d={`M${cx - 70},${g - 70} L${cx},${g - 120} L${cx + 70},${g - 70} Z`} fill={a} />
        <path d={`M${cx - 70},${g - 70} ${Array.from({ length: 7 }, () => "q10,12 20,0").join(" ")} Z`} fill={a} />
        {[-56, -28, 0, 28, 56].map((dx) => <rect key={dx} x={cx + dx - 2} y={g - 70} width={4} height={60} fill={f} />)}
        <rect x={cx - 80} y={g - 12} width={160} height={12} fill={f} />
        <circle cx={cx} cy={g - 124} r={5} fill={f} />
        {([[-130, 90, "#e87ba4"], [-112, 110, "#1baf7a"], [118, 100, "#2a78d6"]] as const).map(([dx, h, c]) => (
          <g key={dx}><path d={`M${cx + dx},${g - h + 14} v${h - 14}`} stroke={f} strokeWidth={1.5} /><ellipse cx={cx + dx} cy={g - h} rx={10} ry={13} fill={c} /></g>))}
      </g>);
    default: // a corner tower with a dome and a statue on top, between two blocks
      return (<g fill={f}>
        <rect x={cx - 34} y={g - 120} width={68} height={120} />
        <path d={`M${cx - 30},${g - 120} a30,26 0 0 1 60,0 Z`} />
        <rect x={cx - 3} y={g - 160} width={6} height={16} /><circle cx={cx} cy={g - 164} r={5} fill={a} />
        <rect x={cx - 90} y={g - 70} width={52} height={70} /><rect x={cx + 40} y={g - 84} width={60} height={84} />
        {Array.from({ length: 4 }, (_, i) => <rect key={i} x={cx - 24 + (i % 2) * 30} y={g - 104 + Math.floor(i / 2) * 30} width={18} height={20} fill={sky.night ? "#ffd27a" : sky.mid} />)}
      </g>);
  }
}

/** A postcard of the city for a tour. Decorative: the tour's name is always printed next to it. */
export function TourCover({ title, time, about = "", className = "", rounded = true }: { title: string; time?: string | null; about?: string; className?: string; rounded?: boolean }) {
  const seed = hash(title), variants = SKIES[skyFor(time)], sky = variants[seed % variants.length];
  const theme = themeFor(`${title} ${about}`), rand = rng(seed);
  const g = 284; // ground line
  const back = street(rand, g, 70, 150), mid = street(rand, g, 30, 90);
  const cx = 150 + Math.floor(rand() * 100);
  const h = time ? Number(time.slice(0, 2)) + Number(time.slice(3, 5)) / 60 : 11;
  const sx = Math.min(350, Math.max(50, 50 + (((h - 6 + 24) % 24) / 16) * 300)), sy = Math.min(140, 56 + Math.abs(h - 13) * 10);
  const id = `pc${seed.toString(36)}`;
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false" className={`block h-full w-full ${rounded ? "rounded-lg" : ""} ${className}`}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={sky.top} /><stop offset="1" stopColor={sky.bottom} /></linearGradient></defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
      {sky.night
        ? Array.from({ length: 26 }, (_, i) => <circle key={i} cx={Math.floor(rand() * 400)} cy={Math.floor(rand() * 160)} r={i % 4 ? 1 : 1.8} fill="#fff" opacity={0.5 + rand() * 0.5} />)
        : [0, 1].map((i) => { const x = 40 + rand() * 300, y = 30 + rand() * 60; return <path key={i} d={`M${x},${y} a14,14 0 0 1 26,-6 a18,18 0 0 1 32,8 a10,10 0 0 1 0,20 h-58 a11,11 0 0 1 0,-22 Z`} fill="#ffffff" opacity={0.7} />; })}
      <circle cx={sx} cy={sy} r={sky.night ? 16 : 24} fill={sky.sun} />
      {sky.night && <circle cx={sx + 7} cy={sy - 5} r={14} fill={sky.top} />}
      <path d={back.d} fill={sky.back} />
      <path d={mid.d} fill={sky.mid} />
      {sky.night && mid.blocks.flatMap((b, i) => (b.h > 40 ? [<rect key={i} x={b.x + 6} y={g - b.h + 10} width={5} height={7} fill="#ffd27a" opacity={0.85} />] : []))}
      {landmark(theme, cx, g, sky)}
      <rect x="0" y={g} width="400" height={300 - g} fill={sky.front} />
    </svg>
  );
}

/** A tour's first uploaded photo when there is one, the illustrated postcard otherwise. */
export function Cover({ photo, alt = "", rounded = true, className = "", ...rest }: { photo?: string | null; alt?: string; title: string; time?: string | null; about?: string; rounded?: boolean; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (photo) return <img src={`/api/media/${photo}`} alt={alt} loading="lazy" className={`block h-full w-full object-cover ${rounded ? "rounded-lg" : ""} ${className}`} />;
  return <TourCover {...rest} rounded={rounded} className={className} />;
}
