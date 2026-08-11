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

interface Span {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Пройденное расстояние от начала трассы до начала пролёта, м. */
  from: number;
  length: number;
}

/**
 * Пролёты, по которым реально вешаются провода.
 *
 * Единый источник и для проводов, и для опор. Раньше провода строились по
 * пролётам, а опоры ставились отдельно по всем точкам чертежа — и опоры без
 * проводов оставались стоять сами по себе. Теперь опора существует только там,
 * где есть пролёт.
 *
 * Пролёты длиннее 140 м отбрасываются: на промысловой ВЛ таких не бывает, это
 * участки, где в чертеже не проставлены промежуточные опоры. Вешать на них
 * трёхметровый провес было бы неправдой.
 */
function collectSpans(lines: Polyline[]): Span[] {
  const out: Span[] = [];

  for (const line of lines) {
    let traveled = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const ax = toSceneX(line[i][0]);
      const az = toSceneZ(line[i][1]);
      const bx = toSceneX(line[i + 1][0]);
      const bz = toSceneZ(line[i + 1][1]);
      const length = Math.hypot(bx - ax, bz - az);

      if (length >= 4 && length <= 140) {
        out.push({ ax, az, bx, bz, from: traveled, length });
      }
      traveled += length;
    }
  }

  return out;
}

/**
 * Строит провода по пролётам: на каждый пролёт — провисающая дуга на каждый
 * провод.
 */
function buildWires(spans: Span[], conductors: Conductor[]): THREE.BufferGeometry {
  const pos: number[] = [];
  // Продольная координата в метрах — по ней бежит импульс. Копится сквозь все
  // пролёты одной трассы, иначе импульс перезапускался бы на каждой опоре.
  const along: number[] = [];

  for (const { ax, az, bx, bz, from, length } of spans) {
    const ay = surfY(ax, az);
    const by = surfY(bx, bz);
    const sag = length * SAG_RATIO;

    // Поперечное направление — по нему разносятся провода на траверсе.
    const nx = -(bz - az) / length;
    const nz = (bx - ax) / length;

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
          along.push(from + length * t);
        }
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.computeBoundingSphere();
  return g;
}

/** Насколько далеко от оси трассы опора всё ещё считается её опорой, м. */
const POLE_SNAP = 30;

/**
 * Раскладывает опоры по трассам и строит пролёты МЕЖДУ СОСЕДНИМИ ОПОРАМИ.
 *
 * Это ключевой момент, и сначала я сделал его неправильно. В чертеже 84 трассы
 * ВЛ-10 кВ, но после упрощения геометрии в них всего 88 звеньев — а опор 2877.
 * То есть вершины трассы и опоры это разные вещи: трасса задаёт направление,
 * опоры стоят вдоль неё через 40–80 м. Если вешать провода между вершинами,
 * получаются пролёты в сотни метров, а 2877 опор остаются стоять без единого
 * провода — ровно то, что и было видно в кадре.
 *
 * Поэтому каждая опора проецируется на ближайшую трассу, опоры сортируются
 * вдоль неё, и пролёт — это отрезок между двумя соседними. Опоры, не легшие ни
 * на одну трассу, отбрасываются: линии у них нет, значит и опоры быть не должно.
 */
