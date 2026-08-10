import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Станок-качалка на своде блока.
 *
 * Почему качалка, а не буровая (открытый вопрос ТЗ §12): Молдабек В. — зрелый
 * актив, фонд по отчёту (стр. 92) — ШГН и УЭВН, не более 30 скважин. Медленный
 * кивок балансира читается на любом силуэте и оживляет статичный экспонат;
 * вышка выше и неподвижна — она спорит с пропорциями цилиндра. Вышка появится
 * позже, на этапе ЦД Скважины, где уместна по смыслу.
 *
 * Пропорции метрические: балансир 9 м, высота стойки 6 м, — потом уменьшены
 * общим масштабом витрины. Никаких подгонов «на глаз» по месту.
 */

interface Props {
  position: [number, number, number];
  rotation?: number;
  scale?: number;
}

const CYCLE_SECONDS = 7.5;

export function Pumpjack({ position, rotation = 0, scale = 1 }: Props) {
  const beam = useRef<THREE.Group>(null);
  const crank = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const phase = (t * Math.PI * 2) / CYCLE_SECONDS;
    if (beam.current) beam.current.rotation.z = Math.sin(phase) * 0.16;
    if (crank.current) crank.current.rotation.z = phase;
  });

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {/* Рама */}
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[5.6, 0.5, 2]} />
        <meshStandardMaterial color="#5f6b7e" metalness={0.5} roughness={0.55} />
      </mesh>

      {/* Пирамида-опора: четыре наклонные стойки к седлу балансира */}
      {(
        [
          [-0.7, -0.8],
          [-0.7, 0.8],
          [1.3, -0.8],
          [1.3, 0.8],
        ] as const
      ).map(([x, z], i) => {
        const a = new THREE.Vector3(x, 0.4, z);
        const b = new THREE.Vector3(0.3, 4.3, 0);
        const dir = b.clone().sub(a);
        const q = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize(),
        );
        const mid = a.clone().addScaledVector(dir, 0.5);
        return (
          <mesh
            key={i}
            position={mid.toArray()}
            quaternion={q}
            castShadow
          >
            <cylinderGeometry args={[0.13, 0.16, dir.length(), 6]} />
            <meshStandardMaterial color="#8c97a8" metalness={0.7} roughness={0.38} />
          </mesh>
        );
      })}

      {/* Балансир с головкой */}
      <group ref={beam} position={[0.3, 4.3, 0]}>
        <mesh castShadow>
          <boxGeometry args={[6.6, 0.44, 0.5]} />
          <meshStandardMaterial color="#8c97a8" metalness={0.7} roughness={0.38} />
        </mesh>
        <mesh position={[-3.3, -0.42, 0]} castShadow>
          <boxGeometry args={[0.7, 1.7, 1]} />
          <meshStandardMaterial color="#8c97a8" metalness={0.7} roughness={0.38} />
        </mesh>
      </group>

      {/* Кривошип с противовесом */}
      <group ref={crank} position={[2.4, 1.3, 0]}>
        <mesh position={[0, 0.8, 0]} castShadow>
          <boxGeometry args={[0.34, 2.3, 0.4]} />
          <meshStandardMaterial color="#5f6b7e" metalness={0.6} roughness={0.45} />
        </mesh>
        <mesh position={[0, 1.65, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.75, 0.75, 0.5, 14]} />
          <meshStandardMaterial color="#5f6b7e" metalness={0.6} roughness={0.45} />
        </mesh>
      </group>

      {/* Устьевая арматура под головкой балансира */}
      <mesh position={[-3, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.3, 1.6, 10]} />
        <meshStandardMaterial color="#8c97a8" metalness={0.75} roughness={0.32} />
      </mesh>
    </group>
  );
}
