import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { perfPoint, surfY, WELLS } from './geology';
import { DrainageZones, EarthLayers, TopIsolines } from './EarthLayers';
import { FloodFront, GgdmGrid, SeismicSection, WaterCone } from './features';
import { Well } from './Well';
import { SurfaceFacilities } from './Surface';
import { Stratum } from './explode';
import { Interactive } from './Interactive';
import { useShow } from '../../store/useShow';

/**
 * Месторождение целиком. Монтируется только когда показ дошёл до этапов,
 * которым нужно 3D: пока идёт витрина и вводные 2D-экраны, поля в памяти нет.
 *
 * Это и есть основной приём производительности (ТЗ §2): не «деградировать
 * тяжёлую сцену», а не собирать её, пока она не нужна.
 */

/** Этапы, на которых поле участвует в кадре. */
const FIELD_STAGES = new Set(['objectmap', 'reservoir', 'surface', 'well', 'production', 'outro']);

/** Свет промысла: теневая камера охватывает блок 1400 × 900 м целиком. */
function FieldLighting({ shadows }: { shadows: boolean }) {
  return (
    <>
      {/* Промысел просматривается с 1500–1800 м, и небесная составляющая на
          такой площади даёт больше, чем ключевой источник. */}
      <hemisphereLight args={['#a8c0dc', '#3a2f24', 0.9]} />
      <directionalLight
        color="#efe6d8"
        intensity={2.6}
        position={[760, 1100, 500]}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-camera-left={-1100}
        shadow-camera-right={1100}
        shadow-camera-top={1100}
        shadow-camera-bottom={-1100}
        shadow-camera-near={100}
        shadow-camera-far={3600}
      />
      <directionalLight color="#6e86c8" intensity={0.55} position={[-600, -300, -900]} />
    </>
  );
}

/**
 * Секущая плоскость. Материалов в сцене сотни и они создаются в разных
 * компонентах, поэтому плоскость навешивается обходом дерева, а не пробросом
 * пропа в каждый материал — иначе пришлось бы тащить его через всю иерархию.
 * Положение плоскости меняется каждый кадр без пересборки материалов.
 */
function useClipping(root: React.RefObject<THREE.Group | null>) {
  const clip = useShow((s) => s.clip);
  const { gl } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 700), []);

  useEffect(() => {
    gl.localClippingEnabled = true;
  }, [gl]);

  useEffect(() => {
    const g = root.current;
    if (!g) return;
    g.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m.clippingPlanes = clip ? [plane] : null;
        m.needsUpdate = true;
      }
    });
  }, [clip, plane, root]);

  useFrame(() => {
    plane.constant = useShow.getState().clipX;
  });
}

export function Field({ shadows }: { shadows: boolean }) {
  const stageId = useShow((s) => s.stageId);
  const features = useShow((s) => s.features);
  const root = useRef<THREE.Group>(null);

  useClipping(root);

  const drainage = useMemo(
    () => WELLS.filter((w) => ['skn', 'esp', 'frac'].includes(w.kind)).map(perfPoint),
    [],
  );

  if (!FIELD_STAGES.has(stageId)) return null;

  return (
    <group ref={root}>
      <FieldLighting shadows={shadows} />

      {/* Недра: каждый слой в своей группе, чтобы их можно было разнести */}
      <EarthLayers />

      {features.grid && <GgdmGrid />}
      {features.isolines && <TopIsolines />}
      {features.seismic && <SeismicSection />}
      {features.flood && <FloodFront />}
      {features.cone && <WaterCone />}
      {features.drainage && <DrainageZones points={drainage} />}

      {/* Поверхность поднимается при разнесении, скважины остаются на месте —
          именно так под приподнятым промыслом открываются стволы */}
      <Stratum id="surface">
        <SurfaceFacilities />
      </Stratum>

      {WELLS.map((w) => (
        <Interactive key={w.id} id={w.id}>
          <Well spec={w} groundY={surfY(w.x, w.z)} />
        </Interactive>
      ))}
    </group>
  );
}
