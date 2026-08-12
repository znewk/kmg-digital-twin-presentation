import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MATERIALS } from '../field/kit/Assembly';
import { mergeParts, type MatKey, type Part } from '../field/kit/parts';
import {
  buildPumpjackBeam,
  buildPumpjackCrank,
  buildPumpjackPitman,
  buildPumpjackStatic,
  pumpjackPose,
} from '../field/facilities/pumpjack';
import { buildGzu } from '../field/facilities/gzu';
import { buildSp } from '../field/facilities/sp';
import { buildKns } from '../field/facilities/kns';
import { buildPole10 } from '../field/facilities/pole';

/**
 * КАРИКАТУРА ПРОМЫСЛА НА КАРТЕ — вместо точки-маркера.
 *
 * Пока докладчик говорит о цифровом двойнике, на фоне стояла оранжевая точка.
 * Точка сообщает «здесь», и больше ничего: аудитория, не связанная с отраслью,
 * из неё не поймёт, о каком именно производстве речь. Здесь на том же месте
 * стоит наглядная сценка — качалки качают, факел горит, по коллектору бежит
 * нефть, — и процесс читается без единого слова.
 *
 * КАРИКАТУРА, А НЕ МОДЕЛЬ. Масштаб намеренно нереальный: настоящий промысел
 * пять на четыре километра на глобусе радиусом в сотню единиц — пятнышко в
 * доли пикселя. Здесь это укрупнённый значок с узнаваемым силуэтом; он
 * означает «месторождение», а не «вот столько там качалок».
 *
 * Оборудование при этом НАСТОЯЩЕЕ — те же построители, что и в сцене промысла,
 * и та же четырёхзвенная кинематика качалки. Рисовать для значка отдельные
 * модели значило бы, что на глобусе одно, а внутри показа другое.
 *
 * ЧИТАЕТСЯ СВЕРХУ, КАК ПЛАН. На карту камера смотрит почти отвесно, и объект
 * узнаётся не силуэтом сбоку, а расстановкой: два ряда качалок, между ними
 * нитка нефтесбора, на востоке сборный пункт, рядом факел. Поэтому раскладка
 * ортогональная — ряды по одной линии, трубы углами, а не лучами из центра.
 * Расходящаяся «звезда» из труб читалась как случайная клякса.
 */

/** Размер сценки в единицах глобуса. Подобран так, чтобы читалась силуэтом. */
const TOKEN_SCALE = 0.045;

/** Высота, на которой лежат нитки нефтесбора. */
const PIPE_Y = 1.4;

type P2 = [number, number];

function partsMesh(m: Map<MatKey, THREE.BufferGeometry>) {
  return [...m.entries()].map(([key, geometry]) => (
    <mesh key={key} geometry={geometry}>
      <meshStandardMaterial {...MATERIALS[key]} />
    </mesh>
  ));
}

/**
 * Станок-качалка с той же кинематикой, что на промысле, на отсыпанной площадке.
 *
 * Площадка не декоративная: значок стоит поверх янтарной заливки области, и
 * без тёмного основания стальная ферма на ней теряется. Отсыпка под каждым
 * объектом даёт этот контраст локально — в отличие от общего круга, который
 * читался чужой границей поверх контура области.
 */
function Pumpjack({ at, phase }: { at: P2; phase: number }) {
  const beam = useRef<THREE.Group>(null);
  const crank = useRef<THREE.Group>(null);
  const pitman = useRef<THREE.Group>(null);

  const geo = useMemo(
    () => ({
      base: mergeParts(buildPumpjackStatic()),
      beam: mergeParts(buildPumpjackBeam()),
      crank: mergeParts(buildPumpjackCrank()),
      pitman: mergeParts(buildPumpjackPitman()),
    }),
    [],
  );

  useFrame(({ clock }) => {
    const pose = pumpjackPose((clock.elapsedTime * Math.PI * 2) / 6 + phase);
    if (beam.current) beam.current.rotation.z = pose.beamAngle;
    if (crank.current) crank.current.rotation.z = pose.crankAngle;
    if (pitman.current) {
      pitman.current.position.copy(pose.pitmanMid);
      pitman.current.quaternion.copy(pose.pitmanQuat);
      pitman.current.scale.set(1, pose.pitmanLength, 1);
    }
  });

  return (
    <group position={[at[0], 0, at[1]]}>
      <mesh position={[-1, 0.06, 0]}>
        <boxGeometry args={[16, 0.3, 7.4]} />
        <meshStandardMaterial color="#2b2117" roughness={1} metalness={0} />
      </mesh>
      {partsMesh(geo.base)}
      <group ref={beam}>{partsMesh(geo.beam)}</group>
      <group ref={crank}>{partsMesh(geo.crank)}</group>
      <group ref={pitman}>{partsMesh(geo.pitman)}</group>
    </group>
  );
}

function Static({
  parts,
  at,
  yaw = 0,
  scale = 1,
}: {
  parts: Part[];
  at: P2;
  yaw?: number;
  scale?: number;
}) {
  const merged = useMemo(() => mergeParts(parts), [parts]);
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, yaw, 0]} scale={scale}>
      {partsMesh(merged)}
    </group>
  );
}

/**
 * Факел. Пламя — конус с бегущим шумом в цвете, а не частицы: частиц на значке
 * не разглядеть, а вертикальный язык с дрожащей яркостью читается сразу.
 *
 * Сверху вертикальный ствол вырождается в точку, поэтому у пламени есть ещё и
 * аддитивный ореол: с отвесного ракурса факел узнаётся по светящемуся пятну.
 */
