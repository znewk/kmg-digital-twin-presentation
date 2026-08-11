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
  cycleStep: string | null;
  /** Цепочка идёт сама, без прокрутки. */
  cyclePlaying: boolean;

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

  setCycleStep: (id: string | null) => void;
  toggleCyclePlay: () => void;
}

const params = new URLSearchParams(globalThis.location?.search ?? '');
const initialTier = (params.get('quality') as QualityTier | null) ?? null;
const initialNaming = (params.get('naming') as NamingMode | null) ?? 'hybrid';
const initialLang = (params.get('lang') as Lang | null) ?? 'ru';

export const useShow = create<ShowState>((set, get) => ({
  beatIndex: 0,
  stageId: 'hero',

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

  cycleStep: null,
  cyclePlaying: false,

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
  togglePaused: () => set((s) => ({ paused: !s.paused })),
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
      stageId: 'hero',
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

  setCycleStep: (cycleStep) => set({ cycleStep }),
  // Остановка не сбрасывает шаг: цепочку ставят на паузу, чтобы рассмотреть
  // передел, на котором она стоит, а не чтобы вернуться в начало.
  toggleCyclePlay: () => set((s) => ({ cyclePlaying: !s.cyclePlaying })),
}));
