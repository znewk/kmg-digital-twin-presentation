import * as THREE from 'three';
import { FIELD_H, FIELD_W } from '../../data/geo/fieldData';

/**
 * Геология месторождения в метрическом масштабе: 1 единица сцены = 1 метр.
 *
 * Функции перенесены из референсного прототипа — там процедурная геология была
 * сделана правильно: шум `fbm` + антиклиналь `dome` + сброс со смещением
 * (`faultTraceX`/`throwAt`). Это то, что даёт реалистичный разрез вместо
 * «игрушечных» полосок.
 *
 * Отличие от прототипа — дисциплина масштаба (ТЗ §2). Там объекты
 * подгонялись индивидуальными `scale.setScalar(1.3…1.6)`, отсюда и претензия
 * «слишком мелко/крупно». Здесь все размеры истинные, а любое преувеличение —
 * один явный коэффициент на группу.
 */

/**
 * Полуразмеры блока по фактическому габариту съёмки: 5352 × 4682 м.
 * Раньше здесь было выдуманное 1400 × 900 — почти вчетверо меньше настоящего
 * промысла, и вся раскладка сцены была условной.
 */
export const HW = FIELD_W / 2;
export const HD = FIELD_H / 2;

/** Водонефтяной контакт, м. */
export const OWC_Y = -520;

/**
 * НЕДРА ОСТАЮТСЯ УСЛОВНЫМИ. Топоплан описывает только поверхность —
 * подземной модели в нём нет, а данных по геологии Молдабека заказчик пока не
 * передал (ТЗ §12). Поэтому антиклиналь, сброс, залежь и ВНК по-прежнему
 * процедурные. В интерфейсе разрез помечается как условная модель: когда
 * поверхность настоящая, условные недра рядом с ней слишком легко принять за
 * факт, а аудитория здесь техническая.
 *
 * Частоты и радиусы пересчитаны под фактический габарит 5352 × 4682 м —
 * прежние были подогнаны под выдуманные 1400 × 900 и на реальном участке
 * давали рябь вместо свода.
 */
const GEO_SCALE = 700 / (FIELD_W / 2);

export function fbm(x: number, z: number): number {
  const sx = x * GEO_SCALE;
  const sz = z * GEO_SCALE;
  return (
    Math.sin(sx * 0.006 + sz * 0.009) * 0.55 +
    Math.sin(sx * 0.017 - sz * 0.013 + 1.7) * 0.3 +
    Math.sin(sx * 0.037 + sz * 0.031 + 4.2) * 0.15
  );
}

/** Свод антиклинали — вытянут по простиранию промысла, с юго-запада на восток. */
export function dome(x: number, z: number): number {
  return Math.exp(-((x * x) / (1760 * 1760) + (z * z) / (1500 * 1500)));
}

const smoothstep = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** След сброса по глубине: плоскость наклонена, поэтому зависит от depth. */
export function faultTraceX(depth: number, z: number): number {
  return 1630 + 0.5 * (depth + 40) + 0.12 * z;
}

/** Вертикальное смещение по сбросу — висячее крыло опущено на 60 м. */
export function throwAt(x: number, z: number, depth: number): number {
  return -60 * smoothstep((x - faultTraceX(depth, z)) / 100 + 0.5);
}

type Fn = (x: number, z: number) => number;

/**
 * ЕДИНАЯ ОТМЕТКА ЗЕМЛИ. Всё, что стоит на промысле — площадки, установки,
 * устья скважин, опоры труб, — садится ровно на `surfY`. Рельеф тоже.
 *
 * Кровля почвенного слоя уходит на два метра НИЖЕ рельефа. Раньше она была на
 * −40 м, и промысел висел над породой в воздухе; потом я сшил их вровень, и
 * копланарные поверхности начали драться за глубину. Поднимать рельеф нельзя —
 * тогда сооружения проваливаются под него. Поэтому опускается порода: рельеф
 * остаётся точкой отсчёта для всего, что на нём стоит, а зазор в два метра при
 * блоке глубиной 900 м не виден.
 */
