import type { ModuleId } from './modules';
import type { PanelId } from './stages';
import type { AnchorSpec } from './cycle/chain';
import type { Framing, SceneSetup, ShotTarget } from './cycle/storyboard';

/**
 * РАЗДЕЛЫ ПО КОНТУРАМ — то, что раньше было хвостом линейной прокрутки.
 *
 * Пятнадцать тактов подряд открывали полноэкранные панели модулей: ГДМ, подбор
 * системы разработки, оптимизация заводнения, гидравлика, целостность труб,
 * бурение, ТКРС, мнемосхема, потенциал, слой данных, целеполагание. Показ
 * превращался в пролистывание интерфейсов, а 3D-модель, ради которой всё
 * строилось, стояла за ними закрытая.
 *
 * Теперь это разделы, в которые проваливаются С ЭКРАНА АРХИТЕКТУРЫ по клику на
 * контур. Разница не в навигации, а в причинности: зритель сначала видит, из
 * чего состоит цифровой двойник актива, и сам выбирает, во что углубиться, —
 * вместо того чтобы получить пятнадцать экранов подряд просто потому, что они
 * идут следом.
 *
 * И главное — каждый шаг раздела ставит камеру на СВОЙ объект в Молдабеке.
 * Панель модуля показывается сбоку, а не вместо сцены: §8.3 требует, чтобы
 * зритель видел объект, а панель дополняла вид. Раньше было наоборот.
 */

export interface DiveStep {
  id: string;
  title: string;
  /** Что модуль делает на этом шаге — своими словами, без жаргона вендора. */
  body: string;
  /** 2D-панель модуля сбоку. */
  panel?: PanelId;
  modules?: ModuleId[];
  /** На что смотрит камера в Молдабеке. */
  look: ShotTarget;
  framing: Framing;
  setup?: SceneSetup;
  /** В теле есть иллюстративные величины (§7). */
  illustrative?: boolean;
  /**
   * Объекты промысла, которыми модуль занимается на этом шаге, — подсвечиваются
   * в сцене.
   *
   * Привязка не выдумана: карта на стр. 12 отчёта об обследовании прямо
   * сопоставляет модули объектам — «Трубопроводы» напорному нефтепроводу,
   * «КНС и ППД» кустовым насосным станциям, «Химизация» БРХ. Показать модуль
   * и не показать, чем он управляет, — значит оставить зрителя с названием
   * продукта вместо понимания.
   *
   * Правило поиска, а не координаты: подсветка встаёт на фактические объекты
   * датасета, и выдумать среди них лишний технически невозможно.
   */
  highlight?: AnchorSpec[];
}

export interface Dive {
  id: string;
  /** Номер контура на экране архитектуры; null — вне периметра пилота. */
  no: string | null;
  title: string;
  /** Зачем этот контур нужен — одной фразой. */
  purpose: string;
  /** Контур двойника, задаёт акцентный цвет. */
  twin: 'plast' | 'skv' | 'dob' | null;
  /** Вне периметра пилота: показывается, но честно помечается. */
  future?: boolean;
  steps: DiveStep[];
}

