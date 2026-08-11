import type { ModuleId } from '../modules';
import type { NetworkKey } from '../geo/fieldStyle';
import type { FacilityKind, WellCategory, WellStatus, WellType } from '../geo/fieldData';

/**
 * Полный цикл добычи — сквозная цепочка от пласта до товарной нефти (ТЗ §4.4).
 *
 * Ключевое архитектурное решение: **шаг не хранит координат**. Он несёт правило
 * поиска своих объектов в датасете — «все ГЗУ», «все трассы нефтесбора», «все
 * работающие нефтяные скважины». Координаты подставляются на этапе разрешения
 * якоря из загруженных геоданных.
 *
 * Так сделано не ради красоты. §4.4.1 требует, чтобы цепочка была построена на
 * фактических объектах, а не на выдуманном составе промысла. При хранении
 * координат в шаге это требование держалось бы на дисциплине автора: никто не
 * мешает вписать «СП» в произвольную точку. При хранении правила поиска
 * выдумать объект технически невозможно — если его нет в данных, якорь не
 * разрешается и шаг остаётся видимо пустым.
 */

// ── Нитки цепочки ───────────────────────────────────────────────────────────

export type CycleLine = 'oil' | 'ppd' | 'gas' | 'power' | 'construction';

export interface LineMeta {
  label: string;
  /** Цвет среды: нефть — янтарь, вода ППД — синий, газ — бирюза (§8.1). */
  color: string;
}

export const CYCLE_LINE: Record<CycleLine, LineMeta> = {
  oil: { label: 'Нефть', color: '#f0ae4a' },
  ppd: { label: 'ППД', color: '#5fa8e8' },
  gas: { label: 'Газ', color: '#35d0c2' },
  power: { label: 'Энергетика', color: '#a9b8cf' },
  construction: { label: 'Строительство скважин', color: '#8fbaf0' },
};

// ── Якоря: как найти объекты шага в датасете ────────────────────────────────

export type AnchorSpec =
  /** Промысловые объекты с настоящими подписями: ГЗУ, КНС, СП, КТП. */
  | { source: 'facility'; kind: FacilityKind; name?: string }
  /** Выборка фонда по фактическим полям реестра. */
  | { source: 'wells'; cat?: WellCategory; st?: WellStatus; type?: WellType; hor?: string }
  /** Трассы сети целиком. */
  | { source: 'network'; key: NetworkKey }
  /** Узлы сбора (кусты). */
  | { source: 'hubs' }
  /** Точечные объекты — факел, опоры, колодцы. */
  | { source: 'points'; key: 'flare' | 'pipe_support' | 'power_pole_10kv' | 'manhole' }
  /** Объект за границами съёмки — показывается выносом. */
  | { source: 'external'; id: string }
  /** Недра: горизонт или интервал. Координат на поверхности не имеет. */
  | { source: 'subsurface'; horizon?: string };

// ── Шаг ─────────────────────────────────────────────────────────────────────

/**
 * Привязка модуля к элементу цикла (§4.4.3).
 *
 * `role` несёт подмодуль там, где продукт один, а функций несколько:
 * DIGITAL TWIN отвечает и за трубопроводы, и за КНС, и за химизацию. Заводить
 * под каждую функцию отдельный `ModuleId` было бы враньём о составе продуктов.
 */
export interface ModuleBinding {
  id: ModuleId;
  role?: string;
}

export interface CycleStep {
  id: string;
  line: CycleLine;
  /** Заголовок шага — он же подпись на индикаторе цепочки. */
  title: string;
  /** Что происходит с флюидом на этом переделе. */
  body: string;
  anchor: AnchorSpec;
  /** Что анимируется — читает сцена. */
  animation: string;
  modules: ModuleBinding[];
  /**
   * Узел сквозного индикатора «где сейчас флюид» (§4.4.6). Задан только у
   * шагов основной нитки: индикатор показывает путь нефти, а не все пять ниток
   * сразу — иначе он перестаёт читаться с двадцати метров зала.
   */
  track?: string;
}

