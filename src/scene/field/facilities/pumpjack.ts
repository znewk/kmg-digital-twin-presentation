import * as THREE from 'three';
import {
  box,
  cyl,
  mergeIndexed,
  mergeParts,
  pipe,
  sphere,
  torus,
  type Part,
} from '../kit/parts';

/**
 * Станок-качалка ШГН — самая массовая машина промысла.
 *
 * Задача нетривиальная: качалок на Восточном Молдабеке около шестисот, все
 * работают, и все обязаны качаться. Отдельными объектами это тысячи вызовов
 * отрисовки. Поэтому модель разложена на три части по признаку подвижности:
 *
 *  · неподвижное — рама, пирамидальная стойка, редуктор, электродвигатель,
 *    ограждение ремённой передачи, устьевой сальник;
 *  · балансир с головкой и хвостовым подшипником — качается вокруг оси на
 *    вершине стойки;
 *  · кривошип с противовесом — вращается вокруг вала редуктора.
 *
 * Плюс шатун, который соединяет палец кривошипа с хвостом балансира: его
 * положение считается из положения обоих, поэтому он живёт отдельной матрицей.
 *
 * Итого пять инстансированных мешей на весь фонд вместо шести тысяч объектов.
 *
 * Размеры соответствуют классу СК8: балансир 9,2 м, высота стойки 6 м, радиус
 * кривошипа около метра. Марка станка в переданных материалах не указана —
 * величины типовые.
 */

/** Высота оси качания над основанием, м. */
export const PIVOT_Y = 6;
/** Смещение оси качания от центра рамы, м. */
export const PIVOT_X = 0.4;
/** Длина плеча балансира до головки, м. */
export const BEAM_HEAD = 5.2;
/** Длина плеча балансира до хвоста, м. */
export const BEAM_TAIL = 4;
/** Центр вала кривошипа. */
export const CRANK_X = 3.4;
export const CRANK_Y = 1.8;
/** Радиус кривошипа, м. */
export const CRANK_R = 1.05;
/** Амплитуда качания балансира, рад. */
export const BEAM_SWING = 0.17;

// ── Неподвижная часть ───────────────────────────────────────────────────────

export function buildPumpjackStatic(): Part[] {
  const out: Part[] = [];

  // Рама-основание на бетонных тумбах
  out.push(box('concrete', 8.4, 0.35, 3.2, 0, 0.18, 0));
  out.push(box('steelDark', 7.8, 0.55, 2.8, 0, 0.6, 0));
  for (const x of [-3.2, 0, 3.2]) {
    out.push(box('steelDark', 0.4, 0.5, 3.0, x, 0.6, 0));
  }

  // Пирамидальная стойка: четыре ноги к оси качания плюс связи
  const top: [number, number, number] = [PIVOT_X, PIVOT_Y, 0];
  const feet: [number, number, number][] = [
    [-1.0, 0.85, -1.1],
    [-1.0, 0.85, 1.1],
    [1.8, 0.85, -1.1],
    [1.8, 0.85, 1.1],
  ];
  for (const f of feet) out.push(pipe('steel', 0.11, f, top, 6));
  // Горизонтальные связи между ногами на середине высоты
  for (let i = 0; i < 4; i++) {
    const a = feet[i];
    const b = feet[(i + 1) % 4];
    const mid = (p: [number, number, number]): [number, number, number] => [
      p[0] + (top[0] - p[0]) * 0.45,
      p[1] + (top[1] - p[1]) * 0.45,
      p[2] + (top[2] - p[2]) * 0.45,
    ];
    out.push(pipe('steel', 0.06, mid(a), mid(b), 5));
  }

  // Опорный узел оси качания
  out.push(box('steelDark', 0.9, 0.5, 1.5, PIVOT_X, PIVOT_Y, 0));

  // Редуктор, шкив и электродвигатель
  out.push(box('painted', 1.9, 1.3, 1.5, CRANK_X, 1.1, 0));
  out.push(cyl('steelDark', 0.34, 0.3, CRANK_X - 1.0, 1.35, 0, 0, 0, Math.PI / 2, 12));
  out.push(cyl('painted', 0.45, 1.2, CRANK_X - 2.4, 1.15, 0, 0, 0, Math.PI / 2, 12));
  // Ограждение ремённой передачи
  out.push(box('steel', 1.5, 1.0, 0.12, CRANK_X - 1.7, 1.25, 0.42));
  out.push(box('steel', 1.5, 1.0, 0.12, CRANK_X - 1.7, 1.25, -0.42));

  // Станция управления на раме
  out.push(box('painted', 0.7, 1.3, 0.6, -3.4, 1.3, 1.1));

  // Устьевая обвязка под головкой балансира: сальник, тройник, выкидная линия
  const wx = -BEAM_HEAD;
  out.push(cyl('steelDark', 0.42, 0.9, wx, 0.95, 0, 0, 0, 0, 12));
  out.push(cyl('steel', 0.26, 0.7, wx, 1.65, 0, 0, 0, 0, 10));
  out.push(torus('steelDark', 0.3, 0.06, wx, 1.35, 0, Math.PI / 2));
  out.push(pipe('pipe', 0.11, [wx, 1.2, 0], [wx - 1.6, 1.2, 0]));
  out.push(pipe('pipe', 0.11, [wx - 1.6, 1.2, 0], [wx - 1.6, 0.5, 0]));
  out.push(box('steelDark', 0.34, 0.42, 0.34, wx - 1.6, 1.45, 0));

  return out;
}

