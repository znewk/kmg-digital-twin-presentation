import { create } from 'zustand';
import type { NamingMode } from '../data/modules';
import type { Lang } from '../i18n';
import { FLAT_BEATS, TOTAL_BEATS, type StageId } from '../data/stages';

export type QualityTier = 'high' | 'mid' | 'low';
export type NavMode = 'scroll' | 'clicker';

/** Дополнительные слои визуализации недр и промысла. */
export type FeatureId =
  | 'grid'
  | 'isolines'
  | 'seismic'
  | 'flood'
  | 'cone'
  | 'drainage'
  | 'flow'
  /**
   * Подземные коммуникации: рельеф становится прозрачным, и видно всё, что
   * лежит в земле — нефтесбор, водоводы, газопровод, кабели, колодцы, стволы
   * скважин. Иначе их не увидеть в принципе: грунт непрозрачен, а трубы в нём.
   */
  | 'utilities'
  /**
   * Схема трасс на поверхности — разметка подземных сетей поверх рельефа.
   *
   * Трубопроводы закопаны на 1,2 м, а это 0,02 % от ширины участка: сверху их
   * не существует для зрителя. Разметка возвращает промыслу узнаваемый рисунок
   * нефтесбора с плоской схемы (§3.1 п.6), не притворяясь при этом трубой —
   * она пунктирная.
   */
  | 'traces';

/**
 * КРИТИЧЕСКОЕ ПРАВИЛО ПРОИЗВОДИТЕЛЬНОСТИ.
 *
 * Скролл пишет прогресс в этот мутабельный ref, а НЕ в стор. Камеру и все
 * покадровые анимации двигает `useFrame`, читая ref напрямую. Через Zustand
 * проходят только дискретные события — смена такта, вход/выход панели.
 *
 * Если писать прогресс в стейт, React перерисовывается 60 раз в секунду и
 * показ гарантированно просядет по кадрам на слабом железе.
 */
export const progressRef = { current: 0, direction: 1 as 1 | -1 };

/**
 * Доля подхода к промыслу на глобусе: 0 — кадр этапа, 1 — осмотр значка вблизи.
 *
 * Живёт рядом с прогрессом и по той же причине: значение покадровое. Его ведёт
 * `CameraRig` — он владеет камерой, — а читает `Globe`, чтобы на подходе
 * отпустить значок из постоянного экранного размера в постоянный мировой.
 *
 * Через стор это не проходит принципиально: обе стороны должны видеть ОДНО И ТО
 * ЖЕ число в ОДНОМ И ТОМ ЖЕ кадре. Два независимых сглаживания разошлись бы, и
 * значок менял бы размер не в такт с подходом камеры — то есть ровно то, ради
 * чего фиксация размера и делается, сломалось бы незаметно.
 */
export const tokenCloseRef = { current: 0 };

export interface ShowState {
  /** Индекс текущего такта — дискретно, обновляется на пересечении границы. */
  beatIndex: number;
  stageId: StageId;

  mode: NavMode;
  /** Скролл заблокирован, включена свободная орбита для детального клика. */
  paused: boolean;

  selected: string | null;
  hovered: string | null;

  naming: NamingMode;
  lang: Lang;
  sysFilter: string | null;

  tier: QualityTier;
  tierLocked: boolean;

  /**
   * Режимы просмотра недр — перенесены из референсного прототипа (ТЗ §1, §8.4).
   * Именно они позволяют «заглянуть под землю»: разнести слои, срезать блок
   * плоскостью, включить сетку ГГДМ, сейсмику, заводнение.
   */
  exploded: boolean;
  clip: boolean;
  /** Положение секущей плоскости по X, м. */
  clipX: number;
  features: Record<FeatureId, boolean>;
  labels: boolean;

