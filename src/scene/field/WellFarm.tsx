import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { toSceneX, toSceneZ, useFieldData, type WellRecord } from '../../data/geo/fieldData';
import { WELL_CATEGORY, WELL_STATUS } from '../../data/geo/fieldStyle';
import { surfY } from './geology';

/**
 * Фонд промысла целиком — 1101 скважина, и все они живут (ТЗ §4.4).
 *
 * Требование заказчика прямое: остальные объекты не должны игнорироваться,
 * они должны быть и должны работать, а не стоять декорацией вокруг одного
 * детализированного узла. Поэтому качается ВЕСЬ работающий механизированный
 * фонд, а не три сюжетные скважины.
 *
 * Как это стоит ноль. Каждая качалка — не объект сцены, а инстанс: станина,
 * стойка и балансир живут тремя `InstancedMesh` на весь промысел, то есть тремя
 * вызовами отрисовки вместо тысячи восьмисот. Анимируется только балансир, и
 * только у него матрицы переписываются в кадре — шестьсот матриц это доли
 * миллисекунды, тогда как шестьсот отдельных мешей стоили бы кадра.
 *
 * Фаза качания у каждой своя и выведена из её координат: реальные станки не
 * синхронизированы между собой, а одинаковая фаза на шестистах качалках
 * выглядит как заводная игрушка и сразу выдаёт подделку.
 */

const STEEL = { color: '#8c97a8', metalness: 0.7, roughness: 0.38 } as const;
const STEEL_DARK = { color: '#5f6b7e', metalness: 0.6, roughness: 0.48 } as const;

/** Период качания балансира, с. Реальные ШГН — 4–10 качаний в минуту. */
const STROKE_PERIOD = 8;

interface Placed {
  well: WellRecord;
  x: number;
  z: number;
  y: number;
  /** Разворот устья: качалка смотрит на свой узел сбора. */
  yaw: number;
  phase: number;
}

/** Разбиение фонда по тому, что стоит на устье. */
interface Split {
  pumps: Placed[];
  trees: Placed[];
  idle: Placed[];
}

function hashPhase(uwi: string): number {
  let h = 2166136261;
  for (let i = 0; i < uwi.length; i++) {
    h ^= uwi.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function usePlacement(exclude: Set<string>): Split {
  const data = useFieldData();

  return useMemo(() => {
    const pumps: Placed[] = [];
    const trees: Placed[] = [];
    const idle: Placed[] = [];

    for (const well of data.wells) {
      if (exclude.has(well.uwi)) continue;

      const x = toSceneX(well.p[0]);
      const z = toSceneZ(well.p[1]);

      // Разворот на свой узел сбора: устья реально ориентированы по выкидной
      // линии, а не по сторонам света. У скважин вне топоплана узла нет —
      // им достаётся разворот от номера, лишь бы не стояли одной шеренгой.
      let yaw: number;
      const hub = well.hub !== null ? data.hubs[well.hub] : undefined;
      if (hub) {
        yaw = Math.atan2(toSceneX(hub.p[0]) - x, toSceneZ(hub.p[1]) - z);
      } else {
        yaw = hashPhase(well.uwi) * Math.PI * 2;
      }

      const placed: Placed = { well, x, z, y: surfY(x, z), yaw, phase: hashPhase(well.uwi) };

      const working = WELL_STATUS[well.st].working;
      if (working && well.cat === 'oil' && well.type === 'vert') pumps.push(placed);
      else if (working) trees.push(placed);
      else idle.push(placed);
    }

    return { pumps, trees, idle };
  }, [data, exclude]);
}

/** Заполняет статический `InstancedMesh` один раз после монтирования. */
function useStaticInstances(
  ref: React.RefObject<THREE.InstancedMesh | null>,
  items: Placed[],
  compose: (p: Placed, m: THREE.Matrix4, tmp: Tmp) => void,
  color?: (p: Placed) => THREE.Color,
) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const tmp: Tmp = {
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(1, 1, 1),
      e: new THREE.Euler(),
    };

    items.forEach((item, i) => {
      compose(item, m, tmp);
      mesh.setMatrixAt(i, m);
      if (color) mesh.setColorAt(i, color(item));
    });

    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, items, compose, color]);
}

interface Tmp {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
  e: THREE.Euler;
}

/**
 * Станки-качалки всего промысла. Три инстансированных меша: станина, стойка,
 * балансир. Качается только балансир.
 */
