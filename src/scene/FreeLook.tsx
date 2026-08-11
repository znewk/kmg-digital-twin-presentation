import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useShow } from '../store/useShow';
import { CAMS, FLAT_BEATS } from '../data/stages';

/**
 * Свободный осмотр сцены.
 *
 * По ТЗ §2 скролл — основной способ навигации, но на этапе нужно уметь
 * «застрять» и разглядеть объекты. Поэтому орбита не борется со скроллом
 * постоянно, а включается режимом паузы: скролл замирает, камера переходит
 * под мышь, выход — тем же переключателем или Esc.
 *
 * При входе орбита подхватывает текущее положение камеры, чтобы кадр не
 * прыгнул, а при выходе таймлайн плавно забирает управление обратно.
 */
export function FreeLook() {
  const paused = useShow((s) => s.paused);
  const beatIndex = useShow((s) => s.beatIndex);
  const { camera } = useThree();
  const ref = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    if (!paused || !ref.current) return;
    // Цель берём из ракурса текущего такта: камера уже смотрит туда, и орбита
    // начинает вращение вокруг той же точки, а не вокруг начала координат.
    const cam = CAMS[FLAT_BEATS[beatIndex].cam];
    ref.current.target.set(cam.t[0], cam.t[1], cam.t[2]);
    ref.current.update();
  }, [paused, beatIndex, camera]);

  return (
    <OrbitControls
      ref={ref}
      enabled={paused}
      enableDamping
      dampingFactor={0.08}
      // Под землю пускаем: разглядывать стволы и залежь нужно именно снизу.
      maxPolarAngle={Math.PI * 0.98}
      minDistance={20}
      maxDistance={4000}
      makeDefault={false}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
}