  /**
   * Текущий шаг сквозной цепочки цикла (§4.4), `null` — цепочка не идёт.
   *
   * Хранится идентификатор шага, а не его номер. Номер сломался бы при первой
   * же вставке шага в середину цепочки, и сломался бы молча: подсветка ушла бы
   * на соседний передел, а понять это можно только глазами.
   */
  cycleShot: string | null;
  /** Цепочка идёт сама, без прокрутки. */
  cyclePlaying: boolean;
  /**
   * Состояние сцены до запуска цикла — чтобы вернуть его на выходе.
   *
   * Раскадровка по ходу цикла переключает слои, и без снимка зритель после
   * выхода получал сцену с чужими настройками.
   */
  cycleReturn: SceneReturn | null;

  /**
   * Состояние сцены до подъёма промысла — им же он и опускается.
   *
   * Разбор модуля и полный цикл включают по ходу свои слои: разрез, сетку ГГДМ,
   * заводнение, разнесение. Без снимка зритель, вернувшийся к показу и снова
   * открывший промысел, получал сцену в том виде, в каком её бросил последний
   * шаг чужого раздела.
   */
  fieldReturn: SceneReturn | null;

  /**
   * Режим осмотра промысла.
   *
   * Сцена месторождения больше не привязана к такту прокрутки: показ идёт из
   * трёх экранов, а промысел открывается кнопкой. Раньше вход в разбор
   * перематывал прокрутку к такту с промыслом — этого такта не стало, и вход
   * пришлось бы закрыть совсем. Отдельный флаг развязывает одно с другим:
   * сцена поднимается по требованию, а линейный показ остаётся трёхэкранным.
   */
  explore: boolean;
  enterExplore: () => void;
  exitExplore: () => void;

  /**
   * ОСМОТР ЗНАЧКА ПРОМЫСЛА ВБЛИЗИ — ЕЩЁ НЕ ПЕРЕХОД НА ПРОМЫСЕЛ.
   *
   * На карте области стоит сценка промысла, и с высоты этапа она читается
   * планом: расстановка видна, а сами объекты — значками в несколько пикселей.
   * Между «вижу, что здесь месторождение» и «стою внутри трёхмерной сцены на
   * пять километров» не хватало ступени: подойти и рассмотреть модель, не
   * поднимая при этом всю сцену промысла с её геометрией и датасетом.
   *
   * Это состояние и есть та ступень. Сцена не меняется — камера идёт по
   * поверхности глобуса к площадке и встаёт рядом с ней на пологом ракурсе.
   * Прокрутка при этом продолжает вести показ: осмотр не режим, а ракурс, и
   * смена такта его снимает.
   */
  tokenView: boolean;
  setTokenView: (v: boolean) => void;

  /**
   * ПЕРЕХОД К ПРОМЫСЛУ — СНИЖЕНИЕ, А НЕ ПОДМЕНА КАДРА.
   *
   * Глобус и месторождение — две сцены разного масштаба: планета радиусом 300
   * единиц и промысел шириной пять километров. Одновременно в кадре они жить не
   * могут, и переход между ними — всегда подмена. Вопрос только в том, видит ли
   * её зритель.
   *
   * Раньше подмену прятал такт «снижение к площадке»: камера уходила с орбиты к
   * поверхности, и на общем плане промысла показ продолжался уже в другой сцене.
   * Такта не стало вместе с сокращением показа до трёх экранов, а сам переход
   * никуда не делся — он просто стал мгновенным.
   *
   * Здесь снижение возвращено как самостоятельное состояние, не привязанное к
   * прокрутке: камера идёт с орбиты к Молдабеку (`descend`), экран перекрывается
   * заслонкой, под ней поднимается промысел (`arrive`), и заслонка уходит, когда
   * рельеф готов. Ждать готовности обязательно: сцена весит три сотни килобайт
   * геометрии, и без ожидания зритель увидит пустой кадр вместо месторождения.
   */
  entry: { dive: string | null; phase: 'descend' | 'arrive' } | null;
  /** Начать снижение. `diveId` — раздел, который откроется по прибытии. */
  enterField: (diveId?: string | null) => void;
  /** Снижение закончилось: промысел монтируется, камера уже над ним. */
  arriveField: () => void;
  /** Сцена готова — заслонку можно убирать. */
  endEntry: () => void;
  /** Уйти с промысла обратно в линейный показ. */
  leaveField: () => void;

