import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  EXTERNAL_NODES,
  FIELD_H,
  FIELD_W,
  useFieldData,
  type FacilityKind,
  type FieldDataset,
  type WellRecord,
} from '../../data/geo/fieldData';
import {
  FACILITY_KIND,
  FLARE_STYLE,
  NETWORK_LEGEND,
  NETWORK_STYLE,
  WELL_CATEGORY,
  WELL_CATEGORY_ORDER,
  WELL_STATUS,
  WELL_STATUS_ORDER,
} from '../../data/geo/fieldStyle';
import { wellMetrics } from '../../data/geo/wellMetrics';
import {
  buildTargets,
  drawPlan,
  fitView,
  pickAt,
  planX,
  planY,
  type PickTarget,
  type PlanView,
} from './fieldPlan';
import { MODULES, moduleName, SOURCE_META, type ModuleId } from '../../data/modules';
import { useShow } from '../../store/useShow';
import { usePanelProgress } from './usePanelProgress';
import { FullScreenPanel as FullScreen } from './kit';

/**
 * Реальная схема месторождения — шаг 5 открывающей последовательности (ТЗ §3.1).
 *
 * Это не схема из презентации и не композиция «по мотивам»: план строится
 * напрямую из геоданных исполнительной съёмки 2023 г. и официального реестра
 * фонда. 1101 скважина на своих координатах со своими номерами, 188 узлов
 * сбора, 1763 трассы сетей, 57 промысловых объектов с настоящими подписями.
 *
 * Отсюда же следует, чего здесь нет. Границы лицензионного участка не
 * рисуется: контур горного отвода заказчиком не передан, а нарисованная
 * «примерно» граница на показе МЭПМ — это ровно тот случай, когда правдоподобная
 * выдумка хуже честного пропуска. Показывается фактическая граница съёмки.
 */

// ── Привязка модулей к типам объектов ───────────────────────────────────────

/**
 * Модули по типу промыслового объекта — по карте объектов сценария
 * (`image4.png`) и отчёту по обследованию. Привязка идёт к типу, а не к
 * конкретной установке: у 41 ГЗУ функционально один и тот же набор.
 */
const FACILITY_MODULES: Record<FacilityKind, ModuleId[]> = {
  sp: ['infraplan', 'digitalTwinPipe', 'digitalTwin'],
  kns: ['infraplan', 'abaiUz', 'digitalTwin'],
  gzu: ['abaiTr', 'abaiPdim', 'infraplan'],
  ktp: ['infraplan'],
};

/** Модули по категории скважины. */
const WELL_MODULES: Record<WellRecord['cat'], ModuleId[]> = {
  oil: ['abaiTr', 'abaiPgno', 'abaiPdim', 'digitalTwin'],
  inj: ['abaiUz', 'infraplan', 'digitalTwin'],
  obs: ['abaiDb', 'abaiPaegtm'],
  water: ['abaiDb', 'infraplan'],
};

const fmt = (n: number) => n.toLocaleString('ru-RU');

// ── Размер области ──────────────────────────────────────────────────────────

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size] as const;
}

// ── Слой подписей и знаков ──────────────────────────────────────────────────

/** С какого прогресса такта проявляются подписанные объекты. */
const FACILITY_FROM = 0.76;
const LABEL_FROM = 0.86;

