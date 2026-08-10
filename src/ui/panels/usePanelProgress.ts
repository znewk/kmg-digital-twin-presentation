import { useEffect, useRef, useState } from 'react';
import { progressRef } from '../../store/useShow';
import { TOTAL_BEATS } from '../../data/stages';

/**
 * Прогресс внутри текущего такта, 0..1 — им «прорисовываются» графики.
 *
 * Значение отдаётся квантованным: графики перерисовываются только при заметном
 * изменении, а не на каждом кадре. Плавности хватает, а React не молотит
 * вхолостую — на показе это разница между 60 и 30 кадрами.
 */
export function usePanelProgress(steps = 60): number {
  const [v, setV] = useState(0);
  const last = useRef(-1);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const raw = progressRef.current * TOTAL_BEATS;
      const t = raw - Math.floor(raw);
      // Рисуем в первой половине такта, дальше держим готовый кадр.
      const drawn = Math.min(1, Math.max(0, (t - 0.2) / 0.45));
      const q = Math.round(drawn * steps);
      if (q !== last.current) {
        last.current = q;
        setV(q / steps);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [steps]);

  return v;
}
