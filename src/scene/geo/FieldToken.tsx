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
  CRANK_X,
  CRANK_Y,
  PIVOT_X,
  PIVOT_Y,
} from '../field/facilities/pumpjack';
import { buildGzu } from '../field/facilities/gzu';
import { buildSp } from '../field/facilities/sp';
import { buildKns } from '../field/facilities/kns';
import { buildPole10 } from '../field/facilities/pole';
import { LAYOUT_OFFSET, TOKEN_SCALE } from './tokenLayout';
import { tokenCloseRef } from '../../store/useShow';

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
 * узнаётся не силуэтом сбоку, а расстановкой: разбросанные по площади качалки,
 * сходящаяся к замерной установке паутина выкидных линий, на востоке сборный
 * пункт, рядом факел. Именно разброс и делает картинку промыслом — почему, см.
 * у `WELLS`.
 *
 * СТОИТ НА КАРТЕ, А НЕ НАД НЕЙ. Размер, посадка на заливку области и сдвиг
 * вглубь неё — в `tokenLayout`: там же от них считается ракурс осмотра вблизи,
 * и порознь эти числа расходятся.
 */

/** Высота, на которой лежат нитки нефтесбора. */
const PIPE_Y = 1.4;

/**
 * Отсыпка под качалкой — по габариту самого станка, а не «с запасом».
 *
 * Пока станки стояли шеренгами вдоль одной оси, размер площадки ничего не решал:
 * между рядами было пусто. При разбросанной расстановке площадки — единственное,
 * что мешает станкам встать друг на друга, и лишние метры отсыпки съедают место,
 * в которое иначе помещается ещё одна качалка. Числа взяты по силуэту: станок
 * занимает от устья (−6,9) до редуктора (+4,4) и три с небольшим метра поперёк.
 */
const PAD_LONG = 13;
const PAD_WIDE = 5.4;
const PAD_CENTER = -1.2;

/**
 * Устье относительно центра станка: выкидная линия отходит от сальника под
 * головкой балансира, а не из-под рамы. Пока качалки стояли по одной линии,
 * разница пряталась внутри площадки; у развёрнутых станков труба, начинающаяся
 * из центра рамы, выходит из-под редуктора и сразу выдаёт, что она нарисована
 * отдельно от машины.
 */
const WELLHEAD_X = -6.8;

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
 *
 * ПОДВИЖНЫЕ УЗЛЫ СТОЯТ НА СВОИХ ОСЯХ. Балансир построен с началом координат на
 * оси качания, кривошип — на валу редуктора: так их можно вращать одной
 * матрицей, не пересчитывая геометрию. Но и ставить их тогда обязано что-то
 * внешнее — иначе оба ложатся в подошву станка, балансир с головкой тонет в
 * отсыпке, и от качалки остаётся голая пирамида стойки. Смещения те же, что у
 * промыслового фонда в `WellFarm`, и берутся из одних констант.
 */
function Pumpjack({ at, yaw, phase }: { at: P2; yaw: number; phase: number }) {
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
    <group position={[at[0], 0, at[1]]} rotation={[0, yaw, 0]}>
      <mesh position={[PAD_CENTER, 0.06, 0]}>
        <boxGeometry args={[PAD_LONG, 0.3, PAD_WIDE]} />
        <meshStandardMaterial color="#2b2117" roughness={1} metalness={0} />
      </mesh>
      {partsMesh(geo.base)}
      <group ref={beam} position={[PIVOT_X, PIVOT_Y, 0]}>
        {partsMesh(geo.beam)}
      </group>
      <group ref={crank} position={[CRANK_X, CRANK_Y, 0]}>
        {partsMesh(geo.crank)}
      </group>
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
 *
 * ОРЕОЛ ГАСНЕТ НА ПОДХОДЕ. Он решает ровно одну задачу — сделать факел заметным
 * там, где сам факел не виден. На пологом ракурсе ствол и пламя видны целиком,
 * а четырёхметровый шар вокруг них превращается из подсказки в оранжевый шар,
 * заслоняющий то, ради чего к промыслу подошли.
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
      const close = tokenCloseRef.current;
      halo.current.visible = close < 0.97;
      halo.current.scale.setScalar(0.9 + 0.18 * Math.sin(t * 6.1));
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - close);
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

const GZU: P2 = [3, 0];
const SP: P2 = [20, 0];
const FLARE: P2 = [20, -15];
const KNS: P2 = [16, 14];

interface Well {
  /** Центр станка в единицах расстановки. */
  at: P2;
  /** Разворот станка по горизонту, рад. */
  yaw: number;
  /** Фаза качания балансира. */
  phase: number;
  /** Ломаная выкидной линии от устья до замерной установки, без её конечной точки. */
  tie: P2[];
}