function FacilityLayer({
  data,
  view,
  t,
  focus,
}: {
  data: FieldDataset;
  view: PlanView;
  t: number;
  focus: string | null;
}) {
  if (t < FACILITY_FROM) return null;
  const appear = Math.min(1, (t - FACILITY_FROM) / 0.1);
  const labels = t >= LABEL_FROM;

  return (
    <g>
      {data.facilities.map((f, i) => {
        const style = FACILITY_KIND[f.kind];
        const active = focus === `fac:${i}`;
        const x = planX(view, f.p[0]);
        const y = planY(view, f.p[1]);
        // Ранг задаёт размер знака: сборные пункты и КНС — узлы схемы, ГЗУ —
        // центры кустов, КТП — сопутствующая электрика.
        const r = style.rank === 1 ? 5.5 : style.rank === 2 ? 3.4 : 2.4;

        return (
          <g key={`fac-${i}`} opacity={appear * (focus && !active ? 0.35 : 1)}>
            {active && <circle cx={x} cy={y} r={r + 7} fill={style.color} opacity={0.18} />}
            <rect
              x={x - r}
              y={y - r}
              width={r * 2}
              height={r * 2}
              fill="none"
              stroke={style.color}
              strokeWidth={style.rank === 1 ? 1.4 : 1}
            />
            {style.rank === 1 && (
              <circle cx={x} cy={y} r={r * 0.4} fill={style.color} />
            )}
            {labels && style.rank <= 2 && (
              <text
                x={x}
                y={y - r - 3}
                textAnchor="middle"
                fontSize={style.rank === 1 ? 9 : 6.5}
                fill={active ? style.color : 'var(--color-txt-dim)'}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {f.name}
              </text>
            )}
          </g>
        );
      })}

      {/* Факел — фактическое положение из чертежа */}
      {data.points.flare.map((p, i) => {
        const x = planX(view, p[0]);
        const y = planY(view, p[1]);
        const active = focus === 'flare';
        return (
          <g key={`flare-${i}`} opacity={appear * (focus && !active ? 0.35 : 1)}>
            <path
              d={`M${x} ${y - 8} L${x + 4} ${y} L${x} ${y + 4} L${x - 4} ${y} Z`}
              fill={FLARE_STYLE.color}
              opacity={0.85}
            />
            {labels && (
              <text
                x={x + 8}
                y={y + 3}
                fontSize={8}
                fill="var(--color-txt-dim)"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {FLARE_STYLE.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

/**
 * Внешние узлы цепочки — ЦППН «Кенбай», МФНС, БРХ.
 *
 * Их нет в границах съёмки, и привязывать их к произвольному зданию на плане
 * нельзя. Показываются выносами за восточной границей участка — там, где
 * фактически проходит напорный нефтепровод, — с явной пометкой «за границей
 * съёмки».
 */
function ExternalLayer({ view, t }: { view: PlanView; t: number }) {
  if (t < LABEL_FROM) return null;
  const edge = planX(view, FIELD_W);
  const appear = Math.min(1, (t - LABEL_FROM) / 0.1);

  return (
    <g opacity={appear}>
      {EXTERNAL_NODES.map((node, i) => {
        const y = planY(view, FIELD_H / 2 + (node.dir[1] * FIELD_H) / 2);
        const x = edge + 14;
        return (
          <g key={node.id}>
            <line
              x1={edge}
              y1={y}
              x2={x - 3}
              y2={y}
              stroke="var(--color-txt-faint)"
              strokeWidth={0.7}
              strokeDasharray="3 3"
            />
            <circle cx={x} cy={y} r={2.6} fill="none" stroke="var(--color-txt-dim)" strokeWidth={1} />
            <text
              x={x + 6}
              y={y - 1}
              fontSize={8}
              fill="var(--color-txt-dim)"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {node.label}
            </text>
            <text x={x + 6} y={y + 8} fontSize={6} fill="var(--color-txt-faint)">
              {i === 0 ? 'за границей съёмки' : ''}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Выделение выбранной цели: кольцо и выноска с номером. */
function SelectionLayer({
  data,
  view,
  target,
}: {
  data: FieldDataset;
  view: PlanView;
  target: PickTarget | null;
}) {
  if (!target) return null;
  const x = planX(view, target.x);
  const y = planY(view, target.y);

  const label =
    target.kind === 'well'
      ? data.wells[target.index].uwi
      : target.kind === 'facility'
        ? data.facilities[target.index].name
        : FLARE_STYLE.label;

  const color =
    target.kind === 'well'
      ? WELL_CATEGORY[data.wells[target.index].cat].color
      : target.kind === 'facility'
        ? FACILITY_KIND[data.facilities[target.index].kind].color
        : FLARE_STYLE.color;

  return (
    <g pointerEvents="none">
      <circle cx={x} cy={y} r={11} fill="none" stroke={color} strokeWidth={1.2} opacity={0.9} />
      <circle cx={x} cy={y} r={18} fill="none" stroke={color} strokeWidth={0.6} opacity={0.35} />
      <line x1={x + 12} y1={y - 12} x2={x + 26} y2={y - 26} stroke={color} strokeWidth={0.8} />
      <text
        x={x + 29}
        y={y - 26}
        fontSize={10}
        fill={color}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {label}
      </text>
    </g>
  );
}

// ── Боковая колонка ─────────────────────────────────────────────────────────

function ModuleList({ ids }: { ids: ModuleId[] }) {
  const naming = useShow((s) => s.naming);
  return (
    <div className="flex flex-col gap-1">
      {ids.map((id) => {
        const m = MODULES[id];
        return (
          <span
            key={id}
            className="font-mono text-[9.5px] tracking-[0.06em]"
            style={{ color: SOURCE_META[m.source].colorVar }}
          >
            {moduleName(m, naming)}
          </span>
        );
      })}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[0.62rem] text-[var(--color-txt-dim)]">{label}</span>
      <span className="shrink-0 font-mono text-[0.72rem]" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

/** Карточка выбранной скважины: факт из реестра отделён от иллюстративного. */
function WellCard({ well }: { well: WellRecord }) {
  const cat = WELL_CATEGORY[well.cat];
  const st = WELL_STATUS[well.st];
  const metrics = wellMetrics(well);

  return (
    <>
      <div className="kicker text-[var(--color-plast)]">Скважина · реестр фонда</div>
      <div className="mt-1 font-mono text-[1.15rem] leading-tight font-semibold">{well.uwi}</div>

      <div className="mt-3 flex flex-col gap-1.5">
        <Row label="Категория" value={cat.label} color={cat.color} />
        <Row label="Состояние" value={st.label} />
        <Row label="Тип ствола" value={well.type === 'horiz' ? 'Горизонтальная' : 'Вертикальная'} />
        <Row label="Продуктивный горизонт" value={well.hor ?? '—'} />
        {well.hub !== null && <Row label="Узел сбора" value={`куст № ${well.hub}`} />}
      </div>

      <div className="mt-2 font-mono text-[8px] tracking-[0.1em] text-[var(--color-ok)]">
        ФАКТ · официальный реестр Управления разработкой КМГ
      </div>

      {metrics.length > 0 && (
        <div className="mt-4 border-t border-[var(--color-line)] pt-2">
          <div className="kicker mb-1.5">Эксплуатационные показатели</div>
          <div className="flex flex-col gap-1.5">
            {metrics.map((m) => (
              <Row key={m.label} label={m.label} value={`${m.value}${m.unit ? ` ${m.unit}` : ''}`} />
            ))}
          </div>
          <div className="mt-2 font-mono text-[8px] leading-tight tracking-[0.08em] text-[var(--color-warn)]">
            ИЛЛЮСТРАТИВНО · в реестре фонда эти показатели отсутствуют
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-[var(--color-line)] pt-2">
        <div className="kicker mb-1.5">Модули</div>
        <ModuleList ids={WELL_MODULES[well.cat]} />
      </div>
    </>
  );
}

function FacilityCard({ data, index }: { data: FieldDataset; index: number }) {
  const f = data.facilities[index];
  const style = FACILITY_KIND[f.kind];

  return (
    <>
      <div className="kicker text-[var(--color-plast)]">{style.full}</div>
      <div
        className="mt-1 font-[family-name:var(--font-display)] text-[1.15rem] leading-tight font-semibold"
        style={{ color: style.color }}
      >
        {f.name}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <Row label="Тип объекта" value={style.label} />
        <Row label="Координаты, м" value={`${f.p[0].toFixed(0)} · ${f.p[1].toFixed(0)}`} />
      </div>

      <div className="mt-2 font-mono text-[8px] leading-tight tracking-[0.08em] text-[var(--color-ok)]">
        ФАКТ · подпись из текстового слоя исполнительного чертежа
      </div>

      <div className="mt-4 border-t border-[var(--color-line)] pt-2">
        <div className="kicker mb-1.5">Модули</div>
        <ModuleList ids={FACILITY_MODULES[f.kind]} />
      </div>
    </>
  );
}

/** Сводка фонда и легенда — то, что видно, пока ничего не выбрано. */
function Summary({ data }: { data: FieldDataset }) {
  const s = data.well_stats;
  const facilityCount = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const f of data.facilities) acc[f.kind] = (acc[f.kind] ?? 0) + 1;
    return acc;
  }, [data]);

  return (
    <div className="flex min-h-0 flex-col overflow-y-auto">
      <div className="kicker">Фонд скважин</div>
      <div className="mt-1 font-mono text-[1.35rem] leading-none">{fmt(s.total)}</div>
      <div className="mt-1 text-[0.58rem] leading-tight text-[var(--color-txt-faint)]">
        с координатами, из 1131 в реестре месторождения
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {WELL_CATEGORY_ORDER.map((c) => {
          const style = WELL_CATEGORY[c];
          const n = s.by_category[style.label] ?? 0;
          if (!n) return null;
          return (
            <div key={c} className="flex items-baseline gap-2">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: style.color }}
              />
              <span className="text-[0.62rem] text-[var(--color-txt-dim)]">{style.label}</span>
              <span className="ml-auto font-mono text-[0.7rem]">{fmt(n)}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-[var(--color-line)] pt-2">
        <div className="kicker mb-1">Состояние</div>
        <div className="flex flex-col gap-0.5">
          {WELL_STATUS_ORDER.map((st) => {
            const style = WELL_STATUS[st];
            const n = s.by_status[style.label] ?? 0;
            if (!n) return null;
            return (
              <div key={st} className="flex items-baseline gap-2">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full border"
                  style={{
                    borderColor: 'var(--color-txt-dim)',
                    background: style.working ? 'var(--color-txt-dim)' : 'transparent',
                  }}
                />
                <span className="text-[0.58rem] text-[var(--color-txt-dim)]">{style.label}</span>
                <span className="ml-auto font-mono text-[0.66rem]">{fmt(n)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 text-[0.55rem] leading-tight text-[var(--color-txt-faint)]">
          заливка — работающий фонд, контур — неработающий
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--color-line)] pt-2">
        <div className="kicker mb-1">Объекты промысла</div>
        <div className="flex flex-col gap-0.5">
          <Row label="Узлы сбора (кусты)" value={fmt(data.hubs.length)} />
          <Row label="ГЗУ" value={fmt(facilityCount.gzu ?? 0)} />
          <Row label="КНС (ППД)" value={fmt(facilityCount.kns ?? 0)} />
          <Row label="Сборные пункты" value={fmt(facilityCount.sp ?? 0)} />
          <Row label="КТП / ТП" value={fmt(facilityCount.ktp ?? 0)} />
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--color-line)] pt-2">
        <div className="kicker mb-1">Сети</div>
        <div className="flex flex-col gap-1">
          {NETWORK_LEGEND.map((key) => {
            const style = NETWORK_STYLE[key];
            const n = data.networks[key].length;
            return (
              <div key={key} className="flex items-baseline gap-2">
                <span
                  className="inline-block h-0.5 w-4 shrink-0"
                  style={{ background: style.color }}
                />
                <span className="text-[0.58rem] text-[var(--color-txt-dim)]">{style.label}</span>
                <span className="ml-auto font-mono text-[0.66rem] text-[var(--color-txt-faint)]">
                  {fmt(n)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--color-line)] pt-2 text-[0.55rem] leading-relaxed text-[var(--color-txt-faint)]">
        Исполнительный топоплан 1:2000, съёмка 2023 г., UTM 40N · реестр фонда КМГ от
        11.08.2026. Источники сверены: 524 совпадения по номерам, невязка 0,5 м.
        Контур горного отвода заказчиком не передан и здесь не показан.
      </div>
    </div>
  );
}

// ── Панель ──────────────────────────────────────────────────────────────────

function FieldPlan() {
  const data = useFieldData();
  const t = usePanelProgress();
  const selected = useShow((s) => s.selected);
  const select = useShow((s) => s.select);

  const [boxRef, size] = useBoxSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const view = useMemo(
    () => (size.w > 0 && size.h > 0 ? fitView(size.w, size.h) : null),
    [size.w, size.h],
  );
  const targets = useMemo(() => buildTargets(data), [data]);

  const focus = selected ?? hovered;
  const focusTarget = useMemo(
    () => targets.find((x) => x.id === focus) ?? null,
    [targets, focus],
  );

  // Перерисовка идёт только при изменении прогресса, размера или самого факта
  // выделения — не по кадрам и не на каждое движение мыши. В зависимостях
  // именно булев `dimmed`, а не объект цели: при проводке указателя над фондом
  // цель меняется десятки раз в секунду, и полная перерисовка плана на каждую
  // из них — это заметный рывок ровно в момент, когда докладчик выбирает
  // скважину. Меняется при этом только обводка, а она живёт в слое SVG.
  const dimmed = focusTarget !== null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    canvas.width = Math.round(view.w * dpr);
    canvas.height = Math.round(view.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlan(ctx, data, view, t, dimmed);
  }, [data, view, t, dimmed]);

  /** Цель под указателем. Событию нужны только координаты и сам элемент. */
  const locate = useCallback(
    (e: { clientX: number; clientY: number; currentTarget: HTMLDivElement }): PickTarget | null => {
      if (!view) return null;
      const r = e.currentTarget.getBoundingClientRect();
      return pickAt(targets, view, e.clientX - r.left, e.clientY - r.top);
    },
    [targets, view],
  );

  return (
    <div className="grid h-full gap-5" style={{ gridTemplateColumns: '1fr 20rem' }}>
      <div className="flex min-h-0 flex-col">
        <div className="kicker mb-1 shrink-0 text-[var(--color-dob)]">
          Молдабек Восточный · исполнительная съёмка 2023 · {fmt(data.wells.length)} скважин
        </div>

        <div
          ref={boxRef}
          className="relative min-h-0 flex-1 cursor-crosshair"
          onPointerMove={(e) => setHovered(locate(e)?.id ?? null)}
          onPointerLeave={() => setHovered(null)}
          onClick={(e) => {
            const hit = locate(e);
            select(hit && hit.id !== selected ? hit.id : null);
          }}
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          {view && (
            <svg
              className="pointer-events-none absolute inset-0"
              width={size.w}
              height={size.h}
              viewBox={`0 0 ${size.w} ${size.h}`}
            >
              {/* Фактическая граница исполнительной съёмки, не лицензионный контур */}
              <rect
                x={planX(view, 0)}
                y={planY(view, FIELD_H)}
                width={FIELD_W * view.scale}
                height={FIELD_H * view.scale}
                fill="none"
                stroke="var(--color-line-strong)"
                strokeWidth={0.8}
                opacity={0.5}
              />
              <text
                x={planX(view, 0) + 4}
                y={planY(view, 0) - 4}
                fontSize={7}
                fill="var(--color-txt-faint)"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                границы съёмки · {(FIELD_W / 1000).toFixed(1)} × {(FIELD_H / 1000).toFixed(1)} км
              </text>

              <FacilityLayer data={data} view={view} t={t} focus={focus} />
              <ExternalLayer view={view} t={t} />
              <SelectionLayer data={data} view={view} target={focusTarget} />
            </svg>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col border-l border-[var(--color-line)] pl-4">
        {focusTarget?.kind === 'well' ? (
          <WellCard well={data.wells[focusTarget.index]} />
        ) : focusTarget?.kind === 'facility' ? (
          <FacilityCard data={data} index={focusTarget.index} />
        ) : focusTarget?.kind === 'flare' ? (
          <>
            <div className="kicker text-[var(--color-plast)]">Факельная установка</div>
            <div className="mt-1 font-[family-name:var(--font-display)] text-[1.15rem] font-semibold">
              Факел
            </div>
            <div className="mt-3 text-[0.62rem] leading-relaxed text-[var(--color-txt-dim)]">
              Фактическое положение из чертежа, рядом со сборным пунктом «СП Молдабек» —
              туда сходится весь нефтесбор промысла.
            </div>
          </>
        ) : (
          <Summary data={data} />
        )}
      </div>
    </div>
  );
}

function PlanFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="kicker">загрузка геоданных промысла…</span>
    </div>
  );
}

export function FieldMap2DPanel() {
  return (
    <FullScreen>
      <Suspense fallback={<PlanFallback />}>
        <FieldPlan />
      </Suspense>
    </FullScreen>
  );
}
