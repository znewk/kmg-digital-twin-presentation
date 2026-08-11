import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  toSceneX,
  toSceneZ,
  useFieldData,
  EXTERNAL_NODES,
  FIELD_H,
  FIELD_W,
} from '../../data/geo/fieldData';
import { NETWORK_STYLE } from '../../data/geo/fieldStyle';
import { Assembly, type Placement } from './kit/Assembly';
import { makeFlowMaterial } from './kit/flow';
import { box, cyl, pipe, sphere, type Part } from './kit/parts';
import { EQUIPMENT_SCALE } from './kit/scale';
import { surfY } from './geology';
import { useShow, type QualityTier } from '../../store/useShow';

/**
 * Окружение промысла: внешние узлы цепочки и степная растительность.
 *
 * Внешние узлы — ЦППН «Кенбай», МФНС, БРХ и питающая подстанция — в границы
 * топоплана не попали. Это не пробел данных, а факт: ЦППН стоит отдельной
 * площадкой в стороне, а МФНС и БРХ в текстовом слое чертежа не подписаны
 * вовсе. Привязывать их к произвольному зданию на плане нельзя — ТЗ §4.1
 * прямо требует показывать такие объекты выносом за границу участка, а не
 * выдумывать им место внутри.
 *
 * Поэтому они и стоят за рамкой съёмки, помеченные как внешние, и соединены с
 * промыслом ниткой, уходящей за край. Зритель видит, что цепочка продолжается
 * дальше, но не получает ложного впечатления, будто ЦППН стоит вот здесь.
 */

// ── Внешний узел ────────────────────────────────────────────────────────────

/**
 * Схематичный узел: площадка, три ёмкости и мачта с щитом.
 *
 * Намеренно условный. Детальной модели ЦППН здесь быть не может — его
 * геометрии у нас нет, а нарисовать правдоподобный завод по памяти значило бы
 * ровно то, против чего написан весь §4.1.
 */
function buildExternalNode(): Part[] {
  const out: Part[] = [];

  out.push(box('concrete', 26, 0.6, 18, 0, 0.3, 0));

  // Три ёмкости в ряд — универсальный признак площадки подготовки
  for (let i = 0; i < 3; i++) {
    const x = -7 + i * 7;
    out.push(cyl('insulation', 2.6, 7.5, x, 4.35, 0, 0, 0, 0, 16));
    out.push(cyl('steel', 2.7, 0.2, x, 8.2, 0, 0, 0, 0, 16));
    out.push(cyl('steelDark', 0.4, 1.2, x, 8.9, 0, 0, 0, 0, 10));
  }
  // Обвязка между ёмкостями
  out.push(pipe('pipe', 0.32, [-9, 1.6, 6], [9, 1.6, 6]));
  for (let i = 0; i < 3; i++) {
    out.push(pipe('pipe', 0.22, [-7 + i * 7, 1.6, 6], [-7 + i * 7, 1.6, 2.7]));
  }

  // Мачта с указательным щитом — то, что делает узел «выносом», а не зданием
  out.push(cyl('steel', 0.22, 16, -12, 8.6, -7, 0, 0, 0, 8));
  out.push(box('painted', 7.5, 2.6, 0.3, -8, 15.5, -7));
  out.push(box('accent', 7.5, 0.22, 0.36, -8, 14.1, -7));
  out.push(sphere('accent', 0.4, -12, 16.8, -7));

  // Ограждение по периметру
  const hw = 14;
  const hd = 10;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    for (const z of [-hd, hd]) out.push(box('steel', 0.14, 2.2, 0.14, -hw + 2 * hw * t, 1.4, z));
  }
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    for (const x of [-hw, hw]) out.push(box('steel', 0.14, 2.2, 0.14, x, 1.4, -hd + 2 * hd * t));
  }

  return out;
}

/**
 * Положение выноса: за границей участка, в ту сторону, где объект
 * действительно находится. Направление задано в `EXTERNAL_NODES`.
 */
function useExternalPlacements(): { placements: Placement[]; anchors: THREE.Vector3[] } {
  return useMemo(() => {
    const placements: Placement[] = [];
    const anchors: THREE.Vector3[] = [];

    for (const node of EXTERNAL_NODES) {
      const x = (node.dir[0] * FIELD_W) / 2;
      const z = -(node.dir[1] * FIELD_H) / 2;
      const y = surfY(
        Math.max(-FIELD_W / 2, Math.min(FIELD_W / 2, x)),
        Math.max(-FIELD_H / 2, Math.min(FIELD_H / 2, z)),
      );
      placements.push({ x, y, z, yaw: Math.atan2(-z, -x), id: node.id });
      anchors.push(new THREE.Vector3(x, y, z));
    }

    return { placements, anchors };
  }, []);
}

/**
 * Напорный нефтепровод на ЦППН «Кенбай».
 *
 * Единственная нитка цепочки, которая физически уходит за границу съёмки, и
 * потому единственная, которую здесь имеет смысл рисовать: от сборного пункта
 * «Молдабек» к внешнему узлу. Поток по ней идёт с той же скоростью, что и по
 * нефтесбору, — это та же нефть, только уже отсепарированная.
 */
