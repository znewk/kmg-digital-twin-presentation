import { absToSceneY } from './fieldData';

/**
 * Стратиграфия Восточного Молдабека (ТЗ §4.3).
 *
 * НОМЕНКЛАТУРА НАСТОЯЩАЯ, ГЕОМЕТРИЯ УСЛОВНАЯ. Названия горизонтов, их порядок в
 * разрезе и число пробуренных на каждый скважин — фактические: первые два из
 * опубликованных геологических источников, третье из реестра фонда
 * (`well_stats.by_horizon`). Отметки кровли и подошвы каждого прослоя —
 * реконструкция: структурных карт и инклинометрии заказчик не передавал.
 *
 * Разрез во всех режимах обязан быть помечен как «условная геологическая
 * модель». Рядом с фактической поверхностью условные недра слишком легко
 * принять за факт, а аудитория здесь техническая.
 *
 * ── О расхождении в исходных данных ──────────────────────────────────────────
 *
 * §4.3 даёт две величины, которые не сходятся между собой напрямую:
 * «глубина залегания — абсолютные отметки от −230,5 до −349,3 м» и «толщина
 * среднеюрских отложений 285–400 м». Все десять горизонтов в интервал 119 м не
 * помещаются: одна только юрская часть по второму числу втрое толще.
 *
 * Принято следующее прочтение, и оно требует подтверждения у заказчика:
 * интервал −230,5…−349,3 относится к МЕЛОВЫМ залежам (М-I-А/Б/В, М-II, М-III) —
 * именно они делают месторождение мелкозалегающим, — а юрские Ю-I…Ю-VII лежат
 * ниже, в пределах среднеюрской толщи, и разрез уходит примерно до −660 м.
 * Так выполняются оба утверждения источника одновременно.
 */

export type HorizonSuite = 'aquifer' | 'cretaceous' | 'jurassic';

export interface Horizon {
  /** Латинский идентификатор — для ключей и id объектов сцены. */
  id: string;
  /**
   * Имя ровно как в реестре фонда. Сверять только по нему: в датасете
   * встречается `Ю-II-A` с латинской «A», и расхождение в одном символе
   * молча потеряет 72 скважины.
   */
  name: string;
  suite: HorizonSuite;
  /** Абсолютная отметка кровли, м. */
  topAbs: number;
  /** Абсолютная отметка подошвы, м. */
  botAbs: number;
  /** Нефтенасыщенный — или водоносный, как альб. */
  productive: boolean;
}

/**
 * Разрез сверху вниз. Между прослоями оставлены непроницаемые перемычки —
 * поэтому подошва одного горизонта не совпадает с кровлей следующего. Общая
 * толщина каждого прослоя удержана в фактическом диапазоне 3–24,7 м из §4.3.
 */
export const HORIZONS: Horizon[] = [
  { id: 'alb', name: 'альб', suite: 'aquifer', topAbs: -140, botAbs: -168, productive: false },

  { id: 'M-I-A', name: 'М-I-А', suite: 'cretaceous', topAbs: -230.5, botAbs: -249.5, productive: true },
  { id: 'M-I-B', name: 'М-I-Б', suite: 'cretaceous', topAbs: -252, botAbs: -268, productive: true },
  { id: 'M-I-V', name: 'М-I-В', suite: 'cretaceous', topAbs: -271, botAbs: -288, productive: true },
  { id: 'M-II', name: 'М-II', suite: 'cretaceous', topAbs: -295, botAbs: -318, productive: true },
  { id: 'M-III', name: 'М-III', suite: 'cretaceous', topAbs: -325, botAbs: -349.3, productive: true },

  { id: 'YU-I', name: 'Ю-I', suite: 'jurassic', topAbs: -372, botAbs: -390, productive: true },
  { id: 'YU-II-A', name: 'Ю-II-A', suite: 'jurassic', topAbs: -402, botAbs: -415, productive: true },
  { id: 'YU-II-B', name: 'Ю-II-Б', suite: 'jurassic', topAbs: -420, botAbs: -434, productive: true },
  { id: 'YU-III-A', name: 'Ю-III-А', suite: 'jurassic', topAbs: -448, botAbs: -458, productive: true },
  { id: 'YU-IV', name: 'Ю-IV', suite: 'jurassic', topAbs: -472, botAbs: -490, productive: true },
  { id: 'YU-V', name: 'Ю-V', suite: 'jurassic', topAbs: -505, botAbs: -520, productive: true },
  { id: 'YU-VI-A', name: 'Ю-VI-А', suite: 'jurassic', topAbs: -540, botAbs: -553, productive: true },
  { id: 'YU-VI-B', name: 'Ю-VI-Б', suite: 'jurassic', topAbs: -558, botAbs: -571, productive: true },
  { id: 'YU-VII', name: 'Ю-VII', suite: 'jurassic', topAbs: -590, botAbs: -612, productive: true },
];

export const HORIZON_BY_NAME = new Map(HORIZONS.map((h) => [h.name, h]));

/**
 * Недифференцированное «М-I» в реестре (5 скважин) — это группа М-I целиком, а
 * не отдельный прослой. Сводится к верхнему из трёх, иначе пять скважин
 * повисают без горизонта.
 */
export const HORIZON_ALIASES: Record<string, string> = { 'М-I': 'М-I-А' };

export function resolveHorizon(name: string | null): Horizon | undefined {
  if (!name) return undefined;
  return HORIZON_BY_NAME.get(HORIZON_ALIASES[name] ?? name);
}

/** Подошва разреза — ниже последнего горизонта, фундамент. */
export const SECTION_BASE_ABS = -660;

