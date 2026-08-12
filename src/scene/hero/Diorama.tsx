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
import { buildKtp } from '../field/facilities/ktp';
import { buildRigStatic } from '../field/facilities/rig';
import { dome, makeLayer, outlineRadius, relief, type Fn } from './dioramaGeometry';

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

/** Глубина блока и подъём под витринный ракурс. */
const DEPTH = 34;
const LIFT = 13;

/** Отметка подошвы блока — по ней ставится подиум витрины. */
export const DIORAMA_BOTTOM = LIFT - DEPTH;

/**
 * РАЗРЕЗ ДИОРАМЫ — СЖАТЫЙ, НО НЕ ВЫДУМАННЫЙ.
 *
 * Порядок толщ тот же, что в модели месторождения: почва, перекрывающая толща
 * с прослоем-маркером, водоносный горизонт, непроницаемая покрышка,
 * продуктивный интервал, вода под ним, фундамент. Настоящие мощности сюда не
 * переносятся — семьсот метров разреза на блок в полсотни единиц дали бы
 * полоски в пиксель.
 *
 * ГЛАВНОЕ ОТЛИЧИЕ ОТ ПОЛОСАТОГО ПИРОГА: слои выгнуты сводом. Купол в середине
 * блока — то, из-за чего нефть вообще собирается в залежь: лёгкая нефть
 * всплывает и упирается в непроницаемую покрышку. Горизонтальные полосы с
 * покрашенной серединой были бы неправдой о том, почему нефть здесь.
 *
 * Свод растёт с глубиной: у поверхности его почти нет, у продуктивного пласта
 * он максимален. Так и выглядит унаследованная структура — приповерхностные
 * отложения выравнивают рельеф, глубокие повторяют форму фундамента.
 */
const BASE = {
  soil: -1.8,
  over1: -7.2,
  marker: -8.4,
  over2: -14.2,
  aquifer: -16.8,
  seal: -20.4,
  payTop: -20.4,
  owc: -24.2,
  payBot: -26.6,
  water: -30.4,
};

/** Насколько слой поднят сводом. */
const ARCH = {
  soil: 0.6,
  over1: 1.4,
  marker: 1.8,
  over2: 2.6,
  aquifer: 3.2,
  seal: 4.4,
  pay: 5.2,
  base: 3,
};

const at =
  (base: number, arch: number): Fn =>
  (x, z) =>
    base + arch * dome(x, z);

/** Кровля блока: свод плюс мелкая складчатость — не плита. */
const surface: Fn = (x, z) => 0.4 * dome(x, z) + relief(x, z);

/**
 * Водонефтяной контакт — СТРОГО ГОРИЗОНТАЛЬНАЯ отметка.
 *
 * Это не украшение, а физика: вода тяжелее нефти и лежит под ней ровной
 * плоскостью независимо от формы пласта. Поэтому нефтенасыщенная часть выходит
 * линзой — толстой в своде и сходящей на нет на крыльях, где кровля пласта
 * опускается ниже контакта. Ровно так залежь и рисуют на разрезах.
 */
const OWC: Fn = () => BASE.owc;

interface Layer {
  id: string;
  top: Fn;
  bot: Fn;
  color: string;
  roughness?: number;
  /** Нефтенасыщенная линза — единственное, что светится. */
  pay?: boolean;
}

const LAYERS: Layer[] = [
  { id: 'soil', top: surface, bot: at(BASE.soil, ARCH.soil), color: '#7d6f57' },
  { id: 'over-1', top: at(BASE.soil, ARCH.soil), bot: at(BASE.over1, ARCH.over1), color: '#8a7a63' },
  { id: 'marker', top: at(BASE.over1, ARCH.over1), bot: at(BASE.marker, ARCH.marker), color: '#5d5750' },
  { id: 'over-2', top: at(BASE.marker, ARCH.marker), bot: at(BASE.over2, ARCH.over2), color: '#7a7264' },
  { id: 'aquifer', top: at(BASE.over2, ARCH.over2), bot: at(BASE.aquifer, ARCH.aquifer), color: '#4f86ad' },
  { id: 'seal', top: at(BASE.aquifer, ARCH.aquifer), bot: at(BASE.seal, ARCH.seal), color: '#4e5259' },
  {
    id: 'oil',
    top: at(BASE.payTop, ARCH.pay),
    bot: (x, z) => Math.max(OWC(x, z), at(BASE.payBot, ARCH.pay)(x, z)),
    color: '#f0a038',
    roughness: 0.45,
    pay: true,
  },
  {
    id: 'pay-water',
    top: (x, z) => Math.min(OWC(x, z), at(BASE.payTop, ARCH.pay)(x, z)),
    bot: at(BASE.payBot, ARCH.pay),
    color: '#3f74a0',
    roughness: 0.5,
  },
  { id: 'under', top: at(BASE.payBot, ARCH.pay), bot: at(BASE.water, ARCH.base), color: '#5a6470' },
  { id: 'base', top: at(BASE.water, ARCH.base), bot: () => -DEPTH, color: '#33373f' },
];

