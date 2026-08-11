import { FLAT_BEATS, type PanelId } from '../../data/stages';
import { useShow } from '../../store/useShow';
import { PanelFrame } from './PanelFrame';
import { usePanelProgress } from './usePanelProgress';
import {
  DataTable,
  DeviationBars,
  Donut,
  GanttChart,
  KpiTile,
  LogTracks,
  OptimizationScatter,
  PanelGrid,
  Pill,
  Section,
} from './kit';
import { NUMEX_RESERVOIR, OPTIMIZE_RUN, PIPE, POTENTIAL, RTM_PARAMS, WWO_ROWS, NDP_SOURCES } from '../../data/panelData';
import { ArchitecturePanel, ItPatchworkPanel, UpstreamChainPanel } from './upstream';
import { FieldMap2DPanel } from './FieldMap2D';
import {
  AssetTwinPanel,
  EffectsPanel,
  InfraplanPanel,
  MnemoschemePanel,
  NdpMapPanel,
  NdpModelPanel,
} from './more';

/**
 * Реестр 2D-панелей модулей. Каждый экран сценария — своя панель; структура и
 * набор виджетов повторяют реальные интерфейсы (ТЗ §6), палитра — общая тёмная.
 */

// ── ЦД Пласта ───────────────────────────────────────────────────────────────

function NumexPanel() {
  const t = usePanelProgress();
  return (
    <PanelFrame
      module="numex"
      screen="Описание пласта · Система разработки"
      dataNote="условные значения демо-проекта"
      side="right"
    >
      <PanelGrid cols="1fr 1fr">
        <Section title="Параметры пласта">
          <div className="grid grid-cols-2 gap-2">
            {NUMEX_RESERVOIR.map((p) => (
              <KpiTile key={p.label} value={p.value} unit={p.unit} label={p.label} />
            ))}
          </div>
        </Section>
        <Section title="Область под ГС · остаточные запасы">
          <div className="flex h-full items-center justify-center">
            <svg viewBox="0 0 200 180" className="h-full w-full">
              {/* Стилизованная карта остаточных запасов: две области —
                  под горизонтальную скважину и под оптимизацию ППД. */}
              {Array.from({ length: 12 }, (_, i) => (
                <ellipse
                  key={i}
                  cx={92}
                  cy={78}
                  rx={12 + i * 6.4}
                  ry={9 + i * 4.8}
                  fill="none"
                  stroke="var(--color-plast)"
                  strokeWidth={0.5}
                  opacity={0.16 + 0.05 * (1 - i / 12)}
                />
              ))}
              <ellipse
                cx={92}
                cy={78}
                rx={44 * t}
                ry={33 * t}
                fill="var(--color-plast)"
                opacity={0.22}
              />
              <line
                x1={58}
                y1={112}
                x2={126}
                y2={64}
                stroke="var(--color-skv)"
                strokeWidth={2}
                strokeDasharray={`${t * 90} 200`}
              />
              <circle cx={58} cy={112} r={3} fill="var(--color-skv)" />
              <text x={8} y={168} fontSize={7.5} className="fill-[var(--color-txt-dim)]">
                намечено 1–2 горизонтальных скважины на пятый Юрский объект
              </text>
            </svg>
          </div>
        </Section>
      </PanelGrid>
    </PanelFrame>
  );
}

function NumexOptimizePanel() {
  const t = usePanelProgress();
  return (
    <PanelFrame
      module="numexOptimize"
      screen="Ход оптимизации"
      dataNote="600–700 серийных расчётов на ГДМ КМГИ"
      side="right"
    >
      <PanelGrid cols="1fr">
        <Section title="Целевая функция по номеру расчёта">
          <OptimizationScatter t={t} points={OPTIMIZE_RUN} />
        </Section>
      </PanelGrid>
    </PanelFrame>
  );
}

