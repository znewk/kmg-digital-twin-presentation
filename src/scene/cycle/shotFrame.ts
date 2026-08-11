import * as THREE from 'three';
import {
  absToSceneY,
  EXTERNAL_NODES,
  FIELD_H,
  FIELD_W,
  toSceneX,
  toSceneZ,
  type FieldDataset,
} from '../../data/geo/fieldData';
import { resolveHorizon } from '../../data/geo/stratigraphy';
import { makeStoryWell } from '../../data/geo/storyWells';
import type { CycleRoute, PpdRoute, RoutePoint } from '../../data/cycle/route';
import type { Framing, ShotTarget } from '../../data/cycle/storyboard';
import { perfPoint, surfY } from '../field/geology';
import { EQUIPMENT_SCALE } from '../field/kit/scale';
import { frameAround, type FocusFrame } from '../focus';

/**
 * Постановка кадра: из смысла шага — в положение камеры.
 *
 * Раскадровка говорит «покажи крупно устье» и «покажи коллектор целиком», а не
 * «камера в точке 812, 140, −430». Здесь это превращается в конкретный ракурс
 * по фактическому маршруту, найденному в данных.
 *
 * Разделение не косметическое. Координаты в раскадровке означали бы, что при
 * любой смене маршрута — другая скважина, другая ГЗУ — кадры нужно
 * переставлять вручную, и рано или поздно камера начнёт смотреть в пустое
 * место. Здесь достаточно, чтобы маршрут разрешился: кадр встанет по нему сам.
 */

export interface ShotView {
  center: THREE.Vector3;
  /** Габарит того, что должно поместиться в кадр, м. */
  radius: number;
}

/** Крупность плана: запас вокруг объекта и угол возвышения. */
const FRAMING: Record<Framing, { margin: number; elevation: number }> = {
  // Деталь — почти вплотную и с уровня человека: так смотрят на машину.
  detail: { margin: 1.15, elevation: 0.3 },
  // Объект целиком, взгляд сверху-сбоку: видно и саму установку, и обвязку.
  object: { margin: 1.8, elevation: 0.5 },
  // Объект в окружении: понятно, где он стоит и с чем связан.
  context: { margin: 2.4, elevation: 0.62 },
  // План: рисунок сети читается только сверху.
  wide: { margin: 1.45, elevation: 1.0 },
};

/**
 * ПОДЗЕМНЫЕ КАДРЫ СНИМАЮТСЯ ИНАЧЕ.
 *
 * Взгляд сверху-сбоку годится для всего, что стоит на земле, и категорически
 * не годится для того, что под ней: цель лежит на трёхсотметровой глубине, и
 * камера, поднятая на сорок градусов над ней, смотрит снизу вверх в подошву
 * рельефа. Именно поэтому кадр «Геолого-гидродинамическая модель» показывал
 * грунт вместо разреза.
 *
 * Пласт нужно снимать почти в уровень — так, как рисуют геологический профиль:
 * слои идут горизонтальными полосами, и видно, что под чем залегает. Небольшой
 * подъём оставлен, чтобы читалась объёмность блока, а не плоская картинка.
 */
const SUBSURFACE_ELEVATION: Record<Framing, number> = {
  detail: 0.12,
  object: 0.16,
  context: 0.2,
  wide: 0.34,
};

function isSubsurface(target: ShotTarget): boolean {
  return target.at === 'reservoir' || target.at === 'perforation' || target.at === 'bore';
}

/** Габарит объектов в натуральную величину, м. */
const SIZE = {
  wellhead: 11,
  gzu: 13,
  kns: 22,
  sp: 30,
  injector: 9,
  external: 120,
};

function centroid(pts: RoutePoint[]): { x: number; z: number } {
  let x = 0;
  let z = 0;
  for (const p of pts) {
    x += p.x;
    z += p.z;
  }
  return { x: x / pts.length, z: z / pts.length };
}

