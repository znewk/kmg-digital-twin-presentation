import * as THREE from 'three';
import { absToSceneY, FIELD_H, FIELD_W } from '../../data/geo/fieldData';
import type { WellKind } from '../../data/geo/storyWells';
import { outlineCentroid, outlineRadius } from '../../data/geo/outline';
import {
  HORIZONS,
  SECTION_BASE_ABS,
  dome,
  horizonBotY,
  horizonTopY,
  owcAbs,
  reservoirPresence,
  resolveHorizon,
  throwAt,
  type Horizon,
} from '../../data/geo/stratigraphy';

/**
 * Геометрия недр в метрическом масштабе: 1 единица сцены = 1 метр по горизонтали.
 *
 * Отличие от прежней версии — принципиальное. Раньше здесь были шесть безымянных
 * слоёв на выдуманных отметках (ВНК на −520, подошва −900), унаследованных от
 * референсного прототипа. Теперь разрез строится по стратиграфии месторождения
 * (§4.3): пятнадцать горизонтов с настоящими именами на реконструированных, но
 * обоснованных отметках, блоковое строение, литологическое замещение на востоке.
 *
 * Все отметки живут в `stratigraphy.ts` в абсолютных величинах и переводятся в
 * сцену единственной функцией `absToSceneY`. Здесь — только геометрия.
 */

/** Полуразмеры блока по фактическому габариту съёмки: 5352 × 4682 м. */
export const HW = FIELD_W / 2;
export const HD = FIELD_H / 2;

// ── Отметка земли ───────────────────────────────────────────────────────────

/**
 * ЕДИНАЯ ОТМЕТКА ЗЕМЛИ. Всё, что стоит на промысле — площадки, установки, устья
 * скважин, опоры труб, — садится ровно на `surfY`.
 *
 * Функция синхронная и вызывается из десятков мест, а датасет грузится
 * асинхронно, поэтому сэмплер подставляется один раз при загрузке. До неё
 * поверхность плоская — но поле монтируется под Suspense, уже после.
 */
let sampler: ((x: number, z: number) => number) | null = null;

export function setTerrainSampler(fn: (x: number, z: number) => number): void {
  sampler = fn;
}

/**
 * Готов ли рельеф.
 *
 * Нужен постановке кадра. Всё, что садится на землю, спрашивает отметку через
 * `surfY`, а тот до появления сэмплера честно отвечает нулём — и кадр,
 * посчитанный в этот момент, наводится на несуществующую плоскость. Заметно это
 * было ровно там, где промысел монтируется одновременно с расчётом кадра: при
 * входе в раздел контура камера вставала мимо, а после щелчка по шагу —
 * правильно, потому что к тому времени рельеф уже был.
 */
export function terrainReady(): boolean {
  return sampler !== null;
}

export function surfY(x: number, z: number): number {
  return sampler ? sampler(x, z) : 0;
}

type Fn = (x: number, z: number) => number;

/**
 * Кровля почвенного слоя — ниже рельефа на заведомый зазор.
 *
 * Зазор был два метра, и этого не хватало: слои разреза строятся сеткой
 * 48 × 34 на участок 5352 × 4682 м, то есть с шагом больше сотни метров, а
 * рельеф — сеткой 150 × 132. Грубая сетка не повторяет мелкие складки местности
 * и на каждом бугре между своими узлами вылезала наружу — по всему промыслу
 * шли бурые пятна породы поверх поверхности.
 *
 * Пятнадцать метров с запасом перекрывают ошибку выборки: при перепаде 120 м
 * (40 м рельефа втрое) на пролёте сетки набегает около четырёх метров, плюс
 * кривизна. Слой ЗСС мощностью 180 м от этого ничего не теряет.
 */
export const ySoilTop: Fn = (x, z) => surfY(x, z) - 15;

// ── Слои разреза ────────────────────────────────────────────────────────────

