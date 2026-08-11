/**
 * Реальные геоданные Восточного Молдабека (ТЗ §4.1).
 *
 * Источник — исполнительный топоплан `В_Молдабек_2023_М2000.dwg` (AutoCAD
 * Civil 3D, съёмка 2023 г.). Отсюда берутся рельеф, 570 скважин с настоящими
 * номерами, 188 кустов, трассы сетей и подписанные объекты промысла.
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

export interface WellRecord {
  /** Координаты в метрах от начала, Y — на север. */
  p: [number, number];
  /** Фактический номер скважины из чертежа; у 10 из 570 отсутствует. */
  n: string | null;
  /** Индекс куста в `hubs`. */
  hub: number | null;
}

export interface HubRecord {
  p: [number, number];
  /** Сколько ниток нефтесбора сходится в узле. */
  links: number;
}

/** Подписанный объект промысла — подписи взяты из самого чертежа. */
export interface FacilityRecord {
  name: string;
  kind: 'gzu' | 'sp' | 'kns' | 'ktp';
  p: [number, number];
}

export type Polyline = [number, number][];

export interface FieldNetworks {
  oil_pipeline: Polyline[];
  water_pipeline: Polyline[];
  gas_pipeline: Polyline[];
  power_10kv: Polyline[];
  power_04kv: Polyline[];
  road: Polyline[];
  contour: Polyline[];
  building: Polyline[];
  gzu: Polyline[];
  tank: Polyline[];
  tp: Polyline[];
}

export interface FieldDataset {
  meta: FieldMeta;
  terrain: TerrainGrid;
  wells: WellRecord[];
  hubs: HubRecord[];
  networks: FieldNetworks;
  points: { flare: [number, number][]; tp: [number, number][] };
  facilities: FacilityRecord[];
}

// ── Габариты и система координат сцены ──────────────────────────────────────

/** Габарит участка по съёмке, м. */
export const FIELD_W = 5352.4;
export const FIELD_H = 4681.6;

/**
 * Вертикальное преувеличение рельефа.
 *
 * Перепад на участке — 40 м на 5,3 км, то есть 0,75%: без усиления местность
 * абсолютно плоская и читается как лист бумаги. Пятикратное даёт около 200 м
 * условного перепада — выразительно и всё ещё правдоподобно для степи.
 * Коэффициент один и явный, чтобы преувеличение нигде не накапливалось.
 */
export const TERRAIN_EXAGGERATION = 5;

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

/** Обратный перевод — нужен для выборки рельефа по координатам сцены. */
export function toDataX(sceneX: number): number {
  return sceneX + FIELD_W / 2;
}

export function toDataY(sceneZ: number): number {
  return -sceneZ + FIELD_H / 2;
}

// ── Точная привязка к глобусу ───────────────────────────────────────────────

/**
 * Центр площадки, вычисленный из исполнительной съёмки (ТЗ §3.1 п.4).
 * Ради него зум с карты страны на промысел получается геометрически честным.
 */
export const PILOT_LATLON: [number, number] = [54.1449, 47.7373];

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
      loaded = m.default as unknown as FieldDataset;
      return loaded;
    });
  }
  return promise;
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

    return (z - mid) * TERRAIN_EXAGGERATION;
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
