import { useMemo } from 'react';
import * as THREE from 'three';
import {
  toSceneX,
  toSceneZ,
  useFieldData,
  type Polyline,
} from '../../data/geo/fieldData';
import { NETWORK_STYLE } from '../../data/geo/fieldStyle';
import { Assembly, type Placement } from './kit/Assembly';
import { makePulseMaterial } from './kit/flow';
import { EQUIPMENT_SCALE } from './kit/scale';
import { buildPole04, buildPole10 } from './facilities/pole';
import { surfY } from './geology';

/**
 * Воздушные линии электропередачи — нитка энергетики промысла (ТЗ §4.4.1).
 *
 * ВЛ-10 кВ: 84 трассы на 2877 фактических опорах, от них через КТП разводка
 * ВЛ-0,4 кВ (355 трасс) до приводов станков-качалок, УЭВН и насосов КНС.
 *
 * Провода провисают. Это не украшение: провес — то, по чему воздушную линию
 * узнают с первого взгляда, и прямые отрезки между опорами читаются как
 * проволочный каркас, а не как ВЛ. Форма провеса — парабола, приближение
 * цепной линии, которого при стреле в пару процентов пролёта не отличить от
 * точной формулы.
 *
 * Стоимость. Опоры — инстансы, две геометрии на все 2877 штук. Провода —
 * отрезки, слитые в одну геометрию на линию: три тысячи пролётов по три
 * провода это один вызов отрисовки, а не девять тысяч.
 */

/** Стрела провеса как доля длины пролёта. У промысловых ВЛ обычно 2–3 %. */
const SAG_RATIO = 0.025;

/** На сколько точек дробится провод в пролёте. Восьми хватает на гладкую дугу. */
const SPAN_STEPS = 8;

interface Conductor {
  /** Смещение подвеса поперёк линии, м. */
  offset: number;
  /** Высота подвеса над землёй, м. */
  height: number;
}

/** Три провода ВЛ-10 кВ: два на траверсе, один на вершине опоры. */
const WIRES_10: Conductor[] = [
  { offset: -1.0, height: 9.62 },
  { offset: 1.0, height: 9.62 },
  { offset: 0, height: 10.5 },
];

/** Четыре провода ВЛ-0,4 кВ на одной траверсе. */
const WIRES_04: Conductor[] = [
  { offset: -0.5, height: 6.9 },
  { offset: -0.17, height: 6.9 },
  { offset: 0.17, height: 6.9 },
  { offset: 0.5, height: 6.9 },
];

/**
 * Строит провода по трассам: для каждого пролёта — провисающая дуга на каждый
 * провод. Вершины трассы считаются точками подвеса, то есть опорами.
 */
