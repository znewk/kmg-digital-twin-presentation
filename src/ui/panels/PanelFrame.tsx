import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { progressRef, useShow } from '../../store/useShow';
import { TOTAL_BEATS } from '../../data/stages';
import { MODULES, moduleName, moduleSubName, SOURCE_META, STATUS_META, type ModuleId } from '../../data/modules';

/**
 * Рама «проваливания» в модуль.
 *
 * Панель — не модалка, а такт того же скролл-таймлайна: она собирается из
 * прогресса и разбирается обратно при скролле вверх. Никакого состояния,
 * которое пришлось бы чинить на реверсе.
 *
 * Заголовок всегда несёт имя модуля и его статус — требование ТЗ §7: аудитория
 * должна отличать работающее от донасыщения и от целевого контура.
 */

interface Props {
  module: ModuleId;
  /** Подпись вкладки/экрана внутри модуля. */
  screen?: string;
  /** Пометка происхождения цифр на панели. */
  dataNote?: string;
  side?: 'left' | 'right' | 'full';
  children: ReactNode;
}

const TONE_COLOR = {
  ok: 'var(--color-ok)',
  warn: 'var(--color-warn)',
  risk: 'var(--color-risk)',
  dim: 'var(--color-txt-faint)',
} as const;

export function PanelFrame({ module, screen, dataNote, side = 'right', children }: Props) {
  const naming = useShow((s) => s.naming);
  const el = useRef<HTMLDivElement>(null);

  const m = MODULES[module];
  const source = SOURCE_META[m.source];
  const status = STATUS_META[m.status];
  const sub = moduleSubName(m, naming);

  // Появление привязано к прогрессу такта, а не к таймеру: скролл вверх
  // разбирает панель ровно теми же кадрами, что и собирал.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const node = el.current;
      if (!node) return;
      const raw = progressRef.current * TOTAL_BEATS;
      const t = raw - Math.floor(raw);
      // Панель входит в первые 35% такта и уходит в последние 15%.
      const inK = Math.min(1, t / 0.35);
      const outK = 1 - Math.max(0, (t - 0.85) / 0.15);
      const k = Math.max(0, Math.min(inK, outK));
      node.style.opacity = String(k);
      const dx = side === 'left' ? -1 : 1;
      node.style.transform =
        side === 'full' ? `scale(${0.985 + k * 0.015})` : `translateX(${(1 - k) * 26 * dx}px)`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [side]);

  const box =
    side === 'full'
      ? 'inset-x-24 top-24 bottom-56'
      : side === 'left'
        ? 'left-10 top-24 bottom-56 w-[46rem]'
        : // Ширина ограничена свободным местом слева от панели: в разборе
          // модуля слева стоит панель раздела, и на узком экране боковая
          // панель наезжала бы на неё. Предел считается от той же переменной,
          // что и отступ полноэкранных панелей, — раскладка одна.
          'right-10 top-24 bottom-56 w-[var(--panel-w,46rem)] max-w-[calc(100%-var(--stage-left,3rem)-3rem)]';

  return (
    <div ref={el} className={`panel pointer-events-auto absolute flex flex-col ${box}`}>
      {/*
        Шапка переносится по строкам. Утверждённые наименования доходят до
        шестидесяти знаков — «ABAI Планирование добычи и мониторинг (Целостность
        трубопроводов) 2.0», — и в одну строку с названием экрана и статусом они
        не помещаются ни при какой ширине панели. Сокращать текст нельзя: имя
        утверждено заказчиком, а сокращение на экране показа читается как другой
        продукт.
      */}
      <header
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b px-5 py-3"
        style={{ borderColor: 'var(--color-line)' }}
      >
        <span
          className="font-mono text-[11px] leading-snug tracking-[0.16em]"
          style={{ color: source.colorVar }}
        >
          {moduleName(m, naming)}
        </span>
        {screen && (
          <span className="font-mono text-[10px] tracking-[0.14em] text-[var(--color-txt-dim)]">
            {screen}
          </span>
        )}
        <span
          className="ml-auto font-mono text-[9px] uppercase tracking-[0.12em]"
          style={{ color: TONE_COLOR[status.tone] }}
        >
          {status.label}
        </span>
      </header>

      {sub && (
        <div className="border-b border-[var(--color-line)] px-5 py-1.5 font-mono text-[9px] tracking-[0.08em] text-[var(--color-txt-faint)]">
          в терминах ABAI — {sub}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden p-5">{children}</div>

      <footer className="flex items-center gap-3 border-t border-[var(--color-line)] px-5 py-2">
        {m.pilotScope && (
          <span className="font-mono text-[9px] tracking-[0.08em] text-[var(--color-txt-dim)]">
            периметр пилота: {m.pilotScope}
          </span>
        )}
        {dataNote && (
          <span className="ml-auto font-mono text-[9px] tracking-[0.08em] text-[var(--color-txt-faint)]">
            {dataNote}
          </span>
        )}
      </footer>
    </div>
  );
}
