import { PanelFrame } from './PanelFrame';
import { useEffect, useRef } from 'react';
import { usePanelProgress } from './usePanelProgress';
import { panelReserve } from '../panelReserve';
import { DataTable, FullScreenPanel as FullScreen, KpiTile, PanelGrid, Pill, Section } from './kit';
import { CONTOURS } from '../../data/upstreamData';
import { MNEMO, NDP_ENTITIES, NDP_MAP_WELLS, SURFACE_NETWORK } from '../../data/panelData2';

/**
 * Панели блоков 4, 6, 7, 8 и итога. Структуры повторяют реальные экраны из
 * сценария (INFRAPLAN, мнемосхема актива, Nedra.DATA, ЦД Актива), палитра —
 * общая тёмная.
 */

// ── Nedra.INFRAPLAN ─────────────────────────────────────────────────────────

/** Карта сети сбора с заливкой по давлению — структура основного экрана. */
export function InfraplanPanel() {
  const t = usePanelProgress();
  const P_MIN = 6;
  const P_MAX = 21;
  const colorFor = (p: number) => {
    const k = (p - P_MIN) / (P_MAX - P_MIN);
    return `color-mix(in oklab, var(--color-risk) ${Math.round(k * 100)}%, var(--color-dob))`;
  };

  return (
    <PanelFrame
      module="infraplan"
      screen="Сеть сбора · давление в начале участка"
      dataNote="иллюстративные значения"
      side="right"
    >
      <PanelGrid cols="9rem 1fr">
        <Section title="Слои">
          <div className="flex flex-col gap-1 text-[0.66rem] text-[var(--color-txt-dim)]">
            {['Скважины', 'Кустовые площадки', 'Трубопроводы', 'НСК', 'НП', 'ВВД', 'ВНД', 'ВЛ'].map(
              (l, i) => (
                <label key={l} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 border"
                    style={{
                      borderColor: 'var(--color-dob)',
                      background: i < 4 ? 'var(--color-dob)' : 'transparent',
                    }}
                  />
                  {l}
                </label>
              ),
            )}
          </div>
        </Section>

        <Section title="Загрузка системы сбора, атм">
          <div className="flex h-full flex-col gap-2">
            <svg viewBox="0 0 400 210" className="min-h-0 flex-1">
              {SURFACE_NETWORK.links.map((l, i) => {
                const a = SURFACE_NETWORK.nodes[l.from];
                const b = SURFACE_NETWORK.nodes[l.to];
                const shown = i / SURFACE_NETWORK.links.length < t;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={colorFor(l.p)}
                    strokeWidth={l.trunk ? 2.6 : 1.2}
                    opacity={shown ? 0.9 : 0}
                  />
                );
              })}
              {SURFACE_NETWORK.nodes.map((n, i) => (
                <g key={i} opacity={i / SURFACE_NETWORK.nodes.length < t ? 1 : 0}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.hub ? 4 : 2}
                    fill={n.hub ? 'var(--color-plast)' : 'var(--color-skv)'}
                  />
                  {n.label && (
                    <text
                      x={n.x + 6}
                      y={n.y + 3}
                      fontSize={7}
                      className="fill-[var(--color-txt-dim)]"
                    >
                      {n.label}
                    </text>
                  )}
                </g>
              ))}
            </svg>

            {/* Шкала давления */}
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-[8px] text-[var(--color-txt-faint)]">{P_MIN}</span>
              <span
                className="h-1.5 flex-1"
                style={{
                  background: 'linear-gradient(90deg, var(--color-dob), var(--color-risk))',
                }}
              />
              <span className="font-mono text-[8px] text-[var(--color-txt-faint)]">{P_MAX} атм</span>
            </div>
          </div>
        </Section>
      </PanelGrid>
    </PanelFrame>
  );
}

// ── Мнемосхема актива ───────────────────────────────────────────────────────