function TNavigatorPanel() {
  const t = usePanelProgress();
  return (
    <PanelFrame
      module="tNavigator"
      screen="Геолого-гидродинамическая модель"
      dataNote="модель передана КМГИ, история на 01.01.2026"
      side="right"
    >
      <PanelGrid cols="1fr 1fr">
        <Section title="Карта проницаемости по кровле">
          <svg viewBox="0 0 200 160" className="h-full w-full">
            {Array.from({ length: 10 }, (_, r) =>
              Array.from({ length: 12 }, (_, c) => {
                const v =
                  0.5 +
                  0.5 *
                    Math.sin(c * 0.7 + r * 0.5) *
                    Math.cos(r * 0.4 - c * 0.3);
                const shown = (r * 12 + c) / 120 < t;
                return (
                  <rect
                    key={`${r}-${c}`}
                    x={8 + c * 15.5}
                    y={8 + r * 14}
                    width={15}
                    height={13.5}
                    fill={`color-mix(in oklab, var(--color-plast) ${Math.round(v * 100)}%, #21384f)`}
                    opacity={shown ? 0.85 : 0}
                  />
                );
              }),
            )}
          </svg>
        </Section>
        <Section title="Ограничения использования ГДМ">
          <ul className="flex flex-col gap-2 text-[0.68rem] leading-snug text-[var(--color-txt-dim)]">
            <li className="border-l border-[var(--color-warn)] pl-2">
              Адаптированная на факт ГДМ передана, но прогнозная способность на месяц/квартал
              не оценена
            </li>
            <li className="border-l border-[var(--color-warn)] pl-2">
              Механизма обновления модели промысловой информацией нет
            </li>
            <li className="border-l border-[var(--color-warn)] pl-2">
              Качество входных данных требует уточнения: скачки обводнённости, нет данных по
              мероприятиям
            </li>
          </ul>
        </Section>
      </PanelGrid>
    </PanelFrame>
  );
}

// ── ЦД Добычи и наземной инфраструктуры ─────────────────────────────────────

function PipeIntegrityPanel() {
  const t = usePanelProgress();
  return (
    <PanelFrame
      module="digitalTwinPipe"
      screen={`Обзор дефектов · ${PIPE.section}`}
      dataNote="прогноз ML"
      side="right"
    >
      <PanelGrid cols="12rem 1fr">
        <Section title="Ключевые метрики">
          <div className="flex flex-col gap-1.5">
            {PIPE.metrics.map((m) => (
              <KpiTile key={m.label} value={m.value} unit={m.unit} label={m.label} tone={m.tone} />
            ))}
          </div>
        </Section>
        <Section title="Развёртка трубы по углу и длине">
          <div className="flex h-full flex-col gap-3">
            <svg viewBox="0 0 400 130" className="w-full">
              {Array.from({ length: 5 }, (_, i) => (
                <text key={i} x={2} y={16 + i * 26} fontSize={7} className="fill-[var(--color-txt-faint)]">
                  {i * 90}°
                </text>
              ))}
              {PIPE.defects.map((d, i) => {
                const x = 26 + (d.at / PIPE.length) * 366;
                const y = 12 + (d.angle / 360) * 104;
                if (i / PIPE.defects.length > t) return null;
                const risk = d.risk === 'высокая';
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={risk ? 3.4 : 1.6}
                    fill={risk ? 'var(--color-risk)' : 'var(--color-ok)'}
                    opacity={risk ? 1 : 0.65}
                  />
                );
              })}
              <line x1={26} y1={122} x2={392} y2={122} stroke="var(--color-line)" strokeWidth={0.5} />
              <text x={26} y={130} fontSize={7} className="fill-[var(--color-txt-faint)]">
                0 м
              </text>
              <text x={352} y={130} fontSize={7} className="fill-[var(--color-txt-faint)]">
                {PIPE.length} м
              </text>
            </svg>
            <div className="min-h-0 flex-1">
              <DataTable
                t={t}
                columns={['Тип дефекта', 'Риск', 'Глубина, мм', 'Угол, °', 'От начала, м']}
                rows={PIPE.defects
                  .filter((d) => d.risk === 'высокая')
                  .map((d) => [
                    d.kind,
                    <Pill tone="risk">{d.risk}</Pill>,
                    d.depth.toFixed(2),
                    d.angle.toFixed(0),
                    d.at.toFixed(0),
                  ])}
              />
            </div>
          </div>
        </Section>
      </PanelGrid>
    </PanelFrame>
  );
}