function spread(pts: RoutePoint[], c: { x: number; z: number }): number {
  let r = 0;
  for (const p of pts) r = Math.max(r, Math.hypot(p.x - c.x, p.z - c.z));
  return r;
}

function externalAt(id: string): { x: number; z: number } | null {
  const node = EXTERNAL_NODES.find((n) => n.id === id);
  if (!node) return null;
  return { x: (node.dir[0] * FIELD_W) / 2, z: -(node.dir[1] * FIELD_H) / 2 };
}

/**
 * Точка и габарит кадра по цели шага.
 *
 * Возвращает `null`, если цель не разрешилась. Подставлять «примерно то же
 * место» нельзя: кадр с подписью «Сборный пункт» и произвольной точкой в
 * центре промысла — это неправда, показанная Президенту, и хуже пропущенного
 * кадра.
 */
export function shotView(
  target: ShotTarget,
  route: CycleRoute,
  ppd: PpdRoute | null,
  data: FieldDataset,
): ShotView | null {
  const wellX = toSceneX(route.well.p[0]);
  const wellZ = toSceneZ(route.well.p[1]);

  switch (target.at) {
    case 'perforation': {
      // Забой — на фактическом горизонте скважины из реестра, а не на общей
      // отметке продуктивной толщи.
      const hero = makeStoryWell(route.well, 'skn');
      const p = perfPoint(hero);
      return { center: p.clone(), radius: 26 };
    }

    case 'bore': {
      const h = resolveHorizon(route.well.hor);
      const top = surfY(wellX, wellZ);
      const bottom = absToSceneY(h ? h.botAbs - 6 : -300);
      return {
        center: new THREE.Vector3(wellX, (top + bottom) / 2, wellZ),
        radius: Math.abs(top - bottom) / 2,
      };
    }

    case 'wellhead': {
      const r = SIZE.wellhead * EQUIPMENT_SCALE;
      return {
        center: new THREE.Vector3(wellX, surfY(wellX, wellZ) + r * 0.5, wellZ),
        radius: r,
      };
    }

    case 'flowline': {
      const c = centroid(route.flowline);
      return {
        center: new THREE.Vector3(c.x, surfY(c.x, c.z) + 8, c.z),
        radius: Math.max(60, spread(route.flowline, c)),
      };
    }

    case 'gzu': {
      const r = SIZE.gzu * EQUIPMENT_SCALE;
      const { x, z } = route.gzuAt;
      return { center: new THREE.Vector3(x, surfY(x, z) + r * 0.5, z), radius: r };
    }

    case 'pad': {
      const pts = route.siblings.map((w) => ({
        x: toSceneX(w.p[0]),
        z: toSceneZ(w.p[1]),
      }));
      pts.push(route.gzuAt);
      const c = centroid(pts);
      return {
        center: new THREE.Vector3(c.x, surfY(c.x, c.z) + 10, c.z),
        radius: Math.max(90, spread(pts, c)),
      };
    }

    case 'collector': {
      const c = centroid(route.collector);
      return {
        center: new THREE.Vector3(c.x, surfY(c.x, c.z) + 20, c.z),
        radius: Math.max(200, spread(route.collector, c)),
      };
    }

    case 'sp': {
      const r = SIZE.sp * EQUIPMENT_SCALE;
      const { x, z } = route.spAt;
      return { center: new THREE.Vector3(x, surfY(x, z) + r * 0.5, z), radius: r };
    }

    case 'external': {
      const p = externalAt(target.id);
      if (!p) return null;
      // Кадр охватывает и сам узел, и сборный пункт, откуда идёт труба: иначе
      // «нефть ушла за пределы промысла» показывается как объект в пустоте.
      const mid = { x: (p.x + route.spAt.x) / 2, z: (p.z + route.spAt.z) / 2 };
      const half = Math.hypot(p.x - route.spAt.x, p.z - route.spAt.z) / 2;
      return {
        center: new THREE.Vector3(mid.x, surfY(mid.x, mid.z) + 40, mid.z),
        radius: Math.max(SIZE.external, half),
      };
    }

    case 'kns': {
      if (!ppd) return null;
      const r = SIZE.kns * EQUIPMENT_SCALE;
      const { x, z } = ppd.knsAt;
      return { center: new THREE.Vector3(x, surfY(x, z) + r * 0.5, z), radius: r };
    }

    case 'waterline': {
      if (!ppd) return null;
      const c = centroid(ppd.waterline);
      return {
        center: new THREE.Vector3(c.x, surfY(c.x, c.z) + 20, c.z),
        radius: Math.max(180, spread(ppd.waterline, c)),
      };
    }

    case 'injector': {
      if (!ppd) return null;
      const r = SIZE.injector * EQUIPMENT_SCALE;
      const { x, z } = ppd.injectorAt;
      return { center: new THREE.Vector3(x, surfY(x, z) + r * 0.5, z), radius: r };
    }

    case 'reservoir': {
      // Разрез смотрим под самой скважиной-героиней: иначе «вот её пласт»
      // показывается на другом конце месторождения.
      const h = resolveHorizon(route.well.hor);
      const y = absToSceneY(h ? (h.topAbs + h.botAbs) / 2 : -300);
      return { center: new THREE.Vector3(wellX, y, wellZ), radius: 700 };
    }

    case 'field': {
      void data;
      return { center: new THREE.Vector3(0, surfY(0, 0), 0), radius: Math.max(FIELD_W, FIELD_H) / 2 };
    }
  }
}