export const GROUND: Fn = (x, z) => surfY(x, z);

export const ySoilTop: Fn = (x, z) => surfY(x, z) - 2;
export const yOverTop: Fn = (x, z) => -180 + 34 * dome(x, z) + 12 * fbm(x, z) + throwAt(x, z, -180);
export const yCapTop: Fn = (x, z) =>
  -480 + 90 * dome(x, z) + 10 * fbm(x * 1.2, z * 1.2) + throwAt(x, z, -480);
export const yResTop: Fn = (x, z) => -540 + 95 * dome(x, z) + 10 * fbm(x, z) + throwAt(x, z, -540);
export const yResBot: Fn = (x, z) => -700 + 80 * dome(x, z) + 9 * fbm(x, z) + throwAt(x, z, -700);
export const yWaterBot: Fn = (x, z) => -800 + 40 * dome(x, z) + 7 * fbm(x, z) + throwAt(x, z, -800);
export const yBaseBot: Fn = () => -900;

/**
 * Отражающие горизонты в перекрывающей толще. Без них триста метров породы
 * читаются однородной массой и разрез теряет глубину.
 */
export const OVERBURDEN_MARKERS = [-260, -340, -420];

export const markerHorizon = (d: number): Fn => (x, z) =>
  d + 55 * dome(x, z) * ((d + 480) / 300 + 0.4) + 10 * fbm(x, z) + throwAt(x, z, d);

/**
 * ОТМЕТКА ЗЕМЛИ — теперь настоящая (ТЗ §4.1 п.2).
 *
 * Раньше здесь был процедурный шум с выполаживанием под выдуманными
 * площадками. Сейчас высота берётся выборкой из высотной сетки топоплана,
 * построенной по 30 864 геодезическим отметкам съёмки 2023 года.
 *
 * Функция синхронная и вызывается из десятков мест, а датасет грузится
 * асинхронно, поэтому сэмплер подставляется один раз при загрузке. До неё
 * поверхность плоская — но поле и монтируется только под Suspense, уже после.
 */
let sampler: ((x: number, z: number) => number) | null = null;

export function setTerrainSampler(fn: (x: number, z: number) => number): void {
  sampler = fn;
}

export function surfY(x: number, z: number): number {
  return sampler ? sampler(x, z) : 0;
}

export interface FieldStratum {
  id: string;
  label: string;
  top: Fn;
  bot: Fn;
  color: string;
  opacity: number;
}

/** Та же дисциплина цвета, что и на витрине: тёплый верх, холодный низ. */
export const FIELD_STRATA: FieldStratum[] = [
  { id: 'g-soil', label: 'Почвенный слой · ЗСС', top: ySoilTop, bot: yOverTop, color: '#5c5448', opacity: 1 },
  { id: 'g-over', label: 'Перекрывающая толща', top: yOverTop, bot: yCapTop, color: '#44423e', opacity: 1 },
  { id: 'g-cap', label: 'Покрышка · флюидоупор', top: yCapTop, bot: yResTop, color: '#26333e', opacity: 1 },
  { id: 'g-res', label: 'Продуктивный пласт', top: yResTop, bot: yResBot, color: '#7a5a33', opacity: 0.78 },
  { id: 'g-water', label: 'Водонасыщенная зона', top: yResBot, bot: yWaterBot, color: '#28455c', opacity: 1 },
  { id: 'g-base', label: 'Фундамент', top: yWaterBot, bot: yBaseBot, color: '#191c24', opacity: 1 },
];

/**
 * Прямоугольный слой блока: кровля, подошва и четыре стенки. Сегментация
 * умеренная — слоёв шесть, и лишние треугольники здесь умножаются на шесть.
 */
