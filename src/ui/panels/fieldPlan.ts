import {
  FIELD_H,
  FIELD_W,
  type FieldDataset,
  type Polyline,
} from '../../data/geo/fieldData';
import {
  NETWORK_STYLE,
  WELL_CATEGORY,
  WELL_STATUS,
  type NetworkKey,
} from '../../data/geo/fieldStyle';

/**
 * Отрисовка реального плана промысла (ТЗ §3.1 п.5).
 *
 * Почему canvas, а не SVG, как остальные панели. На плане 1101 скважина и
 * 1763 полилинии сетей. В SVG это три тысячи узлов DOM, которые браузер
 * пересчитывает при каждом изменении прогресса такта — на показе это гарантия
 * просадки ровно в тот момент, когда схема выезжает на экран. На canvas все
 * трассы одного типа сливаются в один `Path2D` и рисуются одним вызовом:
 * одиннадцать вызовов на весь план вместо тысячи узлов.
 *
 * Подписи, знаки промысловых объектов и выделение остаются в SVG поверх — их
 * шесть десятков, они должны быть чёткими на любом разрешении и им нужны
 * штатные события указателя.
 */

// ── Вид ─────────────────────────────────────────────────────────────────────

export interface PlanView {
  /** Пикселей на метр. */
  scale: number;
  /** Сдвиг начала участка в пикселях. */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

/**
 * Вписывает участок 5352 × 4682 м в доступный прямоугольник с сохранением
 * пропорций. Пропорции обязаны сохраняться: это исполнительная съёмка, а
 * растянутый план перестаёт быть планом.
 */
export function fitView(w: number, h: number, pad = 10): PlanView {
  const scale = Math.min((w - pad * 2) / FIELD_W, (h - pad * 2) / FIELD_H);
  return {
    scale,
    ox: (w - FIELD_W * scale) / 2,
    oy: (h - FIELD_H * scale) / 2,
    w,
    h,
  };
}

/** Координата съёмки → экран. Ось Y переворачивается: север вверху. */
export function planX(v: PlanView, dataX: number): number {
  return v.ox + dataX * v.scale;
}

export function planY(v: PlanView, dataY: number): number {
  return v.oy + (FIELD_H - dataY) * v.scale;
}

// ── Расписание проявления слоёв ─────────────────────────────────────────────

type LayerId = NetworkKey | 'hubs' | 'wells';

/**
 * План не появляется целиком: он собирается на глазах у зрителя от подложки к
 * содержанию — рельеф, дороги, электрика, трубопроводы, кусты, фонд. Нефтесбор
 * идёт предпоследним намеренно: его звездообразный рисунок, сходящийся на
 * восток к СП «Молдабек», и есть узнаваемый образ этого промысла, и он должен
 * лечь на уже готовую подложку, а не потонуть в общем проявлении.
 *
 * Окна перекрываются — иначе сборка читается как одиннадцать отдельных
 * включений, а не как одно движение.
 */
const SCHEDULE: [LayerId, number, number][] = [
  ['contour', 0.0, 0.16],
  ['road', 0.06, 0.2],
  ['building', 0.1, 0.24],
  ['tp', 0.12, 0.26],
  ['power_04kv', 0.16, 0.36],
  ['power_10kv', 0.2, 0.38],
  ['gzu', 0.26, 0.4],
  ['tank', 0.28, 0.42],
  ['gas_pipeline', 0.3, 0.46],
  ['water_pipeline', 0.34, 0.56],
  ['oil_pipeline', 0.38, 0.72],
  ['hubs', 0.52, 0.74],
  ['wells', 0.58, 0.94],
];

function localT(t: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

// ── Отрисовка ───────────────────────────────────────────────────────────────

/** Во сколько раз гасится план, когда выбран объект. */
const DIM_FACTOR = 0.3;

function strokeLines(
  ctx: CanvasRenderingContext2D,
  view: PlanView,
  lines: Polyline[],
  key: NetworkKey,
  progress: number,
  alpha: number,
): void {
  if (progress <= 0) return;
  const style = NETWORK_STYLE[key];
  const count = Math.ceil(lines.length * progress);

  const path = new Path2D();
  for (let i = 0; i < count; i++) {
    const line = lines[i];
    if (line.length < 2) continue;
    path.moveTo(planX(view, line[0][0]), planY(view, line[0][1]));
    for (let j = 1; j < line.length; j++) {
      path.lineTo(planX(view, line[j][0]), planY(view, line[j][1]));
    }
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (style.dash) ctx.setLineDash(style.dash);
  ctx.stroke(path);
  ctx.restore();
}

/**
 * Кусты — 188 узлов сбора. Размер знака берётся от числа сходящихся ниток:
 * узел на девять скважин физически крупнее узла на две, и на плане это видно.
 */
function drawHubs(
  ctx: CanvasRenderingContext2D,
  view: PlanView,
  data: FieldDataset,
  progress: number,
  alpha: number,
): void {
  if (progress <= 0) return;
  const count = Math.ceil(data.hubs.length * progress);

  ctx.save();
  ctx.globalAlpha = alpha * 0.5;
  ctx.strokeStyle = '#8a99a8';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < count; i++) {
    const h = data.hubs[i];
    const r = 2.5 + Math.min(h.links, 10) * 0.42;
    ctx.beginPath();
    ctx.arc(planX(view, h.p[0]), planY(view, h.p[1]), r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Радиус знака скважины на экране, px. Постоянный: план не масштабируется. */
const WELL_R = 2.4;

/**
 * Фонд скважин — 1101 запись официального реестра.
 *
 * Цвет кодирует категорию, заливка против контура — состояние, перечёркивание —
 * ликвидацию (ТЗ §4.1 п.4, по аналогии с символикой корпоративной ГИС КМГ).
 * Это не украшение: на плане сразу видно, что работающий фонд сосредоточен в
 * центре, а ликвидированные скважины стоят по периферии.
 *
 * Скважины группируются по стилю и рисуются пачками: смена `fillStyle` между
 * вызовами дороже самой отрисовки кружка, и поштучное переключение стиля на
 * тысяче объектов заметно в кадре.
 */
function drawWells(
  ctx: CanvasRenderingContext2D,
  view: PlanView,
  data: FieldDataset,
  progress: number,
  alpha: number,
): void {
  if (progress <= 0) return;
  const count = Math.ceil(data.wells.length * progress);

  // Ключ пачки — цвет категории плюс режим отрисовки состояния.
  const batches = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    const w = data.wells[i];
    const st = WELL_STATUS[w.st];
    const key = `${w.cat}|${st.working ? 'f' : st.struck ? 'x' : 'o'}`;
    const bucket = batches.get(key);
    if (bucket) bucket.push(i);
    else batches.set(key, [i]);
  }

  ctx.save();
  for (const [key, idx] of batches) {
    const [cat, mode] = key.split('|');
    const color = WELL_CATEGORY[cat as keyof typeof WELL_CATEGORY].color;

    ctx.beginPath();
    for (const i of idx) {
      const w = data.wells[i];
      const x = planX(view, w.p[0]);
      const y = planY(view, w.p[1]);
      ctx.moveTo(x + WELL_R, y);
      ctx.arc(x, y, WELL_R, 0, Math.PI * 2);
    }

    if (mode === 'f') {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      // Ликвидированные гасятся сильнее прочих неработающих: они часть
      // истории фонда, но не часть сегодняшнего промысла.
      ctx.globalAlpha = alpha * (mode === 'x' ? 0.4 : 0.7);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    if (mode === 'x') {
      ctx.beginPath();
      for (const i of idx) {
        const w = data.wells[i];
        const x = planX(view, w.p[0]);
        const y = planY(view, w.p[1]);
        const d = WELL_R * 0.78;
        ctx.moveTo(x - d, y - d);
        ctx.lineTo(x + d, y + d);
        ctx.moveTo(x + d, y - d);
        ctx.lineTo(x - d, y + d);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Рисует план целиком.
 *
 * `t` — прогресс такта, `dimmed` — выбран ли объект: при выборе весь план
 * уходит на второй план, чтобы выбранная скважина читалась.
 */
export function drawPlan(
  ctx: CanvasRenderingContext2D,
  data: FieldDataset,
  view: PlanView,
  t: number,
  dimmed: boolean,
): void {
  ctx.clearRect(0, 0, view.w, view.h);
  const alpha = dimmed ? DIM_FACTOR : 1;

  for (const [layer, from, to] of SCHEDULE) {
    const p = localT(t, from, to);
    if (p <= 0) continue;
    if (layer === 'hubs') drawHubs(ctx, view, data, p, alpha);
    else if (layer === 'wells') drawWells(ctx, view, data, p, alpha);
    else strokeLines(ctx, view, data.networks[layer], layer, p, alpha);
  }
}

// ── Выбор объекта ───────────────────────────────────────────────────────────

export type PickKind = 'well' | 'facility' | 'flare';

export interface PickTarget {
  /** Идентификатор для стора: `well:VMB_0001`, `fac:12`, `flare`. */
  id: string;
  kind: PickKind;
  /** Индекс в соответствующем массиве датасета. */
  index: number;
  /** Координаты съёмки, м. */
  x: number;
  y: number;
}

/**
 * Плоский список целей наведения. Промысловые объекты идут первыми: у ГЗУ и
 * скважин координаты часто совпадают с точностью до метра, и при равном
 * расстоянии выбрать нужно подписанный объект — он информативнее.
 */
export function buildTargets(data: FieldDataset): PickTarget[] {
  const out: PickTarget[] = [];

  data.points.flare.forEach((p, i) => {
    out.push({ id: 'flare', kind: 'flare', index: i, x: p[0], y: p[1] });
  });

  data.facilities.forEach((f, i) => {
    out.push({ id: `fac:${i}`, kind: 'facility', index: i, x: f.p[0], y: f.p[1] });
  });

  data.wells.forEach((w, i) => {
    out.push({ id: `well:${w.uwi}`, kind: 'well', index: i, x: w.p[0], y: w.p[1] });
  });

  return out;
}

/**
 * Ближайшая цель к точке экрана в пределах радиуса.
 *
 * Полный перебор по 1160 целям: пространственный индекс здесь был бы кодом
 * ради кода — перебор занимает десятки микросекунд, а индекс пришлось бы
 * перестраивать при каждой смене вида.
 */
export function pickAt(
  targets: PickTarget[],
  view: PlanView,
  sx: number,
  sy: number,
  radiusPx = 7,
): PickTarget | null {
  let best: PickTarget | null = null;
  let bestD = radiusPx * radiusPx;

  for (const target of targets) {
    const dx = planX(view, target.x) - sx;
    const dy = planY(view, target.y) - sy;
    const d = dx * dx + dy * dy;
    if (d <= bestD) {
      bestD = d;
      best = target;
    }
  }

  return best;
}
