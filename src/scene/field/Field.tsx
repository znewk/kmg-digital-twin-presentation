import { useMemo } from 'react';
import { perfPoint, surfY, WELLS } from './geology';
import { DrainageZones, EarthLayers, TopIsolines } from './EarthLayers';
import { Well } from './Well';
import { SurfaceFacilities } from './Surface';
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

export function Field({ shadows }: { shadows: boolean }) {
  const stageId = useShow((s) => s.stageId);
  const drainage = useMemo(
    () => WELLS.filter((w) => ['skn', 'esp', 'frac'].includes(w.kind)).map(perfPoint),
    [],
  );

  if (!FIELD_STAGES.has(stageId)) return null;

  return (
    <group>
      <FieldLighting shadows={shadows} />
      <EarthLayers />
      <TopIsolines />
      <DrainageZones points={drainage} />
      <SurfaceFacilities />
      {WELLS.map((w) => (
        <Well key={w.id} spec={w} groundY={surfY(w.x, w.z)} />
      ))}
    </group>
  );
}
