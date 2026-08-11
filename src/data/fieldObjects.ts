import type { ModuleId } from './modules';

/**
 * Реестр объектов месторождения — единственный источник правды.
 *
 * Используется тремя потребителями сразу: плоской картой объектов (§3.1 п.5),
 * бейджами модулей над 3D-объектами и info-панелью при клике (§8.3). Один
 * список гарантирует, что карта, сцена и панель не разъедутся между собой.
 *
 * Координаты — те же метрические X/Z, что и в 3D-сцене, поэтому плоская карта
 * топологически совпадает со сценой без отдельной раскладки.
 *
 * Топология и привязка модулей — с карты объектов сценария (`image4.png`) и из
 * отчёта по обследованию (стр. 92).
 */

export type ObjectKind =
  | 'well-pad'
  | 'well'
  | 'pump'
  | 'separation'
  | 'processing'
  | 'chemical'
  | 'power'
  | 'pipeline'
  | 'control';

export interface FieldParam {
  label: string;
  value: string;
  unit?: string;
  /** Прогнозное значение — показывается рядом с фактом, где уместно. */
  forecast?: string;
  tone?: 'plain' | 'ok' | 'warn' | 'risk';
}

export interface FieldObject {
  id: string;
  label: string;
  /** Расшифровка для info-панели. */
  subtitle?: string;
  kind: ObjectKind;
  /** Положение в метрах, X/Z сцены. */
  x: number;
  z: number;
  /** Высота якоря над рельефом для бейджа и наведения камеры, м. */
  anchorY: number;
  modules: ModuleId[];
  params: FieldParam[];
  /** Границы пилота по этому объекту, если заданы отчётом. */
  pilotScope?: string;
  /**
   * Смещение подписи на плоской карте. Часть объектов стоит вплотную
   * (СП и напорный нефтепровод, ЦППН и факел), подпись по умолчанию сверху
   * у них наезжает на соседнюю.
   */
  labelDy?: number;
}

