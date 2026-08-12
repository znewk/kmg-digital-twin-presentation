/**
 * Реестр программных модулей ЦД — единственный источник правды по именованию,
 * принадлежности и РЕАЛЬНОМУ статусу.
 *
 * Источники фактов (не додумано):
 *  - карта объектов `image4.png` из сценария — раскладка бейджей ABAI / nedra.*;
 *  - мастер-архитектура `image1.png` — атрибуция «ABAI: …» / «Nedra.*» по функциям;
 *  - «Расшифровка наименований» в конце сценария — соответствие Nedra ↔ ABAI-бренд;
 *  - отчёт по обследованию, стр. 92 — границы пилота Молдабек В.;
 *  - ТЗ §7 — подтверждённое владельцем продукта состояние ABAI на август 2026.
 *
 * ВАЖНО. Сценарий показа переименовывает продукты Nedra в ABAI-бренд, а ТЗ §5
 * требует обратного. Поэтому у каждого модуля хранятся ОБА имени, а выбор
 * раскладки — рантайм-режим (`naming` в сторе), переключаемый на пульте.
 */

export type SystemSource =
  /** Модули ABAI, реально доступные ЭМГ сегодня. */
  | 'abai'
  /** Модули ABAI, которых у ЭМГ нет — донасыщение в рамках пилота. */
  | 'abai-new'
  /** Продукты вендора Nedra Digital. */
  | 'nedra'
  /** Внешние существующие системы. */
  | 'ext'
  /** Перспективный слой: интеграций нет, показывать только как цель. */
  | 'target';

export type ModuleStatus =
  /** Работает и используется в продакшене ЭМГ. */
  | 'live'
  /** Развёрнут в пилотном контуре, внедряется. */
  | 'pilot'
  /** Нет у ЭМГ, появляется впервые в рамках пилота. */
  | 'new-for-emg'
  /** Числится в ABAI, но не функционирует (ТЗ §7 п.1–2). */
  | 'broken'
  /** Целевой контур, не факт сегодняшнего дня (ТЗ §7 п.3). */
  | 'target';

export interface SoftwareModule {
  id: string;
  /** Имя продукта вендора — раскладка `nedra` (ТЗ §5). */
  nameNedra: string;
  /** Имя в ABAI-бренде — раскладка `abai` («Расшифровка наименований» сценария). */
  nameAbai: string;
  source: SystemSource;
  status: ModuleStatus;
  /** Кратко: что делает. */
  what: string;
  /** Границы пилота по отчёту, стр. 92 — если заданы, показываем в панели объекта. */
  pilotScope?: string;
}

export const SOURCE_META: Record<
  SystemSource,
  { label: string; colorVar: string; note: string }
> = {
  abai: {
    label: 'ABAI',
    colorVar: 'var(--color-abai)',
    note: 'Модули ИС ABAI, доступные ЭМГ сегодня',
  },
  'abai-new': {
    label: 'ABAI',
    colorVar: 'var(--color-abai)',
    note: 'Модули ABAI вне текущего доступа ЭМГ — донасыщение пилота',
  },
  /**
   * Ключ источника остался прежним — это служебный идентификатор, зритель его
   * не видит. Меняется только то, что выводится на экран: заказчик утвердил
   * единую раскладку наименований, и продуктовые имена вендора в показе не
   * появляются.
   */
  nedra: {
    label: 'Модули ЦД',
    colorVar: 'var(--color-nedra)',
    note: 'Модули цифрового двойника, закрывающие функциональные разрывы действующего контура ABAI',
  },
  ext: {
    label: 'Внешние',
    colorVar: 'var(--color-ext)',
    note: 'Существующие системы за периметром программы',
  },
  target: {
    label: 'Целевой контур',
    colorVar: 'var(--color-target)',
    note: 'Перспективный слой: сегодня не реализован',
  },
};

export const STATUS_META: Record<ModuleStatus, { label: string; tone: 'ok' | 'warn' | 'risk' | 'dim' }> = {
  live: { label: 'эксплуатируется', tone: 'ok' },
  pilot: { label: 'пилот · внедряется', tone: 'warn' },
  'new-for-emg': { label: 'новое для ЭМГ · донасыщение', tone: 'warn' },
  broken: { label: 'не функционирует', tone: 'risk' },
  target: { label: 'целевой контур', tone: 'dim' },
};

/** Модуль считается закрывающим процесс, только если он реально работоспособен. */
export function countsTowardCoverage(m: SoftwareModule): boolean {
  return m.status !== 'broken' && m.status !== 'target';
}