// ── Основная нитка: нефть ───────────────────────────────────────────────────

const OIL: CycleStep[] = [
  {
    id: 'oil-reservoir',
    line: 'oil',
    title: 'Пласт',
    body: 'Десять продуктивных горизонтов: меловые М-I-А/Б/В, М-II, М-III и юрские Ю-I…Ю-VII. Приток к забою идёт из тонких нефтенасыщенных прослоев толщиной от 0,8 до 8,9 м.',
    anchor: { source: 'subsurface' },
    animation: 'inflow',
    modules: [
      { id: 'tNavigator', role: 'ГГДМ' },
      { id: 'abaiKp', role: 'Картопостроитель' },
    ],
    track: 'Пласт',
  },
  {
    id: 'oil-strategy',
    line: 'oil',
    title: 'Стратегия разработки',
    body: 'Серийные расчёты по упрощённой модели: где остались неохваченные бурением области и куда ставить новые скважины.',
    anchor: { source: 'subsurface' },
    animation: 'candidates',
    modules: [
      { id: 'numex' },
      { id: 'abaiCrns', role: 'ЦРНС' },
    ],
  },
  {
    id: 'oil-well',
    line: 'oil',
    title: 'Скважина',
    body: 'Подъём флюида по НКТ. Фонд вертикальный почти целиком — 1079 из 1101; горизонтальных 22. Привод механизированной добычи — станок-качалка или УЭЦН.',
    anchor: { source: 'wells', cat: 'oil', st: 'active' },
    animation: 'lift',
    modules: [
      { id: 'abaiTr', role: 'Технологический режим' },
      { id: 'digitalTwin', role: 'Потенциал добычи' },
    ],
    track: 'Скважина',
  },
  {
    id: 'oil-wellhead',
    line: 'oil',
    title: 'Устье',
    body: 'Устьевая арматура и выкидная линия. Отсюда продукция скважины идёт на замер.',
    anchor: { source: 'wells', cat: 'oil', st: 'active' },
    animation: 'flow-to-gzu',
    modules: [{ id: 'abaiPgno', role: 'Подбор ГНО' }],
  },
  {
    id: 'oil-gzu',
    line: 'oil',
    title: 'ГЗУ · замер',
    body: 'Сорок одна групповая замерная установка — ГЗУ-1…ГЗУ-52, включая спаренные. Скважины поочерёдно переключаются на замерный сепаратор.',
    anchor: { source: 'facility', kind: 'gzu' },
    animation: 'metering',
    modules: [
      { id: 'abaiPdim', role: 'Дебиты и план добычи' },
      { id: 'digitalTwin' },
    ],
    track: 'ГЗУ',
  },
  {
    id: 'oil-gathering',
    line: 'oil',
    title: 'Нефтесборный коллектор',
    body: 'Шестьсот сорок девять фактических трасс нефтесбора, преимущественно подземных. Звездообразный рисунок кустов сходится на восток.',
    anchor: { source: 'network', key: 'oil_pipeline' },
    animation: 'flow-oil',
    modules: [
      { id: 'infraplan', role: 'Гидравлика сети сбора' },
      { id: 'digitalTwinPipe', role: 'Трубопроводы' },
    ],
    track: 'Коллектор',
  },
  {
    id: 'oil-sp',
    line: 'oil',
    title: 'Сборный пункт',
    body: 'СП «Молдабек», СП-16 и Мини СП N43. Сепарация продукции на нефть, воду и попутный газ.',
    anchor: { source: 'facility', kind: 'sp' },
    animation: 'separation',
    modules: [{ id: 'digitalTwin', role: 'Подготовка' }],
    track: 'СП',
  },
  {
    id: 'oil-trunk',
    line: 'oil',
    title: 'Напорный нефтепровод',
    body: 'Выход за границу участка. Целостность и остаточный ресурс стенки прогнозируются по машинному обучению — аварийный участок ищется до отказа, а не после.',
    anchor: { source: 'external', id: 's-cppn' },
    animation: 'flow-trunk',
    modules: [{ id: 'digitalTwinPipe', role: 'Трубопроводы · ML-прогноз' }],
    track: 'Напорный',
  },
  {
    id: 'oil-cppn',
    line: 'oil',
    title: 'ЦППН «Кенбай»',
    body: 'Подготовка нефти до товарной кондиции. Площадка находится за пределами топоплана — показана внешним узлом, а не выдуманным местом внутри участка.',
    anchor: { source: 'external', id: 's-cppn' },
    animation: 'treatment',
    modules: [
      { id: 'digitalTwin', role: 'Подготовка' },
      { id: 'digitalTwin', role: 'Экономика' },
    ],
    track: 'ЦППН',
  },
];

