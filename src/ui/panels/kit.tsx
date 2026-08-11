import type { ReactNode } from 'react';

/**
 * Общий набор виджетов для всех 2D-панелей модулей.
 *
 * Реальные интерфейсы (t-Navigator, NUMEX, INFRAPLAN, RTM, WWO, мнемосхема,
 * NDP) — светлые и разноцветные. По ТЗ §6 их не копируют один в один: панели
 * узнаваемо повторяют структуру и типы виджетов, но приведены к единой тёмной
 * палитре, иначе между 3D-миром и панелями возникает визуальный разрыв.
 *
 * Всё на SVG: чёткая графика на любом разрешении, без канвасов и растров, и
 * прорисовка управляется одним числом `t` — тем же прогрессом такта.
 */

/**
 * Полноэкранная схема (блоки 1, 2, 6, 7, 8 и итог) — у них нет одного
 * владельца-модуля, поэтому они идут без PanelFrame.
 *
 * `fit` подгоняет раму под содержимое и центрирует по вертикали: схемы вроде
 * цепочки UPSTREAM занимают треть высоты, и растянутая на весь кадр рама
 * оставляет под ними мёртвое поле.
 */
export function FullScreenPanel({
  fit = false,
  sheet = false,
  children,
}: {
  fit?: boolean;
  /** Нижняя полка: занимает низ кадра, оставляя верх сцене (глобус, поле). */
  sheet?: boolean;
  children: ReactNode;
}) {
  const box = sheet
    ? 'inset-x-10 bottom-24 max-h-[56vh]'
    : fit
      ? 'inset-x-16 top-1/2 max-h-[62vh] -translate-y-1/2'
      // Нижняя граница подобрана под компактную строку титров (bottom-12,
      // высота ~3rem): панель кончается ровно над ней, а не за полэкрана до.
      : 'inset-x-12 top-16 bottom-28';
  return (
    <div className={`panel pointer-events-auto absolute overflow-hidden p-6 ${box}`}>{children}</div>
  );
}

export function PanelGrid({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div className="grid h-full min-h-0 gap-4" style={{ gridTemplateColumns: cols }}>
      {children}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="kicker mb-2 shrink-0">{title}</div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** Крупный показатель. Тон подчёркивает риск, а не украшает. */
export function KpiTile({
  value,
  label,
  unit,
  tone = 'plain',
}: {
  value: string;
  label: string;
  unit?: string;
  tone?: 'plain' | 'ok' | 'warn' | 'risk';
}) {
  const color =
    tone === 'risk'
      ? 'var(--color-risk)'
      : tone === 'warn'
        ? 'var(--color-warn)'
        : tone === 'ok'
          ? 'var(--color-ok)'
          : 'var(--color-txt)';
  return (
    <div
      className="border-l-2 py-1.5 pl-2.5"
      style={{ borderColor: color, background: 'oklch(24% 0.02 250 / 0.35)' }}
    >
      <div className="font-mono text-[1.15rem] leading-none" style={{ color }}>
        {value}
        {unit && <span className="ml-1 text-[0.6rem] text-[var(--color-txt-dim)]">{unit}</span>}
      </div>
      <div className="mt-1 text-[0.62rem] leading-tight text-[var(--color-txt-dim)]">{label}</div>
    </div>
  );
}

/**
 * Диаграмма «Ход оптимизации» NUMEX Optimize: по X — номер расчёта, по Y —
 * целевая функция, лучшее решение выделено. Структура повторяет реальный
 * scatter из сценария, значения — того же порядка (≈1600 расчётов).
 */
export function OptimizationScatter({ t, points }: { t: number; points: [number, number][] }) {
  const W = 420;
  const H = 220;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const sx = (x: number) => 34 + ((x - x0) / (x1 - x0)) * (W - 46);
  const sy = (y: number) => H - 24 - ((y - y0) / (y1 - y0)) * (H - 40);

  const shown = points.slice(0, Math.max(1, Math.floor(points.length * t)));
  const best = points.reduce((a, b) => (b[1] > a[1] ? b : a), points[0]);
  const bestVisible = t > 0.94;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line
          key={g}
          x1={34}
          x2={W - 12}
          y1={sy(y0 + (y1 - y0) * g)}
          y2={sy(y0 + (y1 - y0) * g)}
          stroke="var(--color-line)"
          strokeWidth={0.5}
        />
      ))}
      {shown.map(([x, y], i) => (
        <circle key={i} cx={sx(x)} cy={sy(y)} r={1.5} fill="#4e8fd0" opacity={0.75} />
      ))}
      {bestVisible && (
        <>
          <circle
            cx={sx(best[0])}
            cy={sy(best[1])}
            r={9}
            fill="none"
            stroke="var(--color-risk)"
            strokeWidth={1.4}
          />
          <circle cx={sx(best[0])} cy={sy(best[1])} r={2.6} fill="var(--color-ok)" />
        </>
      )}
      <text x={34} y={H - 6} className="fill-[var(--color-txt-faint)]" fontSize={8}>
        № расчёта
      </text>
      <text
        x={6}
        y={20}
        className="fill-[var(--color-txt-faint)]"
        fontSize={8}
        transform={`rotate(-90 6 20)`}
      >
        целевая функция
      </text>
    </svg>
  );
}

