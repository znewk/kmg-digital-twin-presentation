import { useMemo } from 'react';
import * as THREE from 'three';
import {
  faultTraceX,
  makeFieldLayer,
  makeOilLens,
  markerHorizon,
  ringRadius,
  yResTop,
  FIELD_STRATA,
  HD,
  HW,
  OVERBURDEN_MARKERS,
  OWC_Y,
} from './geology';
import { Stratum } from './explode';
import { Interactive } from './Interactive';

/**
 * Недра месторождения: шесть слоёв, тектонический сброс, залежь, ВНК.
 *
 * Слои строятся процедурно и мемоизируются один раз — геометрия статична,
 * анимируется только материал. На показе пересборка меша недопустима.
 */

function FaultPlane() {
  const geometry = useMemo(() => {
    const nz = 20;
    const nd = 16;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= nd; j++) {
      for (let i = 0; i <= nz; i++) {
        const z = -HD + (2 * HD * i) / nz;
        const d = -60 - (820 * j) / nd;
        pos.push(faultTraceX(d, z), d, z);
      }
    }
    for (let j = 0; j < nd; j++) {
      for (let i = 0; i < nz; i++) {
        const a = j * (nz + 1) + i;
        idx.push(a, a + nz + 1, a + 1, a + 1, a + nz + 1, a + nz + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#6e4a3a"
        emissive="#3a2118"
        emissiveIntensity={0.25}
        roughness={0.85}
        transparent
        opacity={0.42}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

export function EarthLayers() {
  const strata = useMemo(
    () => FIELD_STRATA.map((s) => ({ spec: s, geometry: makeFieldLayer(s.top, s.bot) })),
    [],
  );
  const lens = useMemo(() => makeOilLens(), []);

  const markers = useMemo(
    () =>
      OVERBURDEN_MARKERS.map((d) =>
        makeFieldLayer(markerHorizon(d), markerHorizon(d - 9), 36, 24),
      ),
    [],
  );

  const owcContour = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const N = 140;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      const r = ringRadius(cx, cz, OWC_Y + 2);
      pts.push(new THREE.Vector3(cx * r, OWC_Y + 2, cz * r));
    }
    return new THREE.CatmullRomCurve3(pts, true);
  }, []);

  // Каждый слой — в собственной группе: только так они могут разъезжаться
  // по отдельности. Всё, что принадлежит слою по смыслу (прослои — толще,
  // залежь, ВНК и сброс — коллектору), едет вместе с ним.
  const byId = new Map(strata.map((s) => [s.spec.id, s]));
  const layer = (id: string) => {
    const s = byId.get(id);
    if (!s) return null;
    return (
      <Interactive id={id}>
        <mesh geometry={s.geometry} castShadow receiveShadow userData={{ id }}>
          <meshStandardMaterial
            color={s.spec.color}
            roughness={0.92}
            metalness={0.04}
            transparent={s.spec.opacity < 1}
            opacity={s.spec.opacity}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Interactive>
    );
  };

  return (
    <group>
      <Stratum id="g-soil">{layer('g-soil')}</Stratum>

      <Stratum id="g-over">
        {layer('g-over')}
        {/* Отражающие горизонты в перекрывающей толще */}
        {markers.map((g, i) => (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color="#57534a" roughness={0.95} metalness={0} />
          </mesh>
        ))}
      </Stratum>

      <Stratum id="g-cap">{layer('g-cap')}</Stratum>

      <Stratum id="g-res">
        {layer('g-res')}
        <Interactive id="res-fault">
          <FaultPlane />
        </Interactive>

        {/* Залежь. polygonOffset — стенки линзы копланарны стенкам коллектора. */}
        <mesh geometry={lens} userData={{ id: 'res-oil' }}>
          <meshStandardMaterial
            color="#8a5a16"
            emissive="#c07b20"
            emissiveIntensity={0.45}
            roughness={0.5}
            metalness={0.1}
            transparent
            opacity={0.88}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-3}
            polygonOffsetUnits={-3}
          />
        </mesh>

        <mesh userData={{ id: 'res-oil' }}>
          <tubeGeometry args={[owcContour, 220, 2.4, 6, true]} />
          <meshBasicMaterial color="#f0ae4a" transparent opacity={0.85} depthWrite={false} />
        </mesh>

        {/* Плоскость ВНК */}
        <mesh position={[0, OWC_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={{ id: 'res-owc' }}>
          <planeGeometry args={[2 * HW * 0.98, 2 * HD * 0.98]} />
          <meshBasicMaterial
            color="#5fa8e8"
            transparent
            opacity={0.12}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </Stratum>

      <Stratum id="g-water">{layer('g-water')}</Stratum>
      <Stratum id="g-base">{layer('g-base')}</Stratum>
    </group>
  );
}

/** Зоны дренирования вокруг интервалов перфорации добывающих скважин. */
export function DrainageZones({ points }: { points: THREE.Vector3[] }) {
  return (
    <group userData={{ id: 'res-drainage' }}>
      {points.map((p, i) => (
        <mesh key={i} position={p} scale={[130, 52, 130]}>
          <sphereGeometry args={[1, 18, 12]} />
          <meshBasicMaterial color="#f0ae4a" transparent opacity={0.1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Изолинии по кровле пласта — визуальный след Картопостроителя ABAI. */
export function TopIsolines() {
  const curves = useMemo(
    () =>
      [-530, -512, -494, -476, -460].map((level) => {
        const pts: THREE.Vector3[] = [];
        const N = 110;
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const cx = Math.cos(a);
          const cz = Math.sin(a);
          const r = ringRadius(cx, cz, level);
          pts.push(new THREE.Vector3(cx * r, yResTop(cx * r, cz * r) + 3, cz * r));
        }
        return new THREE.CatmullRomCurve3(pts, true);
      }),
    [],
  );

  return (
    <group userData={{ id: 'res-map' }}>
      {curves.map((c, i) => (
        <mesh key={i}>
          <tubeGeometry args={[c, 120, 1.2, 5, true]} />
          <meshBasicMaterial color="#f0ae4a" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