export interface FieldStratum {
  id: string;
  label: string;
  /** Подпись второй строкой: число скважин, свита, признак условности. */
  note?: string;
  top: Fn;
  bot: Fn;
  color: string;
  opacity: number;
  /** Продуктивный прослой — по нему идут залежь, ВНК и зоны дренирования. */
  horizon?: Horizon;
  /** Чем насыщен прослой. Порода — всё непродуктивное. */
  phase?: 'oil' | 'water' | 'rock';
  /** Порядок в разрезе сверху вниз — по нему считается разнесение слоёв. */
  order: number;
}

/**
 * Палитра и плотность разреза: ПОРОДА — СТЕКЛО, ФЛЮИД — ТЕЛО.
 *
 * Через две неудачи. Плотными слои сливались в тёмное пятно. Полупрозрачными
 * поровну — в кашу: тридцать один цветной лист друг за другом складывается в
 * муть, где не различить ни одного. Прозрачность вообще нельзя раздавать
 * равномерно, потому что она копится вдоль луча зрения.
 *
 * Разница между слоями теперь не только в цвете, но и в плотности, и разложена
 * она по смыслу. Порода — вмещающий массив, на неё смотреть незачем: приглушена
 * до дымки, различается светлотой в серой гамме и пропускает сквозь себя
 * стволы, насосы и перфорацию. Нефтенасыщенная часть коллектора — то, ради чего
 * разрез и открывают: почти плотный янтарь, читается сквозь всю толщу.
 * Водонасыщенная — посередине: видна, но не спорит с нефтью, и граница между
 * ними остаётся тем самым водонефтяным контактом.
 *
 * Ровно из-за этого вдоль луча набирается два-три плотных листа вместо
 * тридцати, и разрез читается с любого ракурса — и во вскрытом виде, и в
 * сомкнутом блоке.
 */
const COLOR = {
  soil: '#8a7d68',
  overburden: '#6f6a60',
  aquifer: '#4b7ea6',
  interburden: '#5e6166',
  /** Нефтенасыщенная часть коллектора. */
  oil: '#e0912b',
  /** Водонасыщенная часть того же коллектора. */
  water: '#4d6f8c',
  basement: '#3a3d44',
};

/**
 * Плотность слоя по тому, чем он насыщен.
 *
 * Нефть не доведена до полной: сквозь неё должна просвечивать перфорация и
 * низ колонны — они лежат внутри коллектора, и работу подземного оборудования
 * без них не показать. Плотнее всего остального, но не глухая.
 */
const OPACITY = {
  rock: 0.2,
  water: 0.45,
  oil: 0.85,
} as const;

const SUITE_LABEL: Record<Horizon['suite'], string> = {
  aquifer: 'водоносный',
  cretaceous: 'меловые отложения',
  jurassic: 'среднеюрские отложения',
};

/**
 * Разрез сверху вниз: почва, перекрывающая толща, затем чередование
 * продуктивных прослоев и непроницаемых перемычек, внизу фундамент.
 *
 * Перемычки выделены отдельными слоями намеренно. Если рисовать одну сплошную
 * толщу и врезать в неё прослои, при любом ракурсе кроме строго бокового
 * прослои тонут внутри массива. А главное — именно чередование «тонкий
 * коллектор — толстая перемычка» и есть то, что §4.3 п.7 требует сохранить:
 * не шесть однородных «слоёв торта», а много тонких пластов в толще.
 */