// ── Балансир ────────────────────────────────────────────────────────────────

/**
 * Балансир с головкой и хвостовым подшипником. Начало координат — на оси
 * качания, поэтому вращать его можно прямо матрицей инстанса.
 *
 * Головка балансира («конская голова») набирается дугой из коротких пластин:
 * именно её силуэт делает качалку качалкой, и обойтись прямым срезом нельзя.
 */
export function buildPumpjackBeam(): Part[] {
  const out: Part[] = [];

  // Тело балансира — двутавр из трёх пластин
  out.push(box('steel', BEAM_HEAD + BEAM_TAIL, 0.16, 0.62, (BEAM_TAIL - BEAM_HEAD) / 2, 0.3, 0));
  out.push(box('steel', BEAM_HEAD + BEAM_TAIL, 0.16, 0.62, (BEAM_TAIL - BEAM_HEAD) / 2, -0.3, 0));
  out.push(box('steel', BEAM_HEAD + BEAM_TAIL, 0.44, 0.16, (BEAM_TAIL - BEAM_HEAD) / 2, 0, 0));

  // Головка балансира: дуга радиусом 1,5 м на конце плеча
  const R = 1.5;
  const cx = -BEAM_HEAD + 0.1;
  for (let i = 0; i <= 8; i++) {
    const a = -0.95 + (i / 8) * 1.9;
    out.push(
      box(
        'steel',
        0.42,
        0.12,
        0.9,
        cx + Math.sin(a) * R,
        -R + Math.cos(a) * R,
        0,
        0,
        a,
      ),
    );
  }
  // Боковые щёки головки и канатная подвеска
  for (const z of [-0.5, 0.5]) {
    out.push(box('steelDark', 1.1, 1.5, 0.1, cx + 0.2, -0.8, z, 0, 0.3));
  }
  out.push(pipe('steelDark', 0.05, [cx - 1.35, -1.5, -0.34], [cx - 1.42, -3.6, -0.24], 5));
  out.push(pipe('steelDark', 0.05, [cx - 1.35, -1.5, 0.34], [cx - 1.42, -3.6, 0.24], 5));
  // Траверса канатной подвески и полированный шток
  out.push(box('steelDark', 0.5, 0.14, 0.8, cx - 1.42, -3.65, 0));
  out.push(cyl('steel', 0.06, 1.4, cx - 1.42, -4.35, 0, 0, 0, 0, 8));

  // Хвостовой подшипник — к нему крепится шатун
  out.push(box('steelDark', 0.6, 0.5, 0.95, BEAM_TAIL, 0, 0));
  out.push(cyl('steelDark', 0.16, 1.1, BEAM_TAIL, 0, 0, Math.PI / 2, 0, 0, 10));

  return out;
}