// ── Нитка ППД ───────────────────────────────────────────────────────────────

const PPD: CycleStep[] = [
  {
    id: 'ppd-intake',
    line: 'ppd',
    title: 'Водозабор',
    body: 'Шесть водозаборных скважин на альбском горизонте — единственный водоносный горизонт разреза выше продуктивной толщи.',
    anchor: { source: 'wells', cat: 'water' },
    animation: 'water-lift',
    modules: [{ id: 'abaiDb', role: 'База данных' }],
  },
  {
    id: 'ppd-kns',
    line: 'ppd',
    title: 'КНС',
    body: 'Три кустовые насосные станции — КНС-2, КНС-3, КНС-4. Насосы ЦНС поднимают давление до нагнетательного.',
    anchor: { source: 'facility', kind: 'kns' },
    animation: 'pumping',
    modules: [{ id: 'digitalTwin', role: 'КНС и ППД' }],
  },
  {
    id: 'ppd-waterline',
    line: 'ppd',
    title: 'Водоводы',
    body: 'Сто сорок две фактические трассы водоводов от КНС к нагнетательному фонду.',
    anchor: { source: 'network', key: 'water_pipeline' },
    animation: 'flow-water',
    modules: [{ id: 'infraplan', role: 'Гидравлика ППД' }],
  },
  {
    id: 'ppd-injector',
    line: 'ppd',
    title: 'Нагнетательные скважины',
    body: 'Двести десять нагнетательных из 1101 — доля, характерная для высоковязкой нефти: без поддержания давления такая залежь быстро теряет отдачу.',
    anchor: { source: 'wells', cat: 'inj', st: 'active' },
    animation: 'injection',
    modules: [
      { id: 'abaiUz', role: 'Управление заводнением' },
      { id: 'digitalTwin', role: 'КНС и ППД' },
    ],
  },
  {
    id: 'ppd-flood',
    line: 'ppd',
    title: 'Фронт заводнения',
    body: 'Вытеснение нефти к добывающим скважинам. Режим закачки по каждой нагнетательной подбирается серийными оптимизационными расчётами.',
    anchor: { source: 'subsurface' },
    animation: 'flood-front',
    modules: [
      { id: 'numexOptimize' },
      { id: 'abaiUz', role: 'Управление заводнением' },
    ],
  },
];

// ── Нитка газа ──────────────────────────────────────────────────────────────

const GAS: CycleStep[] = [
  {
    id: 'gas-sep',
    line: 'gas',
    title: 'Отделение газа',
    body: 'Попутный нефтяной газ отделяется на сборном пункте вместе с водой.',
    anchor: { source: 'facility', kind: 'sp' },
    animation: 'gas-split',
    modules: [{ id: 'digitalTwin', role: 'Подготовка' }],
  },
  {
    id: 'gas-line',
    line: 'gas',
    title: 'Газопровод',
    body: 'Сорок трасс, из них один надземный участок — единственный в чертеже, проложен по опорам.',
    anchor: { source: 'network', key: 'gas_pipeline' },
    animation: 'flow-gas',
    modules: [{ id: 'digitalTwinPipe', role: 'Трубопроводы' }],
  },
  {
    id: 'gas-flare',
    line: 'gas',
    title: 'Факел',
    body: 'Факельная установка в фактической точке чертежа, рядом с СП «Молдабек».',
    anchor: { source: 'points', key: 'flare' },
    animation: 'flare',
    modules: [{ id: 'infraplan', role: 'Энергетика' }],
  },
];

