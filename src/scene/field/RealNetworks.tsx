import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  toSceneX,
  toSceneZ,
  useFieldData,
  type Polyline,
} from '../../data/geo/fieldData';
import { NETWORK_STYLE, type NetworkKey } from '../../data/geo/fieldStyle';
import { surfY } from './geology';

/**
 * Реальные сети промысла (ТЗ §4.1 п.3): нефтесбор, водоводы, газопровод,
 * ВЛ-10 кВ и 0,4 кВ, дороги — по фактическим трассам из топоплана.
 *
 * Полилиний больше тысячи. Каждая отдельным мешем — это тысяча вызовов
 * отрисовки на кадр, чего показ не переживёт. Все трассы одного типа
 * сливаются в одну геометрию `LineSegments`: один вызов на тип сети.
 */

interface NetSpec {
  id: string;
  lines: Polyline[];
  color: string;
  opacity: number;
  /** Подъём над рельефом, м — чтобы линия не тонула в поверхности. */
  lift: number;
}

/**
 * Максимальная длина звена, м.
 *
 * Трассы в чертеже заданы длинными прямыми — до трёхсот метров между узлами.
 * Если положить такой отрезок прямой хордой, приподняв концы над рельефом,
 * середина уйдёт под землю: местность под ним выгибается, а при пятикратном
 * вертикальном преувеличении перепад на трёхстах метрах достигает десятков
 * метров. Именно поэтому сети сначала не отрисовывались вовсе — они целиком
 * лежали внутри рельефа. Звенья дробятся, и трасса стелется по поверхности.
 */
const MAX_SEG = 40;

function mergeLines(lines: Polyline[], lift: number): THREE.BufferGeometry {
  const pos: number[] = [];

  const push = (x: number, z: number) => pos.push(x, surfY(x, z) + lift, z);

  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const x1 = toSceneX(line[i][0]);
      const z1 = toSceneZ(line[i][1]);
      const x2 = toSceneX(line[i + 1][0]);
      const z2 = toSceneZ(line[i + 1][1]);

      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / MAX_SEG));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        push(x1 + (x2 - x1) * t0, z1 + (z2 - z1) * t0);
        push(x1 + (x2 - x1) * t1, z1 + (z2 - z1) * t1);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

export function RealNetworks() {
  const data = useFieldData();

  // Цвет и подъём над рельефом берутся из общего словаря обозначений: плоская
  // схема и сцена обязаны совпадать по цвету, иначе переход «карта поднимается
  // в 3D» читается как подмена картинки (ТЗ §3.1 п.6).
  const specs = useMemo<NetSpec[]>(() => {
    const n = data.networks;
    const spec = (id: string, key: NetworkKey, lines: Polyline[], opacity: number): NetSpec => ({
      id,
      lines,
      color: NETWORK_STYLE[key].color,
      lift: NETWORK_STYLE[key].lift,
      opacity,
    });
    return [
      spec('s-neftesbor', 'oil_pipeline', n.oil_pipeline, 0.85),
      spec('s-ppd-line', 'water_pipeline', n.water_pipeline, 0.8),
      spec('s-gas', 'gas_pipeline', n.gas_pipeline, 0.75),
      spec('s-vl10', 'power_10kv', n.power_10kv, 0.55),
      spec('s-vl04', 'power_04kv', n.power_04kv, 0.35),
      spec('s-roads', 'road', n.road, 0.4),
    ];
  }, [data]);

  const geometries = useMemo(
    () => specs.map((s) => ({ spec: s, geometry: mergeLines(s.lines, s.lift) })),
    [specs],
  );

  return (
    <group>
      {geometries.map(({ spec, geometry }) => (
        <lineSegments key={spec.id} geometry={geometry} userData={{ id: spec.id }}>
          <lineBasicMaterial
            color={spec.color}
            transparent
            opacity={spec.opacity}
            depthWrite={false}
          />
        </lineSegments>
      ))}
    </group>
  );
}

/**
 * 570 скважин инстансами (ТЗ §4.1 п.5).
 *
 * Детализированные модели ставятся отдельно и только на сюжетные скважины;
 * весь остальной фонд — одинаковые маркеры одним `InstancedMesh`. Иначе
 * пятьсот семьдесят отдельных объектов съедают кадр без всякой пользы:
 * на обзорном плане они всё равно неразличимы поштучно.
 */
export function WellMarkers() {
  const data = useFieldData();
  const ref = useRef<THREE.InstancedMesh>(null);

  const positions = useMemo(
    () =>
      data.wells.map((w) => {
        const x = toSceneX(w.p[0]);
        const z = toSceneZ(w.p[1]);
        return new THREE.Vector3(x, surfY(x, z), z);
      }),
    [data],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => {
      m.makeTranslation(p.x, p.y + 5, p.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.count = positions.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [positions]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, positions.length]} castShadow>
      <cylinderGeometry args={[1.6, 1.6, 10, 6]} />
      <meshStandardMaterial color="#c8d2e0" metalness={0.6} roughness={0.4} />
    </instancedMesh>
  );
}

/**
 * Кусты — 188 узлов сбора. Размер площадки берётся от числа сходящихся ниток:
 * куст на девять скважин физически крупнее куста на две.
 */
export function HubPads() {
  const data = useFieldData();
  const ref = useRef<THREE.InstancedMesh>(null);

  const hubs = useMemo(
    () =>
      data.hubs.map((h) => {
        const x = toSceneX(h.p[0]);
        const z = toSceneZ(h.p[1]);
        return { x, z, y: surfY(x, z), size: 26 + Math.min(h.links, 10) * 4 };
      }),
    [data],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    hubs.forEach((h, i) => {
      p.set(h.x, h.y + 0.6, h.z);
      s.set(h.size, 1.2, h.size * 0.72);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.count = hubs.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [hubs]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, hubs.length]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#37475c" roughness={1} metalness={0} />
    </instancedMesh>
  );
}
