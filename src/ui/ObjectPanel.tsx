import { OBJECT_BY_ID } from '../data/fieldObjects';
import { getFieldData } from '../data/geo/fieldData';
import { resolveObjectState, type ObjectState } from '../data/cycle/objectState';
import { MODULES, STATUS_META, SOURCE_META, moduleName, moduleSubName } from '../data/modules';
import { useShow } from '../store/useShow';

/**
 * Info-панель выбранного объекта (ТЗ §8.3, структура по §4.4.4).
 *
 * Панель **дополняет** приближенный 3D-вид, а не подменяет его: она узкая,
 * прижата к правому краю, а камера в это время смещает объект в левую треть
 * кадра. Модель остаётся видна всё время, пока разбираются её детали.
 *
 * Источник данных — реестр фонда и чертёж. Всё, чего в них нет, помечено на
 * самом поле: показатель без пометки отрисовать нельзя, он её несёт с собой.
 */

const HEALTH = {
  ok: { color: 'var(--color-ok)', label: 'в работе' },
  warning: { color: 'var(--color-warn)', label: 'отклонение' },
  critical: { color: 'var(--color-risk)', label: 'критично' },
} as const;

const STATUS_TONE = {
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  risk: 'var(--color-risk)',
  dim: 'var(--color-txt-faint)',
} as const;

/** Пометка «иллюстративно» — единый вид на все поля, где нет первоисточника. */
function Illustrative() {
  return (
    <span className="ml-1 font-mono text-[7.5px] tracking-[0.08em] text-[var(--color-warn)]">
      ИЛЛ
    </span>
  );
}

