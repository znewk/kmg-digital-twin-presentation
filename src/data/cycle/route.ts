import {
  toSceneX,
  toSceneZ,
  type FacilityRecord,
  type FieldDataset,
  type WellRecord,
} from '../geo/fieldData';

/**
 * НАСТОЯЩИЙ путь одной скважины до сборного пункта.
 *
 * Полный цикл показывается на примере одной скважины, и весь смысл этого — в
 * том, что путь фактический. Нарисовать стрелку от скважины к сборному пункту
 * можно и не открывая данных; ценность в том, что нефть идёт по тем самым
 * трассам, которые есть в исполнительной съёмке, через ту самую ГЗУ, к которой
 * скважина подключена, и на тот сборный пункт, куда этот коллектор приходит.
 *
 * Поэтому маршрут не назначен, а найден: по 649 трассам нефтесбора строится
 * граф, и путь от ГЗУ до СП ищется поиском кратчайшего пути. Что получилось —
 * проверяемо: ГЗУ-3, 2,0 км коллектора, Мини СП N43. Ни одного звена нельзя
 * подставить вручную, не сломав остальные.
 *
 * ПРОВЕРКА СВЯЗНОСТИ. Сеть в чертеже разорвана: трассы оцифрованы отрезками,
 * концы которых не совпадают в точности. При допуске 20 м на стыковку главная
 * компонента графа собирает 635 узлов из 902 и включает 27 ГЗУ из 41 и два
 * сборных пункта из трёх. Двадцать метров — не подгонка: это порядок точности
 * оцифровки, при 6 м сеть распадается на 107 кусков, при 30 м связность уже не
 * растёт. Из 41 ГЗУ связный маршрут до СП имеют 26.
 */

/** Допуск стыковки концов трасс, м. */
const SNAP = 20;

/** Дальше этого установка к сети не привязывается — значит, она не на ней. */
const ATTACH_LIMIT = 60;
const SP_ATTACH_LIMIT = 90;

export interface RoutePoint {
  x: number;
  z: number;
}

export interface CycleRoute {
  /** Скважина-героиня — из реестра, работающая нефтяная рядом со своей ГЗУ. */
  well: WellRecord;
  /** Куст, к которому она подключена. */
  hub: RoutePoint | null;
  /** Замерная установка этой скважины. */
  gzu: FacilityRecord;
  gzuAt: RoutePoint;
  /** Сборный пункт, куда приходит коллектор. */
  sp: FacilityRecord;
  spAt: RoutePoint;
  /** Выкидная линия: устье → куст → ГЗУ. */
  flowline: RoutePoint[];
  /** Нефтесборный коллектор ГЗУ → СП по фактическим трассам. */
  collector: RoutePoint[];
  /** Длина коллектора, м — настоящая, по трассе. */
  collectorLength: number;
  /** Работающие нефтяные скважины этой ГЗУ. */
  siblings: WellRecord[];
}

type NodeKey = string;

interface Graph {
  adj: Map<NodeKey, Set<NodeKey>>;
  pos: Map<NodeKey, [number, number]>;
}

function buildGraph(lines: [number, number][][]): Graph {
  const adj = new Map<NodeKey, Set<NodeKey>>();
  const pos = new Map<NodeKey, [number, number]>();

  const add = (p: [number, number]): NodeKey => {
    const k = `${Math.round(p[0] / SNAP)}:${Math.round(p[1] / SNAP)}`;
    if (!adj.has(k)) {
      adj.set(k, new Set());
      pos.set(k, p);
    }
    return k;
  };

  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = add(line[i]);
      const b = add(line[i + 1]);
      if (a === b) continue;
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    }
  }

  return { adj, pos };
}