/**
 * Минимум, нужный постановке кадра.
 *
 * Не `Shot` целиком: тем же механизмом ставятся кадры разделов по контурам, а
 * у них нет ни нитки, ни длительности, ни узла индикатора. Требовать от них
 * заполнять эти поля пустышками значило бы врать о том, чем они являются.
 */
export interface Framed {
  id: string;
  look: ShotTarget;
  framing: Framing;
}

export function shotFrame(
  shot: Framed,
  route: CycleRoute,
  ppd: PpdRoute | null,
  data: FieldDataset,
  fovDeg: number,
  aspect: number,
): FocusFrame | null {
  const view = shotView(shot.look, route, ppd, data);
  if (!view) return null;

  const f = FRAMING[shot.framing];
  const under = isSubsurface(shot.look);

  /**
   * Азимут меняется от кадра к кадру.
   *
   * При одном и том же ракурсе переход читается как подмена содержимого кадра,
   * а не как движение по промыслу. Значение детерминировано от идентификатора
   * кадра: одна и та же сцена всегда снимается одинаково, но соседние кадры
   * различаются.
   *
   * Разброс сужен на подземных кадрах. Разрез вскрыт секущей плоскостью с
   * запада, и заходить камерой за неё бессмысленно: с той стороны блок цел и
   * смотришь в его глухую стенку.
   */
  let h = 0;
  for (let i = 0; i < shot.id.length; i++) h = (h * 31 + shot.id.charCodeAt(i)) >>> 0;
  const spread = (h % 100) / 100;
  const azimuth = under ? -2.5 + spread * 0.7 : 0.4 + spread * 1.8;

  return frameAround(view.center, view.radius, azimuth, fovDeg, aspect, {
    margin: f.margin,
    elevation: under ? SUBSURFACE_ELEVATION[shot.framing] : f.elevation,
    /**
     * Смещать объект из-под правой панели больше не нужно.
     *
     * Сдвиг вводился, когда карточка объекта была единственной панелью и
     * висела справа. В разделе панели стоят с ОБЕИХ сторон, и увод объекта
     * влево загоняет его под левую — из одной помехи получаются две. Свободное
     * место здесь по центру, туда объект и ставится.
     */
    offsetForPanel: false,
  });
}
