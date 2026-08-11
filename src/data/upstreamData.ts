/**
 * Блоки 1 и 2 сценария — целевой образ и процесс UPSTREAM.
 *
 * Источники: мастер-архитектура ЦД Актива (`image1.png`), цепочка создания
 * ценности и реестр ИТ-ландшафта (`image2.png`, `image3.png`) из сценария,
 * презентация для АТК V6 (слайды 4, 7) и отчёт по обследованию.
 */

import type { ModuleId } from './modules';

// ── Целевой образ: четыре контура ЦД Актива ─────────────────────────────────

export interface TwinContour {
  no: string;
  name: string;
  claim: string;
  /** Ожидаемые эффекты — из слайда 7 презентации для АТК. */
  effects: { value: string; label: string }[];
  blocks: { title: string; items: string[]; modules: ModuleId[] }[];
  /** Контур ресурсной базы вынесен в 2027 год и показывается приглушённым. */
  future?: boolean;
  /**
   * Раздел, в который проваливается клик по контуру.
   *
   * Связь по идентификатору, а не по порядку в списке: колонки на экране и
   * разделы — разные списки, и совпадение их порядка держалось бы на удаче.
   */
  dive?: string;
}

export const CONTOURS: TwinContour[] = [
  {
    no: '—',
    name: 'ЦД ресурсной базы',
    dive: 'base',
    claim: 'Цифровая геологическая модель, восполняемость и конверсия запасов',
    effects: [{ value: '−15%', label: 'полный цикл ГРР' }],
    future: true,
    blocks: [
      {
        title: 'Интерпретация и геологическое моделирование',
        items: ['Сейсморазведка и обработка данных', 'Построение геологических моделей'],
        modules: ['tNavigator'],
      },
    ],
  },
  {
    no: '1',
    name: 'ЦД пласта',
    dive: 'plast',
    claim: 'Цифровая гидродинамическая модель и приоритизация ГТМ по экономике',
    effects: [{ value: '−5%', label: 'снижение CAPEX' }],
    blocks: [
      {
        title: 'Геолого-гидродинамическая модель',
        items: ['Построение и адаптация ГГДМ', 'Модели ХВ и Кпрод по скважине'],
        modules: ['abaiKp', 'tNavigator'],
      },
      {
        title: 'Стратегия разработки и подбор мероприятий',
        items: ['Оптимизация ППД, включая нестационарное заводнение', 'ПВЛГ/ПНЛГ, ГТМ'],
        modules: ['abaiUz', 'abaiPaegtm', 'numex', 'numexOptimize'],
      },
      {
        title: 'Проектирование разработки, ВНС, ТЭО КИН',
        items: [
          'Автовыбор системы разработки на 2.5D/3D',
          'Оптимизация размещения фонда и заканчивания ГС/МГРП',
          'Ранжирование точек бурения',
        ],
        modules: ['abaiCrns', 'abaiPdim', 'numex'],
      },
    ],
  },
  {
    no: '2',
    name: 'ЦД скважины',
    dive: 'skv',
    claim: 'Сквозное планирование ТКРС и снижение простоев бригад',
    effects: [{ value: '−3%', label: 'сроки вывода на режим' }],
    blocks: [
      {
        title: 'Онлайн-мониторинг бурения и сводки',
        items: ['Мониторинг строительства скважин', 'Совместная работа подрядчика и заказчика'],
        modules: ['rtm'],
      },
      {
        title: 'Планирование и анализ внутрискважинных работ',
        items: ['Формирование графика ГТМ', 'Выявление пересечений движения бригад'],
        modules: ['wwo'],
      },
      {
        title: 'СТПА',
        items: ['Интеграция с датчиками СТПА', 'Оперативный контроль ремонта'],
        modules: ['wwo'],
      },
    ],
  },
  {
    no: '3',
    name: 'ЦД добычи и наземной инфраструктуры',
    dive: 'dob',
    claim:
      'Оптимальное управление режимом фонда, минимизация потерь добычи за счёт предиктивной аналитики отказов',
    effects: [
      { value: '−13%', label: 'ТРЗ на отклонениях режима' },
      { value: '−15%', label: 'ТРЗ на расчёты и ГТМ' },
      { value: '−5%', label: 'управляемые потери добычи' },
      { value: '−3%', label: 'энергозатраты инфраструктуры' },
      { value: '−3%', label: 'CAPEX/OPEX инфраструктуры' },
    ],
    blocks: [
      {
        title: 'Скважины',
        items: ['Прогноз и контроль показателей добычи', 'Выявление отклонений режима'],
        modules: ['abaiTr', 'abaiPgno', 'digitalTwin'],
      },
      {
        title: 'КНС и ППД · Экономика',
        items: ['Оценка износа насосов', 'Подбор низкорентабельных скважин под остановку'],
        modules: ['abaiUz', 'digitalTwin'],
      },
      {
        title: 'Трубопроводы · Предиктивный анализ отказов',
        items: ['Онлайн-контроль параметров системы', 'Поиск аварийных участков напорного (ML)'],
        modules: ['digitalTwinPipe'],
      },
      {
        title: 'Гидравлика · Энергетика · Подготовка',
        items: ['Загрузка системы сбора и ППД', 'Расчёт электрических сетей', 'Мнемосхема подготовки'],
        modules: ['infraplan', 'digitalTwin'],
      },
    ],
  },
];

