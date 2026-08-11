import { OBJECT_BY_ID } from '../data/fieldObjects';
import { MODULES, STATUS_META, SOURCE_META, moduleName, moduleSubName } from '../data/modules';
import { useShow } from '../store/useShow';

/**
 * Info-панель выбранного объекта (ТЗ §8.3).
 *
 * Панель **дополняет** приближенный 3D-вид, а не подменяет его: она узкая,
 * прижата к правому краю, а камера в это время смещает объект в левую треть
 * кадра (см. `focusFrameFor`). Модель объекта остаётся видна и в фокусе всё
 * время, пока разбираются его детали.
 */

const TONE = {
  plain: 'var(--color-txt)',
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  risk: 'var(--color-risk)',
} as const;

const STATUS_TONE = {
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  risk: 'var(--color-risk)',
  dim: 'var(--color-txt-faint)',
} as const;

export function ObjectPanel() {
  const selected = useShow((s) => s.selected);
  const select = useShow((s) => s.select);
  const naming = useShow((s) => s.naming);

  const obj = selected ? OBJECT_BY_ID.get(selected) : undefined;
  if (!obj) return null;

  return (
    <aside className="panel pointer-events-auto absolute top-24 right-8 bottom-28 flex w-[21rem] flex-col">
      <header className="border-b border-[var(--color-line)] px-5 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0">
            <div className="kicker text-[var(--color-plast)]">{obj.subtitle ?? 'Объект'}</div>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-[1.2rem] leading-tight font-semibold">
              {obj.label}
            </h3>
          </div>
          <button
            onClick={() => select(null)}
            className="ml-auto shrink-0 font-mono text-[10px] tracking-[0.14em] text-[var(--color-txt-dim)] hover:text-[var(--color-txt)]"
            aria-label="Закрыть"
          >
            ESC
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="kicker mb-2">Параметры</div>
        <div className="flex flex-col gap-2">
          {obj.params.map((p) => (
            <div key={p.label}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.66rem] text-[var(--color-txt-dim)]">{p.label}</span>
                <span
                  className="shrink-0 font-mono text-[0.82rem]"
                  style={{ color: TONE[p.tone ?? 'plain'] }}
                >
                  {p.value}
                  {p.unit && (
                    <span className="ml-1 text-[0.58rem] text-[var(--color-txt-faint)]">
                      {p.unit}
                    </span>
                  )}
                </span>
              </div>
              {p.forecast && (
                <div className="mt-0.5 text-right font-mono text-[0.58rem] text-[var(--color-dob)]">
                  прогноз · {p.forecast}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-[var(--color-line)] pt-3">
          <div className="kicker mb-2">Привязанные модули</div>
          <div className="flex flex-col gap-2">
            {obj.modules.map((mid) => {
              const m = MODULES[mid];
              const src = SOURCE_META[m.source];
              const st = STATUS_META[m.status];
              const sub = moduleSubName(m, naming);
              return (
                <div
                  key={mid}
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
                  {sub && (
                    <div className="mt-0.5 font-mono text-[8px] text-[var(--color-txt-faint)]">
                      {sub}
                    </div>
                  )}
                  <div className="mt-0.5 text-[0.6rem] leading-tight text-[var(--color-txt-dim)]">
                    {m.what}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {obj.pilotScope && (
          <div className="mt-4 border-t border-[var(--color-line)] pt-2 text-[0.6rem] leading-tight text-[var(--color-txt-faint)]">
            периметр пилота: {obj.pilotScope}
          </div>
        )}
      </div>

      <footer className="border-t border-[var(--color-line)] px-5 py-2">
        <span className="font-mono text-[8.5px] tracking-[0.1em] text-[var(--color-txt-faint)]">
          иллюстративные значения · замена на DEV-контур ABAI — правкой данных
        </span>
      </footer>
    </aside>
  );
}
