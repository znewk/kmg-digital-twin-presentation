import { useMemo } from 'react';
import * as THREE from 'three';
import {
  makeTerrainSampler,
  toSceneX,
  toSceneZ,
  useFieldData,
  FIELD_H,
  FIELD_W,
  type FieldDataset,
} from '../../data/geo/fieldData';
import { setTerrainSampler } from './geology';
import { useShow } from '../../store/useShow';

/**
 * Рельеф промысла по реальной высотной сетке (ТЗ §4.1 п.2).
 *
 * Сетка 96×96 построена по 30 864 геодезическим отметкам исполнительной
 * съёмки 2023 года. Отрисовывается с большей плотностью, чем исходная сетка:
 * билинейная выборка сглаживает ступени между узлами, отстоящими на 56 и 49 м.
 *
 * Ориентация сетки проверена не на глаз, а сверкой с горизонталями: вдоль
 * изолинии высота обязана быть постоянной, и при `row 0 = юг` разброс выходит
 * 0,46 м против 1,48 м при перевороте.
 */

const SEG_X = 150;
const SEG_Z = 132;

export function useTerrainReady(): FieldDataset {
  const data = useFieldData();
  // Сэмплер ставится до первого рендера потомков: на него завязана посадка
  // всех наземных объектов, и подставлять его позже нельзя.
  useMemo(() => setTerrainSampler(makeTerrainSampler(data.terrain)), [data]);
  return data;
}

export function RealTerrain() {
  const data = useTerrainReady();

  const geometry = useMemo(() => {
    const sample = makeTerrainSampler(data.terrain);
    const g = new THREE.PlaneGeometry(FIELD_W, FIELD_H, SEG_X, SEG_Z);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setY(i, sample(p.getX(i), p.getZ(i)));
    }
    g.computeVertexNormals();
    return g;
  }, [data]);

  /**
   * В режиме подземных коммуникаций грунт становится полупрозрачным.
   *
   * Иначе закопанные трубы не увидеть в принципе — и это не недоработка
   * визуализации, а свойство натуры: они в земле, земля непрозрачна.
   * Разнесение слоёв тут не помогает, потому что поднимает поверхность вместе
   * с породой, а трубы лежат внутри неё. Прозрачный грунт — единственный
   * честный способ показать подземное хозяйство целиком, не выкапывая его.
   */
  const utilities = useShow((s) => s.features.utilities);

  return (
    <mesh geometry={geometry} receiveShadow={!utilities} userData={{ id: 's-terrain' }}>
      <meshStandardMaterial
        color={utilities ? '#3f5164' : '#55697e'}
        roughness={0.97}
        metalness={0}
        transparent={utilities}
        opacity={utilities ? 0.24 : 1}
        depthWrite={!utilities}
      />
    </mesh>
  );
}

/**
 * Горизонтали рельефа поверх поверхности — 255 линий из чертежа.
 * Дают промыслу топографическую фактуру и подтверждают, что рельеф настоящий.
 */
export function TerrainContours() {
  const data = useFieldData();

  const geometry = useMemo(() => {
    const sample = makeTerrainSampler(data.terrain);
    const pos: number[] = [];
    for (const line of data.networks.contour) {
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, ay] = line[i];
        const [bx, by] = line[i + 1];
        const sx1 = toSceneX(ax);
        const sz1 = toSceneZ(ay);
        const sx2 = toSceneX(bx);
        const sz2 = toSceneZ(by);
        pos.push(sx1, sample(sx1, sz1) + 1.5, sz1, sx2, sample(sx2, sz2) + 1.5, sz2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  }, [data]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#6f8aa6" transparent opacity={0.22} depthWrite={false} />
    </lineSegments>
  );
}