// ── Цепочка создания ценности ───────────────────────────────────────────────

export const UPSTREAM_CHAIN = [
  { id: 'grr', name: 'Геология и геологоразведка', handoff: 'коммерчески извлекаемые запасы' },
  { id: 'dev', name: 'Разработка месторождений', handoff: 'стратегия разработки' },
  { id: 'drill', name: 'Бурение и ВСР', handoff: 'ввод новых мощностей' },
  { id: 'prod', name: 'Добыча', handoff: 'управление добычей' },
  { id: 'infra', name: 'КС и наземная инфраструктура', handoff: 'проектирование новых мощностей' },
];

/**
 * ИТ-ландшафт по этапам — «лоскутное одеяло» из реестра сценария.
 * `own` помечает системы КМГ (ABAI), остальное — сторонние и офисные.
 */
export const IT_LANDSCAPE: { stage: string; systems: { name: string; own?: boolean }[] }[] = [
  {
    stage: 'Геология и ГРР',
    systems: [
      { name: 'Petrel' }, { name: 'Techlog' }, { name: 'tNavigator' }, { name: 'Peloton' },
      { name: 'PVTi' }, { name: 'PVTSim' }, { name: 'ProSource' }, { name: 'Kingdom' },
      { name: 'GeoGraphix' }, { name: 'Hampson Russel' }, { name: 'Spark 1.5' },
      { name: 'ГеоПоиск' }, { name: 'Жулдыз' }, { name: 'ABP+' },
      { name: 'ABAI (БД)', own: true }, { name: 'Excel' }, { name: 'Outlook' },
    ],
  },
  {
    stage: 'Разработка',
    systems: [
      { name: 'Petrel' }, { name: 'tNavigator' }, { name: 'Eclipse' }, { name: 'OFM' },
      { name: 'Жулдыз' }, { name: 'ABAI (УЗ)', own: true }, { name: 'ABAI (ТР)', own: true },
      { name: 'ABAI (ПиАГТМ)', own: true }, { name: 'ABAI (БД)', own: true },
      { name: 'Excel' },
    ],
  },
  {
    stage: 'Бурение и ВСР',
    systems: [
      { name: 'Petrel' }, { name: 'Landmark' }, { name: 'tNavigator' }, { name: 'Sysdrill' },
      { name: 'SoloBox' }, { name: 'SoloFeed' }, { name: 'DrillSpot' }, { name: 'Starsteer' },
      { name: 'WellView' }, { name: 'ДЭЛ-140/150' }, { name: 'АСРППС' }, { name: 'ЕКПД' },
      { name: 'SAP ERP' }, { name: 'СЭД' }, { name: 'WhatsApp' },
      { name: 'ABAI (БД, ПГНО, ПДИМ)', own: true }, { name: 'ABP+' }, { name: 'Excel' },
      { name: 'Outlook' },
    ],
  },
  {
    stage: 'Добыча',
    systems: [
      { name: 'PipeSim' }, { name: 'UniSim' }, { name: 'AutoCAD' }, { name: 'Questor' },
      { name: 'СДМО' }, { name: 'ИСУТО' }, { name: 'ИМ' }, { name: 'GreenData' },
      { name: 'АСКУЭ' }, { name: 'АСТУЭ' }, { name: 'SCADA' }, { name: 'SAP ERP' },
      { name: 'Procu' }, { name: 'ABAI (БД)', own: true }, { name: 'ABP+' },
      { name: 'Excel' }, { name: 'Outlook' },
    ],
  },
  {
    stage: 'КС и наземная инфр-ра',
    systems: [
      { name: 'PipeSim' }, { name: 'UniSim' }, { name: 'AutoCAD' }, { name: 'Qportal.kz' },
      { name: 'АСУ НСИ' }, { name: 'SAP' }, { name: 'ABC-4' }, { name: 'SAS FM' },
      { name: 'E-Pass' }, { name: 'eLicense' }, { name: 'E-Qurylys' }, { name: 'Самрук-Казына' },
      { name: 'Procu' }, { name: 'СЭД' }, { name: 'ABP+' }, { name: 'Excel' }, { name: 'Outlook' },
    ],
  },
];

/** Цифры проблематики — презентация для АТК, слайд 10. */
export const LANDSCAPE_FACTS = [
  { value: 'до 80%', label: 'рабочего времени специалистов — ручной перенос данных в Excel' },
  { value: '0', label: 'интеграционных шин (ESB/API Gateway) и систем MDM/НСИ на уровне ДЗО' },
  { value: '63', label: '«серые зоны» функционального пересечения между службами' },
];
