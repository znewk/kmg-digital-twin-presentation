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
 * ДИОРАМА ПРОМЫСЛА — экспонат приветственного экрана (ТЗ §8.2).
 *
 * Вырезанный из земли куб: сверху работающий промысел, на срезе — вся толща
 * под ним, сквозь которую идут стволы к продуктивному пласту. Одна картинка
 * отвечает на вопрос, о чём вообще показ: цифровой двойник — это надземное и
 * подземное как одно целое.
 *
 * ВСЁ ОБОРУДОВАНИЕ ЗДЕСЬ — НАСТОЯЩИЕ МОДЕЛИ ПРОМЫСЛА. Станки-качалки, ГЗУ,
 * сборный пункт, насосная станция, опоры ВЛ собираются теми же построителями,
 * что и объекты в основной сцене, и качалки качаются той же четырёхзвенной
 * кинематикой. Отдельные «красивые» модели для заставки означали бы, что
 * зритель на входе видит одно, а в самом показе другое.
 *
 * Форма куба — с вырезанной четвертью. Ровный параллелепипед показывает срез
 * только с одной стороны, и при повороте эта сторона половину времени смотрит
 * от зрителя. Вырез даёт две плоскости реза под прямым углом: хотя бы одна
 * всегда обращена в кадр.
 */

/** Полуразмер блока в плане и глубина, единицы сцены. */
const HALF = 26;
const DEPTH = 34;

/**
 * Подъём диорамы, чтобы её середина оказалась в прицеле витринного ракурса.
 *
 * Камера витрины смотрит в точку чуть ниже нуля и стоит далеко: блок, у
 * которого кровля на нуле, а подошва на минус тридцати четырёх, уходил бы из
 * кадра вниз, а над ним висела бы пустота.
 */
const LIFT = 13;

/** Отметка подошвы блока — по ней ставится подиум витрины. */
export const DIORAMA_BOTTOM = LIFT - DEPTH;

/**
 * Разрез диорамы — сжатая, но не выдуманная стратиграфия.
 *
 * Порядок и характер толщ те же, что в модели месторождения: почва,
 * перекрывающая толща с прослоями, продуктивный интервал, водонасыщенная
 * часть под ним, фундамент. Настоящие мощности сюда не переносятся — семьсот
 * метров разреза на блок в полсотни единиц дали бы полоски в пиксель, — но
 * последовательность и соотношение сохранены.
 */
interface Layer {
  id: string;
  /** Верх и низ в единицах сцены, вниз от поверхности. */
  top: number;
  bot: number;
  color: string;
  /** Продуктивный интервал — единственный, что светится. */
  pay?: boolean;
}

const LAYERS: Layer[] = [
  { id: 'soil', top: 0, bot: -2.2, color: '#8a7d68' },
  { id: 'over-1', top: -2.2, bot: -7.5, color: '#6f6a60' },
  { id: 'marker-1', top: -7.5, bot: -8.6, color: '#565049' },
  { id: 'over-2', top: -8.6, bot: -14.5, color: '#6a6a72' },
  { id: 'aquifer', top: -14.5, bot: -17.4, color: '#4b7ea6' },
  { id: 'seal', top: -17.4, bot: -20.6, color: '#5e6166' },
  { id: 'pay', top: -20.6, bot: -24.4, color: '#e0912b', pay: true },
  { id: 'water', top: -24.4, bot: -28.2, color: '#4d6f8c' },
  { id: 'base', top: -28.2, bot: -DEPTH, color: '#3a3d44' },
];

/**
 * Г-образный след блока: полный куб без одной четверти.
 *
 * Две коробки вместо вычитания: булевых операций в three нет, а собирать
 * L-образный контур вершинами ради девяти слоёв — писать полсотни строк там,
 * где хватает двух примитивов. Стык проходит по плоскостям реза, и шва не
 * видно: обе коробки одного материала и вплотную.
 */
function LayerSlab({ layer }: { layer: Layer }) {
  const h = layer.top - layer.bot;
  const y = (layer.top + layer.bot) / 2;

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: layer.color,
      roughness: layer.pay ? 0.5 : 0.95,
      metalness: layer.pay ? 0.1 : 0.02,
    });
    if (layer.pay) {
      m.emissive = new THREE.Color('#c06a12');
      m.emissiveIntensity = 0.55;
    }
    return m;
  }, [layer]);

  /**
   * Продуктивный пласт медленно «дышит».
   *
   * Не мигает и не бегает: это единственная нарочитая условность на экране, и
   * она означает ровно одно — вот то, ради чего всё остальное существует.
   * Период четыре секунды, амплитуда четверть яркости: заметно боковым
   * зрением, не отвлекает от чтения заголовка.
   */
  useFrame(({ clock }) => {
    if (!layer.pay) return;
    material.emissiveIntensity = 0.45 + 0.22 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.6));
  });

  return (
    <group position={[0, y, 0]}>
      <mesh material={material} castShadow receiveShadow position={[0, 0, -HALF / 2]}>
        <boxGeometry args={[HALF * 2, h, HALF]} />
      </mesh>
      <mesh material={material} castShadow receiveShadow position={[-HALF / 2, 0, HALF / 2]}>
        <boxGeometry args={[HALF, h, HALF]} />
      </mesh>
    </group>
  );
}