const RAW = {
  // ─── ABAI: реально доступно ЭМГ (ТЗ §7 п.5) ───────────────────────────────
  abaiDb: {
    id: 'abaiDb',
    nameNedra: 'ABAI · База данных',
    nameAbai: 'ABAI · База данных',
    source: 'abai',
    status: 'live',
    what: 'учётное ядро: фонд, режимы, факт добычи и закачки',
  },
  abaiKp: {
    id: 'abaiKp',
    nameNedra: 'ABAI · Картопостроитель',
    nameAbai: 'ABAI · Картопостроитель',
    source: 'abai',
    status: 'live',
    what: 'карты и структурные построения по пласту',
  },
  abaiTr: {
    id: 'abaiTr',
    nameNedra: 'ABAI · Технологический режим',
    nameAbai: 'ABAI · Технологический режим',
    source: 'abai',
    status: 'live',
    what: 'технологический режим работы скважин',
  },
  abaiPdim: {
    id: 'abaiPdim',
    nameNedra: 'ABAI · ПДИМ',
    nameAbai: 'ABAI · Планирование добычи и мониторинг',
    source: 'abai',
    status: 'live',
    what: 'планирование добычи и мониторинг отклонений',
  },
  abaiPaegtm: {
    id: 'abaiPaegtm',
    nameNedra: 'ABAI · ПАЭГТМ',
    nameAbai: 'ABAI · Подбор и анализ эффективности ГТМ',
    source: 'abai',
    status: 'live',
    what: 'формирование и ранжирование программы ГТМ',
  },
  abaiPgno: {
    id: 'abaiPgno',
    nameNedra: 'ABAI · ПГНО',
    nameAbai: 'ABAI · Подбор ГНО',
    source: 'abai',
    status: 'live',
    what: 'подбор глубинно-насосного оборудования',
  },

  // ─── ABAI: НЕТ у ЭМГ, донасыщение пилотом (ТЗ §7 п.5) ─────────────────────
  abaiCrns: {
    id: 'abaiCrns',
    nameNedra: 'ABAI · ЦРНС',
    nameAbai: 'ABAI ЦРНС 2.0',
    source: 'abai-new',
    status: 'new-for-emg',
    what: 'цифровой рейтинг точек бурения новых скважин',
  },
  abaiUz: {
    id: 'abaiUz',
    nameNedra: 'ABAI · УЗ',
    nameAbai: 'ABAI Управление заводнением 2.0',
    source: 'abai-new',
    status: 'new-for-emg',
    what: 'управление заводнением, баланс закачки и отборов',
  },

  /**
   * ABAI: числится, но не работает (ТЗ §7 п.1–2).
   *
   * УТОЧНЕНИЕ «ДЕЙСТВУЮЩИЙ» ОБЯЗАТЕЛЬНО. После перехода на единую раскладку
   * наименований эти два модуля и внедряемые контуры цифрового бурения и ТКРС
   * называются одинаково — таково утверждённое соответствие. Но состояние у
   * них противоположное: здесь модуль, который числится и не работает, там —
   * то, что внедряется пилотом.
   *
   * Без уточнения на экране оказались бы две одинаковые подписи с разными
   * статусами, и зритель решил бы, что это ошибка. Хуже: пометка «не
   * функционирует» могла бы прочитаться как относящаяся к пилоту, то есть
   * ровно наоборот.
   */
  abaiCb: {
    id: 'abaiCb',
    nameNedra: 'ABAI · ЦБ',
    nameAbai: 'ABAI Цифровое бурение (действующий)',
    source: 'abai',
    status: 'broken',
    what: 'модуль цифрового бурения действующего контура — в продакшене не используется',
  },
  abaiTkrs: {
    id: 'abaiTkrs',
    nameNedra: 'ABAI · ТКРС',
    nameAbai: 'ABAI Цифровой мониторинг ТКРС (действующий)',
    source: 'abai',
    status: 'broken',
    what: 'мониторинг ТКРС действующего контура — восстановление в плане до конца года',
  },

  // ─── Nedra Digital ────────────────────────────────────────────────────────
  numex: {
    id: 'numex',
    nameNedra: 'Nedra.NUMEX',
    nameAbai: 'ABAI ЦРНС 2.0',
    source: 'nedra',
    status: 'pilot',
    what: 'выбор оптимальной системы разработки и конфигурации скважин',
    pilotScope: '2 объекта: один — оптимизация ППД, один — ТЭО ГТМ (ВНС)',
  },
  numexOptimize: {
    id: 'numexOptimize',
    nameNedra: 'Nedra.NUMEX Optimize',
    nameAbai: 'ABAI Управление заводнением 2.0',
    source: 'nedra',
    status: 'pilot',
    what: 'серийные расчёты по критерию оптимизации, ход оптимизации',
  },
  rtm: {
    id: 'rtm',
    nameNedra: 'Nedra.RTM',
    nameAbai: 'ABAI Цифровое бурение',
    source: 'nedra',
    status: 'pilot',
    what: 'цифровое бурение, онлайн-мониторинг строительства скважин и сводки',
  },
  wwo: {
    id: 'wwo',
    nameNedra: 'Nedra.WWO',
    nameAbai: 'ABAI Цифровой мониторинг ТКРС',
    source: 'nedra',
    status: 'pilot',
    what: 'график мероприятий ТКРС, СТПА, оперативный контроль ремонта',
    pilotScope: '3 бригады ПРС, оснащённые ДЭЛ',
  },
  digitalTwin: {
    id: 'digitalTwin',
    nameNedra: 'Nedra.DIGITAL TWIN',
    nameAbai: 'ABAI Планирование добычи и мониторинг 2.0',
    source: 'nedra',
    status: 'pilot',
    what: 'планирование добычи, режимы фонда, потенциал добычи',
    pilotScope: 'ШГН, УЭВН — не более 30 скважин',
  },
  digitalTwinPipe: {
    id: 'digitalTwinPipe',
    nameNedra: 'Nedra.DIGITAL TWIN · Трубопроводы',
    // Полное наименование по утверждённой расшифровке, без сокращения «ПДиМ».
    nameAbai: 'ABAI Планирование добычи и мониторинг (Целостность трубопроводов) 2.0',
    source: 'nedra',
    status: 'pilot',
    what: 'целостность и предиктивная аналитика отказов трубопроводов (ML)',
    pilotScope: '1 напорный нефтепровод',
  },
  infraplan: {
    id: 'infraplan',
    nameNedra: 'Nedra.INFRAPLAN',
    nameAbai: 'ABAI Наземная инфраструктура',
    source: 'nedra',
    status: 'pilot',
    what: 'наземная инфраструктура: гидравлика, энергетика, бизнес-кейс',
    pilotScope: 'ветка нефтесбора из 5 КП · ветка ВЛ из 5 КП',
  },
  nedraData: {
    id: 'nedraData',
    nameNedra: 'Nedra.DATA (NDP)',
    nameAbai: 'КХД. Слой бизнес-интеграций',
    source: 'nedra',
    status: 'pilot',
    what: 'единый слой данных ЦД: источники, модель данных, карта объектов',
  },

  // ─── Внешние системы ──────────────────────────────────────────────────────
  tNavigator: {
    id: 'tNavigator',
    nameNedra: 't-Navigator, Petrel',
    nameAbai: 't-Navigator, Petrel',
    source: 'ext',
    status: 'live',
    what: 'геологическое и гидродинамическое моделирование',
  },
  sapToro: {
    id: 'sapToro',
    nameNedra: 'SAP ТОРО',
    nameAbai: 'SAP ТОРО',
    source: 'ext',
    status: 'live',
    what: 'планирование ТО и ремонтов оборудования',
  },
  smartField: {
    id: 'smartField',
    nameNedra: 'Интеллектуальное месторождение',
    nameAbai: 'Интеллектуальное месторождение',
    source: 'ext',
    status: 'live',
    what: 'действующий контур мониторинга добычи, движение операторов и транспорта',
  },

  // ─── Целевой слой (ТЗ §7 п.3) ─────────────────────────────────────────────
  aiAgents: {
    id: 'aiAgents',
    nameNedra: 'AI-агенты ЦД Актива',
    nameAbai: 'AI-агенты ЦД Актива',
    source: 'target',
    status: 'target',
    what: 'интеграций с Департаментом ИИ нет — перспективный слой',
  },
} as const satisfies Record<string, SoftwareModule>;

