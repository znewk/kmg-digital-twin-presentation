import {
  absToSceneY,
  toSceneX,
  toSceneZ,
  type FieldDataset,
  type WellRecord,
} from './fieldData';
import { resolveHorizon } from './stratigraphy';

/**
 * Сюжетные скважины — выборка из официального реестра фонда (ТЗ §4.1 п.1).
 *
 * Допущение о выдуманных типах снято: категория, состояние, тип ствола и
 * продуктивный горизонт у каждой скважины фактические. Поэтому сюжетные
 * скважины не назначаются произвольно, а **ищутся в реестре по этим полям** —
 * скважина под станок-качалку обязана быть нефтяной и в работе, скважина под
 * ТКРС — бездействующей, горизонтальная — действительно горизонтальной из тех
 * двадцати двух, что есть в фонде.
 *
 * Забой каждой сажается на её собственный продуктивный горизонт из `hor`. Это
 * та самая проверка из §4.3 п.6, только с другой стороны: не контур залежи
 * подгоняется под фонд, а ствол приходит ровно в тот пласт, на который скважина
 * по реестру пробурена.
 */

export type WellKind = 'skn' | 'esp' | 'horiz' | 'frac' | 'inj' | 'drill' | 'wo' | 'water';

export interface StoryWell {
  /** Совпадает с `well:VMB_XXXX` — тем же идентификатором, что и на 2D-схеме. */
  id: string;
  uwi: string;
  label: string;
  kind: WellKind;
  /** Координаты сцены, м. */
  x: number;
  z: number;
  /** Отметка забоя в координатах сцены — по фактическому горизонту скважины. */
  toe: number;
  /** Отход забоя от устья, м. */
  drift: number;
  record: WellRecord;
}

/**
 * Механизированная добыча на этом промысле — ШГН и УЭВН, а не УЭЦН.
 *
 * Прямо из отчёта по обследованию, раздел о периметре пилота: «ШГН, УЭВН не
 * более 30 скв.». Электровинтовой насос — типовое решение как раз для
 * высоковязкой нефти, которой и характерен Восточный Молдабек, тогда как
 * центробежный на такой вязкости работает плохо. Разница не косметическая:
 * техническая аудитория МЭПМ поймает подмену немедленно.
 *
 * Модель датчика на бригадах ПРС — ДЭЛ-140/150, тоже из материалов заказчика.
 */
const KIND_LABEL: Record<WellKind, string> = {
  skn: 'Добывающая · ШГН',
  esp: 'Добывающая · УЭВН',
  horiz: 'Горизонтальная',
  frac: 'Добывающая · ГРП',
  inj: 'Нагнетательная · ППД',
  drill: 'Строительство скважины',
  wo: 'ТКРС · подъёмник, ДЭЛ-140/150',
  water: 'Водозаборная · альб',
};

/**
 * Отход забоя. Реальных инклинометрических данных нет (§4.3, «что снимет
 * условность»), поэтому отход задаётся детерминированно от номера скважины —
 * чтобы стволы не стояли строго вертикальной гребёнкой, но и не плясали при
 * каждой перерисовке.
 */
function driftOf(uwi: string): number {
  let h = 0;
  for (let i = 0; i < uwi.length; i++) h = (h * 31 + uwi.charCodeAt(i)) >>> 0;
  return ((h % 90) - 45) * 0.9;
}

/**
 * Отметка забоя: подошва продуктивного горизонта скважины плюс небольшой
 * зумпф. Если горизонт в реестре не указан, скважина сажается на кровлю
 * продуктивной толщи — глубже неизвестного идти нечестно.
 */
function toeOf(w: WellRecord): number {
  const h = resolveHorizon(w.hor);
  if (!h) return absToSceneY(-240);
  return absToSceneY(h.botAbs - 6);
}

function toStory(w: WellRecord, kind: WellKind): StoryWell {
  return {
    id: `well:${w.uwi}`,
    uwi: w.uwi,
    label: `${w.uwi} · ${KIND_LABEL[kind]}`,
    kind,
    x: toSceneX(w.p[0]),
    z: toSceneZ(w.p[1]),
    toe: toeOf(w),
    drift: driftOf(w.uwi),
    record: w,
  };
}

/**
 * Узел детализации — куст с наибольшим числом сходящихся ниток нефтесбора.
 *
 * Полная детализация всего промысла невозможна и не нужна: по отчёту
 * обследования периметр самого пилота — ветка нефтесбора из пяти кустовых
 * площадок. Крупный узел выбирается по данным, а не назначается: у него больше
 * всего подключённых скважин, и именно на нём технология читается лучше всего.
 */
export function focusHubIndex(data: FieldDataset): number {
  let best = 0;
  for (let i = 1; i < data.hubs.length; i++) {
    if (data.hubs[i].links > data.hubs[best].links) best = i;
  }
  return best;
}

/** Квадрат расстояния между скважиной и точкой в координатах съёмки. */
function dist2(w: WellRecord, p: [number, number]): number {
  const dx = w.p[0] - p[0];
  const dy = w.p[1] - p[1];
  return dx * dx + dy * dy;
}

/**
 * Ближайшая к точке скважина, удовлетворяющая условию и ещё не занятая.
 *
 * Кучность важна: сюжетные скважины должны стоять рядом, иначе камера при
 * переходе между шагами цикла летает через весь промысел, и зритель теряет
 * связь между устьем, ГЗУ и коллектором.
 */