  /** Служебный оверлей: подсветка непереведённых строк, счётчик FPS. */
  debug: boolean;

  setBeatIndex: (i: number) => void;
  step: (delta: number) => void;
  setMode: (m: NavMode) => void;
  togglePaused: () => void;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setNaming: (n: NamingMode) => void;
  cycleNaming: () => void;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  setSysFilter: (s: string | null) => void;
  setTier: (t: QualityTier, lock?: boolean) => void;
  toggleDebug: () => void;
  reset: () => void;

  toggleExplode: () => void;
  toggleClip: () => void;
  setClipX: (v: number) => void;
  toggleFeature: (f: FeatureId) => void;
  toggleLabels: () => void;

  setCycleShot: (id: string | null) => void;
  toggleCyclePlay: () => void;
  exitCycle: () => void;

  /**
   * Открытый раздел контура и номер шага в нём.
   *
   * Разделы больше не идут подряд в прокрутке — в них проваливаются с экрана
   * архитектуры по клику на контур. Поэтому это состояние, а не позиция
   * скролла: выйти из раздела нужно туда же, откуда вошли.
   */
  dive: {
    id: string;
    step: number;
    /**
     * Открыт ли раздел изнутри осмотра промысла.
     *
     * От этого зависит, куда возвращает «Выход». Раздел, открытый с экрана
     * архитектуры, поднял промысел ради себя одного — и на выходе обязан
     * опустить его обратно, вернув зрителя к показу. Раздел, открытый из уже
     * идущего осмотра, промысла не поднимал и убирать его не вправе: выход из
     * него возвращает в осмотр, а не выбрасывает на глобус.
     */
    wasExplore: boolean;
  } | null;
  openDive: (id: string) => void;
  setDiveStep: (n: number) => void;
  closeDive: () => void;
}

const params = new URLSearchParams(globalThis.location?.search ?? '');
const initialTier = (params.get('quality') as QualityTier | null) ?? null;
/**
 * Раскладка наименований по умолчанию — ABAI.
 *
 * Заказчик утвердил единую терминологию: в показе выводятся имена в терминах
 * ABAI, продуктовые имена вендора не появляются. Переключатель оставлен в коде
 * и доступен через адрес (`?naming=`) и горячую клавишу — он нужен на разборах
 * с командой внедрения, где имена продуктов как раз и обсуждают, — но
 * состояние по умолчанию одно.
 *
 * Гибридная раскладка, стоявшая здесь раньше, выводила оба имени сразу и
 * противоречит утверждённому решению напрямую.
 */
const initialNaming = (params.get('naming') as NamingMode | null) ?? 'abai';
const initialLang = (params.get('lang') as Lang | null) ?? 'ru';

/** Что цикл и промысел обязаны вернуть на место при выходе. */
interface SceneReturn {
  paused: boolean;
  exploded: boolean;
  clip: boolean;
  features: Record<FeatureId, boolean>;
}

const snapshot = (s: ShowState): SceneReturn => ({
  paused: s.paused,
  exploded: s.exploded,
  clip: s.clip,
  features: { ...s.features },
});