function nearestNode(g: Graph, p: [number, number]): { key: NodeKey; d: number } | null {
  let best: NodeKey | null = null;
  let bestD = Infinity;
  for (const [k, q] of g.pos) {
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best === null ? null : { key: best, d: Math.sqrt(bestD) };
}

interface Field {
  dist: Map<NodeKey, number>;
  prev: Map<NodeKey, NodeKey>;
}

/**
 * Расстояния по трассам от одного узла до всех остальных.
 *
 * Считается ОДИН раз на приёмник, а не на каждую пару. Пар «ГЗУ — сборный
 * пункт» сто двадцать три, «КНС — нагнетательная» шестьсот тридцать; прогон
 * поиска на каждую означал бы полмиллиарда операций при загрузке страницы. От
 * трёх сборных пунктов — три прогона, и расстояние до любой ГЗУ читается из
 * готовой таблицы.
 *
 * Дейкстра без кучи: узлов девять сотен, и очередь с приоритетом здесь
 * усложнила бы код ради миллисекунды.
 */
function distanceField(g: Graph, source: NodeKey): Field {
  const dist = new Map<NodeKey, number>([[source, 0]]);
  const prev = new Map<NodeKey, NodeKey>();
  const rest = new Set(g.adj.keys());

  const between = (a: NodeKey, b: NodeKey) => {
    const p = g.pos.get(a)!;
    const q = g.pos.get(b)!;
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
  };

  while (rest.size > 0) {
    let u: NodeKey | null = null;
    let best = Infinity;
    for (const k of rest) {
      const v = dist.get(k) ?? Infinity;
      if (v < best) {
        best = v;
        u = k;
      }
    }
    if (u === null || best === Infinity) break;
    rest.delete(u);

    for (const nb of g.adj.get(u)!) {
      if (!rest.has(nb)) continue;
      const nd = best + between(u, nb);
      if (nd < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nd);
        prev.set(nb, u);
      }
    }
  }

  return { dist, prev };
}

/**
 * Путь от узла к источнику поля расстояний.
 *
 * Поле считается ОТ приёмника, поэтому цепочка предшественников ведёт к нему —
 * то есть уже в ту сторону, в которую течёт нефть. Разворачивать не нужно.
 */
function pathToSource(f: Field, from: NodeKey): NodeKey[] | null {
  if (!f.dist.has(from)) return null;
  const path: NodeKey[] = [from];
  let cur = from;
  while (f.prev.has(cur)) {
    cur = f.prev.get(cur)!;
    path.push(cur);
  }
  return path;
}

const toScene = (p: [number, number]): RoutePoint => ({ x: toSceneX(p[0]), z: toSceneZ(p[1]) });

const flat = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Выбор героев показа — по данным, а не по вкусу.
 *
 * Годится ГЗУ, у которой есть связный маршрут до сборного пункта; из них
 * берётся та, вокруг которой больше работающих скважин. Причина простая: узел с
 * одной скважиной выглядит тупиком, а показывать надо типичный куст промысла.
 * При равенстве предпочтение ближней скважине — выкидная линия длиной в двести
 * метров в кадр вместе с устьем и установкой не помещается.
 */
/**
 * Маршрут считается один раз на датасет.
 *
 * Поиск обходит граф из девяти сотен узлов и запускается из трёх источников;
 * это заметная работа, а результат зависит только от данных. Кэш по самому
 * датасету, а не по флагу «уже считали»: при подмене данных пересчёт обязан
 * произойти сам, без ручного сброса.
 */
const routeCache = new WeakMap<FieldDataset, { oil: CycleRoute | null; ppd: PpdRoute | null }>();

export function cycleRoutes(data: FieldDataset): { oil: CycleRoute | null; ppd: PpdRoute | null } {
  const hit = routeCache.get(data);
  if (hit) return hit;
  const built = { oil: resolveCycleRoute(data), ppd: resolvePpdRoute(data) };
  routeCache.set(data, built);

  /**
   * Маршрут печатается при разработке.
   *
   * Он найден в данных и потому может измениться от правки датасета — а весь
   * показ полного цикла построен на нём. Молча уехавший маршрут заметить
   * нельзя: кадры останутся на местах, просто покажут другую установку.
   */
  if (import.meta.env.DEV) {
    const o = built.oil;
    console.info(
      o
        ? `[цикл] ${o.well.uwi} (${o.well.hor ?? 'горизонт не указан'}) → ${o.gzu.name} → ` +
          `${(o.collectorLength / 1000).toFixed(2)} км коллектора → ${o.sp.name}; ` +
          `на установке ${o.siblings.length} работающих скважин`
        : '[цикл] маршрут не разрешился: связного пути от ГЗУ до сборного пункта нет',
    );
    const p = built.ppd;
    console.info(
      p
        ? `[цикл · ППД] ${p.kns.name} → водовод → ${p.injector.uwi}`
        : '[цикл · ППД] маршрут не разрешился',
    );
  }

  return built;
}

