import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { progressRef, useShow } from '../store/useShow';
import { TOTAL_BEATS, TRACK_VH } from '../data/stages';

gsap.registerPlugin(ScrollTrigger);

/**
 * Скролл-трек: высокий пустой блок, задающий длину прокрутки. ScrollTrigger со
 * `scrub` пишет прогресс в мутабельный ref (см. комментарий в useShow) и только
 * при пересечении границы такта дёргает стор.
 *
 * Реверс работает бесплатно: `scrub` двусторонний, а всё содержимое этапов —
 * функции от прогресса, а не одноразовые твины.
 */
export function ScrollTrack() {
  const setBeatIndex = useShow((s) => s.setBeatIndex);
  const paused = useShow((s) => s.paused);

  useEffect(() => {
    // Без `trigger`: start/end считаются от вьюпорта, и `end: 'max'` даёт
    // прогресс по всему документу. С триггером-элементом ключевое слово `max`
    // разрешается иначе и прогресс мгновенно уезжает в единицу.
    const st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      scrub: true,
      onUpdate: (self) => {
        progressRef.current = self.progress;
        progressRef.direction = self.direction >= 0 ? 1 : -1;
        setBeatIndex(Math.floor(self.progress * TOTAL_BEATS));
      },
    });
    return () => st.kill();
  }, [setBeatIndex]);

  // «Застревание» на этапе: скролл замораживается, мышь уходит на орбиту сцены.
  useEffect(() => {
    document.body.style.overflow = paused ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [paused]);

  /**
   * Трек не должен принимать указатель.
   *
   * Это блок в обычном потоке документа высотой в тысячи процентов вьюпорта, и
   * рисуется он ПОСЛЕ канваса — то есть лежит поверх сцены на всю её площадь.
   * Фона у него нет, поэтому невидимо, но клики по объектам он забирает себе.
   * Прокрутке `pointer-events: none` не мешает: колесо обрабатывает документ, а
   * не этот блок.
   */
  return (
    <div aria-hidden className="pointer-events-none" style={{ height: `${TRACK_VH}vh` }} />
  );
}
