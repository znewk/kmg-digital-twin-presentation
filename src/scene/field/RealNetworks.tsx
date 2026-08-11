import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  toSceneX,
  toSceneZ,
  useFieldData,
  type Polyline,
} from '../../data/geo/fieldData';
import { NETWORK_STYLE, type NetworkKey } from '../../data/geo/fieldStyle';
import { makePulseMaterial } from './kit/flow';
import { surfY } from './geology';
import { useShow } from '../../store/useShow';

/**
 * Реальные сети промысла (ТЗ §4.1 п.3): нефтесбор, водоводы, газопровод,
 * ВЛ-10 кВ и 0,4 кВ, дороги — по фактическим трассам из топоплана.
 *
 * Полилиний больше тысячи. Каждая отдельным мешем — это тысяча вызовов
 * отрисовки на кадр, чего показ не переживёт. Все трассы одного типа
 * сливаются в одну геометрию `LineSegments`: один вызов на тип сети.
 */

/**
 * Максимальная длина звена, м.
 *
 * Трассы в чертеже заданы длинными прямыми — до трёхсот метров между узлами.
 * Если положить такой отрезок прямой хордой, приподняв концы над рельефом,
 * середина уйдёт под землю: местность под ним выгибается, а при пятикратном
 * вертикальном преувеличении перепад на трёхстах метрах достигает десятков
 * метров. Именно поэтому сети сначала не отрисовывались вовсе — они целиком
 * лежали внутри рельефа. Звенья дробятся, и трасса стелется по поверхности.
 */
const MAX_SEG = 40;

function mergeLines(lines: Polyline[], lift: number): THREE.BufferGeometry {
  const pos: number[] = [];
  // Продольная координата в метрах, накопленная вдоль всей трассы: по ней
  // бежит волна потока. Без неё обозначение трассы лежит неподвижно, и с
  // поверхности промысел выглядит мёртвым — сама труба-то под землёй.
  const along: number[] = [];

  const push = (x: number, z: number, d: number) => {
    pos.push(x, surfY(x, z) + lift, z);
    along.push(d);
  };

  for (const line of lines) {
    let traveled = 0;

    for (let i = 0; i < line.length - 1; i++) {
      const x1 = toSceneX(line[i][0]);
      const z1 = toSceneZ(line[i][1]);
      const x2 = toSceneX(line[i + 1][0]);
      const z2 = toSceneZ(line[i + 1][1]);
      const len = Math.hypot(x2 - x1, z2 - z1);

      const steps = Math.max(1, Math.ceil(len / MAX_SEG));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        push(x1 + (x2 - x1) * t0, z1 + (z2 - z1) * t0, traveled + len * t0);
        push(x1 + (x2 - x1) * t1, z1 + (z2 - z1) * t1, traveled + len * t1);
      }

      traveled += len;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  return g;
}

export function RealNetworks() {
  const data = useFieldData();

  /**
   * На поверхности остаются только дороги.
   *
   * Трубопроводов здесь больше нет вовсе — и это правильный ответ на простой
   * вопрос: где на промысле лежит нефтесборный коллектор? В земле. Значит и в
   * модели он должен быть в земле, а не продублирован ниткой на поверхности.
   *
   * Раньше здесь была разметка трассы, и формально она честна: подземный
   * трубопровод в натуре размечен полосой отвода. Но на экране линия по земле
   * читается как труба по земле, что бы ни было написано в легенде, и спорит
   * сама с собой — тем более что настоящая труба нарисована рядом, под ней.
   *
   * Цена решения: сверху промысел теряет узнаваемый звездообразный рисунок
   * нефтесбора с плоской схемы (§3.1 п.6). Возвращается он режимом
   * «Коммуникации» и разрезом — там, где ему и место.
   */
  const roads = useMemo(
    () => ({
      geometry: mergeLines(data.networks.road, 0.4),
      material: new THREE.LineBasicMaterial({
        color: NETWORK_STYLE.road.color,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    }),
    [data],
  );

  /**
   * Схема трасс — по тумблеру «Трассы».
   *
   * Пунктиром, чтобы разметка не притворялась трубой, и с той же скоростью
   * волны, что у самой трубы под ней: это одно течение, показанное с двух
   * сторон. В режиме «Коммуникации» разметка гасится — там видно настоящую
   * трубу, и два изображения одного трубопровода спорили бы между собой.
   */
  const traceLayers = useMemo(() => {
    const n = data.networks;
    const specs: [string, NetworkKey, Polyline[], { speed: number; period: number }][] = [
      ['s-neftesbor', 'oil_pipeline', n.oil_pipeline, { speed: 9, period: 46 }],
      ['s-ppd-line', 'water_pipeline', n.water_pipeline, { speed: 16, period: 52 }],
      ['s-gas', 'gas_pipeline', n.gas_pipeline, { speed: 26, period: 60 }],
    ];

    return specs.map(([id, key, lines, flow]) => ({
      id,
      geometry: mergeLines(lines, 0.4),
      material: makePulseMaterial({
        color: NETWORK_STYLE[key].color,
        pulseColor: '#ffffff',
        period: flow.period,
        speed: flow.speed,
        opacity: 0.5,
        dash: 22,
      }),
    }));
  }, [data]);

  const showTraces = useShow((s) => s.features.traces && !s.features.utilities);

  return (
    <group>
      <lineSegments
        geometry={roads.geometry}
        material={roads.material}
        userData={{ id: 's-roads' }}
      />

      {showTraces &&
        traceLayers.map((t) => (
          <lineSegments
            key={t.id}
            geometry={t.geometry}
            material={t.material}
            userData={{ id: t.id }}
          />
        ))}
    </group>
  );
}

/**
 * Кусты — 188 узлов сбора. Размер площадки берётся от числа сходящихся ниток:
 * куст на девять скважин физически крупнее куста на две.
 */
export function HubPads() {
  const data = useFieldData();
  const ref = useRef<THREE.InstancedMesh>(null);

  const hubs = useMemo(
    () =>
      data.hubs.map((h) => {
        const x = toSceneX(h.p[0]);
        const z = toSceneZ(h.p[1]);
        return { x, z, y: surfY(x, z), size: 26 + Math.min(h.links, 10) * 4 };
      }),
    [data],
  );

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    hubs.forEach((h, i) => {
      p.set(h.x, h.y + 0.6, h.z);
      s.set(h.size, 1.2, h.size * 0.72);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.count = hubs.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [hubs]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, hubs.length]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#37475c" roughness={1} metalness={0} />
    </instancedMesh>
  );
}