function buildPoleSpans(
  lines: Polyline[],
  polePoints: [number, number][],
): { spans: Span[]; poles: Placement[] } {
  interface Seg {
    ax: number;
    az: number;
    bx: number;
    bz: number;
    from: number;
    len: number;
  }

  // Трассы в виде отрезков с накопленной длиной.
  const byLine: Seg[][] = lines.map((line) => {
    const segs: Seg[] = [];
    let from = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const ax = toSceneX(line[i][0]);
      const az = toSceneZ(line[i][1]);
      const bx = toSceneX(line[i + 1][0]);
      const bz = toSceneZ(line[i + 1][1]);
      const len = Math.hypot(bx - ax, bz - az);
      segs.push({ ax, az, bx, bz, from, len });
      from += len;
    }
    return segs;
  });

  /** Опоры, легшие на трассу, с положением вдоль неё. */
  const onLine: { x: number; z: number; s: number }[][] = lines.map(() => []);

  for (const p of polePoints) {
    const x = toSceneX(p[0]);
    const z = toSceneZ(p[1]);

    let bestLine = -1;
    let bestS = 0;
    let bestD2 = POLE_SNAP * POLE_SNAP;

    byLine.forEach((segs, li) => {
      for (const seg of segs) {
        if (seg.len < 1e-3) continue;
        // Проекция точки на отрезок, зажатая его концами.
        const t = Math.min(
          1,
          Math.max(
            0,
            ((x - seg.ax) * (seg.bx - seg.ax) + (z - seg.az) * (seg.bz - seg.az)) /
              (seg.len * seg.len),
          ),
        );
        const px = seg.ax + (seg.bx - seg.ax) * t;
        const pz = seg.az + (seg.bz - seg.az) * t;
        const d2 = (px - x) ** 2 + (pz - z) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestLine = li;
          bestS = seg.from + seg.len * t;
        }
      }
    });

    if (bestLine >= 0) onLine[bestLine].push({ x, z, s: bestS });
  }

  const spans: Span[] = [];
  const poles: Placement[] = [];

  onLine.forEach((list) => {
    if (list.length < 2) return;
    list.sort((a, b) => a.s - b.s);

    for (let i = 0; i < list.length; i++) {
      const cur = list[i];
      const next = list[i + 1];

      // Разворот траверсы — поперёк того пролёта, в котором опора участвует.
      const ref = next ?? list[i - 1];
      const yaw = Math.atan2(-(ref.z - cur.z), ref.x - cur.x) + Math.PI / 2;
      poles.push({ x: cur.x, y: surfY(cur.x, cur.z), z: cur.z, yaw });

      if (!next) continue;
      const length = Math.hypot(next.x - cur.x, next.z - cur.z);
      // Разрыв больше 140 м — это не пролёт, а пропуск в расстановке опор.
      if (length < 4 || length > 140) continue;

      spans.push({ ax: cur.x, az: cur.z, bx: next.x, bz: next.z, from: cur.s, length });
    }
  });

  return { spans, poles };
}

/**
 * ВЛ-0,4 кВ: отдельного набора опор в датасете нет, поэтому опоры ставятся в
 * концах пролётов, взятых прямо из вершин трасс, — там они и стоят в натуре.
 */
function spansAndPolesFromVertices(lines: Polyline[]): {
  spans: Span[];
  poles: Placement[];
} {
  const spans = collectSpans(lines);
  const poles: Placement[] = [];
  const seen = new Set<string>();

  for (const s of spans) {
    const yaw = Math.atan2(-(s.bz - s.az), s.bx - s.ax) + Math.PI / 2;
    for (const [x, z] of [
      [s.ax, s.az],
      [s.bx, s.bz],
    ]) {
      // Трассы стыкуются в общих узлах — без отсева там встали бы по две
      // опоры в одну точку.
      const key = `${Math.round(x)}:${Math.round(z)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      poles.push({ x, y: surfY(x, z), z, yaw });
    }
  }

  return { spans, poles };
}

function Wires({
  spans,
  conductors,
  color,
  opacity,
  speed,
  id,
}: {
  spans: Span[];
  conductors: Conductor[];
  color: string;
  opacity: number;
  /** Скорость импульса, м/с. */
  speed: number;
  id: string;
}) {
  const geometry = useMemo(() => buildWires(spans, conductors), [spans, conductors]);

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
        // Импульс приглушён до тёплого серого. Белый на тонкой линии даёт
        // резкую искру, и на общем плане тысячи пролётов ВЛ начинали
        // перекрикивать нефтесбор — при том, что главное на промысле не они.
        pulseColor: '#b8c6d6',
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

  const line10 = useMemo(
    () => buildPoleSpans(data.networks.power_10kv, data.points.power_pole_10kv),
    [data],
  );
  const line04 = useMemo(() => spansAndPolesFromVertices(data.networks.power_04kv), [data]);

  return (
    <group userData={{ id: 'power-lines' }}>
      <Assembly build={buildPole10} placements={line10.poles} id="poles-10kv" />
      <Assembly build={buildPole04} placements={line04.poles} id="poles-04kv" />

      {/* По магистральной ВЛ импульс идёт быстрее, чем по разводке 0,4 кВ —
          так видно направление: от питающей подстанции к КТП и дальше к
          приводам, а не наоборот. */}
      {/* Провода держатся заметно тусклее трубопроводов: их тысячи пролётов
          против сотен трасс нефтесбора, и при равной подаче энергетика
          застилает собой промысел. */}
      <Wires
        spans={line10.spans}
        conductors={WIRES_10}
        color={NETWORK_STYLE.power_10kv.color}
        opacity={0.42}
        speed={150}
        id="s-vl10"
      />
      <Wires
        spans={line04.spans}
        conductors={WIRES_04}
        color={NETWORK_STYLE.power_04kv.color}
        opacity={0.28}
        speed={80}
        id="s-vl04"
      />
    </group>
  );
}