export const DIVES: Dive[] = [
  {
    id: 'base',
    no: null,
    title: 'ЦД Ресурсной базы',
    purpose:
      'Цифровая геологическая модель, восполняемость и конверсия запасов. В периметр пилота не входит: работы намечены на 2027 год, и показывать здесь готовый функционал было бы неправдой.',
    twin: null,
    future: true,
    steps: [
      {
        id: 'base-scope',
        title: 'Что войдёт в контур',
        body: 'Сейсморазведка и обработка данных, построение геологических моделей. Инструменты — t-Navigator и Petrel, те же, что уже используются на пласте. На Молдабеке этот контур пока представлен только исходной геологией разреза.',
        look: { at: 'reservoir' },
        framing: 'context',
        highlight: [{ source: 'subsurface' }],
        setup: { clip: true, features: { seismic: true } },
      },
    ],
  },

  {
    id: 'plast',
    no: '1',
    title: 'ЦД Пласта',
    purpose:
      'Планировать от ограничений пласта, а не от фактически пробуренных скважин. Для зрелого месторождения модель обязана быть постоянно действующей, иначе решения принимаются по устаревшей картине.',
    twin: 'plast',
    steps: [
      {
        id: 'plast-gdm',
        title: 'Шаг 1. Геолого-гидродинамическая модель',
        body: 'Модель получена от КМГИ: структура пласта, свойства коллектора, история адаптации на факт добычи. Это цифровая копия недр, на которой можно считать варианты, не трогая настоящий пласт.',
        panel: 'tnavigator',
        modules: ['tNavigator', 'abaiKp'],
        look: { at: 'reservoir' },
        framing: 'context',
        highlight: [{ source: 'subsurface' }],
        setup: { clip: true, features: { grid: true, isolines: true } },
      },
      {
        id: 'plast-numex',
        title: 'Шаг 2. Подбор системы разработки',
        body: 'Упрощённая модель для оперативных многовариантных расчётов. На пятом Юрском объекте — считавшемся малоперспективным — нашлась область, не охваченная бурением: намечено 1–2 горизонтальные скважины.',
        panel: 'numex',
        modules: ['numex', 'abaiCrns', 'abaiPdim'],
        look: { at: 'reservoir' },
        framing: 'context',
        highlight: [{ source: 'wells', cat: 'oil', st: 'active' }],
        setup: { clip: true, features: { drainage: true, isolines: true } },
        illustrative: true,
      },
      {
        id: 'plast-optimize',
        title: 'Шаг 3. Оптимизация заводнения',
        body: '600–700 серийных расчётов на детальной модели. Алгоритм подбирает, где форсировать отбор и где менять закачку, чтобы вода вытесняла нефть к добывающим, а не проскакивала мимо неё.',
        panel: 'numex-optimize',
        modules: ['numexOptimize', 'abaiUz'],
        look: { at: 'reservoir' },
        framing: 'context',
        highlight: [
          { source: 'wells', cat: 'inj', st: 'active' },
          { source: 'facility', kind: 'kns' },
        ],
        setup: { clip: true, features: { flood: true, cone: true } },
        illustrative: true,
      },
    ],
  },

  {
    id: 'skv',
    no: '2',
    title: 'ЦД Скважины',
    purpose:
      'Сквозной двойник от долота до вывода на режим. Кандидаты, подобранные на пласте, переходят в бурение, затем в освоение и ремонт — и всё это один и тот же объект, а не три разных проекта.',
    twin: 'skv',
    steps: [
      {
        id: 'skv-drilling',
        title: 'Шаг 1. Онлайн-мониторинг бурения',
        body: 'Параметры и режимы бурения контролируются в реальном времени: отклонение видно до того, как оно станет аварией. Траектория корректируется на ходу, сводки ведутся без бумаги.',
        panel: 'rtm',
        modules: ['rtm'],
        look: { at: 'wellhead' },
        framing: 'object',
        highlight: [{ source: 'wells', cat: 'oil', st: 'idle' }],
        setup: { features: { traces: true } },
        illustrative: true,
      },
      {
        id: 'skv-workover',
        title: 'Шаг 2. Ремонт скважин в единой среде',
        body: 'График ремонтов, движение бригад и суточная отчётность — в одном месте. Пересечения бригад на одной скважине видны заранее, а не в день выезда.',
        panel: 'wwo',
        modules: ['wwo', 'sapToro'],
        look: { at: 'pad' },
        framing: 'context',
        highlight: [{ source: 'wells', cat: 'oil', st: 'inactive' }],
        setup: { features: { traces: true } },
        illustrative: true,
      },
      {
        id: 'skv-lift',
        title: 'Шаг 3. Подбор оборудования и режима',
        body: 'По модели подбирается насос и режим его работы под конкретную скважину: слишком слабый не поднимет вязкую нефть, слишком мощный сорвёт приток и быстрее выйдет из строя.',
        modules: ['abaiPgno', 'abaiTr'],
        look: { at: 'bore' },
        framing: 'object',
        highlight: [{ source: 'wells', cat: 'oil', st: 'active' }],
        setup: { clip: true },
      },
    ],
  },

  {
    id: 'dob',
    no: '3',
    title: 'ЦД Добычи и наземной инфраструктуры',
    purpose:
      'Решение о форсировании отбора упирается не в пласт, а в трубу: сеть сбора должна выдержать. Двойник проверяет это до того, как решение уйдёт в поле.',
    twin: 'dob',
    steps: [
      {
        id: 'dob-hydraulics',
        title: 'Гидравлика сети сбора',
        body: 'Загрузка системы сбора считается с учётом вязкости нефти — на Молдабеке она высокая, и труба, проходная по объёму, может не пропустить по давлению. Отдельно считается ветка ППД.',
        panel: 'infraplan',
        modules: ['infraplan'],
        look: { at: 'collector' },
        framing: 'wide',
        highlight: [
          { source: 'network', key: 'oil_pipeline' },
          { source: 'facility', kind: 'gzu' },
        ],
        setup: { features: { traces: true } },
        illustrative: true,
      },
      {
        id: 'dob-pipe',
        title: 'Целостность трубопроводов',
        body: 'Износ стенки прогнозируется по модели: аварийный участок напорного нефтепровода ищут до отказа, а не после разлива. Это и есть разница между планом и аварией.',
        panel: 'pipe-integrity',
        modules: ['digitalTwinPipe'],
        look: { at: 'external', id: 's-cppn' },
        framing: 'wide',
        highlight: [{ source: 'external', id: 's-cppn' }, { source: 'facility', kind: 'sp' }],
        setup: { features: { traces: true } },
        illustrative: true,
      },
      {
        id: 'dob-mnemo',
        title: 'Мнемосхема актива',
        body: 'Вся технологическая цепочка на одном экране: расход и давление на связях, счётчики добычи, отклонения от проекта. Это тот же путь, что показывает полный цикл, но в виде приборной панели.',
        panel: 'mnemoscheme',
        modules: ['digitalTwin', 'abaiTr', 'abaiPdim'],
        look: { at: 'sp' },
        framing: 'object',
        highlight: [
          { source: 'facility', kind: 'sp' },
          { source: 'facility', kind: 'kns' },
        ],
        setup: { features: { traces: true } },
        illustrative: true,
      },
      {
        id: 'dob-potential',
        title: 'Работа с потенциалом добычи',
        body: 'Сколько актив мог бы давать и почему не даёт: отказ оборудования, ожидание ремонта, ограничение сети, нехватка химии. Каждая причина — с цифрой потерь и мероприятием в ответ.',
        panel: 'dt-potential',
        modules: ['digitalTwin'],
        look: { at: 'pad' },
        framing: 'context',
        highlight: [{ source: 'wells', cat: 'oil', st: 'active' }],
        setup: { features: { traces: true } },
        illustrative: true,
      },
      {
        id: 'dob-smart',
        title: 'Интеллектуальное месторождение',
        body: 'Поверх подземной и наземной части — люди и техника: движение операторов и автотранспорта по промыслу. Двойник перестаёт быть схемой и становится картиной смены.',
        modules: ['smartField'],
        look: { at: 'field' },
        framing: 'wide',
        highlight: [{ source: 'hubs' }],
        setup: { features: { traces: true } },
      },
    ],
  },

  {
    id: 'data',
    no: null,
    title: 'Единый слой данных · Nedra.DATA',
    purpose:
      'Снимает «лоскутное одеяло»: данные по одному объекту перестают лежать в десятке несвязанных систем. Без этого слоя двойники остаются отдельными программами, а не одной моделью.',
    twin: null,
    steps: [
      {
        id: 'data-sources',
        title: 'Шаг 1. Источники данных',
        body: 'Исходные и произведённые данные от всех систем — режимы фонда, траектории, ГИС, керн, карты, телеметрия — поступают в единый слой, а не расходятся по папкам подразделений.',
        panel: 'ndp-sources',
        modules: ['nedraData'],
        look: { at: 'field' },
        framing: 'wide',
        highlight: [{ source: 'facility', kind: 'gzu' }],
      },
      {
        id: 'data-model',
        title: 'Шаг 2. Модель данных',
        body: 'Сквозная модель связывает пласты, скважины, флюиды и объекты обустройства между собой. Ответ на вопрос «что сейчас с этой скважиной» перестаёт требовать обхода пяти систем.',
        panel: 'ndp-model',
        modules: ['nedraData'],
        look: { at: 'field' },
        framing: 'wide',
        highlight: [{ source: 'hubs' }],
      },
      {
        id: 'data-asset',
        title: 'Шаг 3. Единый ЦД Актива',
        body: 'Информация со всех двойников — пласта, скважины, добычи, инфраструктуры — сходится в одну систему управления. Это переход от реакции на случившееся к выбору того, что делать дальше.',
        panel: 'asset-twin',
        modules: ['aiAgents', 'nedraData'],
        look: { at: 'field' },
        framing: 'wide',
        highlight: [{ source: 'facility', kind: 'sp' }, { source: 'facility', kind: 'kns' }],
        illustrative: true,
      },
    ],
  },
];

export const DIVE_BY_ID = new Map(DIVES.map((d) => [d.id, d]));

export const DIVE_STEP_BY_ID = new Map(
  DIVES.flatMap((d) => d.steps.map((s) => [s.id, { dive: d, step: s }] as const)),
);