/** Каротажные дорожки RTM: несколько параллельных колонок по глубине. */
export function LogTracks({
  t,
  tracks,
}: {
  t: number;
  tracks: { label: string; color: string; seed: number }[];
}) {
  const H = 240;
  const trackW = 74;
  const W = tracks.length * trackW;
  const N = 90;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {tracks.map((tr, ti) => {
        const x0 = ti * trackW + 4;
        const w = trackW - 10;
        const pts: string[] = [];
        const shown = Math.max(2, Math.floor(N * t));
        for (let i = 0; i < shown; i++) {
          const y = 18 + ((H - 26) * i) / (N - 1);
          const n =
            Math.sin(i * 0.31 + tr.seed) * 0.4 +
            Math.sin(i * 0.77 + tr.seed * 2.1) * 0.3 +
            Math.sin(i * 1.9 + tr.seed * 0.7) * 0.18;
          pts.push(`${x0 + w / 2 + n * (w / 2.3)},${y}`);
        }
        return (
          <g key={tr.label}>
            <rect
              x={x0}
              y={18}
              width={w}
              height={H - 26}
              fill="oklch(22% 0.02 250 / 0.5)"
              stroke="var(--color-line)"
              strokeWidth={0.5}
            />
            <text x={x0} y={11} fontSize={7.5} className="fill-[var(--color-txt-dim)]">
              {tr.label}
            </text>
            <polyline points={pts.join(' ')} fill="none" stroke={tr.color} strokeWidth={1.1} />
          </g>
        );
      })}
    </svg>
  );
}

