/**
 * Реальные геоданные Восточного Молдабека (ТЗ §4.1).
 *
 * Датасет сведён из двух независимых первоисточников:
 *  1) исполнительный топоплан `В_Молдабек_2023_М2000.dwg` (AutoCAD Civil 3D,
 *     съёмка 2023 г.) — рельеф, трассы сетей, 188 кустов и 57 промысловых
 *     объектов с настоящими эксплуатационными подписями;
 *  2) официальный реестр фонда Управления разработкой КМГ — 1101 скважина с
 *     номерами VMB_XXXX, фактическими категорией, состоянием, типом и
 *     продуктивным горизонтом.
 *
 * Источники сверены между собой: 524 совпадения по номерам, остаточная невязка
 * 0,5 м (медиана). По фонду приоритетен реестр, по геометрии сетей и рельефу —
 * чертёж.
 *
 * Процедурный шум `fbm()` из референсного прототипа для рельефа больше не
 * используется: поверхность строится выборкой из реальной высотной сетки.
 */

// ── Форма датасета ──────────────────────────────────────────────────────────

export interface FieldMeta {
  source: string;
  crs: string;
  /** Начало координат UTM зоны 40N, из которого вычтены координаты в файле. */
  origin_utm: [number, number];
  /** Габарит участка в метрах. */
  extent_m: [number, number];
  note: string;
  /** Центр площадки в WGS84, порядок `[широта, долгота]` — как в датасете. */
  site_center_wgs84: [number, number];
  facilities_note?: string;
  /**
   * Заложение линейной части по слоям чертежа. Глубина подземных трасс в
   * чертеже НЕ указана — при визуализации задаётся условно и помечается.
   */
  buried_note?: string;
}

export interface TerrainGrid {
  /** Сетка n × n. */
  n: number;
  w: number;
  h: number;
  zmin: number;
  zmax: number;
  /** `grid[row][col]`, row по оси Y (на север), col по оси X (на восток). */
  grid: number[][];
}

/**
 * Категория скважины по реестру фонда. Величина фактическая, не иллюстративная
 * (ТЗ §4.1: допущение о выдуманных типах снято).
 */
export type WellCategory = 'oil' | 'inj' | 'obs' | 'water';

/** Эксплуатационное состояние по реестру фонда. */
export type WellStatus =
  | 'active'
  | 'mothballed'
  | 'liquidated'
  | 'idle'
  | 'inactive'
  | 'periodic'
  | 'await_liq'
  | 'revival';

export type WellType = 'vert' | 'horiz';

export interface WellRecord {
  /** Официальный номер из реестра фонда, формат `VMB_XXXX`. */
  uwi: string;
  /** Координаты в метрах от начала, Y — на север. */
  p: [number, number];
  cat: WellCategory;
  st: WellStatus;
  type: WellType;
  /**
   * Продуктивный горизонт — реальная стратиграфия месторождения (М-I-А…М-III,
   * Ю-I…Ю-VII, альб). У части фонда не указан.
   */
  hor: string | null;
  /** Индекс куста в `hubs`; null у скважин вне зоны топоплана. */
  hub: number | null;
}

/** Сводка фонда из реестра. Ключи — русские наименования, как в первоисточнике. */
export interface WellStats {
  total: number;
  by_category: Record<string, number>;
  by_status: Record<string, number>;
  by_type: Record<string, number>;
  by_horizon: Record<string, number>;
}

export interface HubRecord {
  p: [number, number];
  /** Сколько ниток нефтесбора сходится в узле. */
  links: number;
}

export type FacilityKind = 'gzu' | 'sp' | 'kns' | 'ktp';

/**
 * Подписанный объект промысла. Подписи извлечены напрямую из текстового слоя
 * чертежа — это настоящие эксплуатационные обозначения (ГЗУ-1…ГЗУ-52, КНС-2/3/4,
 * «СП Молдабек», СП-16, «Мини СП N43», КТП), а не реконструкция по геометрии.
 */
export interface FacilityRecord {
  name: string;
  kind: FacilityKind;
  p: [number, number];
}

export type Polyline = [number, number][];

export interface FieldNetworks {
  oil_pipeline: Polyline[];
  water_pipeline: Polyline[];
  gas_pipeline: Polyline[];
  /** Надземный участок газопровода — единственный в чертеже. */
  gas_overground: Polyline[];
  power_10kv: Polyline[];
  power_04kv: Polyline[];
  /** Кабели связи и низкого напряжения — подземные. */
  comm_cable: Polyline[];
  lv_cable: Polyline[];
  /** Трубные эстакады. */
  pipe_rack: Polyline[];
  road: Polyline[];
  contour: Polyline[];
  building: Polyline[];
  gzu: Polyline[];
  tank: Polyline[];
  tp: Polyline[];
  manhole: Polyline[];
}

