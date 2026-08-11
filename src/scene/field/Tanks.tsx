import { useMemo } from 'react';
import { toSceneX, toSceneZ, useFieldData, type Polyline } from '../../data/geo/fieldData';
import { Assembly, type Placement } from './kit/Assembly';
import { box, cone, cyl, flange, pipe, sphere, torus, valve, type Part } from './kit/parts';
import { surfY } from './geology';

/**
 * Резервуарный парк — по фактическим контурам из чертежа (ТЗ §4.1).
 *
 * Радиусы не назначены, а измерены: в слое `networks.tank` 51 замкнутый контур,
 * из каждого берётся центр и радиус. Крупнейшие два — радиусом 7,8 м, то есть
 * диаметром 15,6 м: это РВС-2000 (номинальный диаметр 15,2 м). Резервуаров
 * РВС-5000, упоминавшихся в описании ЦППН «Кенбай», на этом топоплане нет — и
 * это ожидаемо, ЦППН находится за границей съёмки.
 *
 * Мелкие контуры радиусом 1–4 м — технологические и дренажные ёмкости, а не
 * резервуары товарного парка; они и строятся иначе.
 */

/** Ниже этого радиуса контур считается технологической ёмкостью, а не РВС. */
const RVS_MIN_RADIUS = 4.5;

/** Контуры мельче этого — арматура и мелочь, в сцену не выводятся. */
const MIN_RADIUS = 1.4;

interface Circle {
  x: number;
  z: number;
  r: number;
}

/**
 * Схлопывает контуры, описывающие один и тот же резервуар.
 *
 * Критерий физический: два резервуара не могут стоять внутри друг друга. Если
 * расстояние между центрами меньше суммы радиусов, это не два бака, а один,
 * обведённый в чертеже несколькими контурами — стенка, кольцо жёсткости,
 * отбортовка. Именно из-за этого на площадке стояли бочки, проходящие одна
 * сквозь другую: круги отстоят на пять метров при радиусе почти пять.
 *
 * Контуры перебираются от большего к меньшему, поэтому остаётся внешний.
 * Порог 0,85 от суммы радиусов, а не единица: у стоящих вплотную резервуаров
 * контуры в чертеже иногда чуть перекрываются из-за упрощения геометрии.
 */
function dedupeCircles(circles: Circle[]): Circle[] {
  const sorted = [...circles].sort((a, b) => b.r - a.r);
  const kept: Circle[] = [];

  for (const c of sorted) {
    const overlaps = kept.some(
      (k) => Math.hypot(k.x - c.x, k.z - c.z) < (k.r + c.r) * 0.85,
    );
    if (!overlaps) kept.push(c);
  }

  return kept;
}

/**
 * Центр и радиус замкнутого контура. Контуры в чертеже упрощены до нескольких
 * точек, поэтому радиус берётся по габариту, а не по средней длине радиус-
 * вектора: у четырёхточечного восьмиугольника второе занижает размер.
 */
function circleOf(line: Polyline): Circle | null {
  if (line.length < 3) return null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [x, y] of line) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const r = (maxX - minX + (maxY - minY)) / 4;
  if (!Number.isFinite(r) || r < MIN_RADIUS) return null;

  return {
    x: toSceneX((minX + maxX) / 2),
    z: toSceneZ((minY + maxY) / 2),
    r,
  };
}

/**
 * Вертикальный стальной резервуар с обваловкой и винтовой лестницей.
 *
 * Винтовая лестница по стенке — то, по чему РВС узнают силуэтом. Обваловка
 * (каре) обязательна по нормам: земляной вал вокруг должен вместить объём
 * резервуара при разгерметизации, поэтому он заметно шире самого резервуара.
 */
