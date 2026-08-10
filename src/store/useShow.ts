import { create } from 'zustand';
import type { NamingMode } from '../data/modules';
import type { Lang } from '../i18n';
import { FLAT_BEATS, TOTAL_BEATS, type StageId } from '../data/stages';

export type QualityTier = 'high' | 'mid' | 'low';
export type NavMode = 'scroll' | 'clicker';

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
    set({ beatIndex: 0, stageId: 'hero', selected: null, hovered: null, paused: false });
  },
}));