/** Кровля продуктивной толщи: с неё начинается «условная» часть модели. */
export const PRODUCTIVE_TOP_ABS = HORIZONS.find((h) => h.productive)!.topAbs;

// ── Тектоника ───────────────────────────────────────────────────────────────

/**
 * Разрывные нарушения, делящие залежь на блоки I–V (§4.3 п.3).
 *
 * Это не украшение и не перенесённый из прототипа «сброс для красоты»: блоковое
 * строение — реальная особенность месторождения, и от него зависит, где лежит
 * газовая шапка. Плоскости заданы следом на плане и наклоном, смещение по
 * каждой своё.
 */
export interface Fault {
  id: string;
  /** Смещение по вертикали, м: висячее крыло опущено. */
  throwM: number;
  /** Положение следа по оси X сцены на уровне кровли продуктивной толщи, м. */
  traceX: number;
  /** Наклон плоскости: приращение X на метр глубины. */
  dip: number;
  /** Разворот следа по оси Z, м на метр. */
  skew: number;
}

export const FAULTS: Fault[] = [
  { id: 'f1', throwM: 22, traceX: -1560, dip: 0.35, skew: 0.1 },
  { id: 'f2', throwM: 34, traceX: -520, dip: 0.42, skew: -0.06 },
  { id: 'f3', throwM: 28, traceX: 480, dip: 0.38, skew: 0.08 },
  { id: 'f4', throwM: 18, traceX: 1520, dip: 0.3, skew: -0.05 },
];

/** Блоки I–V — между следами разломов, с запада на восток. */
export const BLOCKS = ['I', 'II', 'III', 'IV', 'V'] as const;
export type BlockId = (typeof BLOCKS)[number];

/**
 * Газовая шапка присутствует ТОЛЬКО в блоке I (§4.3 п.4) — не по всей площади.
 * Блок I — западный, за первым разломом.
 */
export const GAS_CAP_BLOCK: BlockId = 'I';

/** Номер блока по координате X сцены на заданной глубине. */
export function blockAt(x: number, z: number, depthAbs: number): BlockId {
  let i = 0;
  for (const f of FAULTS) {
    if (x > faultTraceAt(f, z, depthAbs)) i++;
  }
  return BLOCKS[Math.min(i, BLOCKS.length - 1)];
}

/** След разлома на заданной глубине: плоскость наклонена, поэтому зависит от неё. */
export function faultTraceAt(f: Fault, z: number, depthAbs: number): number {
  return f.traceX + f.dip * (PRODUCTIVE_TOP_ABS - depthAbs) + f.skew * z;
}

/** Суммарное смещение кровли в точке — сумма сбросов всех пройденных разломов. */
export function throwAt(x: number, z: number, depthAbs: number): number {
  let drop = 0;
  for (const f of FAULTS) {
    const t = faultTraceAt(f, z, depthAbs);
    // Плавный переход через плоскость: ступенька в геометрии дала бы разрыв
    // меша и дыры в разрезе на границе блока.
    const k = Math.min(1, Math.max(0, (x - t) / 120 + 0.5));
    drop -= f.throwM * (k * k * (3 - 2 * k));
  }
  return drop;
}

// ── Структура залежи ────────────────────────────────────────────────────────

/**
 * Антиклиналь: пластово-сводовые залежи (§4.3). Свод вытянут по простиранию,
 * амплитуда убывает с глубиной — юрские горизонты положе меловых.
 */
export function dome(x: number, z: number): number {
  return Math.exp(-((x * x) / (2100 * 2100) + (z * z) / (1750 * 1750)));
}

/**
 * Литологическое замещение на восточном крыле (§4.3 п.5): коллектор выклинивается
 * и замещается плотными породами и глинами. Единица — коллектор есть, ноль —
 * замещён. Залежь не продолжается на восток бесконечно, и это видно в разрезе.
 */
export function reservoirPresence(x: number): number {
  const k = Math.min(1, Math.max(0, (2050 - x) / 700));
  return k * k * (3 - 2 * k);
}

/**
 * Абсолютная отметка кровли горизонта в точке — с учётом свода и блоков.
 * Единственная функция, через которую строится вся геометрия разреза.
 */
export function horizonTopAbs(h: Horizon, x: number, z: number): number {
  const amp = h.suite === 'cretaceous' ? 38 : h.suite === 'jurassic' ? 26 : 14;
  return h.topAbs + amp * dome(x, z) + throwAt(x, z, h.topAbs);
}

export function horizonBotAbs(h: Horizon, x: number, z: number): number {
  const amp = h.suite === 'cretaceous' ? 38 : h.suite === 'jurassic' ? 26 : 14;
  return h.botAbs + amp * dome(x, z) + throwAt(x, z, h.botAbs);
}

/** То же в координатах сцены — чтобы не пересчитывать преувеличение вручную. */
export function horizonTopY(h: Horizon, x: number, z: number): number {
  return absToSceneY(horizonTopAbs(h, x, z));
}

export function horizonBotY(h: Horizon, x: number, z: number): number {
  return absToSceneY(horizonBotAbs(h, x, z));
}

/**
 * Водонефтяной контакт по горизонту, м абс.
 *
 * Отметок ВНК в источниках нет. Принято: контакт на 60% высоты залежи от
 * кровли в своде — так нефтяная часть остаётся в пределах свода, а крылья
 * обводнены, что и объясняет фактическую долю нагнетательного фонда.
 */
export function owcAbs(h: Horizon): number {
  return h.topAbs - (h.topAbs - h.botAbs) * 0.6;
}
