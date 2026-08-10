import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * Пучок стержней одним InstancedMesh.
 *
 * Решётчатые конструкции — вышки, мачты, опоры ВЛ, ограждения, лучи
 * перфорации — это сотни одинаковых цилиндров. Отдельными мешами они дают
 * сотни вызовов отрисовки на кадр; инстансингом — один. Прототип уже применял
 * этот приём точечно, здесь он распространён на все решётки (ТЗ §2).
 */

/** Отрезок: начало, конец, радиус. */
export type BarSpec = [THREE.Vector3, THREE.Vector3, number];

interface Props {
  bars: BarSpec[];
  material?: { color: string; metalness?: number; roughness?: number };
  emissive?: string;
}

const UP = new THREE.Vector3(0, 1, 0);

export function Bars({ bars, material, emissive }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const geometry = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 6), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const dir = new THREE.Vector3();

    bars.forEach(([a, b, r], i) => {
      dir.copy(b).sub(a);
      const len = dir.length();
      p.copy(a).addScaledVector(dir, 0.5);
      q.setFromUnitVectors(UP, dir.normalize());
      s.set(r, len, r);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.count = bars.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [bars]);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, Math.max(1, bars.length)]} castShadow>
      <meshStandardMaterial
        color={material?.color ?? '#8c97a8'}
        metalness={material?.metalness ?? 0.7}
        roughness={material?.roughness ?? 0.35}
        emissive={emissive ?? '#000000'}
        emissiveIntensity={emissive ? 0.3 : 0}
      />
    </instancedMesh>
  );
}