/**
 * РАССТАНОВКА — ПЛАН ПРОМЫСЛА В МИНИАТЮРЕ.
 *
 * Скважины разбросаны по площади и развёрнуты каждая по-своему, выкидные линии
 * сходятся паутиной на замерной установке; восточнее сборный пункт, у него факел
 * (туда уходит попутный газ) и насосная поддержания пластового давления, по
 * северному краю линия электропередачи.
 *
 * ПОЧЕМУ НЕ РЯДАМИ. Прежде качалки стояли двумя шеренгами по шесть, с прямым
 * коллектором между ними. Это читалось не промыслом, а заводским цехом: сетка
 * говорит, что расстановку кто-то вычертил, тогда как настоящий фонд стоит там,
 * где под ним нефть. Разброс с разворотами и сходящейся к узлу паутиной труб —
 * тот же силуэт, что на снимке любого зрелого месторождения.
 *
 * ЧИСЛА НЕ НА ГЛАЗ. Каждая пара «станок + отсыпка» — вытянутый прямоугольник в
 * тринадцать единиц длиной, и при произвольных разворотах они лезут друг на
 * друга, а трубы протыкают чужие станки. Поэтому позиции, развороты и ломаные
 * подобраны расчётом: площадки разведены до непересечения, а каждая нитка
 * проложена обходом чужих станков — отсюда изломы, которых иначе не было бы.
 * Двигать точки по одной нельзя: любая правка требует той же проверки заново.
 *
 * Устья смотрят в сторону замерной установки не строго: разворот задан с
 * разбросом. Строгая ориентация на узел выстроила бы качалки веером — та же
 * правильность, от которой уходили, только в полярных координатах.
 */
const WELLS: Well[] = [
  { at: [-26, 14], yaw: 2.74, phase: 0.0, tie: [[-17.8, 12.1], [-16, 7], [-14, 5]] },
  { at: [-25, 3.5], yaw: 2.37, phase: 2.1, tie: [[-16.6, 4.7]] },
  { at: [-26, -14], yaw: 1.23, phase: 4.2, tie: [[-23.6, -5.9], [-12, 1], [-6, 3]] },
  { at: [-18, -14], yaw: 1.53, phase: 0.7, tie: [[-13.3, -7], [-14, -3], [-12, 1], [-6, 3]] },
  { at: [-10.5, 10], yaw: 2.06, phase: 2.8, tie: [[-4.1, 14.3], [-6, 11], [-4, 7]] },
  { at: [-7, -14], yaw: 0.83, phase: 4.9, tie: [[-8.9, -6.6], [-4, -11], [0, -9]] },
  { at: [-6, -5.5], yaw: 0.71, phase: 1.4, tie: [[-7.9, 2.7]] },
  { at: [1.5, 10.5], yaw: 2.8, phase: 3.5, tie: [[9.1, 9.4], [8, 9]] },
  { at: [8, -12.5], yaw: 0.13, phase: 5.6, tie: [[1.9, -6.7]] },
];

/** Устье в координатах расстановки: сальник вынесен вперёд станка и повёрнут с ним. */
function wellhead(w: Well): P2 {
  return [
    w.at[0] + WELLHEAD_X * Math.cos(w.yaw),
    w.at[1] - WELLHEAD_X * Math.sin(w.yaw),
  ];
}

/** Готовые ломаные — считаются один раз, иначе трубы пересобирались бы на каждый кадр. */
const FLOWLINES: P2[][] = WELLS.map((w) => [wellhead(w), ...w.tie, GZU]);

export function FieldToken() {
  return (
    <group scale={TOKEN_SCALE}>
      {/*
        Расстановка сдвинута вглубь области: координата площадки лежит у самой
        восточной границы Атырауской, и значок читаемого размера, посаженный на
        неё центром, вылезал в соседнюю область. Почему сдвиг именно такой — см.
        `LAYOUT_OFFSET`.
      */}
      <group position={[LAYOUT_OFFSET[0], 0, LAYOUT_OFFSET[1]]}>
        {WELLS.map((w, i) => (
          <Pumpjack key={i} at={w.at} yaw={w.yaw} phase={w.phase} />
        ))}

        <Static parts={buildGzu()} at={GZU} />
        <Static parts={buildSp()} at={SP} scale={0.55} />
        <Static parts={buildKns()} at={KNS} scale={0.5} />
        <Flare at={FLARE} />

        {[-26, -14, -2, 10, 22].map((x) => (
          <Static key={x} parts={buildPole10()} at={[x, 20]} scale={0.9} />
        ))}

        {/* Выкидные линии — от устья к замерной установке, в обход чужих станков */}
        {FLOWLINES.map((line, i) => (
          <Route key={i} points={line} phase={i / FLOWLINES.length} />
        ))}
        {/* Напорный нефтепровод от замерной установки до сборного пункта */}
        <Route points={[GZU, SP]} phase={0.5} />
        {/* Нитка газа со сборного пункта на факел */}
        <Route points={[[SP[0], -5], FLARE]} phase={0.8} />
      </group>
    </group>
  );
}
