import { CONTOURS, IT_LANDSCAPE, LANDSCAPE_FACTS, UPSTREAM_CHAIN } from '../../data/upstreamData';
import { MODULES, moduleName, SOURCE_META } from '../../data/modules';
import { useShow } from '../../store/useShow';
import { usePanelProgress } from './usePanelProgress';
import { FullScreenPanel as FullScreen } from './kit';

/**
 * Блоки 1 и 2 сценария. Это полноэкранные схемы, а не «панели модуля», поэтому
 * они не используют PanelFrame — у них нет одного владельца-модуля.
 */

/** Блок 1: целевой образ ЦД Актива — структура мастер-архитектуры программы. */
export function ArchitecturePanel() {
  const t = usePanelProgress();
  const naming = useShow((s) => s.naming);
  const openDive = useShow((s) => s.openDive);

  // Нижняя полка, а не полный экран: этап идёт поверх глобуса, и планета
  // должна остаться в кадре — иначе гео-последовательность теряет смысл.
  return (
    <FullScreen sheet>
      <div className="flex h-full flex-col gap-3">
        <div className="shrink-0 border-b border-[var(--color-line)] pb-2">
          <div className="kicker text-[var(--color-nedra)]">
            Единый ЦД Актива · сквозная аналитика, интеграции и AI-агенты на единой платформе
          </div>
          <div className="mt-1 text-[0.8rem] text-[var(--color-txt-dim)]">
            Пилот — Молдабек Восточный (ЭМГ), промышленная эксплуатация к октябрю 2026 года
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-3" style={{ gridTemplateColumns: '0.8fr 1fr 1fr 1.6fr' }}>
          {CONTOURS.map((c, ci) => {
            const shown = t > ci * 0.16;
            return (
              /*
                Контур кликабелен: отсюда проваливаются в его раздел.
                Пятнадцать экранов разбора модулей больше не идут подряд в
                прокрутке — зритель сначала видит, из чего состоит двойник
                актива, и сам выбирает, во что углубиться.
              */
              <div
                key={c.name}
                role={c.dive ? 'button' : undefined}
                tabIndex={c.dive ? 0 : undefined}
                onClick={c.dive ? () => openDive(c.dive!) : undefined}
                className="pointer-events-auto flex min-h-0 flex-col border-t-2 transition-all duration-500 hover:brightness-125"
                style={{
                  borderColor: c.future ? 'var(--color-txt-faint)' : 'var(--color-abai)',
                  opacity: shown ? (c.future ? 0.45 : 1) : 0,
                  background: 'oklch(22% 0.02 250 / 0.4)',
                  cursor: c.dive ? 'pointer' : undefined,
                }}
              >
                <div className="flex items-baseline gap-2 px-3 pt-2.5">
                  <span className="font-mono text-[0.7rem] text-[var(--color-plast)]">{c.no}</span>
                  <span className="text-[0.82rem] font-semibold uppercase tracking-wide">{c.name}</span>
                </div>
                <div className="px-3 pt-1.5 text-[0.66rem] leading-snug text-[var(--color-txt-dim)]">
                  {c.claim}
                </div>
                {c.future && (
                  <div className="mx-3 mt-2 w-fit border border-[var(--color-txt-faint)] px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[var(--color-txt-faint)]">
                    2027 · вне периметра пилота
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-hidden px-3 py-2.5">
                  {c.blocks.map((b) => (
                    <div key={b.title} className="mb-2.5">
                      <div className="text-[0.68rem] font-semibold text-[var(--color-txt)]">
                        {b.title}
                      </div>
                      <ul className="mt-0.5 ml-3 list-disc text-[0.6rem] leading-tight text-[var(--color-txt-dim)]">
                        {b.items.map((i) => (
                          <li key={i}>{i}</li>
                        ))}
                      </ul>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                        {b.modules.map((mid) => {
                          const m = MODULES[mid];
                          return (
                            <span
                              key={mid}
                              className="font-mono text-[8.5px] tracking-[0.06em]"
                              style={{ color: SOURCE_META[m.source].colorVar }}
                            >
                              {moduleName(m, naming)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {c.dive && (
                  <div
                    className="px-3 pb-1 font-mono text-[8.5px] tracking-[0.12em] uppercase"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    Открыть раздел →
                  </div>
                )}

                <div className="flex flex-wrap gap-1 border-t border-[var(--color-line)] px-3 py-2">
                  {c.effects.map((e) => (
                    <span key={e.label} className="flex items-baseline gap-1">
                      <span className="font-mono text-[0.78rem] text-[var(--color-ok)]">{e.value}</span>
                      <span className="text-[0.55rem] leading-tight text-[var(--color-txt-dim)]">
                        {e.label}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-[var(--color-line)] pt-2 text-[0.62rem] text-[var(--color-txt-faint)]">
          ИС ABAI остаётся корпоративным учётным ядром. Комплекс ЦД обеспечивает расчётный и
          модельный контур: получает учётные данные из ABAI, моделирует и возвращает результаты.
        </div>
      </div>
    </FullScreen>
  );
}

/** Блок 2, такт 1: цепочка создания ценности UPSTREAM. */
export function UpstreamChainPanel() {
  const t = usePanelProgress();

  return (
    <FullScreen sheet>
      <div className="flex flex-col gap-5">
        <div className="kicker">Цепочка создания ценности UPSTREAM</div>

        <div className="flex items-stretch gap-2">
          {UPSTREAM_CHAIN.map((s, i) => {
            const shown = t > i * 0.17;
            return (
              <div key={s.id} className="flex flex-1 items-center gap-2">
                <div
                  className="flex-1 border-t-2 px-3 py-4 transition-all duration-500"
                  style={{
                    borderColor: 'var(--color-plast)',
                    opacity: shown ? 1 : 0.12,
                    transform: shown ? 'translateY(0)' : 'translateY(8px)',
                    background: 'oklch(22% 0.02 250 / 0.45)',
                  }}
                >
                  <div className="font-mono text-[0.62rem] text-[var(--color-txt-faint)]">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="mt-1 text-[0.85rem] leading-tight font-semibold">{s.name}</div>
                  <div className="mt-2 border-t border-[var(--color-line)] pt-1.5 text-[0.58rem] uppercase tracking-wide text-[var(--color-dob)]">
                    {s.handoff}
                  </div>
                </div>
                {i < UPSTREAM_CHAIN.length - 1 && (
                  <span
                    className="shrink-0 text-[var(--color-txt-faint)] transition-opacity duration-500"
                    style={{ opacity: t > i * 0.17 + 0.08 ? 1 : 0 }}
                  >
                    →
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <p className="max-w-4xl text-[0.78rem] leading-relaxed text-[var(--color-txt-dim)]">
          Все этапы UPSTREAM нужно связать в единый процесс с передачей данных от этапа к этапу.
          Автоматизация — лишь средство: требуются процессные и организационные изменения,
          кросс-функциональные команды по всей цепочке создания ценности.
        </p>
      </div>
    </FullScreen>
  );
}

/**
 * Блок 2, такт 2: сегодняшний ИТ-ландшафт. Смысл кадра — показать физический
 * объём разрозненности, поэтому системы выводятся все и плотно, а не списком
 * «основных»: именно количество плиток и есть аргумент.
 */
export function ItPatchworkPanel() {
  const t = usePanelProgress();
  const total = IT_LANDSCAPE.reduce((n, s) => n + s.systems.length, 0);
  let seen = 0;

  return (
    <FullScreen sheet>
      <div className="flex flex-col gap-3">
        {/* Цифры проблематики вынесены в шапку: в нижней полке вертикали в
            обрез, и отдельной строкой внизу они срезались краем кадра. */}
        <div className="flex shrink-0 items-end gap-8 border-b border-[var(--color-line)] pb-2">
          <div>
            <div className="kicker text-[var(--color-risk)]">
              Инженерный ИТ-ландшафт цепочки КЦ — КМГИ — ЭМГ сегодня
            </div>
            <div className="mt-1 text-[0.75rem] text-[var(--color-txt-dim)]">
              {total} систем на пять этапов. Единого интеграционного слоя нет, обмен идёт через
              Outlook и Excel.
            </div>
          </div>
          <div className="ml-auto flex gap-6">
            {LANDSCAPE_FACTS.map((f) => (
              <div key={f.label} className="flex items-baseline gap-2">
                <span className="font-mono text-[1.25rem] text-[var(--color-risk)]">{f.value}</span>
                <span className="max-w-44 text-[0.58rem] leading-tight text-[var(--color-txt-dim)]">
                  {f.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {IT_LANDSCAPE.map((stage) => (
            <div key={stage.stage} className="flex flex-col">
              <div className="mb-1.5 shrink-0 border-b border-[var(--color-line)] pb-1 text-[0.62rem] uppercase tracking-wide text-[var(--color-txt-dim)]">
                {stage.stage}
              </div>
              <div className="flex flex-wrap content-start gap-1">
                {stage.systems.map((sys) => {
                  const shown = seen++ / total < t;
                  return (
                    <span
                      key={sys.name}
                      className="border px-2 py-1 text-[0.68rem] whitespace-nowrap transition-opacity duration-300"
                      style={{
                        opacity: shown ? 1 : 0,
                        borderColor: sys.own ? 'var(--color-abai)' : 'var(--color-line)',
                        color: sys.own ? 'var(--color-abai)' : 'var(--color-txt-dim)',
                        background: sys.own ? 'oklch(30% 0.06 250 / 0.35)' : 'transparent',
                      }}
                    >
                      {sys.name}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

      </div>
    </FullScreen>
  );
}