function DtPotentialPanel() {
  const t = usePanelProgress();
  return (
    <PanelFrame module="digitalTwin" screen="Потенциалы добычи" dataNote="иллюстративные значения" side="right">
      <PanelGrid cols="1fr 1.6fr">
        <Section title="Динамика потенциала">
          <div className="flex h-full flex-col gap-2">
            <Donut t={t} value={POTENTIAL.operational} label="операционный" color="var(--color-warn)" />
            <Donut t={t} value={POTENTIAL.technological} label="технологический" color="var(--color-risk)" />
          </div>
        </Section>
        <Section title="Отклонения текущих суток, т/сут">
          <DeviationBars t={t} rows={POTENTIAL.deviations} />
        </Section>
      </PanelGrid>
    </PanelFrame>
  );
}

// ── ЦД Скважины ─────────────────────────────────────────────────────────────

function RtmPanel() {
  const t = usePanelProgress();
  return (
    <PanelFrame module="rtm" screen="Мониторинг бурения в реальном времени" dataNote="иллюстративные значения" side="right">
      <PanelGrid cols="11rem 1fr">
        <Section title="Параметры бурения">
          <div className="flex flex-col gap-1.5">
            {RTM_PARAMS.map((p) => (
              <KpiTile key={p.label} value={p.value} unit={p.unit} label={p.label} tone={p.tone} />
            ))}
          </div>
        </Section>
        <Section title="Каротажные дорожки">
          <LogTracks
            t={t}
            tracks={[
              { label: 'Давление', color: 'var(--color-skv)', seed: 0.4 },
              { label: 'Нагрузка', color: 'var(--color-plast)', seed: 1.9 },
              { label: 'Мех. скорость', color: 'var(--color-dob)', seed: 3.3 },
              { label: 'Момент', color: '#c39ce8', seed: 5.1 },
            ]}
          />
        </Section>
      </PanelGrid>
    </PanelFrame>
  );
}

function WwoPanel() {
  const t = usePanelProgress();
  return (
    <PanelFrame module="wwo" screen="График мероприятий ТКРС" dataNote="иллюстративные значения" side="right">
      <PanelGrid cols="1fr">
        <Section title="Движение бригад по скважинам">
          <GanttChart t={t} rows={WWO_ROWS} />
        </Section>
      </PanelGrid>
    </PanelFrame>
  );
}

// ── Единый слой данных ──────────────────────────────────────────────────────

function NdpSourcesPanel() {
  const t = usePanelProgress();
  return (
    <PanelFrame module="nedraData" screen="Источники данных" dataNote="состав демо-контура" side="right">
      <DataTable
        t={t}
        columns={['Источник', 'Статус', 'Описание', 'Витрины', 'Файлы']}
        rows={NDP_SOURCES.map((s) => [
          s.name,
          <Pill tone="ok">активен</Pill>,
          s.description,
          String(s.marts),
          String(s.files),
        ])}
      />
    </PanelFrame>
  );
}

// ── Заглушка для ещё не собранных экранов ───────────────────────────────────

function Placeholder({ panel }: { panel: PanelId }) {
  return (
    <div className="panel pointer-events-auto absolute right-10 top-24 bottom-56 flex w-[46rem] items-center justify-center">
      <span className="kicker">панель «{panel}» — в работе</span>
    </div>
  );
}

export const REGISTRY: Partial<Record<PanelId, () => React.ReactElement>> = {
  architecture: ArchitecturePanel,
  'upstream-chain': UpstreamChainPanel,
  'it-patchwork': ItPatchworkPanel,
  'field-map-2d': FieldMap2DPanel,
  tnavigator: TNavigatorPanel,
  numex: NumexPanel,
  'numex-optimize': NumexOptimizePanel,
  'pipe-integrity': PipeIntegrityPanel,
  'dt-potential': DtPotentialPanel,
  rtm: RtmPanel,
  wwo: WwoPanel,
  infraplan: InfraplanPanel,
  mnemoscheme: MnemoschemePanel,
  'ndp-sources': NdpSourcesPanel,
  'ndp-model': NdpModelPanel,
  'ndp-map': NdpMapPanel,
  'asset-twin': AssetTwinPanel,
  effects: EffectsPanel,
};

/** Единственная точка монтирования панелей — по текущему такту. */
export function PanelLayer() {
  const beatIndex = useShow((s) => s.beatIndex);
  const panel = FLAT_BEATS[beatIndex].panel;
  if (!panel) return null;
  const Cmp = REGISTRY[panel];
  return Cmp ? <Cmp /> : <Placeholder panel={panel} />;
}
