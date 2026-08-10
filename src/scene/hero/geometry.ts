import * as THREE from 'three';

/**
 * Процедурная геология приветственного экрана (ТЗ §8.2).
 *
 * Принцип — из референсного прототипа: слои не статичный меш, а функции шума
 * плюс антиклиналь. Геометрия цилиндрическая, но из блока вырезан сектор,
 * развёрнутый к камере: именно вырез превращает «торт» в вскрытый образец —
 * на плоскостях реза читается стратиграфия, залежь в своде и ствол скважины.
 *
 * Нормали не сглаживаются через ребро: каждая поверхность строится на
 * собственных вершинах. Без этого кромка размывается и блок теряет читаемость.
 */

/** Радиус экспоната, локальные единицы витрины. */
export const R = 32;

/** Вырез развёрнут к камере (камера смотрит с +Z, это угол π/2). */
export const SECTOR_START = Math.PI * 0.78;
export const SECTOR_SWEEP = Math.PI * 1.44;

/** Мягкий шум: три октавы синусов — дешевле честного fbm и достаточно по виду. */
export function fbm(x: number, z: number): number {
  return (
    Math.sin(x * 0.11 + z * 0.15) * 0.55 +
    Math.sin(x * 0.28 - z * 0.22 + 1.7) * 0.3 +
    Math.sin(x * 0.6 + z * 0.52 + 4.2) * 0.15
  );
}

/** Антиклиналь: пологий свод, к которому прижата залежь. */
export function dome(x: number, z: number): number {
  return Math.exp(-((x * x) / (16 * 16) + (z * z) / (18 * 18)));
}

/**
 * Границы слоёв сверху вниз. Амплитуда свода нарастает к кровле коллектора и
 * затухает ниже — так залежь оказывается запечатана под покрышкой, а не
 * размазана по всему блоку.
 */
export const Y_TOP = (x: number, z: number) => 15 + 0.8 * fbm(x * 0.7, z * 0.7);
export const Y_OVER = (x: number, z: number) => 7.5 + 1.6 * dome(x, z) + 0.7 * fbm(x, z);
export const Y_CAP = (x: number, z: number) => -1 + 4 * dome(x, z) + 0.5 * fbm(x * 1.1, z * 1.1);
export const Y_RES_TOP = (x: number, z: number) => -6 + 7 * dome(x, z) + 0.35 * fbm(x, z);
export const Y_RES_BOT = (x: number, z: number) => -15 + 4 * dome(x, z) + 0.35 * fbm(x, z);
export const Y_WATER = (x: number, z: number) => -21 + 2 * dome(x, z) + 0.25 * fbm(x, z);
export const Y_BASE = () => -27;

/**
 * Водонефтяной контакт. Уровень выбран между сводом кровли (+1) и её крылом
 * (−6): только тогда нефть образует линзу в своде, а не заливает весь пласт.
 */
export const OWC_Y = -4;

export interface StratumSpec {
  id: string;
  label: string;
  top: (x: number, z: number) => number;
  bot: (x: number, z: number) => number;
  color: string;
  roughness: number;
}

/**
 * Шесть слоёв, тёплый верх → холодный низ, все приглушены. Единственный
 * насыщенный янтарь во всей витрине — сама залежь: если раздать янтарь слоям,
 * нефть перестанет быть смысловым акцентом.
 */
export const STRATA: StratumSpec[] = [
  { id: 'soil', label: 'Почвенный слой · ЗСС', top: Y_TOP, bot: Y_OVER, color: '#8a7355', roughness: 1 },
  { id: 'over', label: 'Перекрывающая толща', top: Y_OVER, bot: Y_CAP, color: '#6a6053', roughness: 0.96 },
  { id: 'cap', label: 'Покрышка · флюидоупор', top: Y_CAP, bot: Y_RES_TOP, color: '#44525f', roughness: 0.9 },
  { id: 'res', label: 'Продуктивный пласт', top: Y_RES_TOP, bot: Y_RES_BOT, color: '#6f5334', roughness: 0.82 },
  { id: 'water', label: 'Водонасыщенная зона', top: Y_RES_BOT, bot: Y_WATER, color: '#2c4a66', roughness: 0.88 },
  { id: 'base', label: 'Фундамент', top: Y_WATER, bot: Y_BASE, color: '#1e3350', roughness: 0.95 },
];

type Fn = (x: number, z: number) => number;

interface SectorOpts {
  radius?: number;
  rings?: number;
  segs?: number;
  start?: number;
  sweep?: number;
}

/**
 * Слой в виде сектора цилиндра: кровля, подошва, наружная стенка и две
 * плоскости реза. Каждая поверхность — на собственных вершинах, поэтому
 * `computeVertexNormals` не сглаживает кромки между ними.
 */
