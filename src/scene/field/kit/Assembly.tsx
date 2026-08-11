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
 * Вся сцена была стальной — восемь оттенков одного холодного серого, — и
 * промысел выходил чёрно-белым. В натуре это не так: блок-боксы и насосные
 * красят, обычно в приглушённый зелёный или синий, ёмкости идут в светлой
 * изоляции, бетон тёплый и запылённый, а трубы разных сред различаются по
 * окраске — это требование к обозначению, а не украшение.
 *
 * Насыщенность держится низкой намеренно. Палитра §8.1 отдаёт янтарь нефти,
 * фиолетовый — системному слою Nedra, бирюзу — данным; оборудование не имеет
 * права занимать эти голоса. Поэтому промышленные цвета здесь приглушённые и
 * землистые: они дают сцене жизнь, но остаются фоном для смысловых цветов.
 */
export const MATERIALS: Record<MatKey, THREE.MeshStandardMaterialParameters> = {
  steel: { color: '#98a2ac', metalness: 0.72, roughness: 0.38 },
  steelDark: { color: '#5d6672', metalness: 0.62, roughness: 0.5 },
  /** Окраска блок-боксов и насосных: приглушённый промышленный зелёный. */
  painted: { color: '#5d6b5c', metalness: 0.24, roughness: 0.72 },
  pipe: { color: '#a3a79c', metalness: 0.68, roughness: 0.36 },
  pipeWater: { color: '#5b87a8', metalness: 0.6, roughness: 0.42 },
  /** Бетон тёплый и запылённый — он лежит в степи, а не в цеху. */
  concrete: { color: '#6e6759', metalness: 0.02, roughness: 0.95 },
  accent: { color: '#f0ae4a', metalness: 0.5, roughness: 0.45 },
  glass: {
    color: '#16212e',
    metalness: 0.1,
    roughness: 0.15,
    emissive: new THREE.Color('#2a5b7a'),
    emissiveIntensity: 0.35,
  },
  /** Тепловая изоляция ёмкостей — светлое серебро с тёплым уходом. */
  insulation: { color: '#c2bda9', metalness: 0.08, roughness: 0.86 },
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
