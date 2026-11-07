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

/** Horizontal bars, 24px max, rounded data end, value at the tip; colour only with a printed name. */
export function BarList({ rows, format, label, col }: { rows: { label: string; value: number; colour?: string }[]; format: (v: number) => string; label: string; col: string }) {
  const W = 640, rowH = 36, Lft = 150, R = 100, H = rows.length * rowH + 6;
  const max = niceMax(Math.max(...rows.map((r) => r.value), 1) * 1.05);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full overflow-visible">
        {rows.map((r, i) => {
          const w = Math.max(4, ((W - Lft - R) * Math.max(0, r.value)) / max), yy = i * rowH + 6, c = r.colour ? `var(--color-${r.colour})` : "var(--color-ch-viator)";
          return (
            <g key={r.label}>
              <title>{`${r.label}: ${format(r.value)}`}</title>
              {r.colour && <rect x={0} y={yy + 6} width={10} height={10} rx={3} fill={c} />}
              <text x={r.colour ? 16 : 0} y={yy + 16} fontSize={15} fill="var(--color-text-muted)">{r.label}</text>
              <path d={`M${Lft},${yy} h${w - 4} a4,4 0 0 1 4,4 v14 a4,4 0 0 1 -4,4 h-${w - 4} z`} fill={c} />
              <text x={Lft + w + 8} y={yy + 16} fontSize={15} fontWeight={600} fill="var(--color-text)">{format(r.value)}</text>
            </g>
          );
        })}
      </svg>
      <TableView rows={rows.map((r) => [r.label, format(r.value)])} cols={[col, label]} />
    </div>
  );
}
