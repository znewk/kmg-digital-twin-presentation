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

interface NetSpec {
  id: string;
  lines: Polyline[];
  color: string;
  opacity: number;
  /** Подъём над рельефом, м — чтобы линия не тонула в поверхности. */
  lift: number;
  /** Параметры бегущей волны. Нет у дорог: по дороге ничего не течёт. */
  flow?: { speed: number; period: number };
}

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
   * Здесь остаётся ТОЛЬКО поверхностное обозначение трасс.
   *
   * Сами подземные трубопроводы теперь лежат в земле на глубине заложения
   * (см. `Underground.tsx`) — раньше они рисовались линиями над рельефом, и это
   * противоречило `meta.buried_note`. Но убрать их с поверхности совсем нельзя
   * по двум причинам: §3.1 п.6 требует, чтобы 3D читалась как продолжение
   * плоской схемы с теми же трассами, и в натуре подземный трубопровод
   * действительно обозначен на поверхности — расчищенной полосой отвода и
   * знаками. Поэтому здесь тонкая приглушённая нитка-обозначение, а объём —
   * под землёй.
   *
   * Цвет берётся из общего словаря: плоская схема и сцена обязаны совпадать по
   * обозначениям, иначе переход «карта поднимается в 3D» читается как подмена
   * картинки.
   */
  const specs = useMemo<NetSpec[]>(() => {
    const n = data.networks;
    const spec = (
      id: string,
      key: NetworkKey,
      lines: Polyline[],
      opacity: number,
      flow?: { speed: number; period: number },
    ): NetSpec => ({
      id,
      lines,
      color: NETWORK_STYLE[key].color,
      lift: 0.4,
      opacity,
      flow,
    });
    // Скорости те же, что у подземных труб: волна на поверхности и волна в
    // трубе — одно и то же течение, показанное с двух сторон, и расходиться
    // они не должны.
    return [
      spec('s-neftesbor', 'oil_pipeline', n.oil_pipeline, 0.42, { speed: 9, period: 46 }),
      spec('s-ppd-line', 'water_pipeline', n.water_pipeline, 0.36, { speed: 16, period: 52 }),
      spec('s-gas', 'gas_pipeline', n.gas_pipeline, 0.32, { speed: 26, period: 60 }),
      spec('s-roads', 'road', n.road, 0.45),
    ];
  }, [data]);

  const layers = useMemo(
    () =>
      specs.map((s) => ({
        spec: s,
        geometry: mergeLines(s.lines, s.lift),
        material: s.flow
          ? makePulseMaterial({
              color: s.color,
              pulseColor: '#ffffff',
              period: s.flow.period,
              speed: s.flow.speed,
              opacity: s.opacity,
              // Пунктир длиной 22 м: это разметка трассы, а не труба.
              dash: 22,
            })
          : new THREE.LineBasicMaterial({
              color: s.color,
              transparent: true,
              opacity: s.opacity,
              depthWrite: false,
            }),
      })),
    [specs],
  );

  /**
   * В режиме «Коммуникации» разметка трасс убирается.
   *
   * Два изображения одного и того же трубопровода — пунктир на поверхности и
   * настоящая труба под ней — вместе только путают: непонятно, где же он на
   * самом деле. Поэтому они никогда не показываются одновременно: в обычном
   * виде — разметка, в режиме коммуникаций — сама труба. Дороги остаются, они
   * действительно на поверхности.
   */
  const utilities = useShow((s) => s.features.utilities);

  return (
    <group>
      {layers
        .filter(({ spec }) => !utilities || !spec.flow)
        .map(({ spec, geometry, material }) => (
          <lineSegments
            key={spec.id}
            geometry={geometry}
            material={material}
            userData={{ id: spec.id }}
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
