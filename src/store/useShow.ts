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

interface ShowState {
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
     * Такт, с которого вошли, и режим камеры на тот момент.
     *
     * Вход в раздел перематывает показ к промыслу — объекты живут там, а экран
     * архитектуры идёт поверх глобуса, где поля в сцене нет вовсе. Значит выход
     * обязан вернуть и такт, и режим: без этого «Выход» гасил раздел и оставлял
     * зрителя посреди недр, откуда он в этот раздел не заходил.
     */
    from: number;
    wasPaused: boolean;
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

/**
 * Перемотка показа на такт — вместе с прокруткой страницы.
 *
 * Двигать только состояние нельзя: позиция страницы останется прежней, и первое
 * же движение колеса выбросит зрителя обратно туда, откуда его увели.
 */
function jumpToBeat(index: number, set: (s: Partial<ShowState>) => void): void {
  const at = Math.min(TOTAL_BEATS - 1, Math.max(0, index));
  const doc = document.documentElement;
  const top = ((at + 0.5) / TOTAL_BEATS) * (doc.scrollHeight - globalThis.innerHeight);
  globalThis.scrollTo({ top, behavior: 'auto' });
  progressRef.current = top / Math.max(1, doc.scrollHeight - globalThis.innerHeight);
  set({ beatIndex: at, stageId: FLAT_BEATS[at].stage.id });
}

/** Что цикл обязан вернуть на место при выходе. */
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
  explore: false,
  dive: null,

  debug: params.has('debug'),

  setBeatIndex: (i) => {
    const clamped = Math.min(TOTAL_BEATS - 1, Math.max(0, i));
    if (clamped === get().beatIndex) return;
    set({ beatIndex: clamped, stageId: FLAT_BEATS[clamped].stage.id, selected: null });
  },

  step: (delta) => {
    const next = Math.min(TOTAL_BEATS - 1, Math.max(0, get().beatIndex + delta));
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
  // Свободный осмотр гасит цикл: за камеру нельзя тянуть вдвоём, и если
  // пользователь взялся за неё сам — раскадровка отступает.
  togglePaused: () =>
    set((s) => ({ paused: !s.paused, cycleShot: null, cyclePlaying: false, dive: null })),
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
   * Прокрутка двигается вместе с тактом, а не только состояние: иначе позиция
   * страницы остаётся на глобусе, и первое же движение колеса выбрасывает
   * зрителя обратно.
   */
  openDive: (id) => {
    const from = get().beatIndex;
    const wasPaused = get().paused;

    const at = FLAT_BEATS.findIndex((b) => b.stage.id === 'reservoir');
    if (at >= 0) jumpToBeat(at, set);

    // Раздел, цикл и свободный осмотр — один режим на троих. Выделение и
    // наведение сбрасываются: сцена в разборе курсор не ловит, и оставшаяся
    // от прошлого клика подсветка висела бы до самого выхода.
    set({
      dive: { id, step: 0, from, wasPaused },
      paused: true,
      cycleShot: null,
      cyclePlaying: false,
      selected: null,
      hovered: null,
    });
  },

  setDiveStep: (n) => set((s) => (s.dive ? { dive: { ...s.dive, step: n } } : s)),

  closeDive: () => {
    const d = get().dive;
    set({ dive: null, explore: false, paused: d ? d.wasPaused : false });
  },

  /** Открыть промысел без разбора модуля — свободный осмотр сцены. */
  enterExplore: () =>
    set({ explore: true, paused: true, dive: null, cycleShot: null, cyclePlaying: false }),

  exitExplore: () =>
    set({ explore: false, paused: false, dive: null, cycleShot: null, cyclePlaying: false }),
}));
