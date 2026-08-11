import * as THREE from 'three';

/**
 * Конструктор промысловых установок из деталей.
 *
 * Задача, которую он решает. Установка, собранная из тридцати отдельных мешей,
 * выглядит как надо, но 41 ГЗУ по тридцать мешей — это 1230 вызовов отрисовки
 * на одну только замерную обвязку, и показ по кадрам не переживёт. Одна
 * коробка вместо установки кадр спасает, но выглядит макетом.
 *
 * Выход — разделить «сколько деталей» и «сколько объектов рендера». Установка
 * описывается списком деталей, детали сливаются по материалам в несколько
 * геометрий, и каждая такая геометрия инстансируется на все площадки сразу.
 * Сорок одна полностью детализированная ГЗУ обходится в столько вызовов,
 * сколько в ней различных материалов, — обычно четыре-пять.
 *
 * Детали задаются в локальных координатах установки: ноль на земле, ось Z —
 * «вперёд», разворот на месте задаётся при расстановке.
 */

export type MatKey =
  | 'steel'
  | 'steelDark'
  | 'painted'
  | 'pipe'
  | 'pipeWater'
  | 'concrete'
  | 'accent'
  | 'glass'
  | 'insulation';

export interface Part {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  mat: MatKey;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();

function place(
  geometry: THREE.BufferGeometry,
  mat: MatKey,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): Part {
  const matrix = new THREE.Matrix4();
  _p.set(x, y, z);
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _s.set(1, 1, 1);
  matrix.compose(_p, _q, _s);
  return { geometry, matrix, mat };
}

/** Параллелепипед: центр в заданной точке. */
export function box(
  mat: MatKey,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  ry = 0,
  rz = 0,
): Part {
  return place(new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry, rz);
}

/** Цилиндр вдоль Y. Радиальная сегментация скупая: деталей много. */
export function cyl(
  mat: MatKey,
  r: number,
  h: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  seg = 12,
): Part {
  return place(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y, z, rx, ry, rz);
}

/** Конус/переход — для оголовков, юбок и патрубков-переходников. */
export function cone(
  mat: MatKey,
  rTop: number,
  rBot: number,
  h: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  seg = 12,
): Part {
  return place(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, x, y, z, rx, ry, rz);
}

/** Фланец — короткий диск заметно большего диаметра, чем труба. */
export function flange(
  mat: MatKey,
  r: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): Part {
  return place(new THREE.CylinderGeometry(r, r, 0.09, 12), mat, x, y, z, rx, ry, rz);
}

export function sphere(mat: MatKey, r: number, x: number, y: number, z: number): Part {
  return place(new THREE.SphereGeometry(r, 10, 8), mat, x, y, z);
}

/** Тор — обечайки, кольца жёсткости, маховики задвижек. */
export function torus(
  mat: MatKey,
  r: number,
  tube: number,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
): Part {
  return place(new THREE.TorusGeometry(r, tube, 6, 14), mat, x, y, z, rx, ry, rz);
}

/**
 * Отрезок трубы между двумя точками. Ориентация считается из направления —
 * иначе каждую перемычку в обвязке пришлось бы поворачивать вручную, а их в
 * одной ГЗУ полтора десятка.
 */
export function pipe(
  mat: MatKey,
  r: number,
  a: [number, number, number],
  b: [number, number, number],
  seg = 10,
): Part {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();

  const geometry = new THREE.CylinderGeometry(r, r, len, seg);
  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.normalize(),
  );
  matrix.compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  return { geometry, matrix, mat };
}

/** Трубная нитка по ломаной с фланцами в узлах. */
export function pipeRun(
  mat: MatKey,
  r: number,
  points: [number, number, number][],
): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    out.push(pipe(mat, r, points[i], points[i + 1]));
    if (i > 0) out.push(sphere(mat, r * 1.05, ...points[i]));
  }
  return out;
}

/**
 * Задвижка: корпус, шток и маховик. Именно она делает обвязку узнаваемой —
 * без задвижек трубы читаются как декоративные прутья.
 */
