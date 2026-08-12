import { CYCLE_NODES, FULL_CYCLE, SHOT_BY_ID, STORYBOARD_PPD } from '../data/cycle/storyboard';
import { dedupeModules, moduleName, MODULES } from '../data/modules';
import { cycleRoutes } from '../data/cycle/route';
import { getFieldData } from '../data/geo/fieldData';
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
  const exitCycle = useShow((s) => s.exitCycle);

  // Маршрут уже посчитан и закэширован по датасету — здесь только чтение.
  const data = getFieldData();
  const route = data ? cycleRoutes(data).oil : null;

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

  /**
   * ДО ЗАПУСКА — ТОЛЬКО КНОПКА.
   *
   * Полная панель разворачивалась во всю ширину экрана ещё до того, как цикл
   * начали, и накрывала титры этапа в левом нижнем углу: нижняя карточка
   * оказывалась нечитаемой, а показ — захламлённым приглашением, которым ещё
   * не воспользовались. Пока цикл не идёт, здесь стоит одна кнопка, узкая и по
   * центру, — она ни с чем не пересекается.
   */
  if (!shot) {
    return (
      <div className="pointer-events-auto absolute inset-x-0 bottom-6 flex justify-center">
        <button
          type="button"
          onClick={togglePlay}
          className="rounded border border-[var(--color-line)] bg-[var(--color-bg-panel)]/95 px-5 py-2.5 text-left backdrop-blur transition-colors hover:border-[var(--color-accent)]"
        >
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase" style={{ color: LINE_COLOR.oil }}>
            Полный цикл добычи
          </span>
          <span className="mt-0.5 block text-[11px] text-[var(--color-txt-dim)]">
            Путь одной порции нефти от пласта до товарной — {FULL_CYCLE.length} кадров
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0">
      {/*
        Ширина — доля СЛОЯ, а не окна. Слой масштабируется под экран, и `vw`
        внутри него продолжает считаться от немасштабированного окна: на
        большом экране расчёт от `100vw` дал бы панель шире, чем есть места.
      */}
      <div className="mx-auto w-full max-w-[1120px] px-6 pb-5">
        {/*
          Шкала пути внутри карточки, а не над ней.

          Над карточкой она висела на прозрачном фоне, и на светлой земле
          подписи узлов пропадали вовсе — их набор в девять пунктов девятым
          кеглем читался только над тёмным небом. Внутри карточки у неё всегда
          есть подложка.
        */}
        <div className="rounded border border-[var(--color-line)] bg-[var(--color-bg-panel)]/97 px-5 pt-3.5 backdrop-blur">
        <div
          className="flex items-center px-1 pb-3 transition-opacity"
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

        <div className="border-t border-[var(--color-line)] px-0 pt-3.5 pb-4">
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
                {playing ? 'Пауза' : 'Продолжить'}
              </button>

              {/*
                Выход из режима, а не пауза. Пауза оставляет камеру у
                раскадровки и держит сцену некликабельной — выйти из цикла ею
                нельзя, и это тупик: зритель останавливает показ и не понимает,
                почему ничего не слушается.
              */}
              <button
                type="button"
                onClick={exitCycle}
                className="rounded border border-[var(--color-line)] px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors hover:border-[var(--color-accent)]"
              >
                Выход
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
                    {dedupeModules(shot.modules, naming).map((id) => (
                      <span
                        key={id}
                        className="max-w-full rounded border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-[9px] leading-snug tracking-[0.06em] break-words"
                      >
                        {MODULES[id] ? moduleName(MODULES[id], naming) : id}
                      </span>
                    ))}
                  </div>
                )}

                {/*
                  Маршрут показа выводится явно.
                  Цикл идёт по фактическому пути одной скважины, найденному в
                  данных, но зритель этого не видит и вынужден верить на слово —
                  а на вопрос «точно эта скважина?» отвечать расчётами по
                  датасету нельзя. Номер, горизонт, установка и сборный пункт
                  проверяются по чертежу и реестру за секунду.
                */}
                {route && (
                  <p className="mt-2 font-mono text-[9px] tracking-[0.06em] text-[var(--color-txt-faint)]">
                    {route.well.uwi}
                    {route.well.hor ? ` · горизонт ${route.well.hor}` : ''} → {route.gzu.name} →{' '}
                    {(route.collectorLength / 1000).toFixed(2)} км коллектора → {route.sp.name}
                  </p>
                )}

                {shot.illustrative && (
                  <p className="mt-2 font-mono text-[9px] tracking-[0.08em] text-[var(--color-txt-faint)] uppercase">
                    Числовые значения иллюстративны
                  </p>
                )}
              </div>
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
    </div>
  );
}