/** Статичная часть сборки — сливается по материалам, как в основной сцене. */
function StaticParts({
  parts,
  position,
  rotation = 0,
  scale = 1,
}: {
  parts: Part[];
  position: [number, number, number];
  rotation?: number;
  scale?: number;
}) {
  const merged = useMemo(() => mergeParts(parts), [parts]);

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {[...merged.entries()].map(([key, geometry]) => (
        <mesh key={key} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial {...MATERIALS[key as MatKey]} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Работающий станок-качалка — та же кинематика, что на промысле.
 *
 * Балансир, кривошип и шатун считаются по одной паре: шатун не «примерно
 * следует» за кривошипом, а соединяет его палец с задним концом балансира,
 * поэтому длина и наклон получаются из механизма, а не подбираются.
 */
function WorkingPumpjack({
  position,
  rotation,
  phase,
}: {
  position: [number, number, number];
  rotation: number;
  phase: number;
}) {
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
    const pose = pumpjackPose((clock.elapsedTime * Math.PI * 2) / 7 + phase);
    if (beam.current) beam.current.rotation.z = pose.beamAngle;
    if (crank.current) crank.current.rotation.z = pose.crankAngle;
    if (pitman.current) {
      pitman.current.position.copy(pose.pitmanMid);
      pitman.current.quaternion.copy(pose.pitmanQuat);
      pitman.current.scale.set(1, pose.pitmanLength, 1);
    }
  });

  const render = (m: Map<MatKey, THREE.BufferGeometry>) =>
    [...m.entries()].map(([key, geometry]) => (
      <mesh key={key} geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial {...MATERIALS[key]} />
      </mesh>
    ));

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {render(geo.base)}
      <group ref={beam}>{render(geo.beam)}</group>
      <group ref={crank}>{render(geo.crank)}</group>
      <group ref={pitman}>{render(geo.pitman)}</group>
    </group>
  );
}

/**
 * Расстановка на кровле блока.
 *
 * Скважины стоят над вырезом и у его края — так их стволы попадают на
 * плоскости реза и видны на всю глубину. Установки отнесены вглубь: они не
 * должны загораживать стволы, ради которых вырез и сделан.
 */
const WELLS: { at: [number, number]; yaw: number; phase: number }[] = [
  { at: [-6, 6], yaw: 0.2, phase: 0 },
  { at: [-15, 14], yaw: -0.35, phase: 2.1 },
  { at: [6, -6], yaw: 1.35, phase: 4.2 },
  { at: [15, 4], yaw: 1.1, phase: 1.1 },
];

/** Отметка кровли пласта — до неё доводятся стволы. */
const PAY_TOP = LAYERS.find((l) => l.pay)!.top;
const PAY_MID = (PAY_TOP + LAYERS.find((l) => l.pay)!.bot) / 2;

function Bores() {
  const geometry = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (const w of WELLS) {
      const len = -PAY_MID;
      const g = new THREE.CylinderGeometry(0.34, 0.34, len, 10);
      g.translate(w.at[0], PAY_MID + len / 2, w.at[1]);
      parts.push(g);
    }
    return parts;
  }, []);

  return (
    <>
      {geometry.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#2b3038" roughness={0.55} metalness={0.6} />
        </mesh>
      ))}
    </>
  );
}

export function Diorama() {
  return (
    <group position={[0, LIFT, 0]}>
      {LAYERS.map((l) => (
        <LayerSlab key={l.id} layer={l} />
      ))}

      <Bores />

      {/* Фонд: четыре работающих станка-качалки, у каждого своя фаза хода —
          синхронный ход выдал бы механическое повторение одной модели. */}
      {WELLS.map((w, i) => (
        <WorkingPumpjack
          key={i}
          position={[w.at[0], 0.1, w.at[1]]}
          rotation={w.yaw}
          phase={w.phase}
        />
      ))}

      {/* Наземные объекты — те же модели, что на промысле */}
      <StaticParts parts={buildGzu()} position={[-2, 0.1, -12]} rotation={0.4} scale={0.85} />
      <StaticParts parts={buildSp()} position={[13, 0.1, -17]} rotation={-0.5} scale={0.5} />
      <StaticParts parts={buildKns()} position={[-18, 0.1, -6]} rotation={1.2} scale={0.6} />

      {/* Линия электропередачи вдоль дальнего края */}
      {[-20, -8, 4, 16].map((x) => (
        <StaticParts key={x} parts={buildPole10()} position={[x, 0.1, -23]} />
      ))}
    </group>
  );
}
