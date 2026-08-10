import { useEffect, useRef } from 'react';
import { progressRef, useShow } from '../store/useShow';
import { TOTAL_BEATS } from '../data/stages';
import { t, UI } from '../i18n';

/**
 * Приветственный экран по ТЗ §8.2 не несёт интерфейса, подписей и интерактива —
 * это сознательно чистый атмосферный вход. Единственное исключение — индикатор
 * прокрутки: без него зритель не знает, что презентация управляется скроллом.
 * Он же и гаснет первым.
 */
export function HeroOverlay() {
  const lang = useShow((s) => s.lang);
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const node = el.current;
      if (!node) return;
      const heroT = progressRef.current * TOTAL_BEATS;
      const opacity = Math.max(0, 1 - heroT * 4);
      node.style.opacity = String(opacity);
      node.style.visibility = opacity < 0.01 ? 'hidden' : 'visible';
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={el}
      className="absolute inset-x-0 bottom-10 flex flex-col items-center gap-3"
      style={{ transition: 'none' }}
    >
      <span className="kicker">{t(UI.scrollHint, lang)}</span>
      <span className="block h-10 w-px bg-gradient-to-b from-transparent via-[var(--color-txt-dim)] to-transparent" />
    </div>
  );
}