export const FIELD_OBJECTS: FieldObject[] = [
  {
    id: 's-pad-1',
    label: 'Нефтяной фонд · куст 1',
    subtitle: 'Кустовая площадка, ШГН и УЭВН',
    kind: 'well-pad',
    x: 180,
    z: -120,
    anchorY: 30,
    modules: ['abaiTr', 'abaiPdim', 'abaiPgno', 'digitalTwin'],
    pilotScope: 'ШГН, УЭВН — не более 30 скважин на весь фонд',
    params: [
      { label: 'Дебит нефти', value: '2 454', unit: 'т/сут' },
      { label: 'Дебит жидкости', value: '6 822', unit: 'м³/сут' },
      { label: 'Обводнённость', value: '64,0', unit: '%', tone: 'warn' },
      { label: 'Устьевое давление', value: '0,38', unit: 'МПа' },
      { label: 'Действующий фонд', value: '18', unit: 'скв.' },
    ],
  },
  {
    id: 's-pad-2',
    label: 'Нефтяной фонд · куст 2',
    subtitle: 'Кустовая площадка, ШГН',
    kind: 'well-pad',
    x: 420,
    z: 160,
    anchorY: 30,
    modules: ['abaiTr', 'abaiPgno', 'digitalTwin', 'wwo'],
    params: [
      { label: 'Дебит нефти', value: '1 946', unit: 'т/сут' },
      { label: 'Дебит жидкости', value: '7 095', unit: 'м³/сут' },
      { label: 'Обводнённость', value: '72,6', unit: '%', tone: 'risk' },
      { label: 'Устьевое давление', value: '0,63', unit: 'МПа' },
      { label: 'Действующий фонд', value: '12', unit: 'скв.' },
    ],
  },
  {
    id: 's-kp',
    label: 'Кустовые площадки · 5 КП',
    subtitle: 'Ветка системы нефтесбора — периметр пилота',
    kind: 'well-pad',
    x: -430,
    z: -250,
    anchorY: 34,
    modules: ['infraplan', 'digitalTwin'],
    pilotScope: 'ветка нефтесбора из 5 КП · ветка ВЛ из 5 КП',
    params: [
      { label: 'Суммарный отбор', value: '3 108', unit: 'м³/сут' },
      { label: 'Давление в начале', value: '7,2', unit: 'атм' },
      { label: 'Давление в конце', value: '17,4', unit: 'атм' },
      { label: 'Загрузка системы сбора', value: '68', unit: '%', forecast: '81 % с ГТМ' },
    ],
  },
  {
    id: 's-mfns',
    label: 'МФНС',
    subtitle: 'Многофазная насосная станция',
    kind: 'pump',
    x: 100,
    z: -20,
    anchorY: 46,
    modules: ['infraplan', 'digitalTwin'],
    params: [
      { label: 'Расход жидкости', value: '6 822', unit: 'м³/сут' },
      { label: 'Давление на приёме', value: '0,38', unit: 'МПа' },
      { label: 'Давление на выкиде', value: '1,30', unit: 'МПа' },
      { label: 'Насосных агрегатов', value: '3', unit: 'шт.' },
    ],
  },
  {
    id: 's-sp',
    label: 'СП «В-Молдабек»',
    subtitle: 'Сепарационный пункт, узел замера',
    kind: 'separation',
    x: 320,
    z: -40,
    anchorY: 52,
    modules: ['digitalTwin', 'infraplan'],
    params: [
      { label: 'Давление сепарации', value: '1,30', unit: 'МПа' },
      { label: 'Температура', value: '28,4', unit: '°C' },
      { label: 'Сепараторов', value: '2', unit: 'шт.' },
      { label: 'Точность узла замера', value: '±2,5', unit: '%' },
    ],
  },
  {
    id: 's-napor',
    label: 'Напорный нефтепровод',
    subtitle: 'СП «В-Молдабек» → ЦППН «Кенбай», участок УЗ 25/1 — уз. 19А.1',
    kind: 'pipeline',
    x: 460,
    z: -50,
    anchorY: 22,
    labelDy: 20,
    modules: ['digitalTwinPipe'],
    pilotScope: '1 напорный нефтепровод',
    params: [
      { label: 'Протяжённость', value: '2 699', unit: 'м' },
      { label: 'Критических дефектов', value: '6', unit: 'шт.', tone: 'risk' },
      { label: 'Остаточный ресурс', value: '0,2', unit: 'лет', tone: 'risk' },
      { label: 'Мин. толщина стенки', value: '5,51', unit: 'мм', tone: 'warn' },
      { label: 'Скорость коррозии', value: '0,09', unit: 'мм/год' },
      { label: 'Рабочее давление', value: '8,99', unit: 'атм' },
    ],
  },
  {
    id: 's-cppn',
    label: 'ЦППН «Кенбай»',
    subtitle: 'Центральный пункт подготовки нефти',
    kind: 'processing',
    x: 620,
    z: -60,
    anchorY: 92,
    modules: ['digitalTwin', 'infraplan'],
    pilotScope: '1 объект подготовки',
    params: [
      { label: 'Приём нефти', value: '4 400', unit: 'т/сут', forecast: 'проект 5 160' },
      { label: 'Загрузка', value: '85', unit: '%', tone: 'warn' },
      { label: 'Резервуарный парк', value: '4 × РВС-5000', unit: '' },
      { label: 'Заполнение парка', value: '78', unit: '%' },
      { label: 'Температура подготовки', value: '54', unit: '°C' },
    ],
  },
  {
    id: 's-flare',
    label: 'Факельная установка',
    subtitle: 'ЦППН «Кенбай»',
    kind: 'processing',
    x: 700,
    z: -210,
    anchorY: 46,
    modules: ['digitalTwin'],
    params: [
      { label: 'Расход на факел', value: '0,101', unit: 'т.м³/ч' },
      { label: 'Высота ствола', value: '40', unit: 'м' },
    ],
  },
  {
    id: 's-brh',
    label: 'БРХ',
    subtitle: 'Блок реагентного хозяйства, узлы дозирования УДР',
    kind: 'chemical',
    x: 240,
    z: 120,
    anchorY: 40,
    labelDy: 22,
    modules: ['digitalTwin'],
    params: [
      { label: 'Подача реагента', value: '530', unit: 'л/сут', tone: 'warn' },
      { label: 'Норма дозировки', value: '610', unit: 'л/сут' },
      { label: 'Точек подачи', value: '3', unit: 'шт.' },
      { label: 'Дефицит химии', value: 'выявлен', unit: '', tone: 'risk' },
    ],
  },
  {
    id: 's-kns',
    label: 'КНС ППД',
    subtitle: 'Кустовая насосная станция, ЦНС с резервом',
    kind: 'pump',
    x: -360,
    z: 220,
    anchorY: 46,
    modules: ['abaiUz', 'digitalTwin'],
    pilotScope: 'только ЦНС с учётом резерва · профиль-дизайны по одной КНС',
    params: [
      { label: 'Закачка', value: '9 240', unit: 'м³/сут', forecast: 'план 9 800' },
      { label: 'Давление на выкиде', value: '1,79', unit: 'МПа' },
      { label: 'Агрегатов в работе', value: '3 из 4', unit: '' },
      { label: 'Износ насосов по QH', value: '12', unit: '%', tone: 'warn' },
      { label: 'Неэффективная закачка', value: '640', unit: 'м³/сут', tone: 'risk' },
    ],
  },
  {
    id: 'w-inj-1',
    label: 'Скважина ППД Н-1',
    subtitle: 'Нагнетательная, поддержание пластового давления',
    kind: 'well',
    x: -280,
    z: 80,
    anchorY: 18,
    modules: ['abaiUz', 'digitalTwin'],
    params: [
      { label: 'Приёмистость', value: '1 207', unit: 'м³/сут' },
      { label: 'Устьевое давление', value: '16,4', unit: 'МПа' },
      { label: 'Забойное давление', value: '24,1', unit: 'МПа' },
      { label: 'Интервал перфорации', value: '540–596', unit: 'м' },
    ],
  },
  {
    id: 's-ps',
    label: 'Подстанция',
    subtitle: 'Питание промысла, головной узел ВЛ',
    kind: 'power',
    x: -140,
    z: 320,
    anchorY: 44,
    modules: ['infraplan'],
    params: [
      { label: 'Потребляемая мощность', value: '6,3', unit: 'МВт' },
      { label: 'Трансформаторов', value: '2', unit: 'шт.' },
      { label: 'Загрузка', value: '71', unit: '%' },
    ],
  },
  {
    id: 's-vl',
    label: 'ВЛ · ветка 5 КП',
    subtitle: 'Воздушная линия, 12 опор',
    kind: 'power',
    // Якорь вынесен на середину трассы: на площадке КП он совпадал с кустами
    // и подписи накладывались одна на другую.
    x: -545,
    z: -60,
    anchorY: 70,
    modules: ['infraplan'],
    pilotScope: 'ветка ВЛ из 5 КП',
    params: [
      { label: 'Протяжённость', value: '11,4', unit: 'км' },
      { label: 'Опор', value: '12', unit: 'шт.' },
      { label: 'Потери в сети', value: '4,2', unit: '%', tone: 'warn' },
    ],
  },
  {
    id: 's-cio',
    label: 'ЦИО',
    subtitle: 'Центр интегрированных операций',
    kind: 'control',
    x: 200,
    z: -440,
    anchorY: 38,
    modules: ['nedraData', 'smartField'],
    params: [
      { label: 'Источников телеметрии', value: '7', unit: 'узлов' },
      { label: 'Частота опроса', value: '30', unit: 'с' },
    ],
  },
];

