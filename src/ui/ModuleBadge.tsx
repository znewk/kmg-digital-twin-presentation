import {
  MODULES,
  STATUS_META,
  SOURCE_META,
  moduleName,
  moduleSubName,
  type ModuleId,
} from '../data/modules';
import { useShow } from '../store/useShow';

const TONE_COLOR = {
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  risk: 'var(--color-risk)',
  dim: 'var(--color-txt-faint)',
} as const;

/**
 * Бейдж модуля. Кроме имени всегда несёт статус — это прямое требование ТЗ §7:
 * техническая аудитория МЭПМ не должна принять подключаемое за работающее, а целевой
 * контур за работающий. Неработающие модули ABAI помечаются явно.
 */
export function ModuleBadge({ id, compact = false }: { id: ModuleId; compact?: boolean }) {
  const naming = useShow((s) => s.naming);
  const m = MODULES[id];
  const source = SOURCE_META[m.source];
  const status = STATUS_META[m.status];
  const sub = moduleSubName(m, naming);

  return (
    <span
      // Ширина ограничена, текст переносится: длинные утверждённые наименования
      // иначе растягивают бейдж на пол-экрана и выдавливают соседние.
      className="inline-flex max-w-[15rem] flex-col gap-0.5 border-l-2 py-1 pl-2 pr-3 align-top"
      style={{
        borderLeftColor: source.colorVar,
        background: 'oklch(24% 0.02 250 / 0.45)',
      }}
    >
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span
          className="font-mono text-[10px] tracking-[0.14em]"
          style={{ color: source.colorVar }}
        >
          {moduleName(m, naming)}
        </span>
        {!compact && (
          <span
            className="font-mono text-[8.5px] uppercase tracking-[0.1em]"
            style={{ color: TONE_COLOR[status.tone] }}
          >
            {status.label}
          </span>
        )}
      </span>
      {sub && (
        <span className="font-mono text-[8.5px] tracking-[0.06em] text-[var(--color-txt-faint)]">
          {sub}
        </span>
      )}
    </span>
  );
}