// ── Кривошип с противовесом ─────────────────────────────────────────────────

/** Начало координат — на валу редуктора. */
export function buildPumpjackCrank(): Part[] {
  const out: Part[] = [];

  for (const z of [-0.55, 0.55]) {
    // Плечо кривошипа
    out.push(box('steelDark', 0.42, CRANK_R * 2 + 0.5, 0.22, 0, CRANK_R * 0.15, z));
    // Противовес на дальнем плече
    out.push(box('steelDark', 0.85, 1.4, 0.42, 0, -CRANK_R * 0.85, z));
  }
  // Вал и палец кривошипа
  out.push(cyl('steel', 0.14, 1.3, 0, 0, 0, Math.PI / 2, 0, 0, 10));
  out.push(cyl('steel', 0.11, 1.4, 0, CRANK_R, 0, Math.PI / 2, 0, 0, 10));
  out.push(sphere('steel', 0.13, 0, CRANK_R, 0));

  return out;
}

/** Шатун единичной длины вдоль Y, началом в пальце кривошипа. */
export function buildPumpjackPitman(): Part[] {
  return [
    box('steel', 0.16, 1, 0.16, 0, 0.5, -0.55),
    box('steel', 0.16, 1, 0.16, 0, 0.5, 0.55),
    box('steelDark', 0.3, 0.16, 1.3, 0, 0.06, 0),
  ];
}

// ── Кинематика ──────────────────────────────────────────────────────────────

const _pin = new THREE.Vector3();
const _tail = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export interface PumpjackPose {
  beamAngle: number;
  crankAngle: number;
  /** Середина шатуна в системе координат станка. */
  pitmanMid: THREE.Vector3;
  pitmanQuat: THREE.Quaternion;
  pitmanLength: number;
}

const pose: PumpjackPose = {
  beamAngle: 0,
  crankAngle: 0,
  pitmanMid: new THREE.Vector3(),
  pitmanQuat: new THREE.Quaternion(),
  pitmanLength: 1,
};

/**
 * Положение узлов станка по фазе.
 *
 * Балансир качается по синусу, кривошип вращается равномерно — а шатун
 * строится по фактическим положениям пальца кривошипа и хвоста балансира.
 * Если бы шатун просто вращался вместе с кривошипом, его верхний конец
 * отрывался бы от балансира, и вблизи это первое, что бросается в глаза.
 *
 * Объект переиспользуется: функция вызывается шестьсот раз в кадр.
 */
export function pumpjackPose(phase: number): PumpjackPose {
  pose.crankAngle = phase;
  pose.beamAngle = Math.sin(phase) * BEAM_SWING;

  _pin.set(CRANK_X + Math.cos(phase) * CRANK_R, CRANK_Y + Math.sin(phase) * CRANK_R, 0);
  _tail.set(
    PIVOT_X + Math.cos(pose.beamAngle) * BEAM_TAIL,
    PIVOT_Y + Math.sin(pose.beamAngle) * BEAM_TAIL,
    0,
  );

  _dir.subVectors(_tail, _pin);
  pose.pitmanLength = _dir.length();
  _dir.normalize();
  pose.pitmanQuat.setFromUnitVectors(_up, _dir);
  pose.pitmanMid.copy(_pin);

  return pose;
}

/**
 * Слитая геометрия подвижного узла — одна на весь фонд.
 *
 * Все детали узла сливаются в ОДНУ геометрию независимо от материала: на
 * подвижный узел приходится по инстансированному мешу, и разводить его ещё и
 * по материалам значило бы удваивать их число ради оттенка стали. Цвет
 * задаётся общий, разница между сталью и окрашенным металлом остаётся только
 * у неподвижной части, где это ничего не стоит.
 */
export function mergeSingle(parts: Part[]): THREE.BufferGeometry {
  return mergeIndexed([...mergeParts(parts).values()]);
}
