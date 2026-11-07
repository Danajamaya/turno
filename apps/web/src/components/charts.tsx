// Small server-rendered charts (SVG). Each mark carries a <title> for a native
// tooltip, and every chart has a table view, so no number is colour-only.

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

function TableView({ rows, cols }: { rows: [string, string][]; cols: [string, string] }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-accent">Ver como tabla</summary>
      <table className="tnum mt-2 w-full text-left text-sm">
        <thead><tr className="border-b border-border text-xs text-text-muted"><th scope="col" className="py-1 font-semibold">{cols[0]}</th><th scope="col" className="py-1 font-semibold">{cols[1]}</th></tr></thead>
        <tbody>{rows.map(([a, b]) => <tr key={a} className="border-b border-border last:border-0"><td className="py-1">{a}</td><td className="py-1">{b}</td></tr>)}</tbody>
      </table>
    </details>
  );
}

/** One series over time: 2px line, 10% area wash, labelled end point. */
export function LineChart({ labels, values, format, label }: { labels: string[]; values: number[]; format: (v: number) => string; label: string }) {
  const W = 640, H = 220, L = 46, R = 16, T = 16, B = 28;
  const max = niceMax(Math.max(...values, 1) * 1.1);
  const last = values.length - 1;
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(1, last);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("");
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const endBelow = last > 0 && values[last - 1] > values[last];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-text-muted)">{Math.round(t).toLocaleString("es-ES")}</text>
          </g>
        ))}
        {labels.map((l, i) => (i % 2 === 0 || i === last) && <text key={l} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">{l}</text>)}
        <path d={`${path}L${x(last)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--color-ch-viator)" opacity={0.1} />
        <path d={path} fill="none" stroke="var(--color-ch-viator)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 5 : 9} fill={i === last ? "var(--color-ch-viator)" : "transparent"} stroke={i === last ? "var(--color-surface-raised)" : "none"} strokeWidth={2}>
            <title>{`${labels[i]}: ${format(v)}`}</title>
          </circle>
        ))}
        <text x={x(last) - 10} y={endBelow ? y(values[last]) + 22 : y(values[last]) - 12} textAnchor="end" fontSize={13} fontWeight={700} fill="var(--color-text)" paintOrder="stroke" stroke="var(--color-surface-raised)" strokeWidth={4}>{format(values[last])}</text>
      </svg>
      <TableView rows={labels.map((l, i) => [l, format(values[i])])} cols={["Semana", label]} />
    </div>
  );
}

/** Horizontal bars in HTML, so labels stay readable at phone width; rounded data end, value at the tip, colour only next to a printed name. */
export function BarList({ rows, format, label, col }: { rows: { label: string; value: number; colour?: string }[]; format: (v: number) => string; label: string; col: string }) {
  const max = niceMax(Math.max(...rows.map((r) => r.value), 1) * 1.05);
  return (
    <div>
      <ul className="grid gap-2.5" aria-label={label}>
        {rows.map((r, i) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 text-sm" title={`${r.label}: ${format(r.value)}`}>
            <span className="flex items-center gap-2 truncate text-text-muted">{r.colour && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: `var(--color-${r.colour})` }} />}{r.label}</span>
            <span className="flex items-center gap-2">
              <span className="anim-grow-x h-5 rounded-r-sm" style={{ width: `${Math.max(2, (Math.max(0, r.value) / max) * 80)}%`, background: `var(--color-${r.colour ?? "ch-viator"})`, animationDelay: `${i * 60}ms` }} />
              <b className="tnum shrink-0">{format(r.value)}</b>
            </span>
          </li>
        ))}
      </ul>
      <TableView rows={rows.map((r) => [r.label, format(r.value)])} cols={[col, label]} />
    </div>
  );
}

/** Weekly columns stacked by series (e.g. platforms), 2px gaps between segments, rounded top, total above. */
export function StackedColumns({ labels, series, format, label, col }: {
  labels: string[]; series: { name: string; colour: string; values: number[] }[]; format: (v: number) => string; label: string; col: string;
}) {
  const W = 640, H = 240, L = 40, R = 8, T = 22, B = 28;
  const totals = labels.map((_, i) => series.reduce((n, s) => n + s.values[i], 0));
  const max = niceMax(Math.max(...totals, 1) * 1.08);
  const band = (W - L - R) / labels.length, bw = Math.min(30, band * 0.62);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  const last = labels.length - 1;
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted" aria-hidden>
        {series.map((s) => <li key={s.name} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(--color-${s.colour})` }} />{s.name}</li>)}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-text-muted)">{Math.round(t).toLocaleString("es-ES")}</text>
          </g>
        ))}
        {labels.map((lab, i) => {
          const cx = L + band * i + band / 2;
          let acc = 0;
          const segs = series.map((s) => ({ s, v: s.values[i] })).filter((x) => x.v > 0);
          return (
            <g key={lab} className="anim-grow-y" style={{ animationDelay: `${i * 45}ms` }}>
              <title>{`${lab}: ${format(totals[i])}\n${segs.map((x) => `${x.s.name}: ${format(x.v)}`).join("\n")}`}</title>
              {segs.map((x, j) => {
                const y0 = y(acc), y1 = y(acc + x.v); acc += x.v;
                const top = j === segs.length - 1, h = Math.max(0, y0 - y1 - (top ? 0 : 2));
                return top
                  ? <path key={x.s.name} d={`M${cx - bw / 2},${y0} V${y1 + 4} a4,4 0 0 1 4,-4 h${bw - 8} a4,4 0 0 1 4,4 V${y0} Z`} fill={`var(--color-${x.s.colour})`} />
                  : <rect key={x.s.name} x={cx - bw / 2} y={y0 - h} width={bw} height={h} fill={`var(--color-${x.s.colour})`} />;
              })}
              <rect x={cx - band / 2} y={T} width={band} height={H - T - B} fill="transparent" />
              {(i === last || totals[i] === Math.max(...totals)) && totals[i] > 0 && <text x={cx} y={y(totals[i]) - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--color-text)">{format(totals[i])}</text>}
              {(i % 2 === 0 || i === last) && <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">{lab}</text>}
            </g>
          );
        })}
      </svg>
      <TableView rows={labels.map((l, i) => [l, `${format(totals[i])} (${series.filter((s) => s.values[i] > 0).map((s) => `${s.name} ${format(s.values[i])}`).join(", ")})`])} cols={[col, label]} />
    </div>
  );
}
