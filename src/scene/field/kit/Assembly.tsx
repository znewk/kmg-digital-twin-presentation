import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeParts, type MatKey, type Part } from './parts';
import { EQUIPMENT_SCALE } from './scale';

/**
 * Расстановка одной и той же детализированной установки по фактическим точкам.
 *
 * Геометрия собирается один раз, сливается по материалам и инстансируется.
 * Стоимость не зависит от числа площадок: сорок одна ГЗУ рисуется теми же
 * четырьмя-пятью вызовами, что и одна.
 */

export interface Placement {
  /** Координаты сцены. */
  x: number;
  y: number;
  z: number;
  /** Разворот установки вокруг вертикали, рад. */
  yaw?: number;
  /** Идентификатор для клика и подсветки. */
  id?: string;
}

/**
 * Палитра материалов промысла.
 *
 * Оборудование на месторождении не радужное: сталь, окрашенный металл,
 * бетон и изоляция. Единственный насыщенный цвет — янтарный акцент на
 * запорной арматуре, и он тот же, что у нефти в палитре §8.1: маховик
 * задвижки на нефтяной линии и есть точка, где нефтью управляют.
 */
export const MATERIALS: Record<MatKey, THREE.MeshStandardMaterialParameters> = {
  steel: { color: '#8c97a8', metalness: 0.72, roughness: 0.38 },
  steelDark: { color: '#5f6b7e', metalness: 0.62, roughness: 0.5 },
  painted: { color: '#7b8794', metalness: 0.28, roughness: 0.68 },
  pipe: { color: '#9aa7b8', metalness: 0.7, roughness: 0.34 },
  pipeWater: { color: '#5f8bb0', metalness: 0.62, roughness: 0.4 },
  concrete: { color: '#6a6a63', metalness: 0.02, roughness: 0.95 },
  accent: { color: '#f0ae4a', metalness: 0.5, roughness: 0.45 },
  glass: {
    color: '#16212e',
    metalness: 0.1,
    roughness: 0.15,
    emissive: new THREE.Color('#2a5b7a'),
    emissiveIntensity: 0.35,
  },
  insulation: { color: '#b9bcae', metalness: 0.08, roughness: 0.88 },
};

/** Порядок стабилен — от него зависит порядок ключей React. */
const MAT_ORDER: MatKey[] = [
  'concrete',
  'painted',
  'steel',
  'steelDark',
  'pipe',
  'pipeWater',
  'insulation',
  'accent',
  'glass',
];

function InstancedGroup({
  geometry,
  material,
  placements,
  scale,
  castShadow = true,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterialParameters;
  placements: Placement[];
  scale: number;
  castShadow?: boolean;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3(scale, scale, scale);

    placements.forEach((pl, i) => {
      // Масштаб применяется относительно точки посадки, а не центра модели:
      // установка растёт вверх от своего основания и остаётся ровно там, где
      // стоит на плане.
      p.set(pl.x, pl.y, pl.z);
      e.set(0, pl.yaw ?? 0, 0);
      q.setFromEuler(e);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });

    mesh.count = placements.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [placements, scale]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, placements.length]}
      castShadow={castShadow}
      receiveShadow
    >
      <meshStandardMaterial {...material} />
    </instancedMesh>
  );
}

export function Assembly({
  build,
  placements,
  id,
  scale = EQUIPMENT_SCALE,
}: {
  /** Строитель деталей. Вызывается один раз — держите его стабильным. */
  build: () => Part[];
  placements: Placement[];
  id: string;
  /**
   * Габаритный коэффициент. По умолчанию общий для всего оборудования; явно
   * задаётся там, где укрупнение неуместно — например, у вскрытой траншеи:
   * это вырытая в земле канава, и растянуть её значит соврать про глубину
   * заложения.
   */
  scale?: number;
}) {
  const merged = useMemo(() => mergeParts(build()), [build]);

  if (placements.length === 0) return null;

  return (
    <group userData={{ id }}>
      {MAT_ORDER.filter((k) => merged.has(k)).map((k) => (
        <InstancedGroup
          key={k}
          geometry={merged.get(k)!}
          material={MATERIALS[k]}
          placements={placements}
          scale={scale}
        />
      ))}
    </group>
  );
}
