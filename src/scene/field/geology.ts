import * as THREE from 'three';
import { absToSceneY, FIELD_H, FIELD_W } from '../../data/geo/fieldData';
import type { WellKind } from '../../data/geo/storyWells';
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

const COLOR = {
  soil: '#5c5448',
  overburden: '#44423e',
  aquifer: '#2b4a63',
  interburden: '#3a3d42',
  /** Нефтенасыщенная часть коллектора. */
  oil: '#7d5320',
  /** Водонасыщенная часть того же коллектора. */
  water: '#2e4a5e',
  basement: '#191c24',
};

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
    opacity: 1,
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
    opacity: 1,
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
        opacity: 1,
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
        opacity: 1,
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
        opacity: 1,
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
        opacity: 1,
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
    opacity: 1,
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
export function makeFieldLayer(topFn: Fn, botFn: Fn, segX = 48, segZ = 34): THREE.BufferGeometry {
  const nx = segX + 1;
  const nz = segZ + 1;
  const pos: number[] = [];
  const idx: number[] = [];

  for (let pass = 0; pass < 2; pass++) {
    const fn = pass === 0 ? topFn : botFn;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = -HW + (2 * HW * i) / segX;
        const z = -HD + (2 * HD * j) / segZ;
        pos.push(x, fn(x, z), z);
      }
    }
  }

  const T = (i: number, j: number) => j * nx + i;
  const B = (i: number, j: number) => nx * nz + j * nx + i;

  for (let j = 0; j < segZ; j++) {
    for (let i = 0; i < segX; i++) {
      idx.push(T(i, j), T(i, j + 1), T(i + 1, j), T(i + 1, j), T(i, j + 1), T(i + 1, j + 1));
      idx.push(B(i, j), B(i + 1, j), B(i, j + 1), B(i + 1, j), B(i + 1, j + 1), B(i, j + 1));
    }
  }
  for (let i = 0; i < segX; i++) {
    idx.push(T(i, 0), T(i + 1, 0), B(i, 0), T(i + 1, 0), B(i + 1, 0), B(i, 0));
    idx.push(T(i, segZ), B(i, segZ), T(i + 1, segZ), T(i + 1, segZ), B(i, segZ), B(i + 1, segZ));
  }
  for (let j = 0; j < segZ; j++) {
    idx.push(T(0, j), B(0, j), T(0, j + 1), T(0, j + 1), B(0, j), B(0, j + 1));
    idx.push(T(segX, j), T(segX, j + 1), B(segX, j), T(segX, j + 1), B(segX, j + 1), B(segX, j));
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

/** Середина интервала перфорации — к ней крепятся линии тока и зоны дренирования. */
export function perfPoint(w: WellGeom): THREE.Vector3 {
  const curve = wellCurve(w);
  const pts = curve.getPoints(200);
  if (w.kind === 'horiz') return pts[Math.round(pts.length * 0.82)].clone();

  const px = w.x + w.drift * 0.85;
  const pz = w.z + w.drift * 0.6;
  const target = resTopY(px, pz) - 12;
  let best = pts[0];
  let bd = Infinity;
  for (const p of pts) {
    const d = Math.abs(p.y - target);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best.clone();
}
