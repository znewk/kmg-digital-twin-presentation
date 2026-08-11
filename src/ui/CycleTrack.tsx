import { CYCLE_LINE, CYCLE_STEPS, OIL_TRACK, STEP_BY_ID } from '../data/cycle/chain';
import { useShow } from '../store/useShow';

/**
 * Сквозной индикатор «где сейчас флюид» (ТЗ §4.4.6).
 *
 * Показывает путь НЕФТИ — пласт, скважина, ГЗУ, коллектор, СП, напорный, ЦППН.
 * Остальные четыре нитки цепочки в него не входят намеренно: ППД, газ,
 * энергетика и строительство скважин обслуживают основной передел, но сами
 * товарной нефтью не становятся. Если вывести на индикатор все двадцать три
 * шага, он превратится в шкалу, по которой из зала не понять ни где сейчас
 * процесс, ни куда он идёт, — а его читают с двадцати метров.
 *
 * Узлы собираются из самих шагов цепочки, а не перечисляются отдельным
 * списком: список, который можно забыть обновить вслед за цепочкой, хуже
 * отсутствующего.
 */
export function CycleTrack() {
  const stepId = useShow((s) => s.cycleStep);
  const playing = useShow((s) => s.cyclePlaying);
  const setCycleStep = useShow((s) => s.setCycleStep);
  const togglePlay = useShow((s) => s.toggleCyclePlay);

  const step = stepId ? STEP_BY_ID.get(stepId) : null;
  const active = step?.track ? step.id : null;
  const activeIndex = OIL_TRACK.findIndex((n) => n.id === active);

  return (
    <div className="pointer-events-auto absolute bottom-6 left-1/2 w-[min(880px,calc(100vw-3rem))] -translate-x-1/2">
      <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg-panel)]/92 px-4 py-3 backdrop-blur">
        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded border border-[var(--color-line)] px-3 py-1 font-mono text-[10px] tracking-[0.12em] uppercase hover:border-[var(--color-accent)]"
            style={playing ? { borderColor: 'var(--color-accent)', color: 'var(--color-accent)' } : undefined}
          >
            {playing ? 'Пауза' : 'Полный цикл'}
          </button>

          {step && (
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span
                  className="font-mono text-[10px] tracking-[0.12em] uppercase"
                  style={{ color: CYCLE_LINE[step.line].color }}
                >
                  {CYCLE_LINE[step.line].label}
                </span>
                <span className="truncate text-[13px]">{step.title}</span>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-[var(--color-txt-dim)]">{step.body}</p>
            </div>
          )}
        </div>

        {/*
          Узлы кликабельны: на показе ведущий должен уметь вернуться к переделу,
          о котором его спросили, не отматывая цепочку целиком.
        */}
        <div className="flex items-center">
          {OIL_TRACK.map((node, i) => {
            const passed = activeIndex >= 0 && i <= activeIndex;
            const here = i === activeIndex;

            return (
              <div key={node.id} className="flex min-w-0 flex-1 items-center last:flex-none">
                <button
                  type="button"
                  onClick={() => setCycleStep(node.id)}
                  className="flex shrink-0 flex-col items-center gap-1"
                  title={STEP_BY_ID.get(node.id)?.body}
                >
                  <span
                    className="block rounded-full transition-all"
                    style={{
                      width: here ? 13 : 8,
                      height: here ? 13 : 8,
                      background: passed ? CYCLE_LINE.oil.color : 'var(--color-line)',
                      boxShadow: here ? `0 0 12px ${CYCLE_LINE.oil.color}` : undefined,
                    }}
                  />
                  <span
                    className="font-mono text-[9px] tracking-[0.08em] whitespace-nowrap"
                    style={{
                      color: here ? CYCLE_LINE.oil.color : 'var(--color-txt-faint)',
                    }}
                  >
                    {node.label}
                  </span>
                </button>

                {i < OIL_TRACK.length - 1 && (
                  <span
                    className="mx-1 -mt-4 h-px min-w-0 flex-1"
                    style={{
                      background:
                        activeIndex > i ? CYCLE_LINE.oil.color : 'var(--color-line)',
                      opacity: activeIndex > i ? 0.8 : 0.4,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/*
          Шаги вне нитки нефти — ППД, газ, энергетика, строительство — на
          индикаторе пути не появляются, но дойти до них нужно: в них половина
          цепочки. Отдельным рядом, свёрнутым до цветных отметок по нитке.
        */}
        <div className="mt-3 flex flex-wrap gap-1 border-t border-[var(--color-line)] pt-2">
          {CYCLE_STEPS.filter((s) => !s.track).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setCycleStep(s.id)}
              title={s.body}
              className="rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.06em] whitespace-nowrap transition-colors"
              style={{
                color: s.id === stepId ? CYCLE_LINE[s.line].color : 'var(--color-txt-faint)',
                background: s.id === stepId ? 'color-mix(in srgb, currentColor 12%, transparent)' : undefined,
                borderBottom: `1px solid ${CYCLE_LINE[s.line].color}`,
              }}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