export function valve(
  x: number,
  y: number,
  z: number,
  scale = 1,
  ry = 0,
): Part[] {
  const s = scale;
  return [
    box('steelDark', 0.42 * s, 0.5 * s, 0.42 * s, x, y, z, ry),
    cyl('steel', 0.05 * s, 0.55 * s, x, y + 0.5 * s, z, 0, 0, 0, 6),
    torus('accent', 0.22 * s, 0.045 * s, x, y + 0.78 * s, z, Math.PI / 2, 0, 0),
  ];
}

/**
 * Лестница-стремянка: тетивы и ступени. Высота задаётся, шаг ступеней
 * постоянный — 0,3 м, как в натуре.
 */
export function ladder(
  x: number,
  y: number,
  z: number,
  height: number,
  ry = 0,
): Part[] {
  const out: Part[] = [
    box('steel', 0.06, height, 0.06, x - 0.25, y + height / 2, z, ry),
    box('steel', 0.06, height, 0.06, x + 0.25, y + height / 2, z, ry),
  ];
  const steps = Math.max(2, Math.floor(height / 0.3));
  for (let i = 1; i <= steps; i++) {
    out.push(box('steel', 0.56, 0.04, 0.05, x, y + (height * i) / (steps + 1), z, ry));
  }
  return out;
}

/** Перила по периметру площадки: стойки, поручень и промежуточная планка. */
export function railing(
  cx: number,
  y: number,
  cz: number,
  w: number,
  d: number,
  h = 1.1,
): Part[] {
  const out: Part[] = [];
  const hw = w / 2;
  const hd = d / 2;
  const corners: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];

  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i];
    const [bx, bz] = corners[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const stands = Math.max(2, Math.round(len / 1.6));

    for (let s = 0; s <= stands; s++) {
      const t = s / stands;
      out.push(
        box('steel', 0.06, h, 0.06, cx + ax + (bx - ax) * t, y + h / 2, cz + az + (bz - az) * t),
      );
    }
    for (const level of [h, h * 0.55]) {
      out.push(
        pipe(
          'steel',
          0.035,
          [cx + ax, y + level, cz + az],
          [cx + bx, y + level, cz + bz],
          6,
        ),
      );
    }
  }
  return out;
}

/**
 * Ограждение площадки с воротами и КПП.
 *
 * Промысловые объекты с нефтесодержащей средой огораживаются по нормам, и
 * ограждение — не декорация: по нему читается граница площадки, а без него
 * установка выглядит поставленной в чистом поле. Ворота с будкой КПП делают
 * очевидным, где въезд.
 *
 * `gateSide` — сторона въезда: 'z-' ставит ворота в торце со стороны −Z.
 */
export function fence(
  w: number,
  d: number,
  opts: { height?: number; gate?: boolean; guard?: boolean } = {},
): Part[] {
  const out: Part[] = [];
  const h = opts.height ?? 2.2;
  const hw = w / 2;
  const hd = d / 2;
  const STEP = 3;

  /** Пролёт ограждения: стойки и сетчатое полотно между ними. */
  const run = (
    ax: number,
    az: number,
    bx: number,
    bz: number,
    skip?: [number, number],
  ) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / STEP));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (skip && t > skip[0] && t < skip[1]) continue;
      out.push(box('steel', 0.12, h, 0.12, ax + (bx - ax) * t, h / 2, az + (bz - az) * t));
    }
    // Полотно двумя нитками поверху и понизу — сетку решёткой рисовать незачем,
    // на промысловых расстояниях она всё равно не читается.
    for (const level of [h * 0.92, h * 0.45]) {
      if (skip) {
        out.push(pipe('steel', 0.04, [ax, level, az], [ax + (bx - ax) * skip[0], level, az + (bz - az) * skip[0]], 4));
        out.push(pipe('steel', 0.04, [ax + (bx - ax) * skip[1], level, az + (bz - az) * skip[1]], [bx, level, bz], 4));
      } else {
        out.push(pipe('steel', 0.04, [ax, level, az], [bx, level, bz], 4));
      }
    }
  };

  const gate = opts.gate ?? true;
  run(-hw, -hd, hw, -hd, gate ? [0.42, 0.58] : undefined);
  run(hw, -hd, hw, hd);
  run(hw, hd, -hw, hd);
  run(-hw, hd, -hw, -hd);

  if (gate) {
    // Створки ворот, приоткрытые внутрь площадки
    for (const s of [-1, 1]) {
      out.push(box('steelDark', w * 0.08, h * 0.95, 0.1, s * w * 0.05, h * 0.48, -hd + 0.5, 0, 0));
      out.push(box('steel', 0.14, h + 0.4, 0.14, s * w * 0.08, (h + 0.4) / 2, -hd));
    }
  }

  if (opts.guard ?? true) {
    // Будка КПП снаружи, у ворот
    out.push(box('painted', 2.6, 2.5, 2.4, -hw * 0.36, 1.25, -hd - 1.8));
    out.push(box('steel', 2.9, 0.12, 2.7, -hw * 0.36, 2.56, -hd - 1.8));
    out.push(box('glass', 1.6, 0.9, 0.08, -hw * 0.36, 1.8, -hd - 0.58));
    out.push(box('steelDark', 0.8, 1.9, 0.08, -hw * 0.36 + 1.0, 0.95, -hd - 0.58));
  }

  return out;
}