/**
 * Фонд скважин. Координаты и типы совпадают с `WELLS` в геологии сцены —
 * иначе клик наводился бы на пустое место рядом со стволом.
 * Набор параметров по §8.3: дебит, обводнённость, давление, температура.
 */
const WELL_OBJECTS: FieldObject[] = [
  {
    id: 'w-prod-1',
    label: 'Добывающая Д-1',
    subtitle: 'ШГН, станок-качалка',
    kind: 'well',
    x: 180,
    z: -120,
    anchorY: 12,
    modules: ['abaiTr', 'abaiPgno', 'digitalTwin'],
    params: [
      { label: 'Дебит нефти', value: '18,4', unit: 'т/сут' },
      { label: 'Дебит жидкости', value: '52,1', unit: 'м³/сут' },
      { label: 'Обводнённость', value: '64,7', unit: '%', tone: 'warn', forecast: '61,2 % после ГТМ' },
      { label: 'Забойное давление', value: '6,2', unit: 'МПа' },
      { label: 'Температура', value: '38,6', unit: '°C' },
      { label: 'Наработка на отказ', value: '412', unit: 'сут' },
      { label: 'Глубина спуска ГНО', value: '470', unit: 'м' },
    ],
  },
  {
    id: 'w-prod-2',
    label: 'Добывающая Д-2',
    subtitle: 'УЭВН, электроцентробежный насос',
    kind: 'well',
    x: 420,
    z: 160,
    anchorY: 10,
    modules: ['abaiTr', 'abaiPgno', 'digitalTwin', 'infraplan'],
    params: [
      { label: 'Дебит нефти', value: '31,7', unit: 'т/сут' },
      { label: 'Дебит жидкости', value: '104,3', unit: 'м³/сут' },
      { label: 'Обводнённость', value: '69,6', unit: '%', tone: 'warn' },
      { label: 'Забойное давление', value: '5,8', unit: 'МПа' },
      { label: 'Температура', value: '41,2', unit: '°C' },
      { label: 'Потребление ЭЭ', value: '38,4', unit: 'кВт·ч/т', tone: 'warn' },
    ],
  },
  {
    id: 'w-prod-3',
    label: 'Горизонтальная Д-3',
    subtitle: 'Кандидат на бурение по результатам NUMEX',
    kind: 'well',
    x: 60,
    z: 300,
    anchorY: 10,
    modules: ['numex', 'abaiCrns', 'abaiPdim'],
    params: [
      { label: 'Длина горизонтального участка', value: '460', unit: 'м' },
      { label: 'Прогнозный дебит', value: '46,0', unit: 'т/сут', tone: 'ok' },
      { label: 'Объект', value: 'пятый Юрский', unit: '' },
      { label: 'Статус', value: 'намечена к бурению', unit: '' },
    ],
  },
  {
    id: 'w-prod-4',
    label: 'Добывающая Д-4',
    subtitle: 'После ГРП',
    kind: 'well',
    x: 300,
    z: -340,
    anchorY: 10,
    modules: ['abaiPaegtm', 'digitalTwin'],
    params: [
      { label: 'Дебит нефти', value: '27,2', unit: 'т/сут' },
      { label: 'Обводнённость', value: '58,1', unit: '%' },
      { label: 'Полудлина трещины', value: '95', unit: 'м' },
      { label: 'Прирост после ГРП', value: '+11,8', unit: 'т/сут', tone: 'ok' },
    ],
  },
  {
    id: 'w-inj-2',
    label: 'Нагнетательная Н-2',
    subtitle: 'Поддержание пластового давления',
    kind: 'well',
    x: -120,
    z: -320,
    anchorY: 10,
    modules: ['abaiUz', 'digitalTwin', 'numexOptimize'],
    params: [
      { label: 'Приёмистость', value: '986', unit: 'м³/сут' },
      { label: 'Устьевое давление', value: '15,1', unit: 'МПа' },
      { label: 'Неэффективная закачка', value: '148', unit: 'м³/сут', tone: 'warn' },
    ],
  },
  {
    id: 'w-drill',
    label: 'Бурящаяся Б-1',
    subtitle: 'Строительство скважины, онлайн-мониторинг',
    kind: 'well',
    x: -520,
    z: -140,
    anchorY: 42,
    modules: ['rtm'],
    params: [
      { label: 'Глубина забоя', value: '3 761', unit: 'м' },
      { label: 'Глубина долота', value: '3 790', unit: 'м' },
      { label: 'Мех. скорость', value: '19,2', unit: 'м/ч' },
      { label: 'Вес на крюке', value: '110,5', unit: 'т', tone: 'warn' },
      { label: 'Давление на входе', value: '162,1', unit: 'атм' },
    ],
  },
  {
    id: 'w-workover',
    label: 'ПРС · подъёмник',
    subtitle: 'Текущий ремонт, бригада с датчиком ДЭЛ',
    kind: 'well',
    x: 520,
    z: -220,
    anchorY: 24,
    modules: ['wwo'],
    pilotScope: '3 бригады ПРС, оснащённые ДЭЛ',
    params: [
      { label: 'Этап', value: 'смена ГНО', unit: '' },
      { label: 'Плановая длительность', value: '4,5', unit: 'сут' },
      { label: 'Прошло', value: '2,1', unit: 'сут' },
      { label: 'Нагрузка по ДЭЛ', value: '8,4', unit: 'т' },
    ],
  },
];

