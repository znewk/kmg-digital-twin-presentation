import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import countries110m from 'world-atlas/countries-110m.json';
import kzOblasts from '../../data/geo/kz-oblasts.json';
import { progressRef, useShow } from '../../store/useShow';
import { FLAT_BEATS, TOTAL_BEATS } from '../../data/stages';
import {
  geometryRings,
  ringToSurface,
  ringsToSegments,
  lonLatToVec3,
  GLOBE_R,
  MOLDABEK,
} from './projection';

/**
 * Открывающая гео-последовательность (ТЗ §3.1): планета → Казахстан →
 * Атырауская область → погружение к площадке.
 *
 * Всё живёт на одной сфере: карта областей и call-out нарисованы прямо по
 * поверхности глобуса, поэтому переход между этапами — это движение камеры, а
 * не подмена сцены. Границы запечены в бандл, сеть в рантайме не трогается.
 */

/** Этапы, на которых глобус в кадре. */
const GEO_STAGES = new Set(['globe', 'kazakhstan', 'atyrau', 'descend']);

/** Слои приподняты над сферой, иначе линии тонут в ней и мерцают. */
const R_COAST = GLOBE_R * 1.0015;
const R_OBLAST = GLOBE_R * 1.003;
const R_FILL = GLOBE_R * 1.0022;
const R_MARK = GLOBE_R * 1.006;

interface GeoFeature {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
}

function useCountryBorders() {
  return useMemo(() => {
    // world-atlas отдаёт TopoJSON — разворачиваем в GeoJSON один раз при
    // монтировании. 110m хватает: на дистанции облёта более детальные
    // береговые линии неотличимы, а весят в семь раз больше.
    const topo = countries110m as unknown as Topology;
    const fc = feature(topo, topo.objects.countries) as unknown as {
      features: GeoFeature[];
    };

    const world: number[] = [];
    let kzRings: number[][][] = [];
    for (const f of fc.features) {
      const rings = geometryRings(f.geometry);
      if (f.properties.name === 'Kazakhstan') kzRings = rings;
      ringsToSegments(rings, R_COAST, world);
    }

    const worldGeom = new THREE.BufferGeometry();
    worldGeom.setAttribute('position', new THREE.Float32BufferAttribute(world, 3));

    const kzGeom = new THREE.BufferGeometry();
    kzGeom.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(ringsToSegments(kzRings, R_OBLAST), 3),
    );

    return { worldGeom, kzGeom, kzRings };
  }, []);
}

function useOblasts() {
  return useMemo(() => {
    const data = kzOblasts as {
      oblasts: { name: string; nameRu: string; code: string | null; geometry: { type: string; coordinates: unknown } }[];
    };

    const lines: number[] = [];
    let atyrauFill: THREE.BufferGeometry | null = null;

    for (const o of data.oblasts) {
      const rings = geometryRings(o.geometry);
      ringsToSegments(rings, R_OBLAST, lines);
      if (o.code === 'KZ-ATY') {
        // Берём самое длинное кольцо: у области есть острова и косы,
        // подсвечивать нужно материковый контур.
        const main = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
        atyrauFill = ringToSurface(main, R_FILL);
      }
    }

    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    return { lineGeom, atyrauFill };
  }, []);
}

const _worldPos = new THREE.Vector3();