/** График ТКРС по бригадам — структура диаграммы Ганта из Nedra.WWO. */
export function GanttChart({
  t,
  rows,
}: {
  t: number;
  rows: { label: string; bars: { from: number; to: number; kind: string; color: string }[] }[];
}) {
  const W = 420;
  const rowH = 26;
  const H = rows.length * rowH + 22;
  const left = 96;
  const sx = (v: number) => left + v * (W - left - 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {Array.from({ length: 7 }, (_, i) => (
        <line
          key={i}
          x1={sx(i / 6)}
          x2={sx(i / 6)}
          y1={14}
          y2={H - 6}
          stroke="var(--color-line)"
          strokeWidth={0.5}
        />
      ))}
      {rows.map((r, ri) => {
        const y = 20 + ri * rowH;
        return (
          <g key={r.label}>
            <text x={0} y={y + 11} fontSize={8.5} className="fill-[var(--color-txt-dim)]">
              {r.label}
            </text>
            {r.bars.map((b, bi) => {
              const full = sx(b.to) - sx(b.from);
              const w = Math.max(0, Math.min(full, full * ((t - bi * 0.08) / 0.5)));
              if (w <= 0) return null;
              return (
                <g key={bi}>
                  <rect x={sx(b.from)} y={y + 2} width={w} height={14} fill={b.color} rx={1} />
                  {w > 34 && (
                    <text
                      x={sx(b.from) + 4}
                      y={y + 12}
                      fontSize={7}
                      className="fill-[#0a1120]"
                      fontWeight={600}
                    >
                      {b.kind}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Кольцевая диаграмма потенциала — виджет из дашборда Nedra.DIGITAL TWIN. */
export function Donut({
  t,
  value,
  label,
  sub,
  color = 'var(--color-dob)',
}: {
  t: number;
  value: number;
  label: string;
  sub?: string;
  color?: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const frac = Math.min(1, Math.abs(value) / 100) * t;

  return (
    <svg viewBox="0 0 120 120" className="h-full w-full">
      <circle cx={60} cy={60} r={r} fill="none" stroke="var(--color-line)" strokeWidth={9} />
      <circle
        cx={60}
        cy={60}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeDasharray={`${c * frac} ${c}`}
        strokeLinecap="butt"
        transform="rotate(-90 60 60)"
      />
      <text
        x={60}
        y={58}
        textAnchor="middle"
        fontSize={19}
        fill={color}
        className="font-[family-name:var(--font-mono)]"
      >
        {value > 0 ? '+' : ''}
        {(value * t).toFixed(1)}%
      </text>
      <text x={60} y={74} textAnchor="middle" fontSize={7.5} fill="var(--color-txt-dim)">
        {label}
      </text>
      {sub && (
        <text x={60} y={86} textAnchor="middle" fontSize={6.5} fill="var(--color-txt-faint)">
          {sub}
        </text>
      )}
    </svg>
  );
}

/** Горизонтальные бары отклонений — «что съело добычу» в потенциалах. */
export function DeviationBars({
  t,
  rows,
}: {
  t: number;
  rows: { label: string; value: number; color?: string }[];
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)));
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => {
        const k = Math.max(0, Math.min(1, (t - i * 0.06) / 0.4));
        return (
          <div key={r.label} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate text-[0.62rem] text-[var(--color-txt-dim)]">
              {r.label}
            </span>
            <span className="relative h-3 flex-1 bg-[oklch(24%_0.02_250/0.5)]">
              <span
                className="absolute inset-y-0 left-0"
                style={{
                  width: `${(Math.abs(r.value) / max) * 100 * k}%`,
                  background: r.color ?? 'var(--color-risk)',
                }}
              />
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-[0.62rem] text-[var(--color-txt)]">
              {r.value > 0 ? '+' : ''}
              {r.value}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Таблица — источники данных NDP, дефекты трубопровода и т.п. */
export function DataTable({
  columns,
  rows,
  t = 1,
}: {
  columns: string[];
  rows: (string | ReactNode)[][];
  t?: number;
}) {
  const shown = rows.slice(0, Math.max(1, Math.ceil(rows.length * t)));
  return (
    <div className="h-full overflow-hidden">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                className="kicker border-b border-[var(--color-line)] px-2 py-1.5 font-normal"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i} className="border-b border-[oklch(72%_0.05_250/0.08)]">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className="px-2 py-1.5 text-[0.68rem] text-[var(--color-txt)] first:text-[var(--color-txt-dim)]"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Бейдж статуса внутри таблиц. */
export function Pill({ children, tone = 'ok' }: { children: ReactNode; tone?: 'ok' | 'warn' | 'risk' }) {
  const color =
    tone === 'risk' ? 'var(--color-risk)' : tone === 'warn' ? 'var(--color-warn)' : 'var(--color-ok)';
  return (
    <span
      className="border px-1.5 py-0.5 font-mono text-[8px] tracking-[0.1em] uppercase"
      style={{ borderColor: color, color }}
    >
      {children}
    </span>
  );
}