function StateCard({ state, onClose }: { state: ObjectState; onClose: () => void }) {
  const naming = useShow((s) => s.naming);
  const health = HEALTH[state.health];

  return (
    <>
      <header className="border-b border-[var(--color-line)] px-5 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <div className="kicker text-[var(--color-plast)]">{state.kind}</div>
            <h3 className="mt-1 font-mono text-[1.15rem] leading-tight font-semibold">
              {state.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.14em] text-[var(--color-txt-dim)] hover:text-[var(--color-txt)]"
            aria-label="Закрыть"
          >
            ESC
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: health.color }}
          />
          <span className="font-mono text-[9px] tracking-[0.12em] uppercase" style={{ color: health.color }}>
            {health.label}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="kicker mb-2">Показатели</div>
        <div className="flex flex-col gap-1.5">
          {state.params.map((p) => (
            <div key={p.label} className="flex items-baseline justify-between gap-2">
              <span className="text-[0.62rem] leading-tight text-[var(--color-txt-dim)]">
                {p.label}
              </span>
              <span className="shrink-0 text-right font-mono text-[0.72rem]">
                {p.value}
                {p.unit && (
                  <span className="ml-1 text-[0.55rem] text-[var(--color-txt-faint)]">{p.unit}</span>
                )}
                {p.illustrative && <Illustrative />}
              </span>
            </div>
          ))}
        </div>

        {state.sufficient.length > 0 && (
          <div className="mt-4 border-t border-[var(--color-line)] pt-2">
            <div className="kicker mb-1.5 text-[var(--color-ok)]">Обеспечено</div>
            {state.sufficient.map((s) => (
              <div key={s} className="mb-1 text-[0.62rem] leading-relaxed text-[var(--color-txt-dim)]">
                · {s}
              </div>
            ))}
          </div>
        )}

        {state.deficit.length > 0 && (
          <div className="mt-3 border-t border-[var(--color-line)] pt-2">
            <div className="kicker mb-1.5 text-[var(--color-warn)]">Не хватает</div>
            {state.deficit.map((s) => (
              <div key={s} className="mb-1 text-[0.62rem] leading-relaxed text-[var(--color-txt-dim)]">
                · {s}
              </div>
            ))}
          </div>
        )}

        {state.risk && (
          <div className="mt-3 border-t border-[var(--color-line)] pt-2">
            <div className="kicker mb-1.5" style={{ color: HEALTH[state.risk.level].color }}>
              Риск
            </div>
            <div className="text-[0.64rem] leading-relaxed">
              {state.risk.what}
              {state.risk.illustrative && <Illustrative />}
            </div>
            {(state.risk.probability || state.risk.horizon) && (
              <div className="mt-1 font-mono text-[0.6rem] text-[var(--color-txt-faint)]">
                {state.risk.probability} {state.risk.horizon}
              </div>
            )}
          </div>
        )}

        {state.forecast && (
          <div className="mt-3 border-t border-[var(--color-line)] pt-2">
            <div className="kicker mb-1.5">Прогноз</div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[0.62rem] text-[var(--color-txt-dim)]">
                {state.forecast.metric}
              </span>
              <span className="shrink-0 font-mono text-[0.7rem]">
                {state.forecast.value}
                {state.forecast.illustrative && <Illustrative />}
              </span>
            </div>
            <div
              className="mt-1 font-mono text-[8px] tracking-[0.1em]"
              style={{ color: SOURCE_META[MODULES[state.forecast.source].source].colorVar }}
            >
              считает {moduleName(MODULES[state.forecast.source], naming)}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-[var(--color-line)] pt-3">
          <div className="kicker mb-2">Управляющие модули</div>
          <div className="flex flex-col gap-2">
            {state.modules.map((ref, i) => {
              const m = MODULES[ref.id];
              const src = SOURCE_META[m.source];
              const st = STATUS_META[m.status];
              const sub = moduleSubName(m, naming);
              return (
                <div
                  key={`${ref.id}:${i}`}
                  className="border-l-2 py-1 pl-2"
                  style={{ borderColor: src.colorVar }}
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className="font-mono text-[10px] tracking-[0.12em]"
                      style={{ color: src.colorVar }}
                    >
                      {moduleName(m, naming)}
                    </span>
                    <span
                      className="ml-auto shrink-0 font-mono text-[8px] uppercase tracking-[0.1em]"
                      style={{ color: STATUS_TONE[st.tone] }}
                    >
                      {st.label}
                    </span>
                  </div>
                  {ref.role && (
                    <div className="mt-0.5 text-[0.6rem] text-[var(--color-txt)]">{ref.role}</div>
                  )}
                  {sub && (
                    <div className="mt-0.5 font-mono text-[8px] text-[var(--color-txt-faint)]">
                      {sub}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="border-t border-[var(--color-line)] px-5 py-2">
        <div className="font-mono text-[8px] leading-relaxed tracking-[0.08em] text-[var(--color-txt-faint)]">
          факт: {state.origin}
        </div>
        <div className="mt-0.5 font-mono text-[8px] tracking-[0.08em] text-[var(--color-warn)]">
          ИЛЛ — значение иллюстративное, в переданных данных отсутствует
        </div>
      </footer>
    </>
  );
}

/** Прежняя карточка — для объектов старого реестра, ещё живущих в 2D-панелях. */
function LegacyCard({ id, onClose }: { id: string; onClose: () => void }) {
  const naming = useShow((s) => s.naming);
  const obj = OBJECT_BY_ID.get(id);
  if (!obj) return null;

  return (
    <>
      <header className="border-b border-[var(--color-line)] px-5 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <div className="kicker text-[var(--color-plast)]">{obj.subtitle ?? 'Объект'}</div>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-[1.2rem] leading-tight font-semibold">
              {obj.label}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.14em] text-[var(--color-txt-dim)] hover:text-[var(--color-txt)]"
          >
            ESC
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="kicker mb-2">Параметры</div>
        <div className="flex flex-col gap-2">
          {obj.params.map((p) => (
            <div key={p.label} className="flex items-baseline justify-between gap-2">
              <span className="text-[0.66rem] text-[var(--color-txt-dim)]">{p.label}</span>
              <span className="shrink-0 font-mono text-[0.82rem]">
                {p.value}
                {p.unit && (
                  <span className="ml-1 text-[0.58rem] text-[var(--color-txt-faint)]">{p.unit}</span>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-[var(--color-line)] pt-3">
          <div className="kicker mb-2">Привязанные модули</div>
          <div className="flex flex-col gap-2">
            {obj.modules.map((mid) => {
              const m = MODULES[mid];
              const src = SOURCE_META[m.source];
              return (
                <div key={mid} className="border-l-2 py-1 pl-2" style={{ borderColor: src.colorVar }}>
                  <span
                    className="font-mono text-[10px] tracking-[0.12em]"
                    style={{ color: src.colorVar }}
                  >
                    {moduleName(m, naming)}
                  </span>
                  <div className="mt-0.5 text-[0.6rem] leading-tight text-[var(--color-txt-dim)]">
                    {m.what}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="border-t border-[var(--color-line)] px-5 py-2">
        <span className="font-mono text-[8.5px] tracking-[0.1em] text-[var(--color-txt-faint)]">
          иллюстративные значения · замена на DEV-контур ABAI — правкой данных
        </span>
      </footer>
    </>
  );
}

export function ObjectPanel() {
  const selected = useShow((s) => s.selected);
  const select = useShow((s) => s.select);

  if (!selected) return null;

  // Датасет читается синхронно: к моменту клика по объекту промысла он уже
  // загружен — до промысла зритель проходит витрину, глобус и экраны страны.
  const data = getFieldData();
  const state = data ? resolveObjectState(selected, data) : null;
  const legacy = !state && OBJECT_BY_ID.has(selected);
  if (!state && !legacy) return null;

  return (
    <aside className="panel pointer-events-auto absolute top-24 right-8 bottom-28 flex w-[21rem] flex-col">
      {state ? (
        <StateCard state={state} onClose={() => select(null)} />
      ) : (
        <LegacyCard id={selected} onClose={() => select(null)} />
      )}
    </aside>
  );
}
