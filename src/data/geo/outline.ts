import { toSceneX, toSceneZ, type FieldDataset } from './fieldData';

/**
 * Контур снятой площади промысла.
 *
 * Блок недр был прямоугольником по объявленному габариту 5352 × 4682 м. Но
 * съёмка этот прямоугольник не заполняет: горизонтали рельефа занимают
 * X 722…5210 и Y 759…4067, то есть площадь неправильной формы внутри рамки.
 * Прямоугольный блок обрезал модель по границе, которой в природе нет, и
 * выглядел вырезанным из чертежа куском.
 *
 * Контур строится по фактическим горизонталям — по тому единственному слою,
 * который покрывает всю снятую площадь и очерчивает её край. Берётся выпуклая
 * оболочка: она гарантированно замкнута, не имеет самопересечений и её можно
 * триангулировать веером от центра, а вогнутости на краю съёмки для формы
 * блока роли не играют.
 */

export type Point2 = [number, number];

/**
 * Выпуклая оболочка методом Эндрю: сортировка по координате и два прохода —
 * нижняя и верхняя цепочка. Точек несколько тысяч, времени это занимает
 * миллисекунды и делается один раз при загрузке.
 */
function convexHull(points: Point2[]): Point2[] {
  if (points.length < 3) return points;

  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point2, a: Point2, b: Point2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const build = (pts: Point2[]): Point2[] => {
    const chain: Point2[] = [];
    for (const p of pts) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
        chain.pop();
      }
      chain.push(p);
    }
    chain.pop();
    return chain;
  };

  return [...build(sorted), ...build([...sorted].reverse())];
}

let outline: Point2[] = [];
let centroid: Point2 = [0, 0];

/**
 * Считает контур один раз при загрузке датасета — как и сэмплер рельефа.
 *
 * Точки прореживаются: у горизонталей десятки тысяч вершин, а на форму
 * оболочки влияют только крайние. Каждая пятая даёт тот же контур в десять раз
 * быстрее.
 */
export function setFieldOutline(data: FieldDataset): void {
  const pts: Point2[] = [];
  for (const line of data.networks.contour) {
    for (let i = 0; i < line.length; i += 5) {
      pts.push([toSceneX(line[i][0]), toSceneZ(line[i][1])]);
    }
  }

  outline = convexHull(pts);

  let sx = 0;
  let sz = 0;
  for (const p of outline) {
    sx += p[0];
    sz += p[1];
  }
  centroid = outline.length ? [sx / outline.length, sz / outline.length] : [0, 0];
}

export function fieldOutline(): Point2[] {
  return outline;
}

export function outlineCentroid(): Point2 {
  return centroid;
}

/**
 * Точка границы контура на луче под заданным углом от центра.
 *
 * По ней строится полярная сетка блока: лучи расходятся от центра до края, и
 * геометрия слоя точно повторяет форму снятой площади вместо прямоугольника.
 */
export function outlineRadius(angle: number): number {
  if (outline.length < 3) return 2000;

  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  let best = 0;

  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];

    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    // Пересечение луча из центра с отрезком границы.
    const denom = dx * ez - dz * ex;
    if (Math.abs(denom) < 1e-9) continue;

    const ax = a[0] - centroid[0];
    const az = a[1] - centroid[1];
    const t = (ax * ez - az * ex) / denom;
    const u = (ax * dz - az * dx) / denom;

    if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
  }

  return best || 2000;
}
