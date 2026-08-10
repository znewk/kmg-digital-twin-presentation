import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useShow } from '../store/useShow';

/**
 * Автодеградация качества (ТЗ §1, §10).
 *
 * Отличие от прототипа: там FPS мерялся на уже собранной тяжёлой сцене, то есть
 * решение принималось после того, как машина успевала захлебнуться. Здесь замер
 * идёт на приветственном экране — лёгкой сцене — и тир выставляется ДО того,
 * как смонтируется поле. Это единственный момент, когда деградация ещё бесплатна.
 *
 * Замер стартует после прогрева (первые кадры всегда рваные из-за компиляции
 * шейдеров) и усредняет фиксированное окно кадров.
 */

const WARMUP_FRAMES = 45;
const SAMPLE_FRAMES = 90;

/** Пороги подобраны с запасом: показ не терпит даже эпизодических просадок. */
const HIGH_FPS = 52;
const MID_FPS = 34;

export function usePerfTier() {
  const setTier = useShow((s) => s.setTier);
  const locked = useShow((s) => s.tierLocked);

  const frames = useRef(0);
  const accum = useRef(0);
  const done = useRef(false);

  // Заведомо слабые конфигурации не заслуживают даже замера.
  useEffect(() => {
    if (locked) {
      done.current = true;
      return;
    }
    const cores = navigator.hardwareConcurrency ?? 4;
    const smallViewport = Math.min(innerWidth, innerHeight) < 720;
    if (cores <= 2 || smallViewport) {
      setTier('low');
      done.current = true;
    }
  }, [locked, setTier]);

  useFrame((_, dt) => {
    if (done.current) return;
    frames.current++;
    if (frames.current <= WARMUP_FRAMES) return;

    accum.current += Math.min(dt, 0.1);
    if (frames.current < WARMUP_FRAMES + SAMPLE_FRAMES) return;

    done.current = true;
    const fps = SAMPLE_FRAMES / accum.current;
    setTier(fps >= HIGH_FPS ? 'high' : fps >= MID_FPS ? 'mid' : 'low');
  });
}

/** Настройки рендера по тиру — читаются и Canvas, и постобработкой. */
export const TIER_SETTINGS = {
  high: { dpr: [1, 1.5] as [number, number], shadows: true, bloom: true, outline: true },
  mid: { dpr: [1, 1.15] as [number, number], shadows: false, bloom: true, outline: false },
  low: { dpr: [1, 1] as [number, number], shadows: false, bloom: false, outline: false },
} as const;