/**
 * Точечные объекты. Здесь же лежит то, что определяет заложение линейной части:
 * `power_pole_10kv` — 2877 опор ВЛ, `pipe_support` — 169 опор надземных участков
 * трубопровода. По ним и различаются надземные трассы от подземных.
 */
export interface FieldPoints {
  flare: [number, number][];
  tp: [number, number][];
  gzu: [number, number][];
  tank: [number, number][];
  power_pole_10kv: [number, number][];
  comm_cable: [number, number][];
  manhole: [number, number][];
  pipe_support: [number, number][];
}

export interface FieldDataset {
  meta: FieldMeta;
  terrain: TerrainGrid;
  wells: WellRecord[];
  hubs: HubRecord[];
  networks: FieldNetworks;
  points: FieldPoints;
  facilities: FacilityRecord[];
  well_stats: WellStats;
}

// ── Габариты и система координат сцены ──────────────────────────────────────

/** Габарит участка по съёмке, м. */
export const FIELD_W = 5352.4;
export const FIELD_H = 4681.6;

/**
 * Вертикальное преувеличение — ОДНО на всю сцену: и на рельеф, и на недра.
 *
 * Раньше коэффициент был пятикратным и относился только к рельефу, потому что
 * подземной части в сцене фактически не было. С появлением разреза по §4.3 это
 * перестало работать: если поверхность растянута впятеро, а глубины нет, модель
 * внутренне противоречива — предметы на ней стоят в одном масштабе, а порода
 * под ними в другом.
 *
 * Тройка — компромисс между двумя противоположными требованиями. Рельефу нужно
 * преувеличение побольше: перепад 40 м на 5,3 км это 0,75%, без усиления степь
 * читается листом бумаги. Недрам нужно поменьше: продуктивная толща и так
 * уходит на 700 м, и при пятикратном блок превращается в башню высотой почти с
 * ширину участка. При тройке перепад рельефа — 120 м, а блок недр примерно
 * вдвое ниже своей ширины: и то и другое читается.
 *
 * Тонкие прослои при этом остаются тонкими, как и требует §4.3 п.7:
 * нефтенасыщенные 0,8–8,9 м превращаются в 2,4–27 м при ширине участка 5352 м.
 * Толстыми «слоями торта» они не становятся — читаемость даёт приближение
 * камеры, а не раздувание пласта.
 */
export const VERTICAL_EXAGGERATION = 3;

/**
 * Отметка, принятая за ноль сцены, м абс. Середина диапазона рельефа участка
 * (64,2…104,9 м). Подставляется при построении сэмплера рельефа, чтобы у
 * поверхности и у недр был общий нуль.
 */
let elevationDatum = 84.55;

/**
 * Абсолютная отметка (м) → координата Y сцены.
 *
 * Единственный способ поместить что-либо по высоте. Геологические отметки в
 * источниках даны абсолютными (кровля продуктивной толщи −230,5 м), рельеф — в
 * тех же абсолютных, поэтому и пересчёт обязан быть один: любая вторая формула
 * рано или поздно разойдётся с первой, и пласт всплывёт над землёй.
 */
export function absToSceneY(absElevation: number): number {
  return (absElevation - elevationDatum) * VERTICAL_EXAGGERATION;
}

/** Обратный перевод — нужен, чтобы подписывать глубины настоящими отметками. */
export function sceneYToAbs(y: number): number {
  return y / VERTICAL_EXAGGERATION + elevationDatum;
}

/**
 * Перевод координат съёмки в координаты сцены.
 *
 * В данных X на восток, Y на север. В сцене принято: X на восток, Z на юг
 * (правая тройка с Y вверх), начало — в центре участка. Инверсия Z здесь
 * единственная, дальше по коду север везде это −Z.
 */
export function toSceneX(dataX: number): number {
  return dataX - FIELD_W / 2;
}

export function toSceneZ(dataY: number): number {
  return -(dataY - FIELD_H / 2);
}

/**
 * Внутри ли точка объявленного габарита съёмки.
 *
 * Часть слоёв чертежа выходит за `meta.extent_m`: кабели связи и колодцы
 * тянутся на 1,2 км севернее границы. Рельефа там нет — высотная сетка
 * построена только на участок, — поэтому такие объекты повисали бы в пустоте
 * рядом с блоком, и на кадре это читалось как ошибка модели.
 */
