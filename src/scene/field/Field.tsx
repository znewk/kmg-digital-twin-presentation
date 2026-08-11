import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { perfPoint, surfY } from './geology';
import { DrainageZones, EarthLayers, TopIsolines } from './EarthLayers';
import { FloodFront, GgdmGrid, SeismicSection, WaterCone } from './features';
import { RealTerrain, TerrainContours, useTerrainReady } from './RealTerrain';
import { HubPads, RealNetworks } from './RealNetworks';
import { Well } from './Well';
import { WellFarm } from './WellFarm';
import { Stratum } from './explode';
import { useFieldData } from '../../data/geo/fieldData';
import { selectStoryWells } from '../../data/geo/storyWells';
import { useShow } from '../../store/useShow';

/**
 * Месторождение целиком — на реальных геоданных исполнительного топоплана
 * (ТЗ §4.1). Монтируется только когда показ дошёл до этапов, которым нужно 3D:
 * пока идёт витрина, глобус и экраны страны, поля в памяти нет, и триста
 * килобайт геометрии не грузятся.
 */

const FIELD_STAGES = new Set(['objectmap', 'reservoir', 'surface', 'well', 'production', 'outro']);

/** Свет промысла: теневая камера охватывает участок 5352 × 4682 м целиком. */
function FieldLighting({ shadows }: { shadows: boolean }) {
  return (
    <>
      {/* Промысел просматривают с нескольких километров, и небесная
          составляющая на такой площади даёт больше ключевого источника. */}
      <hemisphereLight args={['#a8c0dc', '#3a2f24', 0.9]} />
      <directionalLight
        color="#efe6d8"
        intensity={2.6}
        position={[2600, 3400, 1800]}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0006}
        shadow-camera-left={-3200}
        shadow-camera-right={3200}
        shadow-camera-top={3200}
        shadow-camera-bottom={-3200}
        shadow-camera-near={200}
        shadow-camera-far={9000}
      />
      <directionalLight color="#6e86c8" intensity={0.55} position={[-2200, -900, -3000]} />
    </>
  );
}

/**
 * Секущая плоскость. Материалов в сцене много и создаются они в разных
 * компонентах, поэтому плоскость навешивается обходом дерева, а не пробросом
 * пропа в каждый материал. Положение меняется каждый кадр без пересборки.
 */
function useClipping(root: React.RefObject<THREE.Group | null>) {
  const clip = useShow((s) => s.clip);
  const { gl } = useThree();
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 2700), []);

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

function FieldContents({ shadows }: { shadows: boolean }) {
  // Сэмплер рельефа ставится здесь, до рендера всего, что садится на землю.
  useTerrainReady();

  const data = useFieldData();
  const features = useShow((s) => s.features);
  const root = useRef<THREE.Group>(null);
  useClipping(root);

  /**
   * Сюжетные скважины подбираются из реестра фонда по фактическим категории,
   * состоянию и типу — вокруг самого крупного узла сбора (ТЗ §4.1 п.1).
   * Выдуманного списка скважин в проекте больше нет.
   */
  const story = useMemo(() => selectStoryWells(data), [data]);

  const drainage = useMemo(
    () => story.wells.filter((w) => ['skn', 'esp', 'frac'].includes(w.kind)).map(perfPoint),
    [story],
  );

  const storyUwis = useMemo(() => new Set(story.wells.map((w) => w.uwi)), [story]);

  return (
    <group ref={root}>
      <FieldLighting shadows={shadows} />

      {/* Недра — условная модель, топоплан описывает только поверхность */}
      <EarthLayers />

      {features.grid && <GgdmGrid />}
      {features.isolines && <TopIsolines />}
      {features.seismic && <SeismicSection />}
      {features.flood && <FloodFront wells={story.wells} />}
      {features.cone && <WaterCone wells={story.wells} />}
      {features.drainage && <DrainageZones points={drainage} />}

      {/*
        Сюжетные скважины целиком: ствол с обсадной, НКТ, цементом,
        перфорацией, ГНО и пакером — плюс наземное устье со своим исполнением.
        Они НЕ входят в группу поверхности: при разнесении слоёв поверхность
        поднимается, а стволы обязаны остаться на своих отметках — ради этого
        разнесение и нужно.
      */}
      {story.wells.map((w) => (
        <Well key={w.id} spec={w} groundY={surfY(w.x, w.z)} />
      ))}

      {/* Поверхность промысла по фактическим координатам съёмки */}
      <Stratum id="surface">
        <RealTerrain />
        <TerrainContours />
        <RealNetworks />
        <HubPads />
        {/* Весь остальной фонд — инстансами, но живой: работающие качалки
            качаются, у каждой своя фаза. Сюжетные исключены, они уже
            отрисованы полными моделями выше. */}
        <WellFarm exclude={storyUwis} />
      </Stratum>
    </group>
  );
}

export function Field({ shadows }: { shadows: boolean }) {
  const stageId = useShow((s) => s.stageId);
  if (!FIELD_STAGES.has(stageId)) return null;
  return <FieldContents shadows={shadows} />;
}
