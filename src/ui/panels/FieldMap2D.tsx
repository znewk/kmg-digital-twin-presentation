import { FIELD_LINKS, FIELD_OBJECTS, OBJECT_BY_ID, type ObjectKind } from '../../data/fieldObjects';
import { MODULES, moduleName, SOURCE_META } from '../../data/modules';
import { useShow } from '../../store/useShow';
import { usePanelProgress } from './usePanelProgress';
import { FullScreenPanel as FullScreen } from './kit';

/**
 * Карта объектов месторождения — шаг 5 открывающей последовательности (§3.1).
 *
 * Гибрид двух референсов: картографическая подложка как в Nedra.DATA и точная
 * раскладка объектов со связями как на карте объектов сценария. Объекты
 * кликабельны уже здесь, на плоском виде, — и используют тот же реестр, что и
 * 3D-сцена, поэтому карта и модель не могут разъехаться.
 */

/** Метры сцены → координаты SVG. Карта повторяет раскладку 3D один в один. */
const VB_W = 1000;
const VB_H = 620;
const sx = (x: number) => VB_W / 2 + x * 0.6;
const sy = (z: number) => VB_H / 2 + z * 0.6;

const MEDIUM_COLOR = {
  oil: 'var(--color-oil)',
  water: 'var(--color-water)',
  chem: 'var(--color-chem)',
  power: 'var(--color-txt-faint)',
} as const;

/** Условный знак по типу объекта — как на промысловых схемах. */
function ObjectGlyph({ kind, active }: { kind: ObjectKind; active: boolean }) {
  const c = active ? 'var(--color-plast)' : 'var(--color-skv)';
  const w = 1.6;
  switch (kind) {
    case 'processing':
      return (
        <g stroke={c} strokeWidth={w} fill="none">
          <rect x={-11} y={-9} width={22} height={18} />
          <circle cx={-4} cy={0} r={3.6} />
          <circle cx={5} cy={0} r={3.6} />
        </g>
      );
    case 'pump':
      return (
        <g stroke={c} strokeWidth={w} fill="none">
          <circle cx={0} cy={0} r={9} />
          <path d="M-9 0 L0 -6 L0 6 Z" fill={c} stroke="none" />
        </g>
      );
    case 'separation':
      return (
        <g stroke={c} strokeWidth={w} fill="none">
          <rect x={-12} y={-6} width={24} height={12} rx={6} />
        </g>
      );
    case 'chemical':
      return (
        <g stroke={c} strokeWidth={w} fill="none">
          <rect x={-8} y={-9} width={16} height={18} />
          <path d="M-8 -3 H8" />
        </g>
      );
    case 'power':
      return (
        <g stroke={c} strokeWidth={w} fill="none">
          <path d="M0 -10 L-7 9 L7 9 Z" />
          <path d="M-4 2 H4" />
        </g>
      );
    case 'well':
      return (
        <g stroke={c} strokeWidth={w} fill="none">
          <circle cx={0} cy={0} r={5} />
          <path d="M0 -9 V9 M-9 0 H9" />
        </g>
      );
    case 'control':
      return (
        <g stroke={c} strokeWidth={w} fill="none">
          <rect x={-10} y={-7} width={20} height={14} />
          <path d="M-5 7 V10 M5 7 V10" />
        </g>
      );
    case 'pipeline':
      return (
        <g stroke={c} strokeWidth={w} fill="none">
          <path d="M-11 0 H11" />
          <circle cx={0} cy={0} r={4} />
        </g>
      );
    default:
      // Кустовая площадка: контур обваловки с устьями внутри.
      return (
        <g stroke={c} strokeWidth={w} fill="none">
          <rect x={-13} y={-9} width={26} height={18} />
          <circle cx={-5} cy={0} r={2.4} fill={c} />
          <circle cx={5} cy={0} r={2.4} fill={c} />
        </g>
      );
  }
}

