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
        // Трассы держатся почти непрозрачными. Полупрозрачная линия смешивается
        // с цветом земли под ней, а земля теперь не однотонная — на гипсометрии
        // одна и та же нитка меняла оттенок от низины к гриве и местами
        // пропадала совсем. Разделение ролей должно быть жёстким: земля — фон,
        // сети — передний план.
        opacity: 0.92,
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

/** Запас отсыпки за крайними устьями куста, м. */
const PAD_MARGIN = 11;

/**
 * На каком расстоянии две скважины считаются стоящими на одной площадке, м.
 *
 * На кусте устья отстоят на 20–40 м, между разными кустами — сотни метров.
 * Сорок пять метров разделяют эти два случая с запасом в обе стороны.
 */
const PAD_LINK = 45;

/** Больше этого площадка быть не может — значит, скопление слиплось в цепочку. */
const PAD_MAX = 220;

/**
 * Кустовые площадки — по фактическому пятну скважин.
 *
 * Раньше здесь стояли 188 одинаковых прямоугольников в узлах `hubs`. Это было
 * неправильно по существу: `hubs` — не площадки, а вычисленные точки схождения
 * линий нефтесбора. Часть из них приходится на простые тройники в поле, где
 * никакой площадки нет и быть не может, — отсюда и прямоугольники посреди
 * степи без единого объекта на них.
 *
 * Площадка теперь строится от того, что на ней стоит: берутся скважины,
 * приписанные к узлу, и отсыпка накрывает их пятно с запасом. Узел, к которому
 * не приписано хотя бы двух скважин, площадки не получает вовсе.
 *
 * Разворот считается по главной оси группы: скважины на кусте почти всегда
 * стоят в ряд, и площадка вытянута вдоль этого ряда, а не по сторонам света.
 * Именно это делает её похожей на настоящую отсыпку, а не на плитку.
 */
export function WellPads() {
  const data = useFieldData();
  const ref = useRef<THREE.InstancedMesh>(null);

  const pads = useMemo(() => {
    /**
     * Скопления устьев ищутся по фактическому расстоянию между ними, а не по
     * привязке к узлу сбора.
     *
     * Привязка `hub` в датасете идёт по ближайшему узлу, и в один узел попадают
     * скважины, разнесённые на сотни метров: узел собирает свою ветку сети, а не
     * стоит на площадке. Пятно такой группы накрывало пол-промысла — отсюда и
     * гигантские отсыпки.
     *
     * Здесь скважины связываются в группу, если стоят ближе PAD_LINK друг к
     * другу, обходом в ширину по сеточному индексу. Это и есть куст: несколько
     * устьев на одной отсыпке.
     */
    const spots = data.wells.map((w) => ({
      x: toSceneX(w.p[0]),
      z: toSceneZ(w.p[1]),
    }));

    const grid = new Map<string, number[]>();
    const key = (x: number, z: number) =>
      `${Math.floor(x / PAD_LINK)}:${Math.floor(z / PAD_LINK)}`;
    spots.forEach((s, i) => {
      const k = key(s.x, s.z);
      const bucket = grid.get(k);
      if (bucket) bucket.push(i);
      else grid.set(k, [i]);
    });

    const seen = new Uint8Array(spots.length);
    const clusters: { x: number; z: number }[][] = [];

    for (let start = 0; start < spots.length; start++) {
      if (seen[start]) continue;
      seen[start] = 1;

      const queue = [start];
      const group: { x: number; z: number }[] = [];

      while (queue.length) {
        const i = queue.pop()!;
        const s = spots[i];
        group.push(s);

        const cx = Math.floor(s.x / PAD_LINK);
        const cz = Math.floor(s.z / PAD_LINK);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const bucket = grid.get(`${cx + dx}:${cz + dz}`);
            if (!bucket) continue;
            for (const j of bucket) {
              if (seen[j]) continue;
              const t = spots[j];
              if ((t.x - s.x) ** 2 + (t.z - s.z) ** 2 > PAD_LINK * PAD_LINK) continue;
              seen[j] = 1;
              queue.push(j);
            }
          }
        }
      }

      if (group.length >= 2) clusters.push(group);
    }

    const out: { x: number; y: number; z: number; yaw: number; w: number; d: number }[] = [];

    for (const pts of clusters) {

      const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
      const mz = pts.reduce((a, p) => a + p.z, 0) / pts.length;

      // Главная ось группы через ковариацию: скважины куста стоят рядом, и
      // площадка обязана быть вытянута вдоль ряда.
      let cxx = 0;
      let czz = 0;
      let cxz = 0;
      for (const p of pts) {
        const dx = p.x - mx;
        const dz = p.z - mz;
        cxx += dx * dx;
        czz += dz * dz;
        cxz += dx * dz;
      }
      const angle = 0.5 * Math.atan2(2 * cxz, cxx - czz);
      const ax = Math.cos(angle);
      const az = Math.sin(angle);

      let halfA = 0;
      let halfB = 0;
      for (const p of pts) {
        const dx = p.x - mx;
        const dz = p.z - mz;
        halfA = Math.max(halfA, Math.abs(dx * ax + dz * az));
        halfB = Math.max(halfB, Math.abs(-dx * az + dz * ax));
      }

      const w = halfA * 2 + PAD_MARGIN * 2;
      const d = halfB * 2 + PAD_MARGIN * 2;
      // Слишком крупное скопление — не площадка, а слипшаяся цепочка устьев
      // вдоль трассы. Отсыпки под такое не бывает.
      if (w > PAD_MAX || d > PAD_MAX) continue;

      out.push({ x: mx, y: surfY(mx, mz), z: mz, yaw: Math.atan2(-az, ax), w, d });
    }

    return out;
  }, [data]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();

    pads.forEach((pad, i) => {
      p.set(pad.x, pad.y + 0.35, pad.z);
      e.set(0, pad.yaw, 0);
      q.setFromEuler(e);
      s.set(pad.w, 0.7, pad.d);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });

    mesh.count = pads.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pads]);

  if (pads.length === 0) return null;

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pads.length]} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      {/*
        Отсыпка щебнем и грунтом, спланированная под оборудование. Держится в
        тон земли и чуть светлее её: площадка должна читаться как подготовленное
        место, а не как плита, положенная на степь.
      */}
      <meshStandardMaterial color="#4a4638" roughness={1} metalness={0} />
    </instancedMesh>
  );
}
