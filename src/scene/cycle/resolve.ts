import * as THREE from 'three';
import {
  absToSceneY,
  toSceneX,
  toSceneZ,
  EXTERNAL_NODES,
  FIELD_H,
  FIELD_W,
  type FieldDataset,
  type WellRecord,
} from '../../data/geo/fieldData';
import { resolveHorizon, PRODUCTIVE_TOP_ABS } from '../../data/geo/stratigraphy';
import { surfY } from '../field/geology';
import { facilityPlacements } from '../field/placement';
import type { AnchorSpec, CycleStep } from '../../data/cycle/chain';

/**
 * Разрешение якорей цепочки цикла (ТЗ §4.4.1).
 *
 * Шаг цепочки не хранит координат — он несёт правило поиска: «все ГЗУ», «все
 * трассы нефтесбора», «работающие нефтяные скважины». Здесь правило
 * превращается в конкретные объекты сцены.
 *
 * Смысл разделения — в проверяемости. Пока координаты лежат в спецификации
 * шага, соответствие цепочки фактическому промыслу держится на добросовестности
 * автора: вписать «СП» в произвольную точку ничто не мешает. Когда шаг несёт
 * правило, выдумать объект технически нельзя — если в датасете его нет, якорь
 * не разрешается, и шаг остаётся видимо пустым. Пустой шаг заметен сразу,
 * тихо смещённый на сто метров объект — нет.
 *
 * Поэтому здесь нет ни одной запасной координаты «на случай, если не нашлось».
 * Не нашлось — значит, в данных этого нет, и показывать нечего.
 */

export interface AnchorPoint {
  x: number;
  y: number;
  z: number;
  /** Идентификатор объекта сцены — тот же, по которому работает клик. */
  id: string;
  label?: string;
}

export interface AnchorPath {
  /** Точки трассы в координатах сцены, посаженные на рельеф. */
  pts: THREE.Vector3[];
  id: string;
}

export interface ResolvedAnchor {
  points: AnchorPoint[];
  paths: AnchorPath[];
  /** Куда смотреть камере. */
  center: THREE.Vector3;
  /** Габарит того, что нужно уместить в кадр, м. */
  radius: number;
  /** Шаг о недрах: на поверхности показывать нечего. */
  subsurface: boolean;
  /** Найдено ли вообще хоть что-то. */
  empty: boolean;
}

/** Высота нитки потока над трассой: труба закопана, поток показывается поверх. */
const FLOW_LIFT = 4;

/**
 * Трассы прореживаются по длине, а не по числу вершин.
 *
 * В чертеже частота вершин отражает, насколько подробно оцифровали конкретный
 * участок, а не его протяжённость: на повороте их десяток на десять метров, на
 * прямой — две на километр. Прореживание «каждой N-й» из-за этого съедает
 * повороты и оставляет прямые. Шаг по расстоянию даёт равномерную нитку.
 */
function resample(line: [number, number][], step: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  let carry = 0;

  for (let i = 0; i < line.length - 1; i++) {
    const ax = toSceneX(line[i][0]);
    const az = toSceneZ(line[i][1]);
    const bx = toSceneX(line[i + 1][0]);
    const bz = toSceneZ(line[i + 1][1]);
    const seg = Math.hypot(bx - ax, bz - az);
    if (seg < 1e-6) continue;

    if (out.length === 0) out.push(new THREE.Vector3(ax, surfY(ax, az) + FLOW_LIFT, az));

    let t = carry;
    while (t < seg) {
      const k = t / seg;
      const x = ax + (bx - ax) * k;
      const z = az + (bz - az) * k;
      out.push(new THREE.Vector3(x, surfY(x, z) + FLOW_LIFT, z));
      t += step;
    }
    carry = t - seg;

    if (i === line.length - 2) {
      out.push(new THREE.Vector3(bx, surfY(bx, bz) + FLOW_LIFT, bz));
    }
  }

  return out;
}

/** Точка внешнего узла — там же, где его рисует сцена. */
function externalPoint(id: string): AnchorPoint | null {
  const node = EXTERNAL_NODES.find((n) => n.id === id);
  if (!node) return null;
  const x = (node.dir[0] * FIELD_W) / 2;
  const z = -(node.dir[1] * FIELD_H) / 2;
  return { x, y: surfY(x, z), z, id: node.id, label: node.label };
}

function wellMatches(w: WellRecord, a: Extract<AnchorSpec, { source: 'wells' }>): boolean {
  if (a.cat && w.cat !== a.cat) return false;
  if (a.st && w.st !== a.st) return false;
  if (a.type && w.type !== a.type) return false;
  if (a.hor && w.hor !== a.hor) return false;
  return true;
}

