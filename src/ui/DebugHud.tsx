import { useEffect, useRef } from 'react';
import { progressRef, useShow } from '../store/useShow';
import { renderStats } from '../scene/stats';
import { FLAT_BEATS } from '../data/stages';

/**
 * Служебный оверлей (Ctrl+D или ?debug). Нужен на прогоне: показывает,
 * какой тир качества выбрала автодеградация и держится ли кадровая частота.
 * На показе выключен.
 */
export function DebugHud() {
  const debug = useShow((s) => s.debug);
  const tier = useShow((s) => s.tier);
  const locked = useShow((s) => s.tierLocked);
  const naming = useShow((s) => s.naming);
  const lang = useShow((s) => s.lang);
  const beatIndex = useShow((s) => s.beatIndex);

  const fpsEl = useRef<HTMLSpanElement>(null);
  const progEl = useRef<HTMLSpanElement>(null);
  const callsEl = useRef<HTMLSpanElement>(null);
  const trisEl = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!debug) return;
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        const fps = Math.round((frames * 1000) / (now - last));
        if (fpsEl.current) fpsEl.current.textContent = String(fps);
        // Вызовы и треугольники обновляются вместе с частотой, а не каждый
        // кадр: они скачут, и мельтешащее число невозможно прочитать.
        if (callsEl.current) callsEl.current.textContent = String(renderStats.calls);
        if (trisEl.current) {
          trisEl.current.textContent = `${(renderStats.triangles / 1000).toFixed(0)}к`;
        }
        frames = 0;
        last = now;
      }
      if (progEl.current) progEl.current.textContent = progressRef.current.toFixed(4);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [debug]);

  if (!debug) return null;

  const beat = FLAT_BEATS[beatIndex];

  return (
    <div className="panel absolute top-6 right-6 px-3 py-2 font-mono text-[10px] leading-relaxed text-[var(--color-txt-dim)]">
      <div>
        fps <span ref={fpsEl} className="text-[var(--color-dob)]">—</span>
        {'  '}tier <span className="text-[var(--color-plast)]">{tier}</span>
        {locked && <span className="text-[var(--color-risk)]"> locked</span>}
      </div>
      <div>
        вызовов <span ref={callsEl} className="text-[var(--color-skv)]">—</span>
        {'  '}треуг. <span ref={trisEl} className="text-[var(--color-skv)]">—</span>
      </div>
      <div>
        progress <span ref={progEl}>0</span>
      </div>
      <div>
        beat {beatIndex} · {beat.stage.id}/{beat.id}
      </div>
      <div>
        naming {naming} · lang {lang}
      </div>
      <div className="mt-1 text-[var(--color-txt-faint)]">
        ← → шаг · P пауза · N имена · L язык · F экран · Esc сброс
      </div>
    </div>
  );
}