function Flare({ at }: { at: P2 }) {
  const flame = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Дрожание по двум несовпадающим частотам: одна синусоида читается
    // механическим миганием, две дают живой огонь.
    const k = 1 + 0.16 * Math.sin(t * 7.3) + 0.09 * Math.sin(t * 11.7);
    if (flame.current) {
      flame.current.scale.set(1, k, 1);
      (flame.current.material as THREE.MeshBasicMaterial).opacity = 0.78 + 0.18 * Math.sin(t * 9.1);
    }
    if (halo.current) {
      halo.current.scale.setScalar(0.9 + 0.18 * Math.sin(t * 6.1));
    }
  });

  return (
    <group position={[at[0], 0, at[1]]}>
      {/* Отсыпка под факельной установкой */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[9, 0.3, 9]} />
        <meshStandardMaterial color="#2b2117" roughness={1} metalness={0} />
      </mesh>
      {/* Ствол */}
      <mesh position={[0, 11, 0]}>
        <cylinderGeometry args={[0.7, 1.3, 22, 8]} />
        <meshStandardMaterial color="#8c8f95" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh ref={flame} position={[0, 25, 0]}>
        <coneGeometry args={[2.1, 8, 10]} />
        <meshBasicMaterial color="#ff9a3c" transparent opacity={0.9} depthWrite={false} />
      </mesh>
      <mesh ref={halo} position={[0, 26, 0]}>
        <sphereGeometry args={[4.4, 12, 10]} />
        <meshBasicMaterial
          color="#ff7a1a"
          transparent
          opacity={0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Нитка промыслового трубопровода по ломаной, с бегущей по ней каплей.
 *
 * Ломаная, а не дуга: трубы на промысле идут вдоль дорог прямыми участками с
 * поворотами на углах, и сверху именно это читается разводкой, а дуга поперёк
 * площадки — случайной чертой. Тензия у сплайна нулевая, поэтому кривая
 * вырождается в отрезки и углы остаются углами.
 *
 * Направление показывает капля, а не мигание всей трубы: мигание сообщает
 * «здесь что-то происходит», капля — «продукция идёт отсюда туда».
 */
function Route({ points, phase = 0 }: { points: P2[]; phase?: number }) {
  const bead = useRef<THREE.Mesh>(null);

  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        points.map(([x, z]) => new THREE.Vector3(x, PIPE_Y, z)),
        false,
        'catmullrom',
        0,
      ),
    [points],
  );

  const geometry = useMemo(
    () => new THREE.TubeGeometry(curve, points.length * 8, 0.42, 6, false),
    [curve, points.length],
  );

  useFrame(({ clock }) => {
    if (!bead.current) return;
    const t = (clock.elapsedTime * 0.22 + phase) % 1;
    bead.current.position.copy(curve.getPointAt(t));
  });

  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial color="#b8801f" roughness={0.6} metalness={0.3} />
      </mesh>
      <mesh ref={bead}>
        <sphereGeometry args={[0.95, 10, 8]} />
        <meshBasicMaterial color="#ffd48a" />
      </mesh>
    </group>
  );
}

/**
 * Расстановка — план промысла в миниатюре.
 *
 * Два ряда качалок с запада, между рядами нефтесборный коллектор, на нём
 * замерная установка, восточнее сборный пункт, у сборного пункта факел (туда
 * уходит попутный газ) и насосная поддержания пластового давления, по южному
 * краю линия электропередачи. Тот же порядок, что на настоящем Молдабеке, и
 * тот минимум, по которому промысел узнаётся с одного взгляда.
 */
const WELLS: { at: P2; phase: number }[] = [
  { at: [-24, -11], phase: 0 },
  { at: [-11, -11], phase: 2.4 },
  { at: [2, -11], phase: 4.8 },
  { at: [-24, 11], phase: 1.2 },
  { at: [-11, 11], phase: 3.6 },
  { at: [2, 11], phase: 5.4 },
];

const GZU: P2 = [3, 0];
const SP: P2 = [20, 0];
const FLARE: P2 = [20, -15];
const KNS: P2 = [16, 14];

/** Коллектор идёт между рядами качалок — от западного куста к замерной установке. */
const TRUNK: P2[] = [
  [-24, 0],
  [GZU[0], 0],
];

export function FieldToken() {
  return (
    <group scale={TOKEN_SCALE}>
      {WELLS.map((w, i) => (
        <Pumpjack key={i} at={w.at} phase={w.phase} />
      ))}

      <Static parts={buildGzu()} at={GZU} />
      <Static parts={buildSp()} at={SP} scale={0.55} />
      <Static parts={buildKns()} at={KNS} scale={0.5} />
      <Flare at={FLARE} />

      {[-26, -14, -2, 10, 22].map((x) => (
        <Static key={x} parts={buildPole10()} at={[x, 20]} scale={0.9} />
      ))}

      {/* Выкидные линии скважин — углом на коллектор */}
      {WELLS.map((w, i) => (
        <Route key={i} points={[w.at, [w.at[0], 0]]} phase={i / WELLS.length} />
      ))}
      {/* Коллектор до замерной установки и напорный нефтепровод до сборного пункта */}
      <Route points={TRUNK} phase={0.15} />
      <Route points={[GZU, SP]} phase={0.5} />
      {/* Нитка газа со сборного пункта на факел */}
      <Route points={[[SP[0], -5], FLARE]} phase={0.8} />
    </group>
  );
}
