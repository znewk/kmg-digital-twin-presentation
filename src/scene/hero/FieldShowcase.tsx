import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { progressRef } from '../../store/useShow';
import { TOTAL_BEATS } from '../../data/stages';
import {
  bedding,
  makeOilLensGeometry,
  makeSectorDisc,
  makeStratumGeometry,
  owcContour,
  wellCurve,
  BEDDING_MARKERS,
  OWC_Y,
  R,
  STRATA,
  WELLHEAD,
  Y_TOP,
} from './geometry';
import { Pumpjack } from './Pumpjack';
import { DataMotes } from './DataMotes';

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

  const strata = useMemo(
    () => STRATA.map((s) => ({ spec: s, geometry: makeStratumGeometry(s.top, s.bot) })),
    [],
  );

  // Тонкие прослои в перекрывающей толще. Без них верхние слои сливаются в
  // однородное коричневое пятно и разрез перестаёт читаться как разрез.
  const beddings = useMemo(
    () =>
      BEDDING_MARKERS.map((d) =>
        makeStratumGeometry(bedding(d), bedding(d - 0.45), { rings: 8, segs: 48 }),
      ),
    [],
  );
  const oilLens = useMemo(() => makeOilLensGeometry(), []);
  const owcDisc = useMemo(() => makeSectorDisc(OWC_Y, { radius: R * 0.99 }), []);
  const contour = useMemo(() => owcContour(), []);
  const well = useMemo(() => wellCurve(), []);

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
        {/* Шесть геологических слоёв */}
        {strata.map(({ spec, geometry }) => (
          <mesh key={spec.id} geometry={geometry} castShadow receiveShadow>
            <meshStandardMaterial
              color={spec.color}
              roughness={spec.roughness}
              metalness={0.04}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}

        {/* Прослои-маркеры в перекрывающей толще */}
        {beddings.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color="#4c463c" roughness={0.95} metalness={0} />
          </mesh>
        ))}

        {/* Залежь — единственный насыщенный янтарь во всей витрине.
            polygonOffset: плоскости реза линзы и пласта копланарны, без сдвига
            глубины они дают полосатый z-fighting прямо на главном объекте. */}
        <mesh geometry={oilLens}>
          <meshStandardMaterial
            color="#a86b1c"
            emissive="#e09330"
            emissiveIntensity={0.7}
            roughness={0.42}
            metalness={0.12}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>

        {/* Контур нефтеносности по ВНК */}
        <mesh>
          <tubeGeometry args={[contour, 140, 0.14, 6, true]} />
          <meshBasicMaterial color="#f5c46a" transparent opacity={0.95} depthWrite={false} />
        </mesh>

        {/* Плоскость ВНК — только в пределах сектора */}
        <mesh geometry={owcDisc}>
          <meshBasicMaterial
            color="#5fa8e8"
            transparent
            opacity={0.14}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* Ствол: обсадная колонна и светящийся керн траектории */}
        <mesh>
          <tubeGeometry args={[well, 56, 0.3, 8, false]} />
          <meshStandardMaterial color="#4a5a6e" roughness={0.4} metalness={0.7} />
        </mesh>
        <mesh>
          <tubeGeometry args={[well, 56, 0.13, 6, false]} />
          <meshBasicMaterial
            color="#a8ccff"
            transparent
            opacity={0.95}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>

        {/* Оборудование на своде блока */}
        {/* Масштаб сознательно преувеличен: настоящая качалка на блоке в 64
            единицы была бы точкой. Витрина — экспонат, а не карта. */}
        <Pumpjack
          position={[WELLHEAD[0], Y_TOP(WELLHEAD[0], WELLHEAD[1]), WELLHEAD[1]]}
          rotation={-1.1}
          scale={0.9}
        />

        {/* Подиум. Стенки строго вертикальные: при расширении книзу нижняя
            кромка выглядывает из-за верхней грани неровной дугой. Metalness = 0,
            иначе тёмный подиум ловит окружение и светлеет до серой тарелки. */}
        <mesh position={[0, -29.1, 0]} receiveShadow>
          <cylinderGeometry args={[R * 1.09, R * 1.09, 1.6, 96]} />
          <meshStandardMaterial
            color="#05090f"
            roughness={0.9}
            metalness={0}
            // Почти чёрный подиум всё равно ловит блик от процедурного
            // окружения и светлеет до серой тарелки, перетягивая внимание.
            envMapIntensity={0.1}
          />
        </mesh>
        <mesh position={[0, -28.26, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[R * 1.03, R * 1.07, 96]} />
          <meshBasicMaterial color="#35d0c2" transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>
      </group>

      <DataMotes />
    </group>
  );
}