function LayerBody({ layer }: { layer: Layer }) {
  const geometry = useMemo(() => makeLayer(layer.top, layer.bot), [layer]);

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: layer.color,
      roughness: layer.roughness ?? 0.95,
      metalness: layer.pay ? 0.1 : 0.02,
    });
    if (layer.pay) {
      m.emissive = new THREE.Color('#c9701a');
      m.emissiveIntensity = 0.5;
    }
    return m;
  }, [layer]);

  /**
   * Залежь медленно «дышит». Не мигает и не бегает: единственная нарочитая
   * условность на экране, и означает она ровно одно — вот то, ради чего всё
   * остальное существует.
   */
  useFrame(({ clock }) => {
    if (!layer.pay) return;
    material.emissiveIntensity = 0.42 + 0.24 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.5));
  });

  return <mesh geometry={geometry} material={material} castShadow receiveShadow />;
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
  { at: [-7, -9], yaw: 0.25, phase: 0 },
  { at: [-17, 2], yaw: -0.4, phase: 2.1 },
  { at: [-5, 12], yaw: 1.2, phase: 4.2 },
  { at: [-19, -12], yaw: 0.9, phase: 1.1 },
  { at: [7, 14], yaw: -1.1, phase: 3.4 },
  { at: [16, 6], yaw: 0.5, phase: 5.2 },
];

/** Отметка середины залежи — до неё доводятся стволы. */
const PAY_MID_Y = (BASE.payTop + BASE.owc) / 2 + ARCH.pay * 0.6;

/**
 * Стволы доводятся до залежи и видны на срезе.
 *
 * Устье садится на рельеф, а не на нулевую отметку: кровля блока волнистая, и
 * колонна, начатая от нуля, у одних скважин висела бы в воздухе, у других
 * уходила бы в грунт.
 */
function Bores() {
  const geometry = useMemo(
    () =>
      WELLS.map((w) => {
        const top = surface(w.at[0], w.at[1]) + 1.2;
        const len = top - PAY_MID_Y;
        const g = new THREE.CylinderGeometry(0.3, 0.3, len, 10);
        g.translate(w.at[0], PAY_MID_Y + len / 2, w.at[1]);
        return g;
      }),
    [],
  );

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

/**
 * Наземное хозяйство диорамы.
 *
 * Расставлено так, чтобы промысел выглядел обжитым, а не составленным из трёх
 * образцов: скважины кустами, установки между ними, линия электропередачи по
 * краю. Вырезанный сектор (восточный ближний угол) остаётся пустым — в нём
 * земли нет, и поставленный там объект висел бы над пропастью.
 */
const FACILITIES: { parts: () => Part[]; at: [number, number]; yaw: number; scale: number }[] = [
  { parts: buildGzu, at: [-13, 8], yaw: 0.4, scale: 0.8 },
  { parts: buildGzu, at: [2, 17], yaw: -0.9, scale: 0.8 },
  { parts: buildSp, at: [14, -14], yaw: -0.5, scale: 0.5 },
  { parts: buildKns, at: [-20, 10], yaw: 1.2, scale: 0.55 },
  { parts: buildKtp, at: [-2, 2], yaw: 0.2, scale: 0.9 },
  { parts: buildKtp, at: [10, 20], yaw: -0.4, scale: 0.9 },
  { parts: buildRigStatic, at: [20, -3], yaw: 0.7, scale: 0.55 },
];

/** Опоры ВЛ по дуге вдоль дальнего края — заполняют пустой край блока. */
const POLES = [2.3, 2.7, 3.1, 3.5, 3.9, 4.3].map((a): [number, number] => {
  const r = outlineRadius(a) * 0.82;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

export function Diorama() {
  return (
    <group position={[0, LIFT, 0]}>
      {LAYERS.map((l) => (
        <LayerBody key={l.id} layer={l} />
      ))}

      <Bores />

      {/* Фонд: работающие станки-качалки, у каждого своя фаза хода —
          синхронный выдал бы механическое повторение одной модели. Все садятся
          на рельеф: кровля блока волнистая, и общая нулевая отметка оставила бы
          часть парящей над землёй. */}
      {WELLS.map((w, i) => (
        <WorkingPumpjack
          key={i}
          position={[w.at[0], surface(w.at[0], w.at[1]), w.at[1]]}
          rotation={w.yaw}
          phase={w.phase}
        />
      ))}

      {/* Наземные объекты — те же модели, что на промысле */}
      {FACILITIES.map((f, i) => (
        <StaticParts
          key={i}
          parts={f.parts()}
          position={[f.at[0], surface(f.at[0], f.at[1]), f.at[1]]}
          rotation={f.yaw}
          scale={f.scale}
        />
      ))}

      {/* Линия электропередачи по дальнему краю */}
      {POLES.map((p, i) => (
        <StaticParts
          key={i}
          parts={buildPole10()}
          position={[p[0], surface(p[0], p[1]), p[1]]}
          scale={0.9}
        />
      ))}
    </group>
  );
}