export function isInsideExtent(dataX: number, dataY: number): boolean {
  return dataX >= 0 && dataX <= FIELD_W && dataY >= 0 && dataY <= FIELD_H;
}

/**
 * Отсекает трассы по границе съёмки, разрывая их на входе и выходе.
 *
 * Звено сохраняется, только если внутри оба его конца: обрезать по точной
 * точке пересечения смысла нет — на границе участка всё равно нет ни рельефа,
 * ни продолжения сети, и лишняя точность здесь ничего не добавит.
 */
export function clipToExtent(lines: Polyline[]): Polyline[] {
  const out: Polyline[] = [];

  for (const line of lines) {
    let run: [number, number][] = [];
    for (const p of line) {
      if (isInsideExtent(p[0], p[1])) {
        run.push(p);
      } else {
        if (run.length > 1) out.push(run);
        run = [];
      }
    }
    if (run.length > 1) out.push(run);
  }

  return out;
}

/** Обратный перевод — нужен для выборки рельефа по координатам сцены. */
export function toDataX(sceneX: number): number {
  return sceneX + FIELD_W / 2;
}

export function toDataY(sceneZ: number): number {
  return -sceneZ + FIELD_H / 2;
}

// ── Точная привязка к глобусу ───────────────────────────────────────────────

/**
 * Центр площадки — `meta.site_center_wgs84` датасета: 47,71793° с.ш.,
 * 54,14040° в.д. Привязка уточнена по 524 совпадениям номеров скважин между
 * чертежом и реестром фонда, остаточная невязка 0,5 м по медиане.
 *
 * Порядок здесь `[долгота, широта]` — как у остальных опорных точек проекции
 * (`KZ_CENTER`, `ATYRAU`), а не как в датасете. Разнобой в порядке пар — самая
 * дешёвая ошибка из возможных и самая дорогая по последствиям: камера уезжает
 * в другую точку планеты, и это видно только на прогоне.
 *
 * Константа обязана быть единственной: раньше координата площадки была задана
 * трижды в трёх файлах и все три раза по-разному, с разбросом до 2,4 км. Зум
 * «карта → промысел» после такого перестаёт быть бесшовным.
 */
export const SITE_CENTER_LONLAT: [number, number] = [54.1404, 47.71793];

/** Расхождение с датасетом, при котором привязку считаем разъехавшейся, °. */
const SITE_CENTER_TOLERANCE = 1e-4;

// ── Загрузка ────────────────────────────────────────────────────────────────

/**
 * Полный датасет грузится динамически и один раз.
 *
 * Триста килобайт чисел не должны висеть в стартовом бандле: до карты
 * месторождения зритель проходит витрину, глобус и три экрана страны, и
 * платить за геометрию промысла на первом кадре незачем. Облегчённый файл
 * намеренно не используется — он отличается только отсутствием рельефа и
 * горизонталей, а держать два расходящихся источника правды хуже, чем один
 * раз загрузить полный.
 */
let promise: Promise<FieldDataset> | null = null;
let loaded: FieldDataset | null = null;

export function loadFieldData(): Promise<FieldDataset> {
  if (!promise) {
    promise = import('../../../data/moldabek_field_data.json').then((m) => {
      loaded = trimToExtent(m.default as unknown as FieldDataset);
      if (import.meta.env.DEV) verifySiteCenter(loaded);
      return loaded;
    });
  }
  return promise;
}

/**
 * Приводит датасет к объявленному габариту съёмки — один раз при загрузке.
 *
 * Делается централизованно, а не в каждом компоненте: иначе один слой отсекут,
 * другой забудут, и в кадре останется висеть кусок сети рядом с блоком.
 * Скважины НЕ отсекаются: реестр фонда шире топоплана намеренно и покрывает
 * участки за пределами съёмки (ТЗ §4.1) — их место на плоской схеме.
 */
function trimToExtent(data: FieldDataset): FieldDataset {
  const networks = {} as FieldNetworks;
  for (const key of Object.keys(data.networks) as (keyof FieldNetworks)[]) {
    networks[key] = clipToExtent(data.networks[key]);
  }

  const points = {} as FieldPoints;
  for (const key of Object.keys(data.points) as (keyof FieldPoints)[]) {
    points[key] = data.points[key].filter((p) => isInsideExtent(p[0], p[1]));
  }

  return { ...data, networks, points };
}

