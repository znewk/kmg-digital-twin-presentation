import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  absToSceneY,
  toSceneX,
  toSceneZ,
  useFieldData,
  type Polyline,
} from '../../data/geo/fieldData';
import { BURIED_DEPTH, NETWORK_STYLE, type NetworkKey } from '../../data/geo/fieldStyle';
import { resolveHorizon } from '../../data/geo/stratigraphy';
import { Assembly } from './kit/Assembly';
import { buildTubes } from './kit/tube';
import { buildTrench } from './facilities/trench';
import { surfY } from './geology';

/**
 * Подземная часть промысла (ТЗ §4.4.2).
 *
 * До этого все трассы рисовались линиями НАД рельефом — и это было прямой
 * фактической ошибкой: по `meta.buried_note` нефтесбор, водоводы, кабели связи
 * и низкого напряжения проложены в земле. Наружу выходят только ВЛ на опорах,
 * надземный участок газопровода и эстакады.
 *
 * Теперь подземные системы — настоящие трубы на глубине заложения. Видно их
 * при разнесении слоёв и в разрезе: поверхность поднимается, и под ней
 * открывается всё хозяйство, ради чего разнесение и нужно.
 *
 * Глубина заложения в чертеже НЕ указана ни для одной трассы. Принята типовая —
 * 1,2 м, ниже глубины промерзания, — и помечена как условная наравне с
 * геологической моделью.
 */

/** Диаметры труб по системам, м. Условные, паспортов в материалах нет. */
const RADIUS: Partial<Record<NetworkKey, number>> = {
  oil_pipeline: 0.16,
  water_pipeline: 0.14,
  gas_pipeline: 0.12,
  comm_cable: 0.05,
  lv_cable: 0.05,
};

const BURIED_KEYS: NetworkKey[] = [
  'oil_pipeline',
  'water_pipeline',
  'gas_pipeline',
  'comm_cable',
  'lv_cable',
];

function BuriedSystem({
  lines,
  networkKey,
  depth,
}: {
  lines: Polyline[];
  networkKey: NetworkKey;
  depth: number;
}) {
  const geometry = useMemo(
    () =>
      buildTubes(lines, {
        radius: RADIUS[networkKey] ?? 0.12,
        offset: -depth,
        elevation: surfY,
        radialSegments: 6,
      }),
    [lines, networkKey, depth],
  );

  const style = NETWORK_STYLE[networkKey];

  return (
    <mesh geometry={geometry} userData={{ id: `buried-${networkKey}` }} castShadow={false}>
      <meshStandardMaterial color={style.color} metalness={0.55} roughness={0.5} />
    </mesh>
  );
}

/**
 * Все подземные системы. Кабели заложены мельче труб — так и делают в поле,
 * чтобы при раскопке трубопровода не задеть связь.
 */
export function BuriedNetworks() {
  const data = useFieldData();

  return (
    <group userData={{ id: 'buried-networks' }}>
      {BURIED_KEYS.map((key) => (
        <BuriedSystem
          key={key}
          networkKey={key}
          lines={data.networks[key]}
          depth={key.endsWith('cable') ? BURIED_DEPTH * 0.6 : BURIED_DEPTH}
        />
      ))}
    </group>
  );
}

/**
 * Вскрытая траншея на фактическом участке нефтесбора.
 *
 * Место не выбирается «где красиво»: берётся реальное звено трассы, ближайшее
 * к детализируемому узлу, и траншея разворачивается точно вдоль него. То есть
 * шурф вскрыт над той самой трубой, которая на плане идёт от этого куста.
 */
export function TrenchSection({ near }: { near: { x: number; z: number } }) {
  const data = useFieldData();

  const placement = useMemo(() => {
    let best: { x: number; z: number; yaw: number } | null = null;
    let bestD = Infinity;

    for (const line of data.networks.oil_pipeline) {
      for (let i = 0; i < line.length - 1; i++) {
        const x1 = toSceneX(line[i][0]);
        const z1 = toSceneZ(line[i][1]);
        const x2 = toSceneX(line[i + 1][0]);
        const z2 = toSceneZ(line[i + 1][1]);

        // Звено должно быть длиннее самой траншеи, иначе она торчит за трассу.
        if (Math.hypot(x2 - x1, z2 - z1) < 40) continue;

        const mx = (x1 + x2) / 2;
        const mz = (z1 + z2) / 2;
        const d = (mx - near.x) ** 2 + (mz - near.z) ** 2;
        if (d < bestD) {
          bestD = d;
          // Локальная ось +X траншеи ложится вдоль звена.
          best = { x: mx, z: mz, yaw: Math.atan2(-(z2 - z1), x2 - x1) };
        }
      }
    }

    return best;
  }, [data, near.x, near.z]);

  if (!placement) return null;

  return (
    <Assembly
      build={buildTrench}
      placements={[
        {
          x: placement.x,
          y: surfY(placement.x, placement.z),
          z: placement.z,
          yaw: placement.yaw,
          id: 'trench',
        },
      ]}
      id="trench-section"
    />
  );
}

