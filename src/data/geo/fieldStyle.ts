import type { FacilityKind, FieldNetworks, WellCategory, WellStatus } from './fieldData';

/**
 * Условные обозначения промысла — единственный источник для плоской схемы и
 * для 3D-сцены (ТЗ §4.1: «визуальная дифференциация фонда обязательна»).
 *
 * Разнесение по двум файлам было бы удобнее писать и невозможно поддерживать:
 * §3.1 требует, чтобы 3D-модель читалась как объёмное продолжение той же
 * схемы. Если нагнетательная скважина синяя на плане и серая в сцене, переход
 * «карта поднимается в 3D» распадается на две разные картинки.
 *
 * Цвета — из палитры §8.1. Дисциплина палитры соблюдается буквально: тёплый
 * янтарь только у нефти, фиолетовый не занимается ничем, кроме системного слоя
 * Nedra, бирюза — только данные и потоки. Поэтому ВЛ здесь нейтрально-стальные,
 * а не фиолетовые, как были: линии электропередачи — это инфраструктура, а не
 * система-источник, и отбирать у легенды покрытия её собственный цвет нельзя.
 */

// ── Фонд скважин ────────────────────────────────────────────────────────────

export interface CategoryStyle {
  /** Наименование как в реестре фонда. */
  label: string;
  /** Короткая форма для тесной легенды. */
  short: string;
  color: string;
}

/**
 * Категория задаёт цвет. Водозаборная — осветлённый оттенок того же водного
 * тона, что и нагнетательная: обе про воду, разводить их в разные части круга
 * значило бы соврать о смысле. Различаются они числом (6 против 210) и
 * подписью, а не конфликтующими цветами.
 */
export const WELL_CATEGORY: Record<WellCategory, CategoryStyle> = {
  oil: { label: 'Нефтяная', short: 'нефт.', color: '#f0ae4a' },
  inj: { label: 'Нагнетательная', short: 'нагн.', color: '#5fa8e8' },
  obs: { label: 'Наблюдательная', short: 'набл.', color: '#8fbaf0' },
  water: { label: 'Водозаборная', short: 'водоз.', color: '#7fc4e8' },
};

/** Порядок в легенде — по убыванию численности фонда. */
export const WELL_CATEGORY_ORDER: WellCategory[] = ['oil', 'inj', 'obs', 'water'];

export interface StatusStyle {
  label: string;
  /**
   * Работающая — рисуется заливкой, неработающая — контуром (ТЗ §4.1 п.4, по
   * аналогии с корпоративной ГИС КМГ).
   */
  working: boolean;
  /** Ликвидированная перечёркивается — стандартное промысловое обозначение. */
  struck?: boolean;
}

export const WELL_STATUS: Record<WellStatus, StatusStyle> = {
  active: { label: 'В работе', working: true },
  periodic: { label: 'Периодическая эксплуатация', working: true },
  mothballed: { label: 'В консервации', working: false },
  idle: { label: 'В простое', working: false },
  inactive: { label: 'Бездействие', working: false },
  await_liq: { label: 'В ожидании ликвидации', working: false },
  revival: { label: 'В реанимации', working: false },
  liquidated: { label: 'Ликвидированная', working: false, struck: true },
};

/** Порядок в легенде — по убыванию численности фонда. */
export const WELL_STATUS_ORDER: WellStatus[] = [
  'active',
  'mothballed',
  'liquidated',
  'idle',
  'inactive',
  'periodic',
  'await_liq',
  'revival',
];

// ── Продуктивные горизонты ──────────────────────────────────────────────────

export type HorizonGroup = 'm' | 'yu' | 'other';

/**
 * Свита горизонта. Номенклатура настоящая: группа М (М-I-А…М-III) и группа Ю
 * (Ю-I…Ю-VII), плюс альб у водозаборных.
 *
 * Разбор идёт по префиксу, а не по списку значений: в датасете встречается
 * `Ю-II-A` с латинской «A» вперемешку с кириллическими — сверять полные строки
 * с захардкоженным перечнем значит однажды молча потерять 72 скважины.
 */
export function horizonGroup(hor: string | null): HorizonGroup {
  if (!hor) return 'other';
  if (hor.startsWith('М') || hor.startsWith('M')) return 'm';
  if (hor.startsWith('Ю')) return 'yu';
  return 'other';
}

export const HORIZON_GROUP_LABEL: Record<HorizonGroup, string> = {
  m: 'Группа М',
  yu: 'Группа Ю',
  other: 'Прочие',
};

// ── Сети и площадные объекты ────────────────────────────────────────────────

/**
 * Заложение трассы — определяет, как она строится в 3D (ТЗ §4.4.2):
 * подземные идут в траншее с разрезом грунта, надземные — на опорах и
 * эстакадах, воздушные — провисающими пролётами между опорами ВЛ.
 *
 * Источник — `meta.buried_note` датасета, разбор по слоям чертежа.
 */
export type Laying = 'buried' | 'aboveground' | 'overhead' | 'surface';