export function Globe() {
  const stageId = useShow((s) => s.stageId);
  const { camera } = useThree();
  const root = useRef<THREE.Group>(null);
  const spin = useRef<THREE.Group>(null);

  const oblastLines = useRef<THREE.LineSegments>(null);
  const atyrauMesh = useRef<THREE.Mesh>(null);
  const dimMesh = useRef<THREE.Mesh>(null);
  const markerRef = useRef<THREE.Group>(null);

  const { worldGeom, kzGeom } = useCountryBorders();
  const { lineGeom, atyrauFill } = useOblasts();

  const moldabekPos = useMemo(
    () => lonLatToVec3(MOLDABEK[0], MOLDABEK[1], R_MARK),
    [],
  );

  const active = GEO_STAGES.has(stageId);

  useFrame(() => {
    if (!active) return;

    const raw = progressRef.current * TOTAL_BEATS;
    const i = Math.min(TOTAL_BEATS - 1, Math.floor(raw));
    const t = raw - i;
    const stage = FLAT_BEATS[i].stage.id;
    /**
     * Первые три такта — один этап, и различать их приходится по такту, а не
     * по этапу: подлёт от планеты к области идёт внутри одного блока.
     */
    const beat = FLAT_BEATS[i].id;

    // Планета медленно вращается только на первом этапе; как только начинается
    // подлёт к Казахстану, вращение замирает — иначе цель уезжает из-под камеры.
    if (spin.current) {
      const spinPhase = beat === 'contours' ? t : 1;
      spin.current.rotation.y = 0.35 * (1 - spinPhase) * 0.6;
    }

    // Контуры областей проявляются при подлёте к Казахстану.
    const oblastVis =
      beat === 'contours' ? Math.max(0, t - 0.55) / 0.45 : 1;
    if (oblastLines.current) {
      (oblastLines.current.material as THREE.LineBasicMaterial).opacity = 0.42 * oblastVis;
    }

    // Call-out: Атырауская область загорается, остальная страна гаснет.
    const callout =
      beat === 'landscape' ? Math.min(1, t / 0.4) : stage === 'descend' ? 1 : 0;

    // На подлёте заливка отступает: она нужна, чтобы выделить область на фоне
    // страны, а вблизи площадки просто заливает кадр сплошным янтарём.
    const fillFade = stage === 'descend' ? 1 - 0.82 * Math.min(1, t / 0.35) : 1;
    if (atyrauMesh.current) {
      (atyrauMesh.current.material as THREE.MeshBasicMaterial).opacity = 0.5 * callout * fillFade;
    }
    if (dimMesh.current) {
      (dimMesh.current.material as THREE.MeshBasicMaterial).opacity = 0.62 * callout;
    }

    // Маркер пилота появляется вместе с call-out. Размер держим постоянным на
    // экране: от Атырауской области до подлёта к площадке камера сокращает
    // дистанцию на порядок, и фиксированный радиус превратился бы из точки в
    // бублик во весь кадр.
    if (markerRef.current) {
      markerRef.current.visible = callout > 0.05;
      const dist = camera.position.distanceTo(markerRef.current.getWorldPosition(_worldPos));
      const pulse = 1 + 0.1 * Math.sin(performance.now() * 0.003);
      markerRef.current.scale.setScalar(callout * pulse * dist * 0.022);
    }

    if (root.current) root.current.visible = true;
  });

  if (!active) return null;

  return (
    <group ref={root}>
      {/* Свет планеты: тёплый терминатор с одной стороны, холодный отсвет с другой */}
      <directionalLight color="#f0e2cc" intensity={2.4} position={[600, 320, 700]} />
      <directionalLight color="#4a6ea8" intensity={0.5} position={[-700, -200, -400]} />

      <group ref={spin}>
        {/* Тело планеты */}
        <mesh>
          <sphereGeometry args={[GLOBE_R, 96, 64]} />
          <meshStandardMaterial color="#0e2036" roughness={0.95} metalness={0} />
        </mesh>

        {/* Атмосферный ореол: обратные грани с аддитивным свечением */}
        <mesh scale={1.035}>
          <sphereGeometry args={[GLOBE_R, 64, 48]} />
          <meshBasicMaterial
            color="#3a6ea8"
            transparent
            opacity={0.16}
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>

        {/* Береговые линии и границы стран */}
        <lineSegments geometry={worldGeom}>
          <lineBasicMaterial color="#5f7c9e" transparent opacity={0.5} depthWrite={false} />
        </lineSegments>

        {/* Казахстан — акцентная граница */}
        <lineSegments geometry={kzGeom}>
          <lineBasicMaterial color="#35d0c2" transparent opacity={0.95} depthWrite={false} />
        </lineSegments>

        {/* Затемнение остальной страны при call-out Атырау */}
        <mesh ref={dimMesh} scale={1.0045}>
          <sphereGeometry args={[GLOBE_R, 64, 48]} />
          <meshBasicMaterial color="#050810" transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Контуры областей — поверх затемнения, чтобы не пропадали */}
        <lineSegments ref={oblastLines} geometry={lineGeom} renderOrder={2}>
          <lineBasicMaterial
            color="#8fbaf0"
            transparent
            opacity={0}
            depthWrite={false}
            depthTest={false}
          />
        </lineSegments>

        {/* Атырауская область */}
        {atyrauFill && (
          <mesh ref={atyrauMesh} geometry={atyrauFill} renderOrder={3}>
            <meshBasicMaterial
              color="#f0ae4a"
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
              depthTest={false}
            />
          </mesh>
        )}

        {/* Маркер пилота: Молдабек Восточный */}
        <group ref={markerRef} position={moldabekPos} visible={false} renderOrder={4}>
          <mesh>
            <sphereGeometry args={[0.16, 12, 10]} />
            <meshBasicMaterial color="#f5c46a" depthTest={false} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.3, 0.42, 28]} />
            <meshBasicMaterial
              color="#f0ae4a"
              transparent
              opacity={0.85}
              side={THREE.DoubleSide}
              depthTest={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}
