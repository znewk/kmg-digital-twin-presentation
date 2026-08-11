import {
  toSceneX,
  toSceneZ,
  type FacilityKind,
  type FieldDataset,
  type Polyline,
} from '../../data/geo/fieldData';
import type { Placement } from './kit/Assembly';
import { surfY } from './geology';

/**
 * Где на самом деле стоят промысловые установки.
 *
 * Модуль отделён от компонента, который их рисует, по одной причине: этим же
 * расчётом обязан пользоваться резолвер цикла. Якорь шага цепочки указывает на
 * объект, к которому подлетает камера, и если расстановка посчитана дважды —
 * один раз для отрисовки, другой для якоря, — рано или поздно они разойдутся, и
 * камера будет прилетать мимо установки. Один расчёт на оба применения.
 */

/**
 * Разворот установки: гребёнка подводящих линий смотрит на ближайший узел
 * сбора. Установки, развёрнутые одинаково, сразу выдают процедурную
 * расстановку — в поле каждая стоит по своей обвязке.
 */
function yawToward(x: number, z: number, data: FieldDataset): number {
  let bestX = 0;
  let bestZ = 0;
  let bestD = Infinity;

  for (const hub of data.hubs) {
    const hx = toSceneX(hub.p[0]);
    const hz = toSceneZ(hub.p[1]);
    const d = (hx - x) ** 2 + (hz - z) ** 2;
    if (d < bestD && d > 1) {
      bestD = d;
      bestX = hx;
      bestZ = hz;
    }
  }

  if (bestD === Infinity) return 0;
  // Локальная ось −Z установки направляется на узел.
  return Math.atan2(-(bestX - x), -(bestZ - z));
}

/** Центр и разворот по длинной стороне контура из чертежа. */
interface Footprint {
  x: number;
  z: number;
  yaw: number;
}

function footprintOf(line: Polyline): Footprint {
  const xs = line.map((p) => toSceneX(p[0]));
  const zs = line.map((p) => toSceneZ(p[1]));
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  const z = (Math.min(...zs) + Math.max(...zs)) / 2;

  // Длинная сторона контура задаёт разворот здания.
  let bestLen = 0;
  let yaw = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    const dz = zs[i + 1] - zs[i];
    const len = Math.hypot(dx, dz);
    if (len > bestLen) {
      bestLen = len;
      // Гребёнка установки (локальная −Z) ставится поперёк длинной стороны.
      yaw = Math.atan2(dx, dz) + Math.PI / 2;
    }
  }

  return { x, z, yaw };
}

/** Дальше этого подпись к контуру не притягивается — значит, это не он. */
const SNAP_LIMIT = 45;

/**
 * Какой слой контуров описывает габарит установки данного типа.
 *
 * Подписи в `facilities` взяты из ТЕКСТОВОГО слоя чертежа, а текст в чертеже
 * кладут рядом с объектом, а не в его центр. Проверка по данным: расстояние от
 * подписи до контура установки — 15,7 м по медиане, а от подписи до ближайшей
 * вершины нефтесбора — 11,8 м, тогда как от КОНТУРА до той же вершины всего
 * 2,0 м. То есть сети сходятся именно на контуре, и ставить установку по
 * подписи значит промахиваться мимо собственной обвязки на десяток метров.
 *
 * Поэтому имя берётся из подписи, а место и разворот — из контура.
 */
const FOOTPRINT_LAYER: Partial<Record<FacilityKind, keyof FieldDataset['networks']>> = {
  gzu: 'gzu',
  ktp: 'tp',
};

export function facilityPlacements(data: FieldDataset, kind: FacilityKind): Placement[] {
  const layer = FOOTPRINT_LAYER[kind];
  const prints = layer ? data.networks[layer].filter((l) => l.length > 2).map(footprintOf) : [];

  return data.facilities
    .filter((f) => f.kind === kind)
    .map((f) => {
      const lx = toSceneX(f.p[0]);
      const lz = toSceneZ(f.p[1]);

      // Ближайший контур — если он вообще рядом.
      let best: Footprint | null = null;
      let bestD = SNAP_LIMIT * SNAP_LIMIT;
      for (const p of prints) {
        const d = (p.x - lx) ** 2 + (p.z - lz) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }

      const x = best ? best.x : lx;
      const z = best ? best.z : lz;

      return {
        x,
        y: surfY(x, z),
        z,
        yaw: best ? best.yaw : yawToward(x, z, data),
        id: `fac:${f.name}`,
      };
    });
}