export function resolveCycleRoute(data: FieldDataset): CycleRoute | null {
  const g = buildGraph(data.networks.oil_pipeline);
  const producers = data.wells.filter((w) => w.cat === 'oil' && w.st === 'active');
  const sps = data.facilities.filter((f) => f.kind === 'sp');

  const spNodes = sps
    .map((sp) => ({ sp, at: nearestNode(g, sp.p) }))
    .filter((r): r is { sp: FacilityRecord; at: { key: NodeKey; d: number } } => r.at !== null)
    .filter((r) => r.at.d <= SP_ATTACH_LIMIT);

  if (spNodes.length === 0) return null;

  // Поле расстояний от каждого сборного пункта — по одному прогону на пункт.
  const fields = spNodes.map((s) => ({ sp: s.sp, field: distanceField(g, s.at.key) }));

  let best: CycleRoute | null = null;
  let bestScore = -Infinity;

  for (const gzu of data.facilities.filter((f) => f.kind === 'gzu')) {
    const at = nearestNode(g, gzu.p);
    if (!at || at.d > ATTACH_LIMIT) continue;

    // Ближайший по трассе сборный пункт, а не по прямой: коллектор может
    // обходить участок, и «ближний» на карте оказывается дальним по трубе.
    let target: { sp: FacilityRecord; len: number; path: NodeKey[] } | null = null;
    for (const f of fields) {
      const len = f.field.dist.get(at.key);
      if (len === undefined) continue;
      if (target && len >= target.len) continue;
      const path = pathToSource(f.field, at.key);
      if (!path) continue;
      target = { sp: f.sp, len, path };
    }
    if (!target) continue;

    const around = producers.filter((w) => flat(w.p, gzu.p) < 150);
    if (around.length === 0) continue;

    const nearest = around.reduce((a, b) => (flat(a.p, gzu.p) < flat(b.p, gzu.p) ? a : b));
    const gap = flat(nearest.p, gzu.p);

    // Куст скважин важнее короткой выкидной линии, но за очень длинную штраф.
    const score = around.length - gap / 60;
    if (score <= bestScore) continue;

    const hubIdx = nearest.hub;
    const hub = hubIdx !== null && data.hubs[hubIdx] ? toScene(data.hubs[hubIdx].p) : null;

    const flowline: RoutePoint[] = [toScene(nearest.p)];
    if (hub) flowline.push(hub);
    flowline.push(toScene(gzu.p));

    bestScore = score;
    best = {
      well: nearest,
      hub,
      gzu,
      gzuAt: toScene(gzu.p),
      sp: target.sp,
      spAt: toScene(target.sp.p),
      flowline,
      collector: target.path.map((k) => toScene(g.pos.get(k)!)),
      collectorLength: target.len,
      siblings: around,
    };
  }

  return best;
}

/**
 * Ветка ППД: откуда берётся вода, которую закачивают обратно в пласт.
 *
 * Отдельно от основного маршрута, потому что это не продолжение пути нефти, а
 * встречный процесс: чтобы пласт отдавал нефть, в него закачивают воду, и без
 * этого объяснения половина промысла остаётся непонятной.
 */
export interface PpdRoute {
  kns: FacilityRecord;
  knsAt: RoutePoint;
  /** Нагнетательная скважина, ближайшая к этой КНС. */
  injector: WellRecord;
  injectorAt: RoutePoint;
  /** Водовод от КНС к нагнетательной — фактические трассы. */
  waterline: RoutePoint[];
}

export function resolvePpdRoute(data: FieldDataset): PpdRoute | null {
  const injectors = data.wells.filter((w) => w.cat === 'inj' && w.st === 'active');
  if (injectors.length === 0) return null;

  const g = buildGraph(data.networks.water_pipeline);

  let best: PpdRoute | null = null;
  let bestLen = Infinity;

  for (const kns of data.facilities.filter((f) => f.kind === 'kns')) {
    const from = nearestNode(g, kns.p);
    if (!from || from.d > ATTACH_LIMIT * 2) continue;

    const field = distanceField(g, from.key);

    for (const inj of injectors) {
      const to = nearestNode(g, inj.p);
      if (!to || to.d > ATTACH_LIMIT) continue;

      const len = field.dist.get(to.key);
      // Слишком короткий путь означает, что скважина стоит вплотную к станции:
      // на таком отрезке водовод не показать.
      if (len === undefined || len < 200 || len >= bestLen) continue;

      const path = pathToSource(field, to.key);
      if (!path) continue;

      bestLen = len;
      best = {
        kns,
        knsAt: toScene(kns.p),
        injector: inj,
        injectorAt: toScene(inj.p),
        // Поле считалось от КНС, поэтому путь ведёт к ней — а вода идёт
        // наоборот, от станции к скважине. Здесь разворот обязателен.
        waterline: path.reverse().map((k) => toScene(g.pos.get(k)!)),
      };
    }
  }

  return best;
}