export function MnemoschemePanel() {
  const t = usePanelProgress();

  return (
    <FullScreen>
      <div className="flex h-full flex-col gap-4">
        <div className="flex shrink-0 items-start gap-4">
          <div className="kicker text-[var(--color-dob)]">Мониторинг актива · мнемосхема</div>
          <div className="ml-auto flex gap-2">
            {MNEMO.counters.map((c) => (
              <div key={c.label} className="border border-[var(--color-line)] px-3 py-1.5">
                <div className="kicker text-[var(--color-txt-faint)]">{c.label}</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-mono text-[0.95rem] text-[var(--color-txt-dim)]">
                    {c.plan}
                  </span>
                  <span className="font-mono text-[1.15rem] text-[var(--color-plast)]">
                    {c.fact}
                  </span>
                  <span className="text-[0.55rem] text-[var(--color-txt-faint)]">{c.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <svg viewBox="0 0 900 360" className="min-h-0 flex-1">
          {MNEMO.links.map((l, i) => {
            const a = MNEMO.nodes.find((n) => n.id === l.from)!;
            const b = MNEMO.nodes.find((n) => n.id === l.to)!;
            const shown = i / MNEMO.links.length < t;
            const stroke =
              l.kind === 'oil'
                ? 'var(--color-plast)'
                : l.kind === 'water'
                  ? 'var(--color-water)'
                  : 'var(--color-txt-faint)';
            // Ортогональная трассировка: технологические схемы читаются
            // прямыми углами, диагонали превращают их в паутину.
            const mx = (a.x + b.x) / 2;
            return (
              <g key={i} opacity={shown ? 1 : 0}>
                <polyline
                  points={`${a.x},${a.y} ${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={1.4}
                  strokeDasharray={l.kind === 'water' ? '5 4' : undefined}
                  opacity={0.75}
                />
                {l.value && (
                  <text
                    x={mx + 4}
                    y={(a.y + b.y) / 2 - 3}
                    fontSize={8}
                    className="fill-[var(--color-txt-dim)]"
                  >
                    {l.value}
                  </text>
                )}
              </g>
            );
          })}

          {MNEMO.nodes.map((n, i) => {
            const shown = i / MNEMO.nodes.length < t;
            const alarm = n.alarm;
            return (
              <g key={n.id} opacity={shown ? 1 : 0}>
                <rect
                  x={n.x - 42}
                  y={n.y - 16}
                  width={84}
                  height={32}
                  fill="oklch(24% 0.02 250 / 0.85)"
                  stroke={alarm ? 'var(--color-risk)' : 'var(--color-line-strong)'}
                  strokeWidth={alarm ? 1.4 : 0.8}
                />
                <text
                  x={n.x}
                  y={n.y - 3}
                  textAnchor="middle"
                  fontSize={9}
                  className="fill-[var(--color-txt)]"
                  fontWeight={600}
                >
                  {n.label}
                </text>
                <text
                  x={n.x}
                  y={n.y + 9}
                  textAnchor="middle"
                  fontSize={7.5}
                  fill={alarm ? 'var(--color-risk)' : 'var(--color-txt-dim)'}
                >
                  {n.value}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="flex shrink-0 gap-5 border-t border-[var(--color-line)] pt-2">
          {[
            ['var(--color-plast)', 'нефть'],
            ['var(--color-water)', 'вода ППД'],
            ['var(--color-txt-faint)', 'газ'],
            ['var(--color-risk)', 'отклонение режима'],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5 text-[0.6rem] text-[var(--color-txt-dim)]">
              <span className="inline-block h-0.5 w-4" style={{ background: c }} />
              {l}
            </span>
          ))}
        </div>
      </div>
    </FullScreen>
  );
}

// ── Nedra.DATA ──────────────────────────────────────────────────────────────

export function NdpModelPanel() {
  const t = usePanelProgress();

  return (
    <FullScreen>
      <div className="flex h-full flex-col gap-3">
        <div className="kicker text-[var(--color-nedra)]">
          КХД · сквозная модель данных ЦД Актива
        </div>
        <svg viewBox="0 0 900 320" className="min-h-0 flex-1">
          {NDP_ENTITIES.map((e, i) => {
            const shown = i / NDP_ENTITIES.length < t;
            return (
              <g key={e.name} opacity={shown ? 1 : 0}>
                {e.parents.map((p) => {
                  const pe = NDP_ENTITIES.find((x) => x.name === p);
                  if (!pe) return null;
                  return (
                    <line
                      key={p}
                      x1={pe.x}
                      y1={pe.y + 14}
                      x2={e.x}
                      y2={e.y - 14}
                      stroke="var(--color-nedra)"
                      strokeWidth={0.8}
                      opacity={0.5}
                    />
                  );
                })}
              </g>
            );
          })}
          {NDP_ENTITIES.map((e, i) => {
            const shown = i / NDP_ENTITIES.length < t;
            return (
              <g key={e.name} opacity={shown ? 1 : 0}>
                <rect
                  x={e.x - 58}
                  y={e.y - 14}
                  width={116}
                  height={28}
                  fill="oklch(24% 0.02 250 / 0.9)"
                  stroke="var(--color-nedra)"
                  strokeWidth={0.9}
                />
                <text
                  x={e.x}
                  y={e.y + 1}
                  textAnchor="middle"
                  fontSize={9.5}
                  className="fill-[var(--color-txt)]"
                >
                  {e.name}
                </text>
                <text
                  x={e.x}
                  y={e.y + 11}
                  textAnchor="middle"
                  fontSize={7}
                  className="fill-[var(--color-txt-faint)]"
                >
                  {e.attrs} атрибутов
                </text>
              </g>
            );
          })}
        </svg>
        <div className="shrink-0 text-[0.66rem] text-[var(--color-txt-dim)]">
          Расширяемая сквозная модель интегрирует данные всех двойников в единый
          структурированный слой; справочные объекты источников маппятся на центральную НСИ.
        </div>
      </div>
    </FullScreen>
  );
}

export function NdpMapPanel() {
  const t = usePanelProgress();
  return (
    <FullScreen>
      <div className="flex h-full flex-col gap-3">
        <div className="kicker text-[var(--color-nedra)]">
          КХД · карта объектов актива
        </div>
        <div className="grid min-h-0 flex-1 gap-4" style={{ gridTemplateColumns: '16rem 1fr' }}>
          <div className="min-h-0 overflow-hidden">
            <DataTable
              t={t}
              columns={['Объект', 'Тип']}
              rows={NDP_MAP_WELLS.slice(0, 12).map((w) => [w.name, w.kind])}
            />
          </div>
          <svg viewBox="0 0 520 300" className="h-full w-full">
            {/* Граница лицензионного участка */}
            <polygon
              points="60,26 470,26 470,268 250,268 60,214"
              fill="none"
              stroke="var(--color-ok)"
              strokeWidth={1.2}
              strokeDasharray="6 4"
            />
            {/* Контур залежи */}
            <ellipse cx={230} cy={132} rx={124} ry={78} fill="var(--color-plast)" opacity={0.14} />
            {/* Напорный нефтепровод до ЦППН */}
            <polyline
              points="330,150 400,206 462,236"
              fill="none"
              stroke="var(--color-txt-dim)"
              strokeWidth={1.6}
            />
            {NDP_MAP_WELLS.map((w, i) => {
              const shown = i / NDP_MAP_WELLS.length < t;
              const inj = w.kind === 'нагнетательная';
              return (
                <g key={w.name} opacity={shown ? 1 : 0}>
                  <circle
                    cx={w.x}
                    cy={w.y}
                    r={3}
                    fill={inj ? 'var(--color-water)' : 'var(--color-plast)'}
                  />
                  <circle cx={w.x} cy={w.y} r={5.5} fill="none" stroke="var(--color-line-strong)" strokeWidth={0.6} />
                </g>
              );
            })}
            <text x={462} y={252} fontSize={8} className="fill-[var(--color-txt-dim)]">
              ЦППН «Кенбай»
            </text>
          </svg>
        </div>
      </div>
    </FullScreen>
  );
}

// ── ЦД Актива, стратегический уровень ───────────────────────────────────────

export function AssetTwinPanel() {
  const t = usePanelProgress();
  const N = 220;

  return (
    <FullScreen fit>
      <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 1.1fr' }}>
        <div className="flex flex-col justify-center gap-5">
          <div className="kicker text-[var(--color-nedra)]">Единый ЦД Актива</div>
          <p className="text-[0.85rem] leading-relaxed text-[var(--color-txt-dim)]">
            Информация со всех двойников — пласта, скважины, добычи и наземной инфраструктуры —
            интегрируется в единую систему управления. Это позволяет перейти от реактивного
            управления к стратегическому.
          </p>

          <div className="flex flex-col gap-2.5">
            {[
              { label: 'NPV проекта', v: 0.72 },
              { label: 'Вовлечение запасов', v: 0.58 },
              { label: 'Уровень добычи', v: 0.64 },
            ].map((s, i) => (
              <div key={s.label}>
                <div className="flex justify-between text-[0.62rem] text-[var(--color-txt-dim)]">
                  <span>{s.label}</span>
                </div>
                <div className="mt-1 h-1.5 bg-[oklch(24%_0.02_250/0.6)]">
                  <div
                    className="h-full bg-[var(--color-dob)]"
                    style={{ width: `${s.v * 100 * Math.max(0, Math.min(1, (t - i * 0.1) / 0.5))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* ТЗ §7 п.3: интеграций с Департаментом ИИ нет — не выдаём за факт. */}
          <div className="mt-2 flex items-center gap-2 border border-[var(--color-target)] px-3 py-2">
            <Pill tone="warn">целевой контур</Pill>
            <span className="text-[0.62rem] leading-tight text-[var(--color-txt-dim)]">
              Слой AI-агентов — перспективный. Интеграции с Департаментом ИИ на сегодня отсутствуют.
            </span>
          </div>

          <div className="text-[0.66rem] text-[var(--color-txt-faint)]">
            2027 — цифровые двойники на ТОП-12 месторождений · 2028 — 100% добывающих активов
          </div>
        </div>

        {/* Облако сценариев в осях NPV / Запасы / Добыча */}
        <svg viewBox="0 0 380 300" className="h-full w-full">
          <line x1={40} y1={260} x2={340} y2={260} stroke="var(--color-line)" strokeWidth={0.8} />
          <line x1={40} y1={260} x2={40} y2={30} stroke="var(--color-line)" strokeWidth={0.8} />
          <line x1={40} y1={260} x2={128} y2={196} stroke="var(--color-line)" strokeWidth={0.8} />
          <text x={330} y={274} fontSize={8} textAnchor="end" className="fill-[var(--color-txt-faint)]">
            Запасы
          </text>
          <text x={20} y={34} fontSize={8} className="fill-[var(--color-txt-faint)]">
            NPV
          </text>
          <text x={132} y={192} fontSize={8} className="fill-[var(--color-txt-faint)]">
            Добыча
          </text>
          {Array.from({ length: N }, (_, i) => {
            if (i / N > t) return null;
            const a = i * 2.399;
            const r = 1 - i / N;
            const x = 190 + Math.cos(a) * 108 * Math.sqrt(1 - r * 0.7) - r * 24;
            const y = 148 + Math.sin(a) * 78 * Math.sqrt(1 - r * 0.7) + r * 18;
            const best = i === N - 1;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={best ? 4.5 : 1.7}
                fill={best ? 'var(--color-ok)' : 'var(--color-nedra)'}
                opacity={best ? 1 : 0.55}
              />
            );
          })}
        </svg>
      </div>
    </FullScreen>
  );
}

// ── Итог ────────────────────────────────────────────────────────────────────

export function EffectsPanel() {
  const rows = CONTOURS.filter((c) => !c.future);

  /**
   * Итог встаёт на то же место, что и плашка целевого образа: нижняя часть
   * кадра, верхняя остаётся карте актива.
   *
   * Раньше это была панель по центру экрана, и переход на итог читался как
   * прыжок — менялось всё сразу: и место панели, и содержимое, и ракурс. Здесь
   * плашка остаётся на месте и меняет только содержание, а карта за ней стоит
   * неподвижно: показ подводит черту над тем же активом, о котором и шёл.
   *
   * Проявление по прогрессу такта убрано. Оно имело смысл, когда этапов было
   * восемь и панель успевала собраться на подлёте; на трёх экранах зритель
   * доходит до итога сразу, и колонки, проступающие по очереди, читаются как
   * подтормаживание.
   */

  /**
   * Плашка сообщает камере, сколько кадра занимает, — так же, как плашка
   * целевого образа. Карта за ней поднимается в свободную полосу сама, и на
   * любом разрешении одинаково.
   */
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      panelReserve.current = Math.min(
        0.8,
        (globalThis.innerHeight - rect.top) / globalThis.innerHeight,
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    globalThis.addEventListener('resize', measure);

    return () => {
      ro.disconnect();
      globalThis.removeEventListener('resize', measure);
      panelReserve.current = 0;
    };
  }, []);

  return (
    <div className="plate-in panel pointer-events-auto absolute inset-x-16 top-1/2 flex max-h-[64%] -translate-y-1/2 flex-col gap-4 overflow-hidden px-7 py-5">
      <div className="kicker shrink-0 text-[var(--color-plast)]">Ожидаемые эффекты по контурам</div>

      <div
        className="grid min-h-0 shrink-0 gap-4"
        style={{ gridTemplateColumns: `repeat(${rows.length}, 1fr)` }}
      >
        {rows.map((c) => (
          <div key={c.name} className="border-t-2 pt-2.5" style={{ borderColor: 'var(--color-plast)' }}>
            <div className="text-[0.9rem] font-semibold uppercase tracking-wide">{c.name}</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {c.effects.map((e) => (
                <div key={e.label} className="flex items-baseline gap-2">
                  <span className="font-mono text-[1.6rem] text-[var(--color-ok)]">{e.value}</span>
                  <span className="text-[0.68rem] leading-tight text-[var(--color-txt-dim)]">
                    {e.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div
        className="grid shrink-0 gap-3 border-t border-[var(--color-line)] pt-3"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
      >
        <KpiTile value="окт. 2026" label="промышленная эксплуатация пилота Молдабек В." />
        <KpiTile value="12" label="приоритетных активов, 7 ДЗО — 2027–2028" />
        <KpiTile value="100%" label="добывающих активов к 2028 году" />
        <KpiTile value="15,03" unit="млрд ₸" label="общая потребность в финансировании программы" />
      </div>
    </div>
  );
}

