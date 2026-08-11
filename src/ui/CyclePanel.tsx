import { CYCLE_NODES, FULL_CYCLE, SHOT_BY_ID, STORYBOARD_PPD } from '../data/cycle/storyboard';
import { moduleName, MODULES } from '../data/modules';
import { useShow } from '../store/useShow';

/**
 * Панель полного цикла: что сейчас в кадре и что это значит (ТЗ §4.4.6).
 *
 * Показ идёт для аудитории, которая не обязана знать нефтедобычу, поэтому
 * главное здесь — не шкала, а ТЕКСТ. Он объясняет кадр обычными словами:
 * почему нефть вообще идёт вверх, зачем её мерят по очереди, куда девается
 * вода. Шкала под ним отвечает на второй вопрос — «где мы в этом пути».
 *
 * Панель прижата к низу и занимает не больше трети высоты: она сопровождает
 * кадр, а не заменяет его. §8.3 требует, чтобы объект оставался виден, а
 * панель дополняла вид.
 */

const LINE_COLOR = {
  oil: '#f0ae4a',
  ppd: '#5fa8e8',
  gas: '#35d0c2',
};

export function CyclePanel() {
  // Раскладка имён продуктов общая с остальным показом (§5): переключатель
  // «Недра / ABAI» обязан действовать и здесь, иначе на одном экране окажутся
  // два разных названия одного модуля.
  const naming = useShow((s) => s.naming);
  const shotId = useShow((s) => s.cycleShot);
  const playing = useShow((s) => s.cyclePlaying);
  const setCycleShot = useShow((s) => s.setCycleShot);
  const togglePlay = useShow((s) => s.toggleCyclePlay);

  const shot = shotId ? SHOT_BY_ID.get(shotId) : null;
  const index = shotId ? FULL_CYCLE.findIndex((s) => s.id === shotId) : -1;

  const go = (delta: number) => {
    const next = FULL_CYCLE[Math.min(FULL_CYCLE.length - 1, Math.max(0, index + delta))];
    if (next) setCycleShot(next.id);
  };

  // Узел пути, до которого дошёл рассказ. Не все кадры отмечены узлом —
  // «Выкидная линия» и «Куст» узлов не имеют, и при поиске по совпадению шкала
  // на них гасла бы целиком. Берётся последний ПРОЙДЕННЫЙ.
  let nodeIndex = -1;
  if (index >= 0) {
    for (let i = 0; i <= index; i++) {
      const at = CYCLE_NODES.findIndex((n) => n.id === FULL_CYCLE[i].id);
      if (at >= 0) nodeIndex = at;
    }
  }
  const onPpd = shot?.line === 'ppd';

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0">
      <div className="mx-auto w-[min(1120px,calc(100vw-3rem))] pb-5">
        {/* Шкала пути нефти */}
        <div
          className="mb-3 flex items-center px-1 transition-opacity"
          style={{ opacity: onPpd ? 0.3 : 1 }}
        >
          {CYCLE_NODES.map((node, i) => {
            const passed = nodeIndex >= 0 && i <= nodeIndex;
            const here = i === nodeIndex && !onPpd;

            return (
              <div key={node.id} className="flex min-w-0 flex-1 items-center last:flex-none">
                <button
                  type="button"
                  onClick={() => setCycleShot(node.id)}
                  className="flex shrink-0 flex-col items-center gap-1.5"
                >
                  <span
                    className="block rounded-full transition-all"
                    style={{
                      width: here ? 12 : 7,
                      height: here ? 12 : 7,
                      background: passed ? LINE_COLOR.oil : 'var(--color-line)',
                      boxShadow: here ? `0 0 14px ${LINE_COLOR.oil}` : undefined,
                    }}
                  />
                  <span
                    className="font-mono text-[9px] tracking-[0.06em] whitespace-nowrap"
                    style={{ color: here ? LINE_COLOR.oil : 'var(--color-txt-faint)' }}
                  >
                    {node.label}
                  </span>
                </button>
                {i < CYCLE_NODES.length - 1 && (
                  <span
                    className="mx-1.5 -mt-4 h-px min-w-0 flex-1"
                    style={{
                      background: nodeIndex > i ? LINE_COLOR.oil : 'var(--color-line)',
                      opacity: nodeIndex > i ? 0.85 : 0.35,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg-panel)]/94 px-5 py-4 backdrop-blur">
          <div className="flex items-start gap-5">
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                type="button"
                onClick={togglePlay}
                className="rounded border px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors"
                style={{
                  borderColor: playing ? 'var(--color-accent)' : 'var(--color-line)',
                  color: playing ? 'var(--color-accent)' : undefined,
                }}
              >
                {playing ? 'Пауза' : shot ? 'Продолжить' : 'Полный цикл'}
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  disabled={index <= 0}
                  className="flex-1 rounded border border-[var(--color-line)] px-2 py-1 font-mono text-[11px] disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  disabled={index < 0 || index >= FULL_CYCLE.length - 1}
                  className="flex-1 rounded border border-[var(--color-line)] px-2 py-1 font-mono text-[11px] disabled:opacity-30"
                >
                  →
                </button>
              </div>
            </div>

            {shot ? (
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-3">
                  <span
                    className="font-mono text-[9px] tracking-[0.14em] uppercase"
                    style={{ color: LINE_COLOR[shot.line] }}
                  >
                    {shot.line === 'ppd' ? 'Поддержание давления' : shot.line === 'gas' ? 'Газ' : 'Нефть'}
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--color-txt-faint)]">
                    {index + 1} / {FULL_CYCLE.length}
                  </span>
                </div>

                <h3 className="mt-1 text-[17px] leading-tight">{shot.title}</h3>
                <p className="mt-1.5 max-w-[70ch] text-[13px] leading-relaxed text-[var(--color-txt-dim)]">
                  {shot.body}
                </p>

                {shot.modules && shot.modules.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--color-txt-faint)] uppercase">
                      Здесь работают
                    </span>
                    {shot.modules.map((id) => (
                      <span
                        key={id}
                        className="rounded border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-[9px] tracking-[0.06em]"
                      >
                        {MODULES[id] ? moduleName(MODULES[id], naming) : id}
                      </span>
                    ))}
                  </div>
                )}

                {shot.illustrative && (
                  <p className="mt-2 font-mono text-[9px] tracking-[0.08em] text-[var(--color-txt-faint)] uppercase">
                    Числовые значения иллюстративны
                  </p>
                )}
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <h3 className="text-[17px] leading-tight">Полный цикл добычи</h3>
                <p className="mt-1.5 max-w-[70ch] text-[13px] leading-relaxed text-[var(--color-txt-dim)]">
                  Путь одной порции нефти от пласта до товарной: {FULL_CYCLE.length} кадров, камера
                  идёт по фактическому маршруту одной скважины через её замерную установку на
                  сборный пункт. Ветка поддержания пластового давления — в конце.
                </p>
              </div>
            )}
          </div>

          {/* Ветка ППД — отдельным рядом: это не участок пути нефти */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--color-line)] pt-2.5">
            <span className="font-mono text-[9px] tracking-[0.1em] text-[var(--color-txt-faint)] uppercase">
              Обратно в пласт
            </span>
            {STORYBOARD_PPD.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setCycleShot(s.id)}
                className="rounded px-1.5 py-0.5 font-mono text-[9px] tracking-[0.06em] whitespace-nowrap transition-colors"
                style={{
                  color: s.id === shotId ? LINE_COLOR.ppd : 'var(--color-txt-faint)',
                  borderBottom: `1px solid ${LINE_COLOR.ppd}`,
                  opacity: s.id === shotId ? 1 : 0.55,
                }}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