function buildRvs(r: number): Part[] {
  const out: Part[] = [];
  // Высота стенки: у РВС отношение высоты к диаметру около 0,75–0,8.
  const H = Math.max(6, r * 1.55);

  // Днище и стенка
  out.push(cyl('concrete', r + 0.6, 0.4, 0, 0.2, 0, 0, 0, 0, 24));
  out.push(cyl('painted', r, H, 0, 0.4 + H / 2, 0, 0, 0, 0, 24));

  // Пояса стенки: РВС собирают из поясов, и швы видны на любом снимке.
  const belts = Math.max(3, Math.round(H / 2));
  for (let i = 1; i < belts; i++) {
    out.push(torus('steelDark', r + 0.02, 0.04, 0, 0.4 + (H * i) / belts, 0, Math.PI / 2));
  }

  // Коническая кровля с центральной стойкой и световыми люками
  out.push(cone('steel', 0.35, r + 0.15, r * 0.22, 0, 0.4 + H + (r * 0.22) / 2, 0, 0, 0, 0, 24));
  out.push(cyl('steel', 0.24, 0.9, 0, 0.4 + H + r * 0.22 + 0.35, 0, 0, 0, 0, 10));
  // Дыхательный клапан и огневой предохранитель
  out.push(cone('steelDark', 0.34, 0.24, 0.32, 0, 0.4 + H + r * 0.22 + 0.9, 0, 0, 0, 0, 10));
  out.push(sphere('steelDark', 0.26, 0, 0.4 + H + r * 0.22 + 1.2, 0));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.6;
    out.push(
      cyl(
        'steelDark',
        0.28,
        0.22,
        Math.cos(a) * r * 0.55,
        0.4 + H + r * 0.16,
        Math.sin(a) * r * 0.55,
        0,
        0,
        0,
        10,
      ),
    );
  }

  // Винтовая лестница: марши по спирали вокруг стенки плюс наружное ограждение
  const TURNS = 1.15;
  const STEPS = Math.round(H * 3.2);
  for (let i = 0; i < STEPS; i++) {
    const t = i / STEPS;
    const a = t * Math.PI * 2 * TURNS;
    const y = 0.5 + H * t;
    const x = Math.cos(a) * (r + 0.42);
    const z = Math.sin(a) * (r + 0.42);
    out.push(box('steel', 0.85, 0.05, 0.3, x, y, z, -a + Math.PI / 2));
    if (i % 3 === 0) {
      out.push(cyl('steel', 0.035, 1.05, Math.cos(a) * (r + 0.8), y + 0.5, Math.sin(a) * (r + 0.8), 0, 0, 0, 5));
    }
  }
  // Площадка наверху лестницы
  const aTop = Math.PI * 2 * TURNS;
  out.push(
    box('steel', 1.4, 0.06, 1.4, Math.cos(aTop) * (r + 0.5), 0.5 + H, Math.sin(aTop) * (r + 0.5), -aTop),
  );

  // Приёмо-раздаточные патрубки и задвижки у днища
  out.push(pipe('pipe', 0.16, [r * 0.9, 0.8, 0], [r + 2.6, 0.8, 0]));
  out.push(flange('steelDark', 0.24, r + 0.9, 0.8, 0, 0, 0, Math.PI / 2));
  out.push(...valve(r + 2.0, 0.95, 0, 0.9));
  // Люк-лаз в нижнем поясе
  out.push(cyl('steelDark', 0.34, 0.18, -r * 0.99, 1.1, 0, 0, 0, Math.PI / 2, 12));

  return out;
}

/**
 * Обваловка резервуарного парка — одна на группу, а не на каждый резервуар.
 *
 * По нормам каре должно вместить объём наибольшего резервуара, и его делают
 * общим для парка: у стоящих рядом баков вал один. Пока обваловка строилась в
 * каждом резервуаре, валы соседей пересекались и площадка выглядела кривой.
 */
function buildTankFarmDike(w: number, d: number): Part[] {
  const out: Part[] = [];
  const hw = w / 2;
  const hd = d / 2;

  for (const [dx, dz, bw, bd] of [
    [0, -hd, w + 3, 3],
    [0, hd, w + 3, 3],
    [-hw, 0, 3, d + 3],
    [hw, 0, 3, d + 3],
  ] as const) {
    out.push(box('concrete', bw, 1.8, bd, dx, 0.9, dz));
  }

  // Переходные лестницы через вал с двух сторон
  for (const s of [-1, 1]) {
    out.push(box('steel', 1.2, 0.1, 4.2, s * hw * 0.55, 1.9, -hd, 0, 0.1));
  }

  return out;
}