export type ModuleId = keyof typeof RAW;

/**
 * `as const` выше нужен только чтобы `ModuleId` был объединением литералов.
 * Наружу отдаём с общим типом значения: иначе у модулей без `pilotScope`
 * этого поля нет в типе, и обращение к нему не проходит проверку.
 */
export const MODULES: Record<ModuleId, SoftwareModule> = RAW;

export const MODULE_LIST: SoftwareModule[] = Object.values(MODULES);

/** Раскладка именования — политическое решение, вынесенное в рантайм. */
export type NamingMode =
  /** Только Nedra.* — по ТЗ §5. */
  | 'nedra'
  /** Только ABAI-бренд — по «Расшифровке наименований» сценария. */
  | 'abai'
  /** Nedra.* крупно + ABAI-соответствие мелкой строкой. */
  | 'hybrid';

export function moduleName(m: SoftwareModule, naming: NamingMode): string {
  return naming === 'abai' ? m.nameAbai : m.nameNedra;
}

/** Вторая строка бейджа в гибридном режиме; null — если дублировать нечего. */
export function moduleSubName(m: SoftwareModule, naming: NamingMode): string | null {
  if (naming !== 'hybrid') return null;
  if (m.nameAbai === m.nameNedra) return null;
  return m.nameAbai;
}