/**
 * Сверка опорной координаты с датасетом.
 *
 * Глобус и ракурсы гео-последовательности строятся от `SITE_CENTER_LONLAT` ещё
 * до того, как геоданные загрузятся, — литерал неизбежен. Но если датасет
 * когда-нибудь переизвлекут с уточнённой привязкой, литерал молча разойдётся с
 * промыслом, и заметить это можно будет только глазом на прогоне. Проверка
 * стоит один `if` при загрузке и снимает целый класс отложенных ошибок.
 */
function verifySiteCenter(data: FieldDataset): void {
  const [lat, lon] = data.meta.site_center_wgs84;
  const drift = Math.max(
    Math.abs(lon - SITE_CENTER_LONLAT[0]),
    Math.abs(lat - SITE_CENTER_LONLAT[1]),
  );
  if (drift > SITE_CENTER_TOLERANCE) {
    console.error(
      `[fieldData] SITE_CENTER_LONLAT разошлась с датасетом на ${drift.toFixed(5)}°. ` +
        `В коде [${SITE_CENTER_LONLAT.join(', ')}], в meta.site_center_wgs84 ` +
        `[${lon}, ${lat}] (порядок приведён к «долгота, широта»).`,
    );
  }
}

/** Синхронный доступ для тех, кто уже отрисован под Suspense. */
export function getFieldData(): FieldDataset | null {
  return loaded;
}

/** Пробрасывает промис в Suspense, пока данные не готовы. */
export function useFieldData(): FieldDataset {
  if (loaded) return loaded;
  throw loadFieldData();
}

// ── Рельеф ──────────────────────────────────────────────────────────────────

/**
 * Высота рельефа в точке сцены, метры, с учётом преувеличения.
 *
 * Билинейная интерполяция по сетке 96×96: соседние узлы отстоят на 56 и 49 м,
 * и без интерполяции поверхность получается ступенчатой, а объекты на границах
 * ячеек «прыгают» по высоте.
 *
 * Отсчёт ведётся от средней отметки участка, чтобы ноль сцены остался на
 * уровне земли и вся остальная геометрия не уехала вверх на 85 метров.
 */
export function makeTerrainSampler(terrain: TerrainGrid) {
  const { n, grid, zmin, zmax } = terrain;
  const mid = (zmin + zmax) / 2;
  // Нуль сцены закрепляется за серединой диапазона рельефа — с этого момента
  // недра считаются от той же отметки, что и поверхность.
  elevationDatum = mid;

  return function elevation(sceneX: number, sceneZ: number): number {
    const dx = toDataX(sceneX);
    const dy = toDataY(sceneZ);

    // Нормализованные координаты в сетке.
    const gx = (dx / FIELD_W) * (n - 1);
    const gy = (dy / FIELD_H) * (n - 1);

    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const cx = Math.min(Math.max(x0, 0), n - 2);
    const cy = Math.min(Math.max(y0, 0), n - 2);
    const fx = Math.min(Math.max(gx - cx, 0), 1);
    const fy = Math.min(Math.max(gy - cy, 0), 1);

    const z00 = grid[cy][cx];
    const z10 = grid[cy][cx + 1];
    const z01 = grid[cy + 1][cx];
    const z11 = grid[cy + 1][cx + 1];

    const z = z00 * (1 - fx) * (1 - fy) + z10 * fx * (1 - fy) + z01 * (1 - fx) * fy + z11 * fx * fy;

    return absToSceneY(z);
  };
}

// ── Внешние узлы цепочки ────────────────────────────────────────────────────

/**
 * Объекты, которых нет в границах съёмки.
 *
 * ЦППН «Кенбай», МФНС и БРХ в топоплан не попали — они за пределами участка.
 * Привязывать их к произвольным зданиям на плане нельзя: это ровно тот случай,
 * когда правдоподобная выдумка хуже честного пропуска. Показываются выносами
 * за границу участка, направление указывает на реальную сторону.
 */
export interface ExternalNode {
  id: string;
  label: string;
  /** Куда вынести относительно центра участка, в долях габарита. */
  dir: [number, number];
  note: string;
}

export const EXTERNAL_NODES: ExternalNode[] = [
  {
    id: 's-cppn',
    label: 'ЦППН «Кенбай»',
    dir: [1.35, 0.1],
    note: 'за границей съёмки · приём напорного нефтепровода',
  },
  {
    id: 's-mfns',
    label: 'МФНС',
    dir: [1.2, -0.42],
    note: 'за границей съёмки',
  },
  {
    id: 's-brh',
    label: 'БРХ',
    dir: [1.1, 0.5],
    note: 'за границей съёмки · реагентные линии к точкам подачи',
  },
];