FIELD_OBJECTS.push(...WELL_OBJECTS);

export const OBJECT_BY_ID = new Map(FIELD_OBJECTS.map((o) => [o.id, o]));

/**
 * Связи между объектами: направление потока и среда.
 * Совпадают с трассировкой трубопроводов в 3D-сцене.
 */
export const FIELD_LINKS: { from: string; to: string; medium: 'oil' | 'water' | 'chem' | 'power' }[] =
  [
    { from: 's-pad-1', to: 's-mfns', medium: 'oil' },
    { from: 's-pad-2', to: 's-mfns', medium: 'oil' },
    { from: 's-kp', to: 's-mfns', medium: 'oil' },
    { from: 's-mfns', to: 's-sp', medium: 'oil' },
    { from: 's-sp', to: 's-napor', medium: 'oil' },
    { from: 's-napor', to: 's-cppn', medium: 'oil' },
    { from: 's-cppn', to: 's-flare', medium: 'oil' },
    { from: 's-kns', to: 'w-inj-1', medium: 'water' },
    { from: 's-brh', to: 's-pad-1', medium: 'chem' },
    { from: 's-brh', to: 's-sp', medium: 'chem' },
    { from: 's-ps', to: 's-vl', medium: 'power' },
    { from: 's-vl', to: 's-kns', medium: 'power' },
  ];
