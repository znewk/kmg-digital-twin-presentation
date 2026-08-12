import { CONTOURS, IT_LANDSCAPE, UPSTREAM_CHAIN } from '../../data/upstreamData';
import { MODULES, moduleName, SOURCE_META } from '../../data/modules';
import { useShow } from '../../store/useShow';
import { useRef } from 'react';
import { usePanelReserve } from '../panelReserve';

/**
 * ПЕРВЫЙ ЭТАП ПОКАЗА — ОДИН ЭКРАН ВМЕСТО ТРЁХ.
 *
 * Целевой образ, цепочка создания ценности и ИТ-ландшафт шли тремя отдельными
 * тактами, и каждый занимал экран целиком. Связь между ними при этом терялась:
 * зритель видел контуры двойника, потом — процесс, потом — россыпь систем, и
 * ничто не говорило, что это три взгляда на одно и то же.
 *
 * Здесь они собраны в один блок сверху вниз: ЧТО строим (контуры) → В КАКОМ
 * процессе (этапы UPSTREAM) → ЧЕМ работают сегодня (ландшафт). Каждая строка
 * отвечает на вопрос, оставшийся от предыдущей, и вывод — что разрозненные
 * инструменты нужно свести в один двойник — зритель делает сам, не выслушивая
 * его отдельно.
 *
 * Блок занимает НИЖНЮЮ ПОЛОВИНУ кадра. Верхняя остаётся сцене: там планета
 * подходит к Казахстану и дальше к Атырауской области с точкой Молдабека.
 * Панель на весь экран убила бы этот подлёт, а он и объясняет, где всё
 * происходит.
 *
 * Плашка ЕДИНАЯ и не проявляется по тактам. Проявление означало бы, что
 * зритель должен дождаться нужной строки, чтобы её прочесть; здесь всё
 * доступно сразу, а такты меняют только ракурс подлёта за ней.
 *
 * Высота ограничена половиной кадра, содержимое подобрано так, чтобы влезать
 * целиком: прокрутки внутри плашки нет. Скроллящийся блок на показе — это
 * содержание, которого зритель не увидит.
 */

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="kicker mb-1.5 shrink-0">{title}</div>
      {children}
    </div>
  );
}

export function IntroPanel() {
  const box = useRef<HTMLDivElement>(null);
  usePanelReserve(box);

  const naming = useShow((s) => s.naming);

  const total = IT_LANDSCAPE.reduce((n, s) => n + s.systems.length, 0);

  /** Контур ресурсной базы вне периметра пилота — в этой сводке не участвует. */
  const contours = CONTOURS.filter((c) => !c.future);

  return (
    <div ref={box} className="plate-in panel pointer-events-auto absolute inset-x-8 bottom-8 flex max-h-[54%] flex-col gap-2.5 overflow-hidden px-5 py-3.5">
      {/* ── Что строим ───────────────────────────────────────────────────── */}
      <Row title="Единый ЦД Актива · из чего он строится">
        <div className="grid shrink-0 gap-2.5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {contours.map((c) => (
            <div
              key={c.name}
              className="border-t-2 px-3 py-2"
              style={{
                borderColor: 'var(--color-abai)',
                background: 'oklch(22% 0.02 250 / 0.45)',
              }}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[0.7rem] text-[var(--color-plast)]">{c.no}</span>
                <span className="text-[0.8rem] font-semibold uppercase tracking-wide">
                  {c.name}
                </span>
              </div>
              <div className="mt-1 text-[0.66rem] leading-snug text-[var(--color-txt-dim)]">
                {c.claim}
              </div>
            </div>
          ))}
        </div>
      </Row>

      {/* ── В каком процессе ─────────────────────────────────────────────── */}
      <Row title="Цепочка создания ценности UPSTREAM">
        <div className="flex shrink-0 items-stretch gap-1.5">
          {UPSTREAM_CHAIN.map((s, i) => {
            const m = MODULES[s.module];
            return (
              <div key={s.id} className="flex flex-1 items-center gap-1.5">
                <div
                  className="flex-1 border-t-2 px-2.5 py-2"
                  style={{
                    borderColor: 'var(--color-plast)',
                    background: 'oklch(22% 0.02 250 / 0.45)',
                  }}
                >
                  <div className="font-mono text-[0.58rem] text-[var(--color-txt-faint)]">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="mt-0.5 text-[0.75rem] leading-tight font-semibold">{s.name}</div>
                  <div className="mt-1 text-[0.55rem] uppercase tracking-wide text-[var(--color-dob)]">
                    {s.handoff}
                  </div>
                  {/* Модуль, который закрывает этап: цепочка процесса и состав
                      двойника — про одно и то же, и связь должна быть видна. */}
                  <div
                    className="mt-1.5 border-t border-[var(--color-line)] pt-1 font-mono text-[0.55rem] leading-snug break-words"
                    style={{ color: SOURCE_META[m.source].colorVar }}
                  >
                    {moduleName(m, naming)}
                  </div>
                </div>
                {i < UPSTREAM_CHAIN.length - 1 && (
                  <span className="shrink-0 font-mono text-[0.7rem] text-[var(--color-txt-faint)]">
                    →
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Row>

      {/* ── Чем работают сегодня ─────────────────────────────────────────── */}
      <Row title={`Инженерный ИТ-ландшафт · ${total} систем, единого слоя между ними нет`}>
        <div className="grid min-h-0 gap-2 overflow-hidden" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {IT_LANDSCAPE.map((stage) => (
            <div key={stage.stage} className="flex min-h-0 flex-col">
              <div className="mb-1 shrink-0 border-b border-[var(--color-line)] pb-0.5 text-[0.55rem] uppercase tracking-wide text-[var(--color-txt-dim)]">
                {stage.stage}
              </div>
              <div className="flex flex-wrap content-start gap-1">
                {stage.systems.map((sys) => (
                  <span
                    key={sys.name}
                    className="border px-1.5 py-0.5 text-[0.6rem] whitespace-nowrap"
                    style={{
                      borderColor: sys.own ? 'var(--color-abai)' : 'var(--color-line)',
                      color: sys.own ? 'var(--color-abai)' : 'var(--color-txt-dim)',
                      background: sys.own ? 'oklch(30% 0.06 250 / 0.35)' : 'transparent',
                    }}
                  >
                    {sys.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Row>
    </div>
  );
}