/**
 * Сколько объектов одного вида показывать в шаге.
 *
 * Шаг «нефтесборный коллектор» отвечает 649 трассам, шаг «скважина» — сотням.
 * Гнать по всем ниткам разом бессмысленно вдвойне: это и не читается, и грузит
 * кадр ровно там, где идёт основная анимация показа. Берётся выборка вокруг
 * центра шага — ближайшие к тому месту, куда всё равно смотрит камера.
 */
const MAX_POINTS = 60;
const MAX_PATHS = 40;

export function resolveAnchor(anchor: AnchorSpec, data: FieldDataset): ResolvedAnchor {
  const points: AnchorPoint[] = [];
  const paths: AnchorPath[] = [];
  let subsurface = false;

  switch (anchor.source) {
    case 'facility': {
      for (const p of facilityPlacements(data, anchor.kind)) {
        // Идентификатор у расстановки необязателен по типу, но у установок он
        // есть всегда: он же служит ключом клика. Без него якорь указывал бы в
        // объект, к которому нельзя ни подлететь, ни обратиться.
        if (!p.id) continue;
        if (anchor.name && !p.id.includes(anchor.name)) continue;
        points.push({ x: p.x, y: p.y, z: p.z, id: p.id, label: p.id.slice(4) });
      }
      break;
    }

    case 'wells': {
      for (const w of data.wells) {
        if (!wellMatches(w, anchor)) continue;
        const x = toSceneX(w.p[0]);
        const z = toSceneZ(w.p[1]);
        points.push({ x, y: surfY(x, z), z, id: `well:${w.uwi}`, label: w.uwi });
      }
      break;
    }

    case 'network': {
      const lines = data.networks[anchor.key] ?? [];
      lines.forEach((line, i) => {
        if (line.length < 2) return;
        const pts = resample(line, 22);
        if (pts.length >= 2) paths.push({ pts, id: `net:${anchor.key}:${i}` });
      });
      break;
    }

    case 'hubs': {
      data.hubs.forEach((h, i) => {
        const x = toSceneX(h.p[0]);
        const z = toSceneZ(h.p[1]);
        points.push({ x, y: surfY(x, z), z, id: `hub:${i}` });
      });
      break;
    }

    case 'points': {
      const list = data.points[anchor.key] ?? [];
      list.forEach((p, i) => {
        const x = toSceneX(p[0]);
        const z = toSceneZ(p[1]);
        points.push({ x, y: surfY(x, z), z, id: `pt:${anchor.key}:${i}` });
      });
      break;
    }

    case 'external': {
      const p = externalPoint(anchor.id);
      if (p) points.push(p);
      break;
    }

    case 'subsurface': {
      subsurface = true;
      const h = anchor.horizon ? resolveHorizon(anchor.horizon) : null;
      const y = absToSceneY(h ? (h.topAbs + h.botAbs) / 2 : PRODUCTIVE_TOP_ABS);
      points.push({ x: 0, y, z: 0, id: h ? `res-horizon:${h.id}` : 'res-section' });
      break;
    }
  }

  const center = new THREE.Vector3();
  let count = 0;
  for (const p of points) {
    center.x += p.x;
    center.y += p.y;
    center.z += p.z;
    count++;
  }
  for (const p of paths) {
    const mid = p.pts[Math.floor(p.pts.length / 2)];
    center.add(mid);
    count++;
  }
  if (count > 0) center.divideScalar(count);

  // Габарит — по самому дальнему объекту от центра, но не меньше, чем нужно,
  // чтобы одиночная установка не оказалась в кадре размером с саму себя.
  let radius = 120;
  for (const p of points) radius = Math.max(radius, Math.hypot(p.x - center.x, p.z - center.z));
  for (const p of paths) {
    for (const v of p.pts) radius = Math.max(radius, Math.hypot(v.x - center.x, v.z - center.z));
  }

  return {
    points: trim(points, center, MAX_POINTS),
    paths: trim(paths, center, MAX_PATHS, (p) => p.pts[Math.floor(p.pts.length / 2)]),
    center,
    radius,
    subsurface,
    empty: points.length === 0 && paths.length === 0,
  };
}

/** Ближайшие к центру шага — остальное в кадр всё равно не попадёт. */
function trim<T>(
  items: T[],
  center: THREE.Vector3,
  max: number,
  at: (t: T) => { x: number; z: number } = (t) => t as unknown as { x: number; z: number },
): T[] {
  if (items.length <= max) return items;
  return items
    .map((t) => {
      const p = at(t);
      return { t, d: (p.x - center.x) ** 2 + (p.z - center.z) ** 2 };
    })
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((r) => r.t);
}

/** Разрешённые якоря всех шагов цепочки — считается один раз на датасет. */
export function resolveChain(steps: CycleStep[], data: FieldDataset): Map<string, ResolvedAnchor> {
  const out = new Map<string, ResolvedAnchor>();
  for (const s of steps) out.set(s.id, resolveAnchor(s.anchor, data));
  return out;
}