export function makeFieldLayer(topFn: Fn, botFn: Fn, segX = 44, segZ = 30): THREE.BufferGeometry {
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

/** Нефтяная залежь: часть коллектора выше ВНК. */
export function makeOilLens(): THREE.BufferGeometry {
  const top: Fn = (x, z) => Math.max(yResTop(x, z) - 4, OWC_Y);
  const bot: Fn = (x, z) => Math.min(Math.max(yResBot(x, z) + 4, OWC_Y), top(x, z));
  return makeFieldLayer(top, bot, 40, 28);
}

/** Радиус контура нефтеносности вдоль луча — кровля монотонно падает от свода. */
export function ringRadius(cx: number, cz: number, level: number): number {
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (yResTop(cx * mid, cz * mid) > level) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Фонд скважин пилота ─────────────────────────────────────────────────────

export type WellKind = 'skn' | 'esp' | 'horiz' | 'frac' | 'inj' | 'drill' | 'wo';

export interface WellSpec {
  id: string;
  label: string;
  kind: WellKind;
  x: number;
  z: number;
  toe: number;
  drift: number;
}

/** Состав фонда — из реестра прототипа, он согласован с топологией пилота. */
export const WELLS: WellSpec[] = [
  { id: 'w-prod-1', label: 'Добывающая Д-1 · ШГН', kind: 'skn', x: 180, z: -120, toe: -640, drift: 40 },
  { id: 'w-prod-2', label: 'Добывающая Д-2 · УЭВН', kind: 'esp', x: 420, z: 160, toe: -630, drift: -46 },
  { id: 'w-prod-3', label: 'Горизонтальная Д-3', kind: 'horiz', x: 60, z: 300, toe: -590, drift: 0 },
  { id: 'w-prod-4', label: 'Добывающая Д-4 · ГРП', kind: 'frac', x: 300, z: -340, toe: -635, drift: -40 },
  { id: 'w-inj-1', label: 'Нагнетательная Н-1 · ППД', kind: 'inj', x: -280, z: 80, toe: -655, drift: 36 },
  { id: 'w-inj-2', label: 'Нагнетательная Н-2 · ППД', kind: 'inj', x: -120, z: -320, toe: -660, drift: -30 },
  { id: 'w-drill', label: 'Бурящаяся Б-1', kind: 'drill', x: -520, z: -140, toe: -320, drift: 18 },
  { id: 'w-workover', label: 'ПРС · подъёмник, ДЭЛ', kind: 'wo', x: 520, z: -220, toe: -610, drift: 30 },
];

export function wellCurve(w: WellSpec): THREE.CatmullRomCurve3 {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  if (w.kind === 'horiz') {
    return new THREE.CatmullRomCurve3([
      V(w.x, 0, w.z),
      V(w.x, -260, w.z),
      V(w.x + 15, -470, w.z - 70),
      V(w.x + 35, -575, w.z - 160),
      V(w.x + 50, -590, w.z - 280),
      V(w.x + 60, -592, w.z - 460),
    ]);
  }
  return new THREE.CatmullRomCurve3([
    V(w.x, 0, w.z),
    V(w.x + w.drift * 0.25, w.toe * 0.35, w.z + w.drift * 0.18),
    V(w.x + w.drift * 0.7, w.toe * 0.75, w.z + w.drift * 0.5),
    V(w.x + w.drift, w.toe, w.z + w.drift * 0.75),
  ]);
}

/** Середина интервала перфорации — к ней крепятся линии тока и зоны дренирования. */
export function perfPoint(w: WellSpec): THREE.Vector3 {
  const curve = wellCurve(w);
  const pts = curve.getPoints(200);
  if (w.kind === 'horiz') return pts[Math.round(pts.length * 0.82)].clone();
  const px = w.x + w.drift * 0.85;
  const pz = w.z + w.drift * 0.6;
  const target = yResTop(px, pz) - 40;
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