export const FIELD_STRATA: FieldStratum[] = (() => {
  const out: FieldStratum[] = [];
  const topOf = (h: Horizon): Fn => (x, z) => horizonTopY(h, x, z);
  const botOf = (h: Horizon): Fn => (x, z) => horizonBotY(h, x, z);

  const first = HORIZONS[0];
  let order = 0;

  out.push({
    id: 'g-soil',
    label: 'Почвенный слой',
    note: 'зона малых скоростей',
    top: ySoilTop,
    bot: (x, z) => Math.min(ySoilTop(x, z) - 6, absToSceneY(-24)),
    color: COLOR.soil,
    opacity: OPACITY.rock,
    phase: 'rock',
    order: order++,
  });

  out.push({
    id: 'g-overburden',
    label: 'Перекрывающая толща',
    note: 'выше продуктивного разреза',
    top: (x, z) => Math.min(ySoilTop(x, z) - 6, absToSceneY(-24)),
    bot: topOf(first),
    color: COLOR.overburden,
    opacity: OPACITY.rock,
    phase: 'rock',
    order: order++,
  });

  HORIZONS.forEach((h, i) => {
    const step = order++;

    if (!h.productive) {
      out.push({
        id: `h-${h.id}`,
        label: h.name,
        note: 'водоносный горизонт',
        top: topOf(h),
        bot: botOf(h),
        color: COLOR.aquifer,
        opacity: OPACITY.water,
        horizon: h,
        phase: 'water',
        order: step,
      });
    } else {
      /**
       * Продуктивный прослой делится водонефтяным контактом на две части — и
       * это не приём, а физика залежи.
       *
       * ВНК — горизонтальная отметка, одна на горизонт. Кровля пласта при этом
       * поднята антиклиналью на 26–38 м, а сам прослой толщиной 10–24 м. Значит
       * в своде пласт целиком выше контакта и заполнен нефтью, а на крыльях
       * уходит под него и обводнён. Граница между ними — замкнутый контур
       * нефтеносности, тот самый, который на картах и рисуют.
       *
       * Раньше залежь была отдельной линзой, положенной поверх пласта. Она
       * спорила с ним по глубине, требовала отдельной прозрачности и не давала
       * контакта: нефть просто лежала на коллекторе сверху.
       */
      const owc = absToSceneY(owcAbs(h));

      out.push({
        id: `h-${h.id}`,
        label: h.name,
        note: `${SUITE_LABEL[h.suite]} · нефтенасыщенная часть`,
        // Нефть — часть пласта выше контакта. На восточном крыле коллектор
        // замещён плотными породами, и залежь там кончается (§4.3 п.5).
        top: (x, z) =>
          reservoirPresence(x) < 0.5 ? owc : Math.max(horizonTopY(h, x, z), owc),
        bot: (x, z) =>
          reservoirPresence(x) < 0.5
            ? owc
            : Math.min(Math.max(horizonBotY(h, x, z), owc), Math.max(horizonTopY(h, x, z), owc)),
        color: COLOR.oil,
        opacity: OPACITY.oil,
        horizon: h,
        phase: 'oil',
        order: step,
      });

      out.push({
        id: `hw-${h.id}`,
        label: h.name,
        note: `${SUITE_LABEL[h.suite]} · водонасыщенная часть`,
        top: (x, z) => Math.min(horizonTopY(h, x, z), owc),
        bot: botOf(h),
        color: COLOR.water,
        opacity: OPACITY.water,
        horizon: h,
        phase: 'water',
        order: step,
      });
    }

    const next = HORIZONS[i + 1];
    if (next) {
      out.push({
        id: `ib-${h.id}`,
        label: 'Непроницаемая перемычка',
        top: botOf(h),
        bot: topOf(next),
        color: COLOR.interburden,
        opacity: OPACITY.rock,
        phase: 'rock',
        order: order++,
      });
    }
  });

  const last = HORIZONS[HORIZONS.length - 1];
  out.push({
    id: 'g-base',
    label: 'Фундамент',
    note: 'ниже продуктивного разреза',
    top: botOf(last),
    bot: () => absToSceneY(SECTION_BASE_ABS),
    color: COLOR.basement,
    opacity: OPACITY.rock,
    phase: 'rock',
    order: order++,
  });

  return out;
})();

/** Только продуктивные прослои — по ним строятся залежи и ВНК. */
export const PRODUCTIVE_STRATA = FIELD_STRATA.filter((s) => s.horizon?.productive);

/**
 * Опорный горизонт — М-I-А: самый верхний продуктивный и самый разбуренный
 * (135 скважин). К нему привязано всё, что в сцене требует «пласта» вообще:
 * сетка ГГДМ, сейсмический профиль, конус обводнения.
 */
export const REFERENCE_HORIZON = resolveHorizon('М-I-А')!;

export const resTopY: Fn = (x, z) => horizonTopY(REFERENCE_HORIZON, x, z);
export const resBotY: Fn = (x, z) => horizonBotY(REFERENCE_HORIZON, x, z);