export interface NetworkStyle {
  label: string;
  color: string;
  /** Толщина линии на плоской схеме, px при ширине вида 1000. */
  width: number;
  /** Штрих для линий, которые не являются трубопроводом. */
  dash?: [number, number];
  /** Подъём над рельефом в 3D, м. Для подземных — отрицательный. */
  lift: number;
  laying: Laying;
}

/**
 * Условная глубина заложения подземных трасс, м.
 *
 * В чертеже глубина не указана ни для одной трассы (`meta.buried_note`).
 * Значение принято по типовой практике промысловых трубопроводов —
 * ниже глубины промерзания — и обязано быть помечено в интерфейсе как
 * условное, наравне с геологической моделью.
 */
export const BURIED_DEPTH = 1.2;

/**
 * Ключ выводится из самого датасета, а не перечисляется руками: если состав
 * сетей в геоданных изменится, несоответствие всплывёт ошибкой компиляции, а не
 * пропавшим слоем на схеме.
 */
export type NetworkKey = keyof FieldNetworks;

export const NETWORK_STYLE: Record<NetworkKey, NetworkStyle> = {
  contour: { label: 'Горизонтали рельефа', color: '#1d2b3d', width: 0.45, lift: 0.4, laying: 'surface' },
  road: { label: 'Дороги', color: '#8a99a8', width: 1.1, lift: 1, laying: 'surface' },
  oil_pipeline: { label: 'Нефтесбор', color: '#f0ae4a', width: 0.85, lift: 2.5, laying: 'buried' },
  water_pipeline: { label: 'Водовод ППД', color: '#5fa8e8', width: 0.85, lift: 2, laying: 'buried' },
  gas_pipeline: { label: 'Газопровод', color: '#35d0c2', width: 0.85, lift: 3, laying: 'buried' },
  gas_overground: {
    label: 'Газопровод надземный',
    color: '#35d0c2',
    width: 1.1,
    lift: 3,
    laying: 'aboveground',
  },
  pipe_rack: { label: 'Эстакады', color: '#c8d2e0', width: 1.2, lift: 4, laying: 'aboveground' },
  power_10kv: {
    label: 'ВЛ-10 кВ',
    color: '#7d8b9e',
    width: 0.6,
    dash: [4, 3],
    lift: 6,
    laying: 'overhead',
  },
  power_04kv: {
    label: 'ВЛ-0,4 кВ',
    color: '#5b697a',
    width: 0.4,
    dash: [2, 3],
    lift: 4,
    laying: 'overhead',
  },
  comm_cable: {
    label: 'Кабель связи',
    color: '#5c6b84',
    width: 0.4,
    dash: [1, 4],
    lift: 1,
    laying: 'buried',
  },
  lv_cable: {
    label: 'Кабель НН',
    color: '#5c6b84',
    width: 0.4,
    dash: [1, 4],
    lift: 1,
    laying: 'buried',
  },
  building: { label: 'Здания', color: '#55677f', width: 0.6, lift: 0.8, laying: 'surface' },
  tank: { label: 'Резервуары', color: '#8fbaf0', width: 0.7, lift: 0.8, laying: 'surface' },
  gzu: { label: 'ГЗУ', color: '#f0ae4a', width: 0.7, lift: 0.8, laying: 'surface' },
  tp: { label: 'ТП / ВРП', color: '#6d7d94', width: 0.55, lift: 0.8, laying: 'surface' },
  manhole: { label: 'Колодцы', color: '#6d7d94', width: 0.5, lift: 0.8, laying: 'surface' },
};

/**
 * Что показывать в легенде схемы: служебная площадная мелочь туда не идёт.
 *
 * Порядок отрисовки здесь намеренно не задаётся — он неотделим от расписания
 * проявления слоёв и живёт единым списком в `fieldPlan.ts`. Два параллельных
 * перечня слоёв разошлись бы при первой же правке.
 */
export const NETWORK_LEGEND: NetworkKey[] = [
  'oil_pipeline',
  'water_pipeline',
  'gas_pipeline',
  'power_10kv',
  'power_04kv',
  'road',
];

// ── Промысловые объекты с настоящими подписями ──────────────────────────────

export interface FacilityStyle {
  label: string;
  /** Расшифровка аббревиатуры для info-панели. */
  full: string;
  color: string;
  /** Ранг важности: определяет размер знака и порог показа подписи. */
  rank: 1 | 2 | 3;
}

export const FACILITY_KIND: Record<FacilityKind, FacilityStyle> = {
  sp: {
    label: 'СП',
    full: 'Сборный пункт',
    color: '#f0ae4a',
    rank: 1,
  },
  kns: {
    label: 'КНС',
    full: 'Кустовая насосная станция ППД',
    color: '#5fa8e8',
    rank: 1,
  },
  gzu: {
    label: 'ГЗУ',
    full: 'Групповая замерная установка',
    color: '#e2c08a',
    rank: 2,
  },
  ktp: {
    label: 'КТП',
    full: 'Комплектная трансформаторная подстанция',
    color: '#a9b8cf',
    rank: 3,
  },
};

/** Факел — единственная точка своего рода, стиль задаётся отдельно. */
export const FLARE_STYLE = { label: 'Факел', color: '#e8674f' };
