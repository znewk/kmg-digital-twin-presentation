import { useMemo } from 'react';
import * as THREE from 'three';
import {
  absToSceneY,
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

/**
 * Гипсометрическая шкала: от низин к возвышенностям.
 *
 * Рельеф участка — 64,2…104,9 м, то есть сорок метров перепада на пять
 * километров. При мягком освещении это почти не даёт светотени, и поверхность
 * читается однотонной плитой: сам рельеф есть, но увидеть его нельзя.
 *
 * Раскраска по высоте — приём топографической карты, и он решает задачу без
 * вранья: цвет прямо соответствует отметке. Ход от прохладного серо-синего
 * в понижениях к тёплому песчаному на гривах — так же, как выглядит степь,
 * где на возвышенностях выдувается песок, а в понижениях держится суглинок.
 *
 * ЯРКОСТЬ НАМЕРЕННО НИЗКАЯ. Первая версия шкалы была светлее, и трассы сетей
 * в ней утонули: земля перетянула на себя внимание и стала спорить с тем, что
 * на ней лежит. Распределение ролей должно быть однозначным — поверхность это
 * тихий фон, промысел это передний план. Поэтому вся шкала держится в нижней
 * трети светлоты, а различимость рельефа обеспечивается не яркостью, а
 * разностью тона между низинами и гривами плюс притемнением склонов.
 */
const HYPSO: [number, string][] = [
  [0, '#18242f'],
  [0.32, '#212c34'],
  [0.58, '#2a3231'],
  [0.8, '#33352c'],
  [1, '#3d3c2e'],
];

function hypsoColor(t: number, out: THREE.Color): THREE.Color {
  const k = Math.min(1, Math.max(0, t));
  for (let i = 1; i < HYPSO.length; i++) {
    if (k <= HYPSO[i][0]) {
      const [t0, c0] = HYPSO[i - 1];
      const [t1, c1] = HYPSO[i];
      const f = (k - t0) / (t1 - t0);
      return out.set(c0).lerp(new THREE.Color(c1), f);
    }
  }
  return out.set(HYPSO[HYPSO.length - 1][1]);
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

    // Цвет вершины по её отметке плюс притемнение на склонах: крутизна сама
    // по себе информативна — по ней читаются бровки и промоины, которых на
    // ровной заливке не видно вовсе.
    const { zmin, zmax } = data.terrain;
    const yMin = absToSceneY(zmin);
    const yMax = absToSceneY(zmax);
    const n = g.attributes.normal;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();

    for (let i = 0; i < p.count; i++) {
      hypsoColor((p.getY(i) - yMin) / (yMax - yMin), c);
      // n.y = 1 на горизонтальной площадке, меньше — на склоне.
      const slope = 1 - Math.min(1, Math.max(0, n.getY(i)));
      c.multiplyScalar(1 - slope * 1.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
        // В режиме коммуникаций гипсометрия гасится: там смотрят на подземное
        // хозяйство, и пёстрая поверхность поверх него только мешает.
        vertexColors={!utilities}
        color={utilities ? '#3f5164' : '#ffffff'}
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
    <lineSegments geometry={geometry} userData={{ id: 's-contours' }}>
      {/*
        Горизонтали — 255 линий из чертежа, настоящие. При прежней
        непрозрачности 0,22 они терялись на заливке, и рельеф читался только по
        контуру блока. Вместе с гипсометрической раскраской они дают
        поверхности форму: цвет показывает высоту, изолинии — её изменение.
      */}
      {/*
        Горизонталей 255, и это главный источник «каши» на общем плане: сеть
        тонких линий по всей площади забивает собой и трассы, и оборудование.
        Уводятся почти в фон — они справочный слой, который должен проступать
        при взгляде на рельеф, а не соперничать с содержанием промысла.
      */}
      <lineBasicMaterial color="#5f7185" transparent opacity={0.13} depthWrite={false} />
    </lineSegments>
  );
}
