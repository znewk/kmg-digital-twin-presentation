import { FLAT_BEATS } from '../data/stages';
import { OBJECT_BY_ID } from '../data/fieldObjects';
import { useShow, type FeatureId } from '../store/useShow';

/**
 * Тумблеры режимов просмотра недр (ТЗ §1, §8.4) — перенос строки состояния из
 * референсного прототипа.
 *
 * Показываются только на этапах, где в кадре есть месторождение: на глобусе и
 * плоских экранах они бессмысленны и только загромождают кадр.
 */

const FIELD_STAGES = new Set(['objectmap', 'reservoir', 'surface', 'well', 'production', 'outro']);

const FEATURES: { id: FeatureId; label: string }[] = [
  { id: 'traces', label: 'Трассы сетей' },
  { id: 'utilities', label: 'Коммуникации' },
  { id: 'grid', label: 'Сетка ГГДМ' },
  { id: 'isolines', label: 'Изолинии' },
  { id: 'seismic', label: 'Сейсмика' },
  { id: 'flood', label: 'Заводнение' },
  { id: 'cone', label: 'Конус обводнения' },
  { id: 'drainage', label: 'Дренирование' },
  { id: 'flow', label: 'Поток' },
];

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="border px-2.5 py-1 font-mono text-[9.5px] tracking-[0.12em] uppercase whitespace-nowrap transition-colors"
      style={{
        borderColor: on ? 'var(--color-dob)' : 'var(--color-line)',
        color: on ? 'var(--color-dob)' : 'var(--color-txt-dim)',
        background: on ? 'oklch(30% 0.05 190 / 0.22)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}

export function SceneControls() {
  const stageId = useShow((s) => s.stageId);
  const beatIndex = useShow((s) => s.beatIndex);
  const exploded = useShow((s) => s.exploded);
  const clip = useShow((s) => s.clip);
  const clipX = useShow((s) => s.clipX);
  const features = useShow((s) => s.features);
  const paused = useShow((s) => s.paused);
  const hovered = useShow((s) => s.hovered);

  const toggleExplode = useShow((s) => s.toggleExplode);
  const toggleClip = useShow((s) => s.toggleClip);
  const setClipX = useShow((s) => s.setClipX);
  const toggleFeature = useShow((s) => s.toggleFeature);
  const togglePaused = useShow((s) => s.togglePaused);
  const inCycle = useShow((s) => s.cycleShot !== null);

  if (!FIELD_STAGES.has(stageId)) return null;
  // Под полноэкранной панелью модуля сцены всё равно не видно.
  if (FLAT_BEATS[beatIndex].panel) return null;

  const hoveredObj = hovered ? OBJECT_BY_ID.get(hovered) : undefined;

  return (
    <div className="panel pointer-events-auto absolute top-24 left-8 flex w-[13.5rem] flex-col gap-2 px-3 py-3">
      {/*
        Свободный осмотр: без него объекты почти невозможно поймать курсором на
        общих планах, и кликабельность сцены остаётся незамеченной.

        Во время полного цикла он показан выключенным, а нажатие выходит из
        цикла. Режим ровно один: камерой владеет либо раскадровка, либо
        пользователь, и совмещать их — значит не иметь ни того ни другого.
      */}
      <Toggle on={paused && !inCycle} onClick={togglePaused}>
        {inCycle ? 'Взять камеру себе' : paused ? '● свободный осмотр' : 'Свободный осмотр'}
      </Toggle>
      <div className="text-[0.58rem] leading-tight text-[var(--color-txt-faint)]">
        {inCycle
          ? 'Идёт полный цикл — камерой ведёт раскадровка'
          : paused
            ? 'ЛКМ — поворот · колесо — приближение · ПКМ — сдвиг. Клик по объекту — карточка'
            : 'Клавиша P. Скролл замрёт, камера перейдёт под мышь'}
      </div>

      <div className="kicker mt-1 border-t border-[var(--color-line)] pt-2">Просмотр недр</div>

      <div className="flex flex-wrap gap-1">
        <Toggle on={exploded} onClick={toggleExplode}>
          Разнести слои
        </Toggle>
        <Toggle on={clip} onClick={toggleClip}>
          Разрез
        </Toggle>
      </div>

      {hoveredObj && (
        <div className="border-l-2 border-[var(--color-plast)] pl-2 text-[0.62rem] leading-tight text-[var(--color-txt)]">
          {hoveredObj.label}
          <span className="block text-[0.55rem] text-[var(--color-txt-faint)]">
            кликните, чтобы раскрыть
          </span>
        </div>
      )}

      {clip && (
        <label className="flex items-center gap-2">
          {/* Пределы — по фактической полуширине участка 2676 м. Прежние ±700
              достались от выдуманного поля 1400 × 900: плоскость физически не
              могла пройти через промысел и упиралась в его четверть. */}
          <input
            type="range"
            min={-2700}
            max={2700}
            step={20}
            value={clipX}
            onChange={(e) => setClipX(Number(e.target.value))}
            className="w-full accent-[var(--color-dob)]"
            aria-label="Положение секущей плоскости"
          />
        </label>
      )}

      <div className="mt-1 flex flex-wrap gap-1 border-t border-[var(--color-line)] pt-2">
        {FEATURES.map((f) => (
          <Toggle key={f.id} on={features[f.id]} onClick={() => toggleFeature(f.id)}>
            {f.label}
          </Toggle>
        ))}
      </div>
    </div>
  );
}