export const useShow = create<ShowState>((set, get) => ({
  beatIndex: 0,
  stageId: 'globe',

  mode: 'scroll',
  paused: false,

  selected: null,
  hovered: null,

  naming: initialNaming,
  lang: initialLang,
  sysFilter: null,

  tier: initialTier ?? 'high',
  tierLocked: initialTier !== null,

  exploded: false,
  clip: false,
  // Плоскость по умолчанию идёт через середину участка: разрез для того и
  // нужен, чтобы вскрыть промысел, а не отсечь у него краешек.
  clipX: 0,
  // Поток идёт по умолчанию — это «живость» сцены; остальные слои включаются
  // по ходу рассказа. Тумблера телеметрии здесь больше нет: он не был подключён
  // ни к чему и не выводился в интерфейс. Импульсы телеметрии на мачте связи
  // и движение транспорта идут всегда — это фон живого промысла, а не режим
  // просмотра недр.
  features: {
    grid: false,
    isolines: false,
    seismic: false,
    flood: false,
    cone: false,
    drainage: false,
    flow: true,
    utilities: false,
    traces: false,
  },
  labels: true,

  cycleShot: null,
  cyclePlaying: false,
  cycleReturn: null,
  fieldReturn: null,
  explore: false,
  tokenView: false,
  entry: null,
  dive: null,

  debug: params.has('debug'),

  setBeatIndex: (i) => {
    const clamped = Math.min(TOTAL_BEATS - 1, Math.max(0, i));
    if (clamped === get().beatIndex) return;
    // Осмотр значка принадлежит такту, на котором его открыли: он поставлен на
    // конкретную точку карты, а следующий такт может уводить камеру со всей
    // области. Смена такта возвращает кадр показу.
    set({
      beatIndex: clamped,
      stageId: FLAT_BEATS[clamped].stage.id,
      selected: null,
      tokenView: false,
    });
  },

  step: (delta) => {
    /**
     * На промысле шаг такта не работает.
     *
     * Стрелки и пробел ведут линейный показ, а он в этот момент за кадром:
     * такт сменился бы вслепую, и зритель, вернувшись, оказался бы не там, где
     * уходил. Из промысла выходят выходом, а не перелистыванием.
     */
    const s = get();
    if (selectFieldMode(s) || s.entry) return;

    const next = Math.min(TOTAL_BEATS - 1, Math.max(0, s.beatIndex + delta));
    // В кликер-режиме двигаем скролл, чтобы оба режима оставались в одной фазе.
    const target = (next + 0.5) / TOTAL_BEATS;
    const doc = document.documentElement;
    globalThis.scrollTo({
      top: target * (doc.scrollHeight - globalThis.innerHeight),
      behavior: 'smooth',
    });
    get().setBeatIndex(next);
  },

  setMode: (mode) => set({ mode }),
  /**
   * Свободный осмотр гасит цикл: за камеру нельзя тянуть вдвоём, и если
   * пользователь взялся за неё сам — раскадровка отступает.
   *
   * На промысле снимать паузу не с чего и нельзя. Прокрутка ведёт линейный
   * показ, которого в этот момент нет на экране: отпущенная камера уехала бы по
   * таймлайну на орбиту глобуса, оставив промысел смонтированным где-то под
   * ней. Выход отсюда один — вернуться к показу.
   */
  togglePaused: () => {
    const s = get();
    // Во время цикла тумблер значит «взять камеру себе» — это выход из
    // раскадровки, а не снятие паузы, и сцена возвращается в то состояние, в
    // котором цикл её застал.
    if (s.cycleShot || s.cyclePlaying) {
      get().exitCycle();
      return;
    }
    if (selectFieldMode(s) || s.entry) return;
    // Свободная орбита забирает камеру у таймлайна, а вместе с ним и у осмотра
    // значка: тянуть кадр вдвоём нельзя.
    set({ paused: !s.paused, dive: null, tokenView: false });
  },
  select: (selected) => set({ selected }),
  hover: (hovered) => set({ hovered }),

  setNaming: (naming) => set({ naming }),
  cycleNaming: () =>
    set((s) => ({
      naming: s.naming === 'hybrid' ? 'nedra' : s.naming === 'nedra' ? 'abai' : 'hybrid',
    })),

  setLang: (lang) => set({ lang }),
  toggleLang: () => set((s) => ({ lang: s.lang === 'ru' ? 'kk' : 'ru' })),

  setSysFilter: (sysFilter) => set({ sysFilter }),

  setTier: (tier, lock = false) =>
    set((s) => (s.tierLocked && !lock ? s : { tier, tierLocked: s.tierLocked || lock })),

  toggleDebug: () => set((s) => ({ debug: !s.debug })),

  reset: () => {
    globalThis.scrollTo({ top: 0, behavior: 'auto' });
    progressRef.current = 0;
    set({
      beatIndex: 0,
      stageId: 'globe',
      selected: null,
      hovered: null,
      paused: false,
      exploded: false,
      clip: false,
      // Сброс возвращает показ в начало — значит и промысел опускается вместе
      // со всем, что его держало: иначе сцена месторождения осталась бы
      // смонтированной поверх глобуса на первом такте.
      explore: false,
      tokenView: false,
      entry: null,
      dive: null,
      fieldReturn: null,
      cycleShot: null,
      cyclePlaying: false,
      cycleReturn: null,
    });
  },

  toggleExplode: () => set((s) => ({ exploded: !s.exploded })),
  toggleClip: () => set((s) => ({ clip: !s.clip })),
  setClipX: (clipX) => set({ clipX }),
  toggleFeature: (f) =>
    set((s) => ({ features: { ...s.features, [f]: !s.features[f] } })),
  toggleLabels: () => set((s) => ({ labels: !s.labels })),

  /**
   * ПОЛНЫЙ ЦИКЛ И СВОБОДНЫЙ ОСМОТР — ВЗАИМОИСКЛЮЧАЮЩИЕ РЕЖИМЫ.
   *
   * За камеру нельзя тянуть вдвоём. Раньше тянули трое: таймлайн вёл её по
   * ракурсам прокрутки, раскадровка — к текущему кадру, орбита — за мышью.
   * Побеждал тот, кто писал последним, и кадр дёргался между точками.
   *
   * Поэтому режим ровно один. Цикл останавливает прокрутку (иначе таймлайн
   * перебивает кадр) и выключает орбиту (иначе мышь дерётся с подлётом).
   * Свободный осмотр, наоборот, гасит цикл: пользователь взял камеру себе.
   */
  setCycleShot: (cycleShot) =>
    set((s) => ({
      cycleShot,
      paused: cycleShot ? true : s.paused,
      dive: cycleShot ? null : s.dive,
      // Снимок берётся один раз — на входе в цикл, а не на каждом кадре:
      // иначе он затрётся режимами, которые включил сам цикл.
      cycleReturn: cycleShot ? (s.cycleReturn ?? snapshot(s)) : s.cycleReturn,
    })),

  // Остановка не сбрасывает кадр: цикл ставят на паузу, чтобы рассмотреть
  // передел, на котором он стоит, а не чтобы вернуться в начало.
  toggleCyclePlay: () =>
    set((s) => ({
      cyclePlaying: !s.cyclePlaying,
      paused: s.cyclePlaying ? s.paused : true,
      cycleReturn: s.cyclePlaying ? s.cycleReturn : (s.cycleReturn ?? snapshot(s)),
    })),

  /**
   * Выход из цикла: сцена возвращается в то состояние, в котором её застали.
   *
   * Раскадровка по ходу цикла включает и гасит слои — трассы сетей, разрез,
   * заводнение, дренирование, — и после выхода они оставались в том виде, в
   * каком их бросил последний кадр. Зритель получал сцену с чужими
   * настройками и свободный осмотр, которого не включал.
   *
   * Снимок снят на входе, поэтому восстанавливается ровно то, что было, а не
   * набор «по умолчанию»: если пользователь сам включил разрез до запуска
   * цикла, разрез и останется.
   */
  exitCycle: () =>
    set((s) => ({
      cycleShot: null,
      cyclePlaying: false,
      cycleReturn: null,
      ...(s.cycleReturn ?? {}),
    })),

  /**
   * Вход в раздел контура.
   *
   * Раздел разбирает модуль НА ОБЪЕКТЕ, а объекты живут в 3D-модели промысла —
   * значит показ обязан сначала туда попасть. Экран архитектуры идёт поверх
   * глобуса, где поля в сцене ещё нет вовсе.
   *
   * Попадание туда — это снижение, а не перемотка прокрутки: такта с промыслом
   * в показе больше нет, и вести переход тактом нечем. Раздел просто просит
   * поднять сцену и открывается по прибытии.
   */
  openDive: (id) => get().enterField(id),

  setDiveStep: (n) => set((s) => (s.dive ? { dive: { ...s.dive, step: n } } : s)),

  closeDive: () => {
    const d = get().dive;
    // Раздел, открытый из осмотра, промысла не поднимал — и опускать его не
    // вправе: выход возвращает в осмотр. Открытый с экрана архитектуры поднял
    // сцену ради себя одного и на выходе уводит показ обратно.
    if (d?.wasExplore) {
      set({ dive: null, paused: true, selected: null, hovered: null });
      return;
    }
    get().leaveField();
  },

  /**
   * Подойти к значку промысла на карте или вернуться к кадру этапа.
   *
   * Осмотр несовместим со свободной орбитой и с разбором: и то и другое владеет
   * камерой. Поэтому включение снимает паузу, а не спорит с ней.
   */
  setTokenView: (v) => {
    const s = get();
    if (v && (selectFieldMode(s) || s.entry)) return;
    set({ tokenView: v, paused: v ? false : s.paused, selected: null });
  },

  /** Открыть промысел без разбора модуля — свободный осмотр сцены. */
  enterExplore: () => get().enterField(null),

  exitExplore: () => get().leaveField(),

  /**
   * НАЧАЛО СНИЖЕНИЯ К ПРОМЫСЛУ.
   *
   * Кадром дальше распоряжается сцена: камеру ведёт `FieldEntry`, а стор только
   * держит, куда идём и на каком этапе перехода находимся. Прокрутка на время
   * перехода замирает — иначе таймлайн тянет камеру обратно на орбиту.
   */
  enterField: (diveId = null) => {
    const s = get();

    // Промысел уже в кадре — снижаться неоткуда, раздел открывается сразу.
    if (s.explore || s.dive) {
      set({
        dive: diveId ? { id: diveId, step: 0, wasExplore: true } : null,
        paused: true,
        cycleShot: null,
        cyclePlaying: false,
        selected: null,
        hovered: null,
      });
      return;
    }

    // Переход уже идёт: повторный клик по соседнему контуру не должен начинать
    // снижение заново с середины пути.
    if (s.entry) return;

    set({
      entry: { dive: diveId, phase: 'descend' },
      fieldReturn: snapshot(s),
      // Кадром дальше владеет снижение — осмотр значка ему только мешал бы:
      // камера тянулась бы одновременно к площадке и к точке обзора значка.
      tokenView: false,
      paused: true,
      cycleShot: null,
      cyclePlaying: false,
      selected: null,
      hovered: null,
    });
  },

  /**
   * Снижение закончилось: под заслонкой поднимается промысел.
   *
   * Разбор открывается ровно здесь, а не в начале перехода: до прибытия его
   * панель стояла бы поверх глобуса, а камера шага наводилась бы на объекты
   * сцены, которой ещё нет.
   */
  arriveField: () => {
    const e = get().entry;
    if (!e || e.phase !== 'descend') return;
    set({
      entry: { dive: e.dive, phase: 'arrive' },
      explore: true,
      dive: e.dive ? { id: e.dive, step: 0, wasExplore: false } : null,
      paused: true,
    });
  },

  endEntry: () => set((s) => (s.entry ? { entry: null } : s)),

  /**
   * Возврат к показу: промысел опускается, сцена восстанавливается по снимку.
   *
   * Снимок снят на входе, поэтому возвращается ровно то, что было: если зритель
   * сам включил разрез до перехода, разрез и останется. Прокрутка отпускается —
   * показ продолжается с того же такта, с которого уходили.
   */
  leaveField: () => {
    const s = get();
    set({
      explore: false,
      tokenView: false,
      entry: null,
      dive: null,
      cycleShot: null,
      cyclePlaying: false,
      cycleReturn: null,
      selected: null,
      hovered: null,
      ...(s.fieldReturn ?? { paused: false }),
      fieldReturn: null,
    });
  },
}));

/**
 * Промысел ведёт показ, а не прокрутка.
 *
 * Один селектор на все места, где это нужно знать: сцена решает, монтировать ли
 * поле, глобус — гасить ли планету, интерфейс — какую обвязку показывать. При
 * трёх копиях условия расхождение вопрос времени, и выглядело бы оно как
 * «планета внутри промысла».
 */
export const selectFieldMode = (s: ShowState): boolean => s.explore || s.dive !== null;