/** ВНК опорного горизонта в координатах сцены. */
export const OWC_Y = absToSceneY(owcAbs(REFERENCE_HORIZON));

// ── Построение геометрии ────────────────────────────────────────────────────

/**
 * Прямоугольный слой блока: кровля, подошва и четыре стенки.
 *
 * Сегментация умеренная: слоёв тридцать один, и лишние треугольники здесь
 * умножаются на тридцать один. Свод и разломы читаются и на такой сетке —
 * рельефа в подземной части нет, формы гладкие.
 */
export function makeFieldLayer(topFn: Fn, botFn: Fn, rays = 72, rings = 16): THREE.BufferGeometry {
  const [cx, cz] = outlineCentroid();

  // Луч наружу под каждым углом: длина берётся от контура снятой площади,
  // поэтому слой повторяет её форму, а не рамку габарита.
  const reach: number[] = [];
  for (let r = 0; r < rays; r++) {
    reach.push(outlineRadius((r / rays) * Math.PI * 2));
  }

  const pos: number[] = [];
  const idx: number[] = [];

  /** Вершины: сначала кровля, затем подошва. Порядок — центр, потом кольца. */
  for (let pass = 0; pass < 2; pass++) {
    const fn = pass === 0 ? topFn : botFn;
    pos.push(cx, fn(cx, cz), cz);

    for (let ring = 1; ring <= rings; ring++) {
      const k = ring / rings;
      for (let r = 0; r < rays; r++) {
        const a = (r / rays) * Math.PI * 2;
        const x = cx + Math.cos(a) * reach[r] * k;
        const z = cz + Math.sin(a) * reach[r] * k;
        pos.push(x, fn(x, z), z);
      }
    }
  }

  const perSurface = 1 + rings * rays;
  /** Номер вершины: кольцо 0 — центр, дальше по лучам. */
  const V = (surface: number, ring: number, ray: number) =>
    surface * perSurface + (ring === 0 ? 0 : 1 + (ring - 1) * rays + (ray % rays));

  for (let surface = 0; surface < 2; surface++) {
    // Обход снизу разворачивается, иначе подошва смотрит внутрь толщи.
    const flip = surface === 1;

    for (let r = 0; r < rays; r++) {
      const a = V(surface, 0, 0);
      const b = V(surface, 1, r);
      const c = V(surface, 1, r + 1);
      idx.push(a, flip ? c : b, flip ? b : c);
    }

    for (let ring = 1; ring < rings; ring++) {
      for (let r = 0; r < rays; r++) {
        const a = V(surface, ring, r);
        const b = V(surface, ring, r + 1);
        const c = V(surface, ring + 1, r);
        const d = V(surface, ring + 1, r + 1);
        if (flip) idx.push(a, b, c, b, d, c);
        else idx.push(a, c, b, b, c, d);
      }
    }
  }

  // Боковая стенка по краю контура — то, что и видно на срезе блока.
  for (let r = 0; r < rays; r++) {
    const t0 = V(0, rings, r);
    const t1 = V(0, rings, r + 1);
    const b0 = V(1, rings, r);
    const b1 = V(1, rings, r + 1);
    idx.push(t0, b0, t1, t1, b0, b1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Нефтяная залежь горизонта: часть коллектора выше ВНК, ограниченная с востока
 * литологическим замещением.
 *
 * Замещение здесь не декоративное: коллектор выклинивается, и залежь на восток
 * не продолжается (§4.3 п.5). Там, где `reservoirPresence` уходит в ноль,
 * кровля и подошва линзы схлопываются — залежь физически кончается.
 */
export function makeOilLens(h: Horizon): THREE.BufferGeometry {
  const owc = absToSceneY(owcAbs(h));

  const top: Fn = (x, z) => {
    const t = horizonTopY(h, x, z);
    const present = reservoirPresence(x);
    return present <= 0.01 ? owc : Math.max(t, owc);
  };
  const bot: Fn = (x, z) => {
    const b = horizonBotY(h, x, z);
    const present = reservoirPresence(x);
    if (present <= 0.01) return owc;
    return Math.min(Math.max(b, owc - 0.5), top(x, z));
  };

  return makeFieldLayer(top, bot, 40, 28);
}

/**
 * Газовая шапка — только в блоке I (§4.3 п.4), в самом своде над нефтью.
 * Строится по верхнему меловому горизонту: именно там она и присутствует.
 */
export function makeGasCap(h: Horizon, westEdgeX: number): THREE.BufferGeometry {
  const gwc = absToSceneY(h.topAbs - (h.topAbs - h.botAbs) * 0.22);

  const inBlock = (x: number) => (x < westEdgeX ? 1 : 0);
  const top: Fn = (x, z) => (inBlock(x) ? horizonTopY(h, x, z) : gwc);
  const bot: Fn = (x, z) => (inBlock(x) ? Math.min(gwc, horizonTopY(h, x, z)) : gwc);

  return makeFieldLayer(top, bot, 28, 20);
}

/**
 * Радиус контура нефтеносности вдоль луча: кровля монотонно падает от свода,
 * поэтому уровень пересекается ровно один раз и годится половинное деление.
 */
export function ringRadius(h: Horizon, cx: number, cz: number, levelY: number): number {
  let lo = 0;
  let hi = 1;
  const reach = Math.max(HW, HD) * 1.4;
  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (horizonTopY(h, cx * mid * reach, cz * mid * reach) > levelY) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * reach;
}

/** След разлома в плане на заданной глубине — для отрисовки плоскостей сброса. */
export { dome, throwAt };

// ── Фонд скважин пилота ─────────────────────────────────────────────────────

/**
 * Минимум, нужный геометрии ствола. Выдуманного списка скважин здесь больше
 * нет: состав фонда приходит из реестра (`selectStoryWells`), а этот модуль
 * умеет только строить траекторию по устью, забою и отходу.
 */
export interface WellGeom {
  kind: WellKind;
  x: number;
  z: number;
  toe: number;
  drift: number;
}

export function wellCurve(w: WellGeom): THREE.CatmullRomCurve3 {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const head = surfY(w.x, w.z);
  if (w.kind === 'horiz') {
    return new THREE.CatmullRomCurve3([
      V(w.x, head, w.z),
      V(w.x, head + (w.toe - head) * 0.45, w.z),
      V(w.x + 15, head + (w.toe - head) * 0.8, w.z - 70),
      V(w.x + 35, w.toe, w.z - 160),
      V(w.x + 50, w.toe - 6, w.z - 280),
      V(w.x + 60, w.toe - 8, w.z - 460),
    ]);
  }
  return new THREE.CatmullRomCurve3([
    V(w.x, head, w.z),
    V(w.x + w.drift * 0.25, head + (w.toe - head) * 0.35, w.z + w.drift * 0.18),
    V(w.x + w.drift * 0.7, head + (w.toe - head) * 0.75, w.z + w.drift * 0.5),
    V(w.x + w.drift, w.toe, w.z + w.drift * 0.75),
  ]);
}

/**
 * Доля длины ствола, на которой лежит середина интервала перфорации.
 *
 * Перфорация вскрывается у забоя, а забой каждой скважины посажен на подошву
 * ЕЁ СОБСТВЕННОГО продуктивного горизонта из реестра. Поэтому доля пути и есть
 * правильная привязка: она автоматически попадает в нужный пласт, будь он
 * меловой на трёхстах метрах или юрский на шестистах.
 *
 * Раньше точка искалась по кровле опорного горизонта М-I-А — одного для всех.
 * У скважины, работающей на Ю-IV, перфорация оказывалась на двести метров выше
 * её пласта, в чужой толще.
 */
export const PERF_FRACTION = 0.93;

/** Доля пути до перфорации с учётом исполнения скважины. */
export function perfFraction(kind: WellKind): number {
  return kind === 'horiz' ? 0.82 : PERF_FRACTION;
}

/** Середина интервала перфорации — к ней крепятся линии тока и дренирование. */
export function perfPoint(w: WellGeom): THREE.Vector3 {
  const curve = wellCurve(w);
  // У горизонтальной перфорирован сам горизонтальный участок, а не забой.
  return curve.getPointAt(w.kind === 'horiz' ? 0.82 : PERF_FRACTION).clone();
}
