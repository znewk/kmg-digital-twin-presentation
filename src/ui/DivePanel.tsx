import { useEffect } from 'react';
import { DIVE_BY_ID } from '../data/dives';
import { moduleName, MODULES, SOURCE_META } from '../data/modules';
import { DOSSIER } from '../data/moduleDossier';
import { useShow } from '../store/useShow';
import { REGISTRY } from './panels';

/** Раздел досье: заголовок и список. Пустые разделы не рисуются вовсе. */
function DossierList({
  title,
  items,
  accent,
}: {
  title: string;
  items: string[];
  accent?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3">
      <div
        className="font-mono text-[8.5px] tracking-[0.12em] uppercase"
        style={{ color: accent ?? 'var(--color-txt-faint)' }}
      >
        {title}
      </div>
      <ul className="mt-1 ml-3 list-disc text-[0.68rem] leading-snug text-[var(--color-txt-dim)]">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Раздел контура: разбор модуля на объекте Молдабека.
 *
 * Слева — что это за модуль и зачем он нужен, справа — его настоящий экран,
 * посередине остаётся 3D-сцена с объектом, к которому подлетела камера. Раньше
 * панель модуля занимала экран целиком, и сцена, ради которой всё построено,
 * стояла за ней закрытой; §8.3 требует обратного — объект виден, панель
 * дополняет вид.
 */
export function DivePanel() {
  const dive = useShow((s) => s.dive);
  const naming = useShow((s) => s.naming);
  const setDiveStep = useShow((s) => s.setDiveStep);
  const closeDive = useShow((s) => s.closeDive);

  const d = dive ? DIVE_BY_ID.get(dive.id) : null;
  const step = d?.steps[dive?.step ?? 0] ?? null;

  /**
   * Шаг раздела включает свои режимы сцены и гасит чужие — тем же правилом,
   * что и кадр цикла: состояние задаётся целиком по текущему шагу, чтобы
   * возврат назад не оставлял гореть слои предыдущего.
   */
  useEffect(() => {
    if (!step) return;
    const want = step.setup ?? {};
    const f = want.features ?? {};
    useShow.setState((s) => ({
      exploded: want.exploded ?? false,
      clip: want.clip ?? false,
      features: {
        ...s.features,
        grid: f.grid ?? false,
        isolines: f.isolines ?? false,
        seismic: f.seismic ?? false,
        flood: f.flood ?? false,
        cone: f.cone ?? false,
        drainage: f.drainage ?? false,
        utilities: f.utilities ?? false,
        traces: f.traces ?? false,
        flow: true,
      },
    }));
  }, [step]);

  if (!dive || !d || !step) return null;

  const Panel = step.panel ? REGISTRY[step.panel] : null;
  const accent = d.twin ? `var(--color-${d.twin})` : 'var(--color-nedra)';

  /**
   * Досье берётся по ПЕРВОМУ модулю шага — тому, вокруг которого шаг и
   * построен. Остальные перечислены бейджами: показывать три досье подряд
   * значит превратить панель в справочник, который на показе никто не читает.
   */
  const dossier = step.modules?.map((id) => DOSSIER[id]).find(Boolean) ?? null;

  return (
    <>
      {Panel && <Panel />}

      <div className="pointer-events-auto absolute top-24 left-8 flex w-[22rem] flex-col gap-3 rounded border border-[var(--color-line)] bg-[var(--color-bg-panel)]/94 px-4 py-3.5 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              {d.no && (
                <span className="font-mono text-[0.72rem]" style={{ color: accent }}>
                  {d.no}
                </span>
              )}
              <span className="text-[0.95rem] font-semibold">{d.title}</span>
            </div>
            {d.future && (
              <span className="mt-1 inline-block border border-[var(--color-txt-faint)] px-1.5 py-0.5 font-mono text-[8px] tracking-[0.1em] text-[var(--color-txt-faint)] uppercase">
                2027 · вне периметра пилота
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={closeDive}
            className="shrink-0 rounded border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10px] tracking-[0.1em] uppercase hover:border-[var(--color-accent)]"
          >
            Выход
          </button>
        </div>

        <p className="border-l-2 pl-2.5 text-[0.7rem] leading-relaxed text-[var(--color-txt-dim)]" style={{ borderColor: accent }}>
          {d.purpose}
        </p>

        <div className="border-t border-[var(--color-line)] pt-3">
          <div className="font-mono text-[9px] tracking-[0.1em] text-[var(--color-txt-faint)] uppercase">
            Шаг {dive.step + 1} из {d.steps.length}
          </div>
          <h3 className="mt-1 text-[0.95rem] leading-tight">{step.title}</h3>
          <p className="mt-1.5 text-[0.75rem] leading-relaxed text-[var(--color-txt-dim)]">
            {step.body}
          </p>

          {step.modules && step.modules.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {step.modules.map((id) => {
                const m = MODULES[id];
                if (!m) return null;
                return (
                  <span
                    key={id}
                    className="rounded border border-[var(--color-line)] px-1.5 py-0.5 font-mono text-[9px] tracking-[0.06em]"
                    style={{ color: SOURCE_META[m.source].colorVar }}
                  >
                    {moduleName(m, naming)}
                  </span>
                );
              })}
            </div>
          )}

          {step.illustrative && (
            <p className="mt-2 font-mono text-[9px] tracking-[0.08em] text-[var(--color-txt-faint)] uppercase">
              Числовые значения иллюстративны
            </p>
          )}
        </div>

        {/*
          Досье модуля: что получает, как обрабатывает, что отдаёт и чего пока
          не умеет. Собрано из отчёта об обследовании, сценария демо и
          официальной документации продукта — ничего не дописано «для полноты».

          Ограничения показаны наравне с возможностями и не смягчены: отчёт
          прямо фиксирует, что у переданной ГДМ не оценена прогнозная
          способность, — показывать модуль так, будто этого нет, значит
          подставить докладчика под первый же вопрос профильной аудитории.
        */}
        {dossier && (
          <div className="max-h-[42vh] overflow-y-auto border-t border-[var(--color-line)] pt-3">
            <p className="text-[0.72rem] leading-relaxed">{dossier.purpose}</p>

            <DossierList title="Получает" items={dossier.inputs} />
            <DossierList title="Обрабатывает" items={dossier.processing} />
            <DossierList title="Отдаёт" items={dossier.outputs} accent={accent} />

            {dossier.objects && dossier.objects.length > 0 && (
              <div className="mt-3">
                <div className="font-mono text-[8.5px] tracking-[0.12em] text-[var(--color-txt-faint)] uppercase">
                  Объекты Молдабека
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {dossier.objects.map((o) => (
                    <span
                      key={o}
                      className="rounded border border-[var(--color-line)] px-1.5 py-0.5 text-[9.5px] text-[var(--color-txt-dim)]"
                    >
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {dossier.limits && dossier.limits.length > 0 && (
              <div className="mt-3 border-l-2 border-[var(--color-warn,#d08b3a)] pl-2.5">
                <div className="font-mono text-[8.5px] tracking-[0.12em] text-[var(--color-txt-faint)] uppercase">
                  Ограничения на сегодня
                </div>
                <ul className="mt-1 ml-3 list-disc text-[0.68rem] leading-snug text-[var(--color-txt-dim)]">
                  {dossier.limits.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}

            {dossier.mapping && (
              <div className="mt-3 font-mono text-[8.5px] tracking-[0.08em] text-[var(--color-txt-faint)]">
                в терминах ABAI — {dossier.mapping}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 border-t border-[var(--color-line)] pt-2.5">
          <button
            type="button"
            onClick={() => setDiveStep(Math.max(0, dive.step - 1))}
            disabled={dive.step === 0}
            className="rounded border border-[var(--color-line)] px-2.5 py-1 font-mono text-[11px] disabled:opacity-30"
          >
            ←
          </button>
          <div className="flex flex-1 gap-1">
            {d.steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setDiveStep(i)}
                className="h-[3px] flex-1 transition-colors"
                style={{ background: i <= dive.step ? accent : 'var(--color-line)' }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDiveStep(Math.min(d.steps.length - 1, dive.step + 1))}
            disabled={dive.step >= d.steps.length - 1}
            className="rounded border border-[var(--color-line)] px-2.5 py-1 font-mono text-[11px] disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>
    </>
  );
}