export function makeStratumGeometry(topFn: Fn, botFn: Fn, opts: SectorOpts = {}): THREE.BufferGeometry {
  const {
    radius = R,
    rings = 12,
    segs = 64,
    start = SECTOR_START,
    sweep = SECTOR_SWEEP,
  } = opts;

  const pos: number[] = [];
  const idx: number[] = [];
  const v = (x: number, y: number, z: number) => {
    pos.push(x, y, z);
    return pos.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => {
    idx.push(a, b, c, a, c, d);
  };

  const ang = (s: number) => start + (sweep * s) / segs;

  // ── Кровля и подошва: радиальные сетки ──────────────────────────────────
  for (let pass = 0; pass < 2; pass++) {
    const fn = pass === 0 ? topFn : botFn;
    const grid: number[][] = [];
    for (let ri = 0; ri <= rings; ri++) {
      const r = (radius * ri) / rings;
      const row: number[] = [];
      for (let s = 0; s <= segs; s++) {
        const a = ang(s);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        row.push(v(x, fn(x, z), z));
      }
      grid.push(row);
    }
    for (let ri = 0; ri < rings; ri++) {
      for (let s = 0; s < segs; s++) {
        if (pass === 0) quad(grid[ri][s], grid[ri + 1][s], grid[ri + 1][s + 1], grid[ri][s + 1]);
        else quad(grid[ri][s], grid[ri][s + 1], grid[ri + 1][s + 1], grid[ri + 1][s]);
      }
    }
  }

  // ── Наружная стенка ─────────────────────────────────────────────────────
  {
    const top: number[] = [];
    const bot: number[] = [];
    for (let s = 0; s <= segs; s++) {
      const a = ang(s);
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      top.push(v(x, topFn(x, z), z));
      bot.push(v(x, botFn(x, z), z));
    }
    for (let s = 0; s < segs; s++) quad(top[s], bot[s], bot[s + 1], top[s + 1]);
  }

  // ── Две плоскости реза: ради них всё и затевалось ───────────────────────
  for (const [a, flip] of [
    [start, false],
    [start + sweep, true],
  ] as const) {
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const top: number[] = [];
    const bot: number[] = [];
    for (let ri = 0; ri <= rings; ri++) {
      const r = (radius * ri) / rings;
      const x = cx * r;
      const z = cz * r;
      top.push(v(x, topFn(x, z), z));
      bot.push(v(x, botFn(x, z), z));
    }
    for (let ri = 0; ri < rings; ri++) {
      if (flip) quad(top[ri], bot[ri], bot[ri + 1], top[ri + 1]);
      else quad(top[ri], top[ri + 1], bot[ri + 1], bot[ri]);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Нефтяная линза: часть коллектора выше ВНК. Отдельная геометрия, а не
 * подкраска слоя, — только так получается резкая горизонтальная граница по
 * контакту. Радиус чуть меньше блока, иначе стенка линзы совпадает со стенкой
 * пласта и даёт z-fighting.
 */
export function makeOilLensGeometry(): THREE.BufferGeometry {
  const top: Fn = (x, z) => Math.max(Y_RES_TOP(x, z) - 0.12, OWC_Y);
  const bot: Fn = (x, z) => Math.min(Math.max(Y_RES_BOT(x, z) + 0.12, OWC_Y), top(x, z));
  return makeStratumGeometry(top, bot, { radius: R * 0.995, rings: 16, segs: 72 });
}

/**
 * Плоский диск-сектор на заданной отметке. Собственная реализация вместо
 * `circleGeometry` с thetaStart: у той параметризация в плоскости XY, и после
 * поворота в XZ угол идёт в обратную сторону — сектор уезжает в вырез.
 */
export function makeSectorDisc(y: number, opts: SectorOpts = {}): THREE.BufferGeometry {
  const { radius = R, segs = 64, start = SECTOR_START, sweep = SECTOR_SWEEP } = opts;
  const pos: number[] = [0, y, 0];
  const idx: number[] = [];
  for (let s = 0; s <= segs; s++) {
    const a = start + (sweep * s) / segs;
    pos.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
  }
  for (let s = 1; s <= segs; s++) idx.push(0, s, s + 1);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Прослои-маркеры в перекрывающей толще: повторяют форму свода с ослабленной
 * амплитудой, как реальные отражающие горизонты выше коллектора.
 */
export const BEDDING_MARKERS = [5, 1.5, -2.5];

export const bedding = (d: number): Fn => (x, z) =>
  d + 2.6 * dome(x, z) * ((d + 6) / 12 + 0.35) + 0.4 * fbm(x, z);

/** Радиус контура нефтеносности на уровне ВНК — бинарным поиском по кровле. */
export function owcRadius(dirX: number, dirZ: number): number {
  let lo = 0;
  let hi = R;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (Y_RES_TOP(dirX * mid, dirZ * mid) > OWC_Y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Контур нефтеносности — замкнутая кривая по границе линзы на уровне ВНК. */
export function owcContour(): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const N = 96;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    const r = owcRadius(cx, cz);
    pts.push(new THREE.Vector3(cx * r, OWC_Y + 0.06, cz * r));
  }
  return new THREE.CatmullRomCurve3(pts, true);
}

/**
 * Траектория ствола. Устье вынесено на свод, забой уходит в линзу — и всё это
 * рядом с плоскостью реза, чтобы ствол читался целиком, а не угадывался.
 */
export const WELLHEAD: [number, number] = [-6, 13];

export function wellCurve(): THREE.CatmullRomCurve3 {
  const [hx, hz] = WELLHEAD;
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(hx, Y_TOP(hx, hz) + 0.3, hz),
    new THREE.Vector3(hx + 0.4, 6, hz - 0.8),
    new THREE.Vector3(hx + 1.8, -1, hz - 2.6),
    new THREE.Vector3(hx + 3.6, -5.5, hz - 5.2),
    new THREE.Vector3(hx + 5.2, -9.5, hz - 7.4),
  ]);
}