export function FieldMap2DPanel() {
  const t = usePanelProgress();
  const naming = useShow((s) => s.naming);
  const selected = useShow((s) => s.selected);
  const select = useShow((s) => s.select);
  const hovered = useShow((s) => s.hovered);
  const hover = useShow((s) => s.hover);

  const focus = selected ?? hovered;
  const focusObj = focus ? OBJECT_BY_ID.get(focus) : undefined;

  return (
    <FullScreen>
      <div className="grid h-full gap-5" style={{ gridTemplateColumns: '1fr 19rem' }}>
        <div className="relative min-h-0">
          <div className="kicker mb-1 text-[var(--color-dob)]">
            Молдабек Восточный · карта объектов
          </div>
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="h-[calc(100%-1.5rem)] w-full">
            {/* Картографическая подложка: сетка координат и граница участка */}
            <defs>
              <pattern id="fm-grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path
                  d="M50 0 H0 V50"
                  fill="none"
                  stroke="var(--color-line)"
                  strokeWidth={0.5}
                  opacity={0.5}
                />
              </pattern>
            </defs>
            <rect width={VB_W} height={VB_H} fill="url(#fm-grid)" />
            <rect
              x={sx(-700)}
              y={sy(-450)}
              width={1400 * 0.6}
              height={900 * 0.6}
              fill="none"
              stroke="var(--color-ok)"
              strokeWidth={1.2}
              strokeDasharray="8 6"
              opacity={0.55}
            />
            <text
              x={sx(-700) + 6}
              y={sy(-450) + 14}
              fontSize={9}
              className="fill-[var(--color-ok)]"
              opacity={0.7}
            >
              граница лицензионного участка
            </text>

            {/* Связи между объектами */}
            {FIELD_LINKS.map((l, i) => {
              const a = OBJECT_BY_ID.get(l.from);
              const b = OBJECT_BY_ID.get(l.to);
              if (!a || !b) return null;
              if (i / FIELD_LINKS.length > t) return null;
              const dim = focus !== null && focus !== l.from && focus !== l.to;
              return (
                <line
                  key={i}
                  x1={sx(a.x)}
                  y1={sy(a.z)}
                  x2={sx(b.x)}
                  y2={sy(b.z)}
                  stroke={MEDIUM_COLOR[l.medium]}
                  strokeWidth={l.medium === 'power' ? 1 : 1.8}
                  strokeDasharray={l.medium === 'power' ? '4 4' : undefined}
                  opacity={dim ? 0.14 : 0.72}
                />
              );
            })}

            {/* Объекты */}
            {FIELD_OBJECTS.map((o, i) => {
              if (i / FIELD_OBJECTS.length > t) return null;
              const active = focus === o.id;
              const dim = focus !== null && !active;
              return (
                <g
                  key={o.id}
                  transform={`translate(${sx(o.x)} ${sy(o.z)})`}
                  opacity={dim ? 0.3 : 1}
                  className="cursor-pointer"
                  onPointerEnter={() => hover(o.id)}
                  onPointerLeave={() => hover(null)}
                  onClick={() => select(selected === o.id ? null : o.id)}
                >
                  {active && (
                    <circle r={20} fill="var(--color-plast)" opacity={0.16} />
                  )}
                  {/* Прозрачная мишень — по тонким штрихам попасть трудно */}
                  <circle r={18} fill="transparent" />
                  <ObjectGlyph kind={o.kind} active={active} />
                  <text
                    y={o.labelDy ?? -14}
                    textAnchor="middle"
                    fontSize={11}
                    className={active ? 'fill-[var(--color-plast)]' : 'fill-[var(--color-txt)]'}
                  >
                    {o.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Боковая колонка: подсказка либо карточка выбранного объекта */}
        <div className="flex min-h-0 flex-col border-l border-[var(--color-line)] pl-4">
          {focusObj ? (
            <>
              <div className="kicker text-[var(--color-plast)]">{focusObj.subtitle ?? 'Объект'}</div>
              <div className="mt-1 font-[family-name:var(--font-display)] text-[1.15rem] leading-tight font-semibold">
                {focusObj.label}
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                {focusObj.params.map((p) => (
                  <div key={p.label} className="flex items-baseline justify-between gap-2">
                    <span className="text-[0.62rem] text-[var(--color-txt-dim)]">{p.label}</span>
                    <span className="shrink-0 font-mono text-[0.72rem]">
                      {p.value}
                      {p.unit && (
                        <span className="ml-1 text-[0.55rem] text-[var(--color-txt-faint)]">
                          {p.unit}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-[var(--color-line)] pt-2">
                <div className="kicker mb-1.5">Модули</div>
                <div className="flex flex-col gap-1">
                  {focusObj.modules.map((mid) => {
                    const m = MODULES[mid];
                    return (
                      <span
                        key={mid}
                        className="font-mono text-[9.5px] tracking-[0.06em]"
                        style={{ color: SOURCE_META[m.source].colorVar }}
                      >
                        {moduleName(m, naming)}
                      </span>
                    );
                  })}
                </div>
              </div>

              {focusObj.pilotScope && (
                <div className="mt-3 border-t border-[var(--color-line)] pt-2 text-[0.58rem] leading-tight text-[var(--color-txt-faint)]">
                  периметр пилота: {focusObj.pilotScope}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full flex-col justify-center gap-3">
              <div className="kicker">Кликните по объекту</div>
              <p className="text-[0.7rem] leading-relaxed text-[var(--color-txt-dim)]">
                Цифровой двойник месторождения состоит из цифровых копий реальных объектов
                физического мира. У каждого объекта — свои показатели и свой набор модулей.
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {(
                  [
                    ['oil', 'нефть'],
                    ['water', 'вода ППД'],
                    ['chem', 'реагент'],
                    ['power', 'электроснабжение'],
                  ] as const
                ).map(([k, l]) => (
                  <span
                    key={k}
                    className="flex items-center gap-2 text-[0.6rem] text-[var(--color-txt-dim)]"
                  >
                    <span
                      className="inline-block h-0.5 w-5"
                      style={{ background: MEDIUM_COLOR[k] }}
                    />
                    {l}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </FullScreen>
  );
}