function buildWires(lines: Polyline[], conductors: Conductor[]): THREE.BufferGeometry {
  const pos: number[] = [];
  // Продольная координата в метрах — по ней бежит импульс. Копится сквозь все
  // пролёты одной трассы, иначе импульс перезапускался бы на каждой опоре.
  const along: number[] = [];

  for (const line of lines) {
    let traveled = 0;

    for (let i = 0; i < line.length - 1; i++) {
      const ax = toSceneX(line[i][0]);
      const az = toSceneZ(line[i][1]);
      const bx = toSceneX(line[i + 1][0]);
      const bz = toSceneZ(line[i + 1][1]);

      const span = Math.hypot(bx - ax, bz - az);
      // Пролёты длиннее 120 м на промысловой ВЛ не встречаются — такие
      // «пролёты» на самом деле участки без промежуточных опор в чертеже,
      // и вешать на них провес в три метра было бы неправдой.
      if (span < 4 || span > 140) continue;

      const ay = surfY(ax, az);
      const by = surfY(bx, bz);
      const sag = span * SAG_RATIO;

      // Поперечное направление — по нему разносятся провода на траверсе.
      const nx = -(bz - az) / span;
      const nz = (bx - ax) / span;

      for (const wire of conductors) {
        // Разнос по траверсе и высота подвеса растут вместе с опорой: иначе
        // провода отвяжутся от траверс и повиснут сами по себе.
        const ox = nx * wire.offset * EQUIPMENT_SCALE;
        const oz = nz * wire.offset * EQUIPMENT_SCALE;

        for (let s = 0; s < SPAN_STEPS; s++) {
          const t0 = s / SPAN_STEPS;
          const t1 = (s + 1) / SPAN_STEPS;

          for (const t of [t0, t1]) {
            const x = ax + (bx - ax) * t + ox;
            const z = az + (bz - az) * t + oz;
            // Парабола провеса: ноль на опорах, максимум в середине пролёта.
            const droop = 4 * sag * t * (1 - t);
            const y = ay + (by - ay) * t + wire.height * EQUIPMENT_SCALE - droop;
            pos.push(x, y, z);
            along.push(traveled + span * t);
          }
        }
      }

      traveled += span;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.computeBoundingSphere();
  return g;
}

/** Опоры ВЛ-10 кВ — в фактических точках чертежа, все 2877. */
function usePoles10(): Placement[] {
  const data = useFieldData();

  return useMemo(() => {
    // Направление траверсы: поперёк ближайшего пролёта. Считается по трассам —
    // у точки опоры собственного направления нет.
    const segments: [number, number, number, number][] = [];
    for (const line of data.networks.power_10kv) {
      for (let i = 0; i < line.length - 1; i++) {
        segments.push([
          toSceneX(line[i][0]),
          toSceneZ(line[i][1]),
          toSceneX(line[i + 1][0]),
          toSceneZ(line[i + 1][1]),
        ]);
      }
    }

    return data.points.power_pole_10kv.map((p) => {
      const x = toSceneX(p[0]);
      const z = toSceneZ(p[1]);

      let yaw = 0;
      let bestD = Infinity;
      for (const [ax, az, bx, bz] of segments) {
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const d = (mx - x) ** 2 + (mz - z) ** 2;
        if (d < bestD) {
          bestD = d;
          // Траверса (локальная ось X) ставится поперёк пролёта.
          yaw = Math.atan2(-(bz - az), bx - ax) + Math.PI / 2;
        }
      }

      return { x, y: surfY(x, z), z, yaw };
    });
  }, [data]);
}

/**
 * Опоры ВЛ-0,4 кВ. Отдельного набора точек в датасете нет, поэтому опоры
 * ставятся в вершины трасс — там они и стоят в натуре.
 */
function usePoles04(): Placement[] {
  const data = useFieldData();

  return useMemo(() => {
    const out: Placement[] = [];
    const seen = new Set<string>();

    for (const line of data.networks.power_04kv) {
      for (let i = 0; i < line.length; i++) {
        const x = toSceneX(line[i][0]);
        const z = toSceneZ(line[i][1]);
        // Трассы стыкуются в общих узлах — без отсева там встали бы по две
        // опоры в одну точку.
        const key = `${Math.round(x)}:${Math.round(z)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const j = i < line.length - 1 ? i + 1 : i - 1;
        const jx = toSceneX(line[j][0]);
        const jz = toSceneZ(line[j][1]);
        out.push({
          x,
          y: surfY(x, z),
          z,
          yaw: Math.atan2(-(jz - z), jx - x) + Math.PI / 2,
        });
      }
    }

    return out;
  }, [data]);
}

function Wires({
  lines,
  conductors,
  color,
  opacity,
  speed,
  id,
}: {
  lines: Polyline[];
  conductors: Conductor[];
  color: string;
  opacity: number;
  /** Скорость импульса, м/с. */
  speed: number;
  id: string;
}) {
  const geometry = useMemo(() => buildWires(lines, conductors), [lines, conductors]);

  /**
   * Импульс по проводу — условное изображение передачи энергии, а не движение
   * заряда: электричество так не выглядит. Но нитку энергетики надо чем-то
   * оживить, а бегущий по проводу свет читается однозначно и не притворяется
   * физической величиной.
   */
  const material = useMemo(
    () =>
      makePulseMaterial({
        color,
        pulseColor: '#eaf4ff',
        period: 240,
        speed,
        opacity,
      }),
    [color, opacity, speed],
  );

  return <lineSegments geometry={geometry} material={material} userData={{ id }} />;
}

export function PowerLines() {
  const data = useFieldData();
  const poles10 = usePoles10();
  const poles04 = usePoles04();

  return (
    <group userData={{ id: 'power-lines' }}>
      <Assembly build={buildPole10} placements={poles10} id="poles-10kv" />
      <Assembly build={buildPole04} placements={poles04} id="poles-04kv" />

      {/* По магистральной ВЛ импульс идёт быстрее, чем по разводке 0,4 кВ —
          так видно направление: от питающей подстанции к КТП и дальше к
          приводам, а не наоборот. */}
      <Wires
        lines={data.networks.power_10kv}
        conductors={WIRES_10}
        color={NETWORK_STYLE.power_10kv.color}
        opacity={0.9}
        speed={150}
        id="s-vl10"
      />
      <Wires
        lines={data.networks.power_04kv}
        conductors={WIRES_04}
        color={NETWORK_STYLE.power_04kv.color}
        opacity={0.7}
        speed={80}
        id="s-vl04"
      />
    </group>
  );
}