/** Технологическая ёмкость: вертикальный цилиндр с крышкой, люком и патрубками. */
function buildVessel(r: number): Part[] {
  const out: Part[] = [];
  const H = Math.max(2.4, r * 2.0);

  out.push(cyl('concrete', r + 0.35, 0.3, 0, 0.15, 0, 0, 0, 0, 16));
  out.push(cyl('insulation', r, H, 0, 0.3 + H / 2, 0, 0, 0, 0, 16));
  out.push(cone('insulation', r * 0.5, r, r * 0.4, 0, 0.3 + H + r * 0.2, 0, 0, 0, 0, 16));
  out.push(torus('steel', r + 0.02, 0.05, 0, 0.3 + H * 0.55, 0, Math.PI / 2));
  out.push(cyl('steelDark', r * 0.3, 0.16, 0, 0.3 + H + r * 0.4, 0, 0, 0, 0, 10));
  out.push(pipe('pipe', 0.1, [r * 0.9, 0.7, 0], [r + 1.4, 0.7, 0]));
  out.push(...valve(r + 1.1, 0.85, 0, 0.6));
  // Обслуживающая лестница
  for (let i = 0; i < Math.round(H / 0.32); i++) {
    out.push(box('steel', 0.5, 0.04, 0.05, 0, 0.5 + i * 0.32, -r - 0.22));
  }

  return out;
}

/**
 * Группировка по округлённому радиусу.
 *
 * Резервуары разного размера одной сборкой не поставить — геометрия зависит от
 * радиуса. Но и по отдельной сборке на каждый из 51 контура делать незачем:
 * радиусы кучкуются, и после округления до полуметра остаётся с десяток
 * размеров, каждый со своей инстансированной сборкой.
 */
function groupByRadius(circles: Circle[]): Map<number, Placement[]> {
  const groups = new Map<number, Placement[]>();

  for (const c of circles) {
    const key = Math.round(c.r * 2) / 2;
    const placement: Placement = { x: c.x, y: surfY(c.x, c.z), z: c.z };
    const bucket = groups.get(key);
    if (bucket) bucket.push(placement);
    else groups.set(key, [placement]);
  }

  return groups;
}

export function Tanks() {
  const data = useFieldData();

  /**
   * Строители создаются здесь же, вместе с группами.
   *
   * Важно, что они стабильны между рендерами: `Assembly` мемоизирует слитую
   * геометрию по функции-строителю, и новая стрелка на каждом рендере
   * заставляла бы пересобирать полсотни резервуаров заново — на каждый кадр,
   * в котором что-нибудь дёрнет перерисовку.
   */
  const groups = useMemo(() => {
    const circles = dedupeCircles(
      data.networks.tank.map(circleOf).filter((c): c is Circle => c !== null),
    );

    const out: { id: string; build: () => Part[]; placements: Placement[] }[] = [];
    const rvs = circles.filter((c) => c.r >= RVS_MIN_RADIUS);

    for (const [r, placements] of groupByRadius(rvs)) {
      out.push({ id: `rvs-${r}`, build: () => buildRvs(r), placements });
    }
    for (const [r, placements] of groupByRadius(circles.filter((c) => c.r < RVS_MIN_RADIUS))) {
      out.push({ id: `vessel-${r}`, build: () => buildVessel(r), placements });
    }

    // Общая обваловка вокруг резервуарного парка — по габариту группы РВС.
    if (rvs.length > 0) {
      const minX = Math.min(...rvs.map((c) => c.x - c.r));
      const maxX = Math.max(...rvs.map((c) => c.x + c.r));
      const minZ = Math.min(...rvs.map((c) => c.z - c.r));
      const maxZ = Math.max(...rvs.map((c) => c.z + c.r));
      const w = maxX - minX + 16;
      const d = maxZ - minZ + 16;
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;

      out.push({
        id: 'tank-farm-dike',
        build: () => buildTankFarmDike(w, d),
        placements: [{ x: cx, y: surfY(cx, cz), z: cz }],
      });
    }

    return out;
  }, [data]);

  return (
    <group userData={{ id: 'tanks' }}>
      {groups.map((g) => (
        <Assembly key={g.id} build={g.build} placements={g.placements} id={g.id} />
      ))}
    </group>
  );
}