function pickNearest(
  wells: WellRecord[],
  near: [number, number],
  used: Set<string>,
  match: (w: WellRecord) => boolean,
): WellRecord | null {
  let best: WellRecord | null = null;
  let bestD = Infinity;
  for (const w of wells) {
    if (used.has(w.uwi) || !match(w)) continue;
    const d = dist2(w, near);
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}

export interface StorySelection {
  wells: StoryWell[];
  byKind: Map<WellKind, StoryWell>;
  /** Центр узла детализации в координатах сцены. */
  focus: { x: number; z: number; hub: number };
  /**
   * Кусты, разнесённые по всей площади, — для стволов остального фонда.
   *
   * Детально показывался один узел, и под землёй он выглядел одиноким пучком
   * стволов посреди пустого блока: 1101 скважина есть в реестре, а в недрах
   * видно два десятка. Промысел разрабатывается по всей площади, и разрез
   * обязан это показывать.
   */
  satellites: { x: number; z: number; hub: number }[];
}

/**
 * Кусты, максимально разнесённые по площади.
 *
 * Не первые попавшиеся и не самые крупные: и то и другое даёт скопление в одной
 * части промысла, потому что кусты сами по себе стоят неравномерно. Берётся
 * поочерёдно тот куст, который дальше всех отстоит от уже выбранных, — так
 * фонд ложится по всей площади равномерно при любом числе точек.
 */
function spreadHubs(data: FieldDataset, from: number, count: number): number[] {
  const hubs = data.hubs;
  const chosen = [from];
  const minD = hubs.map((h) => dist2p(h.p, hubs[from].p));

  while (chosen.length <= count) {
    let best = -1;
    let bestD = -1;
    for (let i = 0; i < hubs.length; i++) {
      if (minD[i] > bestD) {
        bestD = minD[i];
        best = i;
      }
    }
    if (best < 0 || bestD <= 0) break;

    chosen.push(best);
    minD[best] = -1;
    for (let i = 0; i < hubs.length; i++) {
      if (minD[i] < 0) continue;
      minD[i] = Math.min(minD[i], dist2p(hubs[i].p, hubs[best].p));
    }
  }

  // Первым в списке лежит сам узел детализации — он уже показан полностью.
  return chosen.slice(1);
}

function dist2p(a: [number, number], b: [number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

/**
 * Подбор всего сюжетного состава вокруг узла детализации.
 *
 * Порядок важен: сначала берутся редкие категории (горизонтальные — их всего
 * 22 на 1101, водозаборные — 6), потом массовые. Если начать с массовых, редкие
 * рискуют оказаться на другом конце промысла.
 */
export function selectStoryWells(data: FieldDataset): StorySelection {
  const hub = focusHubIndex(data);
  const center = data.hubs[hub].p;
  const used = new Set<string>();
  const wells: StoryWell[] = [];

  const take = (kind: WellKind, match: (w: WellRecord) => boolean) => {
    const w = pickNearest(data.wells, center, used, match);
    if (!w) return;
    used.add(w.uwi);
    wells.push(toStory(w, kind));
  };

  const working = (w: WellRecord) => w.st === 'active' || w.st === 'periodic';

  // Редкие категории — первыми.
  take('horiz', (w) => w.type === 'horiz' && w.cat === 'oil');
  take('water', (w) => w.cat === 'water');

  // Механизированная добыча: две работающие нефтяные рядом с узлом.
  take('skn', (w) => w.cat === 'oil' && working(w) && w.type === 'vert');
  take('esp', (w) => w.cat === 'oil' && working(w) && w.type === 'vert');
  take('frac', (w) => w.cat === 'oil' && working(w) && w.type === 'vert');

  // Нагнетательные — их 210, рядом с узлом найдутся.
  take('inj', (w) => w.cat === 'inj' && working(w));
  take('inj', (w) => w.cat === 'inj' && working(w));

  // ТКРС ставится на бездействующую скважину — это и есть повод для ремонта.
  take('wo', (w) => w.cat === 'oil' && (w.st === 'inactive' || w.st === 'idle'));

  // Бурение — состояние «в бурении» реестром не предусмотрено: реестр описывает
  // существующий фонд. Площадка строительства привязывается к скважине в
  // простое, а сам факт бурения помечается как сюжет, а не как факт реестра.
  take('drill', (w) => w.cat === 'oil' && w.st === 'idle');

  /**
   * Узел детализации — не единственное место, где идёт добыча.
   *
   * Один работающий куст на весь промысел читается как опытный участок, а не
   * как разрабатываемое месторождение. На двух самых удалённых кустах ставятся
   * полные модели работающих скважин: подъём флюида по колонне и приток в
   * перфорацию видны и там, за несколько километров от основного узла.
   *
   * Скважины под них ищутся в реестре по тем же правилам, что и остальные, —
   * нефтяная, в работе, вертикальная, — только рядом со СВОИМ кустом.
   */
  const satelliteHubs = spreadHubs(data, hub, 20);

  for (const h of satelliteHubs.slice(0, 2)) {
    const w = pickNearest(
      data.wells,
      data.hubs[h].p,
      used,
      (r) => r.cat === 'oil' && working(r) && r.type === 'vert',
    );
    if (!w) continue;
    used.add(w.uwi);
    wells.push(toStory(w, 'skn'));
  }

  const byKind = new Map<WellKind, StoryWell>();
  for (const w of wells) if (!byKind.has(w.kind)) byKind.set(w.kind, w);

  return {
    wells,
    byKind,
    focus: { x: toSceneX(center[0]), z: toSceneZ(center[1]), hub },
    satellites: satelliteHubs.map((i) => ({
      x: toSceneX(data.hubs[i].p[0]),
      z: toSceneZ(data.hubs[i].p[1]),
      hub: i,
    })),
  };
}
