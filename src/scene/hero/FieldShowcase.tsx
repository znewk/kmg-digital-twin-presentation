import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { progressRef } from '../../store/useShow';
import { TOTAL_BEATS } from '../../data/stages';
import { DataMotes } from './DataMotes';
import { Diorama, DIORAMA_BOTTOM } from './Diorama';

/** Радиус подиума под диорамой: чуть шире её диагонали в плане. */
const PODIUM_R = 40;

/**
 * «Витрина месторождения» — приветственный экран (ТЗ §8.2).
 *
 * Вращение строго от скролла и реверсивно: `rotation.y` — чистая функция
 * прогресса, никакой автономной анимации и никакого предрендеренного видео.
 * Экран первый и лёгкий, живое 3D тянет с запасом даже на низком тире.
 *
 * Интерфейса, подписей и интерактива здесь нет намеренно — чистый вход.
 */

/**
 * Поворот за такт скролла и стартовая фаза.
 *
 * Амплитуда намеренно небольшая: вырез — главное, что показывает витрина, и
 * при полном обороте он уезжает от камеры уже на трети прокрутки, оставляя
 * зрителю глухую боковую стенку. Блок начинает повёрнутым влево и проходит
 * через фронтальный ракурс, так что плоскости реза видны всё время.
 */
const TURN_PER_BEAT = 0.95;
const TURN_START = -0.45;

/** Свет витрины: масштаб десятки метров, теневая камера под него и настроена. */
function ShowcaseLighting({ shadows }: { shadows: boolean }) {
  return (
    <>
      <directionalLight
        color="#efe6d8"
        intensity={2.1}
        position={[46, 62, 30]}
        castShadow={shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0008}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={10}
        shadow-camera-far={200}
      />
      <directionalLight color="#6e86c8" intensity={0.75} position={[-40, -12, -55]} />
      {/* Заполняющий в вырез блока. Без него плоскости реза — а это главное,
          что показывает витрина, — уходят в чёрное. */}
      <pointLight color="#a9c4e8" intensity={2600} distance={190} decay={2} position={[6, 6, 54]} />
    </>
  );
}

export function FieldShowcase({ shadows }: { shadows: boolean }) {
  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);

  useFrame(() => {
    // Единственный источник движения — прогресс скролла.
    const heroT = progressRef.current * TOTAL_BEATS;

    if (spin.current) spin.current.rotation.y = TURN_START + heroT * TURN_PER_BEAT;

    if (root.current) {
      // Уход экспоната по мере выхода из первого такта: опускается и уменьшается,
      // освобождая кадр под архитектурный экран.
      const out = THREE.MathUtils.clamp(heroT - 0.7, 0, 1);
      root.current.position.y = -3 - out * 30;
      root.current.scale.setScalar(1 - out * 0.2);
      root.current.visible = out < 0.995;
    }
  });

  return (
    <group ref={root} position={[0, -3, 0]}>
      <ShowcaseLighting shadows={shadows} />
      <group ref={spin}>
        <Diorama />

        {/* Подиум. Стенки строго вертикальные: при расширении книзу нижняя
            кромка выглядывает из-за верхней грани неровной дугой. Metalness = 0,
            иначе тёмный подиум ловит окружение и светлеет до серой тарелки. */}
        <mesh position={[0, DIORAMA_BOTTOM - 0.9, 0]} receiveShadow>
          <cylinderGeometry args={[PODIUM_R, PODIUM_R, 1.6, 96]} />
          <meshStandardMaterial
            color="#05090f"
            roughness={0.9}
            metalness={0}
            envMapIntensity={0.1}
          />
        </mesh>
        <mesh position={[0, DIORAMA_BOTTOM - 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[PODIUM_R * 0.94, PODIUM_R * 0.98, 96]} />
          <meshBasicMaterial color="#35d0c2" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <DataMotes />
    </group>
  );
}