/**
 * Колодцы — 336 фактических точек. Горловина с крышкой на поверхности плюс
 * ствол вниз: колодец это единственное место, где подземное хозяйство выходит
 * наружу, и по ним читается, где под землёй что-то есть.
 */
export function Manholes() {
  const data = useFieldData();
  const ring = useRef<THREE.InstancedMesh>(null);
  const cover = useRef<THREE.InstancedMesh>(null);

  const spots = useMemo(
    () =>
      data.points.manhole.map((p) => {
        const x = toSceneX(p[0]);
        const z = toSceneZ(p[1]);
        return { x, y: surfY(x, z), z };
      }),
    [data],
  );

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (const [mesh, dy] of [
      [ring.current, -0.6],
      [cover.current, 0.06],
    ] as const) {
      if (!mesh) continue;
      spots.forEach((s, i) => {
        m.makeTranslation(s.x, s.y + dy, s.z);
        mesh.setMatrixAt(i, m);
      });
      mesh.count = spots.length;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [spots]);

  if (spots.length === 0) return null;

  return (
    <group userData={{ id: 'manholes' }}>
      <instancedMesh ref={ring} args={[undefined, undefined, spots.length]} receiveShadow>
        <cylinderGeometry args={[0.55, 0.55, 1.4, 10, 1, true]} />
        <meshStandardMaterial color="#5a5a54" roughness={0.95} side={THREE.DoubleSide} />
      </instancedMesh>
      <instancedMesh ref={cover} args={[undefined, undefined, spots.length]} castShadow>
        <cylinderGeometry args={[0.42, 0.42, 0.09, 10]} />
        <meshStandardMaterial color="#4a4f56" metalness={0.5} roughness={0.7} />
      </instancedMesh>
    </group>
  );
}

/**
 * Стволы всего фонда — 1101 скважина до своего продуктивного горизонта.
 *
 * Сюжетные скважины показаны полностью, с обсадной, НКТ и ГНО; здесь — весь
 * остальной фонд одной колонной на скважину. Без них при разнесении слоёв под
 * поверхностью пусто: девять стволов на промысел, где скважин больше тысячи,
 * выглядят единичными, а фонд — главное, что на этом месторождении есть.
 *
 * Инстансы с индивидуальным масштабом по высоте: глубина у каждой своя, по её
 * фактическому горизонту из реестра.
 */
export function FundBores({ exclude }: { exclude: Set<string> }) {
  const data = useFieldData();
  const mesh = useRef<THREE.InstancedMesh>(null);

  const bores = useMemo(() => {
    const out: { x: number; z: number; top: number; bottom: number }[] = [];

    for (const w of data.wells) {
      if (exclude.has(w.uwi)) continue;
      const h = resolveHorizon(w.hor);
      if (!h) continue;

      const x = toSceneX(w.p[0]);
      const z = toSceneZ(w.p[1]);
      out.push({ x, z, top: surfY(x, z), bottom: absToSceneY(h.botAbs - 6) });
    }

    return out;
  }, [data, exclude]);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const mat = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    bores.forEach((b, i) => {
      const len = b.top - b.bottom;
      p.set(b.x, b.bottom + len / 2, b.z);
      s.set(1, len, 1);
      mat.compose(p, q, s);
      m.setMatrixAt(i, mat);
    });

    m.count = bores.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [bores]);

  if (bores.length === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, bores.length]}
      userData={{ id: 'fund-bores' }}
    >
      {/* Высота единичная — реальная длина задаётся масштабом инстанса. */}
      <cylinderGeometry args={[0.9, 0.9, 1, 6]} />
      <meshStandardMaterial color="#8a95a6" metalness={0.6} roughness={0.45} />
    </instancedMesh>
  );
}