function TrunkPipeline({ target }: { target: THREE.Vector3 }) {
  const data = useFieldData();

  const geometry = useMemo(() => {
    const sp = data.facilities.find((f) => f.kind === 'sp' && f.name.includes('Молдабек'));
    if (!sp) return null;

    const from = new THREE.Vector3(toSceneX(sp.p[0]), 0, toSceneZ(sp.p[1]));
    const pos: number[] = [];
    const along: number[] = [];
    const normal: number[] = [];
    const index: number[] = [];

    const R = 0.9 * EQUIPMENT_SCALE;
    const SIDES = 8;
    const STEPS = 60;
    const total = from.distanceTo(target);

    for (let s = 0; s <= STEPS; s++) {
      const t = s / STEPS;
      const x = from.x + (target.x - from.x) * t;
      const z = from.z + (target.z - from.z) * t;
      // За границей участка рельефа нет — высота держится по краю.
      const cx = Math.max(-FIELD_W / 2, Math.min(FIELD_W / 2, x));
      const cz = Math.max(-FIELD_H / 2, Math.min(FIELD_H / 2, z));
      const y = surfY(cx, cz) + 2.2 * EQUIPMENT_SCALE;

      for (let r = 0; r < SIDES; r++) {
        const a = (r / SIDES) * Math.PI * 2;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        pos.push(x + nx * R, y + ny * R, z);
        normal.push(nx, ny, 0);
        along.push(total * t);
      }
    }

    for (let s = 0; s < STEPS; s++) {
      for (let r = 0; r < SIDES; r++) {
        const a0 = s * SIDES + r;
        const a1 = s * SIDES + ((r + 1) % SIDES);
        const b0 = a0 + SIDES;
        const b1 = a1 + SIDES;
        index.push(a0, b0, a1, a1, b0, b1);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
    g.setIndex(index);
    g.computeBoundingSphere();
    return g;
  }, [data, target]);

  const material = useMemo(
    () =>
      makeFlowMaterial({
        color: NETWORK_STYLE.oil_pipeline.color,
        flowColor: '#ffffff',
        period: 90,
        speed: 14,
        intensity: 1.5,
      }),
    [],
  );

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} castShadow userData={{ id: 's-napor' }} />;
}

export function ExternalNodes() {
  const { placements, anchors } = useExternalPlacements();
  const cppn = EXTERNAL_NODES.findIndex((n) => n.id === 's-cppn');

  return (
    <group userData={{ id: 'external-nodes' }}>
      <Assembly build={buildExternalNode} placements={placements} id="external-node" />
      {cppn >= 0 && <TrunkPipeline target={anchors[cppn]} />}
    </group>
  );
}

// ── Степная растительность ──────────────────────────────────────────────────

/**
 * Сколько кустиков раскидывается по участку — по тиру качества.
 *
 * Растительность первой идёт под нож при деградации: она чистая фактура, без
 * неё сцена теряет ощущение масштаба, но не теряет ни одного смыслового
 * объекта. Отдавать кадры за неё в ущерб оборудованию нельзя.
 */
const SHRUB_COUNT: Record<QualityTier, number> = { high: 2600, mid: 1300, low: 450 };

/**
 * Полынь и солянка — то, чем покрыта прикаспийская степь.
 *
 * Нужна не для красоты, а для масштаба: без мелкой фактуры глаз не за что
 * зацепиться, и промысел кажется макетом, где качалка может быть и с дом, и с
 * ладонь. Кустики дают привычный размерный ориентир.
 *
 * Раскидываются детерминированно: положение зависит от номера, а не от
 * случайного числа. Иначе степь перерисовывалась бы заново при каждом
 * монтировании сцены, и на реверсе скролла кусты прыгали бы с места на место.
 */
export function Vegetation() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const tier = useShow((s) => s.tier);

  const spots = useMemo(() => {
    // Линейный конгруэнтный генератор с фиксированным зерном.
    let seed = 20260811;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const out: { x: number; z: number; y: number; s: number; rot: number }[] = [];
    for (let i = 0; i < SHRUB_COUNT[tier]; i++) {
      const x = (rnd() - 0.5) * FIELD_W;
      const z = (rnd() - 0.5) * FIELD_H;
      out.push({
        x,
        z,
        y: surfY(x, z),
        // Разброс размера заметный: в степи кусты не одинаковые.
        s: 0.6 + rnd() * 1.1,
        rot: rnd() * Math.PI,
      });
    }
    return out;
  }, [tier]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();

    spots.forEach((spot, i) => {
      p.set(spot.x, spot.y + 0.25 * spot.s, spot.z);
      e.set(0, spot.rot, 0);
      q.setFromEuler(e);
      s.set(spot.s, spot.s * 0.7, spot.s);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });

    mesh.count = spots.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [spots]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, Math.max(1, spots.length)]} receiveShadow>
      {/* Восьмигранник вместо сферы: кустик размером в метр, и лишние
          треугольники здесь умножаются на две с половиной тысячи. */}
      <icosahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#4e5340" roughness={1} metalness={0} flatShading />
    </instancedMesh>
  );
}