// ── Нитка энергетики ────────────────────────────────────────────────────────

const POWER: CycleStep[] = [
  {
    id: 'pwr-substation',
    line: 'power',
    title: 'Питающая подстанция',
    body: 'Точка внешнего электроснабжения промысла. В границы топоплана не попала — показана внешним узлом.',
    anchor: { source: 'external', id: 's-ps' },
    animation: 'power-source',
    modules: [{ id: 'infraplan', role: 'Энергетика' }],
  },
  {
    id: 'pwr-ol10',
    line: 'power',
    title: 'ВЛ-10 кВ',
    body: 'Восемьдесят четыре трассы на 2877 фактических опорах — самый массовый объект промысла после фонда скважин.',
    anchor: { source: 'network', key: 'power_10kv' },
    animation: 'power-pulse',
    modules: [{ id: 'infraplan', role: 'Энергетика' }],
  },
  {
    id: 'pwr-ktp',
    line: 'power',
    title: 'КТП',
    body: 'Десять комплектных трансформаторных подстанций понижают напряжение до 0,4 кВ.',
    anchor: { source: 'facility', kind: 'ktp' },
    animation: 'transform',
    modules: [{ id: 'infraplan', role: 'Энергетика' }],
  },
  {
    id: 'pwr-ol04',
    line: 'power',
    title: 'ВЛ-0,4 кВ · приводы',
    body: 'Триста пятьдесят пять трасс низкого напряжения до приводов станков-качалок, УЭЦН и насосов КНС.',
    anchor: { source: 'network', key: 'power_04kv' },
    animation: 'power-pulse',
    modules: [
      { id: 'infraplan', role: 'Энергетика' },
      { id: 'digitalTwin', role: 'Экономика' },
    ],
  },
];

// ── Нитка строительства скважин ─────────────────────────────────────────────

const CONSTRUCTION: CycleStep[] = [
  {
    id: 'bld-rig',
    line: 'construction',
    title: 'Бурение',
    body: 'Буровая установка: вышка, кронблок, талевый блок, ротор, мостки. Параметры режима контролируются в реальном времени, отклонения — до аварии.',
    anchor: { source: 'wells', cat: 'oil', st: 'idle' },
    animation: 'drilling',
    modules: [{ id: 'rtm' }],
  },
  {
    id: 'bld-workover',
    line: 'construction',
    title: 'ТКРС',
    body: 'Агрегат А-50 с выложенными НКТ. График ремонтов, пересечения бригад и суточная отчётность ведутся в единой среде.',
    anchor: { source: 'wells', cat: 'oil', st: 'inactive' },
    animation: 'workover',
    modules: [
      { id: 'wwo' },
      { id: 'sapToro', role: 'СТПА' },
    ],
  },
];

export const CYCLE_STEPS: CycleStep[] = [...OIL, ...PPD, ...GAS, ...POWER, ...CONSTRUCTION];

export const STEP_BY_ID = new Map(CYCLE_STEPS.map((s) => [s.id, s]));

/**
 * Узлы сквозного индикатора — путь нефти (§4.4.6). Собирается из самих шагов,
 * а не перечисляется отдельно: список, который можно забыть обновить вслед за
 * цепочкой, хуже отсутствующего.
 */
export const OIL_TRACK = OIL.filter((s) => s.track).map((s) => ({
  id: s.id,
  label: s.track as string,
}));