/** Двускатная кровля блок-бокса — два наклонных ската и два фронтона. */
export function gableRoof(
  mat: MatKey,
  w: number,
  d: number,
  y: number,
  rise: number,
): Part[] {
  const slope = Math.atan2(rise, w / 2);
  const len = Math.hypot(w / 2, rise);
  return [
    box(mat, len, 0.1, d, -w / 4, y + rise / 2, 0, 0, -slope),
    box(mat, len, 0.1, d, w / 4, y + rise / 2, 0, 0, slope),
  ];
}

// ── Слияние ─────────────────────────────────────────────────────────────────

/**
 * Сливает детали по материалам. Возвращает по одной геометрии на материал —
 * их и инстансировать.
 *
 * Матрица применяется к геометрии на месте: инстансирование задаёт положение
 * всей установки, а взаимное положение деталей внутри неё обязано быть уже
 * запечено. Исходные геометрии после слияния освобождаются — их в одной
 * установке под сотню, и держать их в памяти незачем.
 */
export function mergeParts(parts: Part[]): Map<MatKey, THREE.BufferGeometry> {
  const byMat = new Map<MatKey, THREE.BufferGeometry[]>();

  for (const part of parts) {
    const g = part.geometry.clone();
    // applyMatrix4 переносит и нормали через нормальную матрицу — поэтому
    // пересчитывать их после слияния не нужно, и не нужно тем более: пересчёт
    // усреднил бы нормали по общим вершинам и сгладил бы рёбра корпусов.
    g.applyMatrix4(part.matrix);
    const bucket = byMat.get(part.mat);
    if (bucket) bucket.push(g);
    else byMat.set(part.mat, [g]);
    part.geometry.dispose();
  }

  const out = new Map<MatKey, THREE.BufferGeometry>();
  for (const [mat, list] of byMat) {
    out.set(mat, mergeIndexed(list));
    for (const g of list) g.dispose();
  }
  return out;
}

/**
 * Слияние индексированных геометрий по позициям и нормалям.
 *
 * Своя реализация вместо `BufferGeometryUtils` из `three/examples` намеренно.
 * Тот модуль импортирует three по своему пути, и сборщик выдаёт вторую копию
 * библиотеки: в консоли появляется «Multiple instances of Three.js», а вместе
 * с ней ломаются проверки `instanceof` между объектами из разных копий. Здесь
 * нужен ровно один частный случай — position и normal, — и он занимает меньше
 * места, чем обход этой проблемы через настройку сборки.
 */
export function mergeIndexed(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let vertexCount = 0;
  let indexCount = 0;

  for (const g of list) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }

  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  // Установка легко перебирает 65 536 вершин, поэтому индекс всегда 32-битный:
  // экономия на типе индекса здесь обменивалась бы на молчаливое схлопывание
  // геометрии при переполнении.
  const index = new Uint32Array(indexCount);

  let vo = 0;
  let io = 0;

  for (const g of list) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute | undefined;

    position.set(p.array as Float32Array, vo * 3);
    if (n) normal.set(n.array as Float32Array, vo * 3);

    if (g.index) {
      for (let i = 0; i < g.index.count; i++) index[io++] = g.index.getX(i) + vo;
    } else {
      for (let i = 0; i < p.count; i++) index[io++] = i + vo;
    }

    vo += p.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingSphere();
  return merged;
}
