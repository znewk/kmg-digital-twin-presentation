import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Облако частиц вокруг экспоната — «данные» (ТЗ §8.2).
 *
 * Points с одним материалом: дешевле любой инстансированной геометрии и не
 * даёт заметного вклада в кадр даже на низком тире. Движение — сдвиг фазы в
 * шейдере-заменителе на CPU по времени, без пересборки буфера.
 */

interface Props {
  count?: number;
  radius?: number;
}

export function DataMotes({ count = 420, radius = 52 }: Props) {
  const points = useRef<THREE.Points>(null);

  const { geometry, phases } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Распределение в приплюснутом объёме вокруг блока, а не в шаре:
      // так частицы читаются как атмосфера витрины, а не как звёздное небо.
      const a = Math.random() * Math.PI * 2;
      // Внутренний радиус задран: частицы образуют гало вокруг экспоната, а не
      // сыплются поверх него, иначе читаются как пыль на объективе.
      const r = radius * (0.78 + 0.22 * Math.sqrt(Math.random()));
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (Math.random() - 0.4) * 40;
      positions[i * 3 + 2] = Math.sin(a) * r;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: g, phases: seeds };
  }, [count, radius]);

  const base = useMemo(() => {
    const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
    return Float32Array.from(attr.array as Float32Array);
  }, [geometry]);

  useFrame(({ clock }) => {
    const p = points.current;
    if (!p) return;
    const t = clock.elapsedTime;
    const attr = p.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < phases.length; i++) {
      const j = i * 3 + 1;
      arr[j] = base[j] + Math.sin(t * 0.22 + phases[i]) * 1.6;
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        size={0.5}
        sizeAttenuation
        color="#5fd8cc"
        transparent
        opacity={0.34}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
