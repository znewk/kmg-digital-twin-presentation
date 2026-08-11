import * as THREE from 'three';
import type { Polyline } from '../../../data/geo/fieldData';
import { toSceneX, toSceneZ } from '../../../data/geo/fieldData';

/**
 * Сборка трубной нитки по трассе съёмки в одну геометрию.
 *
 * Почему не `TubeGeometry` на каждую трассу. Трасс девятьсот с лишним, и
 * девятьсот отдельных геометрий — это девятьсот вызовов отрисовки плюс
 * заметная пауза на их создание при входе в этап. Здесь все трассы одной
 * системы собираются в один буфер: одна геометрия, один вызов.
 *
 * Труба строится кольцами вдоль трассы. Опорная система координат берётся от
 * вертикали, а не переносится вдоль кривой: промысловые трубопроводы почти
 * горизонтальны, и честный параллельный перенос дал бы то же самое, но с
 * накоплением ошибки на длинных нитках.
 */

/**
 * Максимальная длина звена, м.
 *
 * Трассы в чертеже заданы длинными прямыми — до трёхсот метров между узлами.
 * Труба, положенная прямой хордой на глубине от рельефа, на середине пролёта
 * вылезет наружу: местность под ней выгибается. Звенья дробятся, и нитка
 * повторяет поверхность, как и лежит в натуре.
 */
const MAX_SEG = 40;

export interface TubeOptions {
  radius: number;
  /**
   * Смещение по вертикали относительно рельефа, м. Отрицательное — заложение
   * ниже поверхности, положительное — надземная прокладка на опорах.
   */
  offset: number;
  /** Число граней в сечении. Труба тонкая, шести хватает с запасом. */
  radialSegments?: number;
  /** Высота рельефа в точке сцены. */
  elevation: (x: number, z: number) => number;
}

/** Уплотняет трассу так, чтобы звено не превышало `MAX_SEG`. */
function densify(line: Polyline): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < line.length - 1; i++) {
    const x1 = toSceneX(line[i][0]);
    const z1 = toSceneZ(line[i][1]);
    const x2 = toSceneX(line[i + 1][0]);
    const z2 = toSceneZ(line[i + 1][1]);
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / MAX_SEG));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([x1 + (x2 - x1) * t, z1 + (z2 - z1) * t]);
    }
  }
  if (line.length > 1) {
    out.push([toSceneX(line[line.length - 1][0]), toSceneZ(line[line.length - 1][1])]);
  }
  return out;
}

/**
 * Линейное представление трассы — отрезки с продольной координатой.
 *
 * Нужно там, где объём трубы физически невидим: диаметр нефтесборной трубы
 * 114–219 мм, и на промысле шириной 5,3 км она тоньше пикселя с любого
 * ракурса, кроме вплотную. Линия рисуется постоянной толщиной в пикселях и
 * читается с любого расстояния — поэтому подземная схема показывается и
 * трубами, и линиями сразу: линии дают общую картину, трубы — правду вблизи.
 */
export function buildTraceLines(
  lines: Polyline[],
  opts: { offset: number; elevation: (x: number, z: number) => number },
): THREE.BufferGeometry {
  const pos: number[] = [];
  const along: number[] = [];

  for (const line of lines) {
    const pts = densify(line);
    if (pts.length < 2) continue;

    let traveled = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i];
      const [x2, z2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);

      pos.push(x1, opts.elevation(x1, z1) + opts.offset, z1);
      along.push(traveled);
      pos.push(x2, opts.elevation(x2, z2) + opts.offset, z2);
      along.push(traveled + len);

      traveled += len;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.computeBoundingSphere();
  return g;
}

export function buildTubes(lines: Polyline[], opts: TubeOptions): THREE.BufferGeometry {
  const { radius, offset, elevation } = opts;
  const R = opts.radialSegments ?? 6;

  const position: number[] = [];
  const normal: number[] = [];
  // Продольная координата в метрах — по ней шейдер потока гонит волну, и она
  // обязана быть в метрах, иначе скорость потока на длинной нитке и на
  // короткой перемычке окажется разной.
  const along: number[] = [];
  const index: number[] = [];

  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const up = new THREE.Vector3();
  const center = new THREE.Vector3();
  const prev = new THREE.Vector3();

  for (const line of lines) {
    const pts = densify(line);
    if (pts.length < 2) continue;

    const ringStart = position.length / 3;
    let distance = 0;

    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const y = elevation(x, z) + offset;
      center.set(x, y, z);

      if (i > 0) distance += center.distanceTo(prev);
      prev.copy(center);

      // Касательная — по соседям, на концах по одному соседу.
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const ay = elevation(a[0], a[1]) + offset;
      const by = elevation(b[0], b[1]) + offset;
      tangent.set(b[0] - a[0], by - ay, b[1] - a[1]);
      if (tangent.lengthSq() < 1e-9) tangent.set(0, 0, 1);
      tangent.normalize();

      side.crossVectors(tangent, upAxis);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      up.crossVectors(side, tangent).normalize();

      for (let r = 0; r < R; r++) {
        const a2 = (r / R) * Math.PI * 2;
        const nx = side.x * Math.cos(a2) + up.x * Math.sin(a2);
        const ny = side.y * Math.cos(a2) + up.y * Math.sin(a2);
        const nz = side.z * Math.cos(a2) + up.z * Math.sin(a2);
        position.push(center.x + nx * radius, center.y + ny * radius, center.z + nz * radius);
        normal.push(nx, ny, nz);
        along.push(distance);
      }
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const c0 = ringStart + i * R;
      const c1 = ringStart + (i + 1) * R;
      for (let r = 0; r < R; r++) {
        const rn = (r + 1) % R;
        index.push(c0 + r, c1 + r, c0 + rn);
        index.push(c0 + rn, c1 + r, c1 + rn);
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}
