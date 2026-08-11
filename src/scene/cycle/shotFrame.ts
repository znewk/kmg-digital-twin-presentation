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
import {
  resolveHorizon,
  PRODUCTIVE_TOP_ABS,
  SECTION_BASE_ABS,
} from '../../data/geo/stratigraphy';
import { outlineCentroid, outlineRadius } from '../../data/geo/outline';
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
  /**
   * Общий план — наклонный, а не отвесный.
   *
   * Шестьдесят градусов давали почти вид сверху: рисунок сети читался, но
   * промысел превращался в чертёж. С высоты птичьего полёта пропадает всё, что
   * стоит НА земле, — качалки, эстакады, опоры ВЛ, резервуары: у них исчезает
   * высота, и они становятся пятнами на плане.
   *
   * Тридцать три градуса оставляют рисунок сети читаемым и возвращают объектам
   * силуэт. Заодно в кадр входит горизонт, и промысел выглядит местом, а не
   * схемой.
   */
  wide: { margin: 1.15, elevation: 0.58 },
};

/**
 * ПОДЗЕМНЫЕ КАДРЫ СНИМАЮТСЯ СО СТОРОНЫ ВСКРЫТОЙ ГРАНИ.
 *
 * Секущая плоскость оставляет ЗАПАДНУЮ половину блока и срезает восточную —
 * значит вскрытая грань, на которой видна вся стратиграфия, смотрит на восток.
 * Камеру нужно ставить туда же. Западный ракурс, который стоял здесь до этого,
 * показывал целый бок блока: сплошную поверхность верхнего слоя во весь кадр,
 * без единого признака того, что внутри что-то есть. Ровно это и выглядело
 * как «нифига не видно на объекте».
 *
 * Угол — двадцать градусов: достаточно полого, чтобы слои читались полосами,
 * как на геологическом профиле, и достаточно приподнято, чтобы блок не
 * выглядел плоской картинкой.
 */
const SUBSURFACE_ELEVATION: Record<Framing, number> = {
  detail: 0.2,
  object: 0.28,
  context: 0.36,
  wide: 0.5,
};

/**
 * Подземный кадр берётся крупнее наземного.
 *
 * Запас в два с половиной габарита оставлял разрез крошечным посреди пустого
 * неба: блок недр и так вытянут вертикальным преувеличением, и вокруг него
 * нет ничего, что стоило бы показывать. Здесь запас минимальный — грань
 * заполняет кадр.
 */
const SUBSURFACE_MARGIN: Record<Framing, number> = {
  // Деталь под землёй — не вплотную. Камера, поставленная по габариту ствола,
  // упиралась в саму обсадную колонну: в кадре серая труба во весь экран, а
  // перфорация и приток, ради которых кадр существует, за ней не видны.
  detail: 1.7,
  object: 1.3,
  context: 1.25,
  wide: 1.5,
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
      // Габарит не по стволу, а по зоне притока: разговор идёт о том, как
      // нефть входит в скважину, значит в кадре должен быть кусок пласта
      // вокруг перфорации, а не одна труба.
      return { center: p.clone(), radius: 48 };
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
      /**
       * Кадр строится по ВСКРЫТОЙ ГРАНИ блока, а не по скважине.
       *
       * Наводка на скважину давала центр где-то в толще: половина стратиграфии
       * уходила за верх кадра, половина за низ, а по горизонтали в кадр
       * попадала случайная часть блока. Смотреть на разрез имеет смысл целиком —
       * иначе непонятно, что это разрез.
       *
       * Габарит берётся по фактической высоте продуктивного разреза с учётом
       * вертикального преувеличения и по ширине снятой площади, а не задаётся
       * числом: при правке стратиграфии или контура кадр обязан подстроиться
       * сам.
       */
      const [cx, cz] = outlineCentroid();
      const top = absToSceneY(PRODUCTIVE_TOP_ABS + 60);
      const bottom = absToSceneY(SECTION_BASE_ABS);
      const halfHeight = Math.abs(top - bottom) / 2;
      const halfWidth = outlineRadius(Math.PI / 2);

      return {
        center: new THREE.Vector3(cx, (top + bottom) / 2, cz),
        radius: Math.max(halfHeight, halfWidth * 0.75),
      };
    }

    case 'field': {
      void data;
      /**
       * Общий план строится по снятой площади, а не по объявленному габариту.
       *
       * Съёмка рамку 5352 × 4682 не заполняет, и кадр по габариту оставлял
       * четверть экрана пустой землёй за краем модели. Центр — центр контура,
       * радиус — по нему же.
       */
      const [cx, cz] = outlineCentroid();
      const r = Math.max(outlineRadius(0), outlineRadius(Math.PI / 2));
      return { center: new THREE.Vector3(cx, surfY(cx, cz), cz), radius: r };
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
  /**
   * Раскладка панелей вокруг кадра.
   *
   * В полном цикле панель одна и лежит снизу — свободное место по центру. В
   * разборе модуля панели стоят слева и справа, и свободная полоса смещена
   * влево от центра экрана: объект, поставленный по центру, уходит под правую
   * панель. Это ровно то, что было видно на разрезе.
   */
  layout: 'cycle' | 'dive' = 'cycle',
): FocusFrame | null {
  /**
   * Свободная полоса кадра — доли ширины экрана между панелями.
   *
   * Числа те же, что в раскладке интерфейса: слева панель раздела 19 em с
   * отступом 2 em, справа экран модуля 36 em с отступом 2,5 em. При базовой
   * ширине раскладки это примерно от 0,22 до 0,60. В полном цикле панель одна
   * и лежит снизу — по ширине свободно всё, только объект чуть приподнят над
   * ней.
   */
  const band =
    layout === 'dive' ? { left: 0.22, right: 0.6 } : { left: 0.06, right: 0.94 };
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
  // Восток — сторона вскрытой грани; разброс узкий, чтобы не уйти за неё.
  const azimuth = under ? 1.25 + spread * 0.6 : 0.4 + spread * 1.8;

  return frameAround(view.center, view.radius, azimuth, fovDeg, aspect, {
    margin: under ? SUBSURFACE_MARGIN[shot.framing] : f.margin,
    elevation: under ? SUBSURFACE_ELEVATION[shot.framing] : f.elevation,
    band,
  });
}