function PumpjackFarm({ items }: { items: Placed[] }) {
  const base = useRef<THREE.InstancedMesh>(null);
  const post = useRef<THREE.InstancedMesh>(null);
  const beam = useRef<THREE.InstancedMesh>(null);

  const composeBase = useMemo(
    () => (p: Placed, m: THREE.Matrix4, t: Tmp) => {
      t.p.set(p.x, p.y + 0.3, p.z);
      t.e.set(0, p.yaw, 0);
      t.q.setFromEuler(t.e);
      t.s.set(1, 1, 1);
      m.compose(t.p, t.q, t.s);
    },
    [],
  );

  const composePost = useMemo(
    () => (p: Placed, m: THREE.Matrix4, t: Tmp) => {
      t.p.set(p.x, p.y + 3.1, p.z);
      t.e.set(0, p.yaw, 0);
      t.q.setFromEuler(t.e);
      t.s.set(1, 1, 1);
      m.compose(t.p, t.q, t.s);
    },
    [],
  );

  useStaticInstances(base, items, composeBase);
  useStaticInstances(post, items, composePost);

  // Балансир: единственное, что переписывается каждый кадр.
  const scratch = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(1, 1, 1),
      e: new THREE.Euler(),
    }),
    [],
  );

  useFrame(({ clock }) => {
    const mesh = beam.current;
    if (!mesh) return;
    const base2 = (clock.elapsedTime * Math.PI * 2) / STROKE_PERIOD;
    const { m, p, q, s, e } = scratch;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const tilt = Math.sin(base2 + it.phase * Math.PI * 2) * 0.17;
      p.set(it.x, it.y + 6, it.z);
      e.set(0, it.yaw, tilt);
      q.setFromEuler(e);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }

    mesh.count = items.length;
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (items.length === 0) return null;

  return (
    <group userData={{ id: 'fund-pumpjacks' }}>
      <instancedMesh ref={base} args={[undefined, undefined, items.length]} castShadow receiveShadow>
        <boxGeometry args={[7.8, 0.6, 2.8]} />
        <meshStandardMaterial {...STEEL_DARK} />
      </instancedMesh>

      <instancedMesh ref={post} args={[undefined, undefined, items.length]} castShadow>
        <boxGeometry args={[1.1, 5.6, 1.1]} />
        <meshStandardMaterial {...STEEL} />
      </instancedMesh>

      <instancedMesh ref={beam} args={[undefined, undefined, items.length]} castShadow>
        <boxGeometry args={[9.2, 0.6, 0.7]} />
        <meshStandardMaterial {...STEEL} />
      </instancedMesh>
    </group>
  );
}

/**
 * Устьевая арматура — нагнетательные, наблюдательные, водозаборные и всё
 * работающее, что не механизировано качалкой. Цвет по категории, тот же, что
 * на плоской схеме: 2D и 3D обязаны совпадать по обозначениям.
 */
function TreeFarm({ items, id }: { items: Placed[]; id: string }) {
  const body = useRef<THREE.InstancedMesh>(null);

  const compose = useMemo(
    () => (p: Placed, m: THREE.Matrix4, t: Tmp) => {
      t.p.set(p.x, p.y + 2.2, p.z);
      t.e.set(0, p.yaw, 0);
      t.q.setFromEuler(t.e);
      t.s.set(1, 1, 1);
      m.compose(t.p, t.q, t.s);
    },
    [],
  );

  const color = useMemo(
    () => (p: Placed) => new THREE.Color(WELL_CATEGORY[p.well.cat].color),
    [],
  );

  useStaticInstances(body, items, compose, color);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={body}
      args={[undefined, undefined, items.length]}
      castShadow
      userData={{ id }}
    >
      <cylinderGeometry args={[0.75, 0.9, 4.4, 8]} />
      <meshStandardMaterial metalness={0.65} roughness={0.4} />
    </instancedMesh>
  );
}

/**
 * Неработающий фонд — консервация, простой, бездействие, ликвидация.
 *
 * Показывается низкой заглушкой без арматуры и без свечения: 356 скважин,
 * которые сегодня не дают продукции, не должны выглядеть как работающие.
 * Это то же различие «заливка против контура», что и на плоской схеме, только
 * выраженное высотой и материалом.
 */
function IdleFarm({ items }: { items: Placed[] }) {
  const body = useRef<THREE.InstancedMesh>(null);

  const compose = useMemo(
    () => (p: Placed, m: THREE.Matrix4, t: Tmp) => {
      t.p.set(p.x, p.y + 0.7, p.z);
      t.q.identity();
      t.s.set(1, 1, 1);
      m.compose(t.p, t.q, t.s);
    },
    [],
  );

  const color = useMemo(
    () => (p: Placed) => {
      const c = new THREE.Color(WELL_CATEGORY[p.well.cat].color);
      // Ликвидированные гасятся сильнее прочих неработающих: они часть истории
      // фонда, но не часть сегодняшнего промысла.
      return c.lerp(new THREE.Color('#3a4250'), p.well.st === 'liquidated' ? 0.8 : 0.55);
    },
    [],
  );

  useStaticInstances(body, items, compose, color);

  if (items.length === 0) return null;

  return (
    <instancedMesh
      ref={body}
      args={[undefined, undefined, items.length]}
      receiveShadow
      userData={{ id: 'fund-idle' }}
    >
      <cylinderGeometry args={[0.85, 0.85, 1.4, 6]} />
      <meshStandardMaterial metalness={0.3} roughness={0.8} />
    </instancedMesh>
  );
}

export function WellFarm({ exclude }: { exclude: Set<string> }) {
  const { pumps, trees, idle } = usePlacement(exclude);

  return (
    <group>
      <PumpjackFarm items={pumps} />
      <TreeFarm items={trees} id="fund-trees" />
      <IdleFarm items={idle} />
    </group>
  );
}
