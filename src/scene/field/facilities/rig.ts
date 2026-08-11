import { box, cyl, flange, ladder, pipe, railing, sphere, torus, type Part } from '../kit/parts';

/**
 * Буровая установка (ТЗ §4.4.2, нитка строительства скважин).
 *
 * Состав по технологии: вышечно-лебёдочный блок с мачтой и кронблоком,
 * ротор и стол на буровой площадке, приёмные мостки со стеллажами труб,
 * циркуляционная система с ёмкостями и ситами, насосный блок, будка
 * бурильщика.
 *
 * Мостки и стеллажи здесь не декорация: по ним подают трубы на буровую, и без
 * них установка выглядит вышкой в чистом поле. Циркуляционная система — то,
 * чем буровой раствор очищается и возвращается в скважину, и её ёмкости
 * занимают на площадке места не меньше, чем сама вышка.
 *
 * Высота мачты 41 м — типовая для установок эшелонного типа, применяемых на
 * глубинах до полутора километров. Марка установки в переданных материалах не
 * указана.
 *
 * Подвижные узлы — талевый блок и ротор — в сборку не входят: они живут
 * отдельными мешами и анимируются.
 */

const MAST_H = 41;
const FLOOR_Y = 6.2;

/** Решётчатая мачта: четыре пояса, горизонтальные связи и раскосы. */
function mast(): Part[] {
  const out: Part[] = [];
  const base = 6.4;
  const top = 1.8;
  const LEVELS = 10;

  const corner = (sx: number, sz: number, t: number): [number, number, number] => {
    const half = base + (top - base) * t;
    return [half * sx, FLOOR_Y + MAST_H * t, half * sz];
  };

  const S: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];

  // Пояса
  for (const [sx, sz] of S) {
    out.push(pipe('steel', 0.2, corner(sx, sz, 0), corner(sx, sz, 1), 6));
  }

  // Связи по ярусам: горизонтальные и раскосы
  for (let l = 1; l <= LEVELS; l++) {
    const t = l / LEVELS;
    const p = (l - 1) / LEVELS;
    for (let k = 0; k < 4; k++) {
      const a = S[k];
      const b = S[(k + 1) % 4];
      out.push(pipe('steel', 0.11, corner(a[0], a[1], t), corner(b[0], b[1], t), 5));
      out.push(pipe('steel', 0.08, corner(a[0], a[1], p), corner(b[0], b[1], t), 5));
    }
  }

  return out;
}

export function buildRigStatic(): Part[] {
  const out: Part[] = [];

  // ── Основание и буровая площадка ─────────────────────────────────────────
  out.push(box('concrete', 22, 0.5, 18, 0, 0.25, 0));
  // Основание вышечного блока: опорные тумбы и настил на отметке
  for (const [dx, dz] of [
    [-6.4, -6.4],
    [6.4, -6.4],
    [6.4, 6.4],
    [-6.4, 6.4],
  ] as const) {
    out.push(box('steelDark', 1.4, FLOOR_Y - 0.5, 1.4, dx, (FLOOR_Y - 0.5) / 2 + 0.5, dz));
  }
  out.push(box('steel', 15, 0.35, 15, 0, FLOOR_Y - 0.18, 0));
  out.push(...railing(0, FLOOR_Y, 0, 15, 15, 1.15));

  // ── Мачта и кронблок ─────────────────────────────────────────────────────
  out.push(...mast());
  out.push(box('steelDark', 4.4, 1.3, 4.4, 0, FLOOR_Y + MAST_H + 0.65, 0));
  // Шкивы кронблока
  for (const dz of [-0.9, -0.3, 0.3, 0.9]) {
    out.push(torus('steel', 0.55, 0.12, 0, FLOOR_Y + MAST_H + 0.65, dz, 0, Math.PI / 2, 0));
  }
  // Балкон верхового рабочего
  out.push(box('steel', 3.0, 0.12, 1.6, 0, FLOOR_Y + MAST_H * 0.62, 2.4));
  out.push(...railing(0, FLOOR_Y + MAST_H * 0.62 + 0.12, 2.4, 3.0, 1.6, 1.0));

  // ── Лебёдка и привод ─────────────────────────────────────────────────────
  out.push(box('painted', 4.2, 2.0, 2.6, -4.4, FLOOR_Y + 1.0, -3.2));
  out.push(cyl('steel', 0.75, 3.2, -4.4, FLOOR_Y + 1.2, -3.2, 0, 0, Math.PI / 2, 14));
  out.push(box('painted', 2.4, 1.6, 1.8, -8.2, FLOOR_Y + 0.8, -3.2));

  // ── Будка бурильщика ─────────────────────────────────────────────────────
  out.push(box('painted', 2.8, 2.4, 2.2, 5.2, FLOOR_Y + 1.2, -4.0));
  out.push(box('glass', 2.2, 1.0, 0.08, 5.2, FLOOR_Y + 1.8, -2.86));
  out.push(box('steelDark', 0.85, 1.9, 0.08, 6.4, FLOOR_Y + 0.95, -2.86));

  // ── Приёмные мостки со стеллажами труб ───────────────────────────────────
  // Наклонный настил от земли к полу буровой: по нему трубы затаскивают наверх.
  const RAMP_LEN = 18;
  out.push(box('steel', 2.4, 0.25, RAMP_LEN, 0, FLOOR_Y / 2 + 0.4, 11 + RAMP_LEN / 2, 0, 0));
  // Наклон задаётся поворотом вокруг X — parts.box поворота по X не даёт,
  // поэтому настил набирается ступенями: их всё равно не видно за трубами.
  for (let i = 0; i < 8; i++) {
    const t = i / 8;
    out.push(box('steel', 2.6, 0.2, RAMP_LEN / 8, 0, 0.6 + (FLOOR_Y - 0.9) * (1 - t), 11 + RAMP_LEN * t));
  }

  // Стеллажи: два ряда труб по обе стороны от мостков
  for (const side of [-1, 1]) {
    const zx = side * 5.2;
    for (let i = 0; i < 3; i++) {
      out.push(box('steelDark', 0.25, 0.7, 12, zx, 0.85, 14 + i * 0.01));
    }
    // Свечи бурильных труб, уложенные горизонтально
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 7; i++) {
        out.push(
          cyl(
            'pipe',
            0.14,
            11.5,
            zx + (i - 3) * 0.34,
            1.35 + row * 0.3,
            15.5,
            Math.PI / 2,
            0,
            0,
            8,
          ),
        );
      }
    }
  }

  // ── Циркуляционная система ───────────────────────────────────────────────
  // Три ёмкости в линию с переливами, вибросито и желоба.
  for (let i = 0; i < 3; i++) {
    const x = -13 - i * 4.6;
    out.push(box('painted', 4.2, 2.6, 8, x, 1.6, 6));
    out.push(box('steel', 4.4, 0.12, 8.2, x, 2.96, 6));
    out.push(...railing(x, 2.96, 6, 4.4, 8.2, 1.05));
    if (i < 2) out.push(pipe('pipe', 0.2, [x - 2.1, 2.2, 6], [x - 2.5, 2.2, 6]));
  }
  out.push(...ladder(-13, 0.5, 1.6, 2.9));
  // Вибросито на первой ёмкости
  out.push(box('steelDark', 2.6, 0.9, 2.0, -13, 3.5, 2.4, 0, -0.12));
  out.push(box('accent', 2.4, 0.06, 1.8, -13, 3.98, 2.4, 0, -0.12));

  // Насосный блок: два буровых насоса
  for (let i = 0; i < 2; i++) {
    const z = -4 - i * 4.2;
    out.push(box('steelDark', 5.4, 0.4, 2.4, -15, 0.7, z));
    out.push(box('painted', 3.0, 1.7, 2.0, -16, 1.75, z));
    out.push(cyl('steel', 0.62, 2.2, -13.2, 1.6, z, 0, 0, Math.PI / 2, 14));
    out.push(flange('steelDark', 0.78, -12.1, 1.6, z, 0, 0, Math.PI / 2));
  }

  // Манифольд высокого давления к стояку
  out.push(pipe('pipe', 0.16, [-12, 2.4, -4], [-6, 2.4, -4]));
  out.push(pipe('pipe', 0.16, [-6, 2.4, -4], [-6, FLOOR_Y + MAST_H * 0.55, -4]));
  out.push(pipe('pipe', 0.14, [-6, FLOOR_Y + MAST_H * 0.55, -4], [-2.2, FLOOR_Y + MAST_H * 0.58, -1.2]));

  // ── Устьевая обвязка и превентор ─────────────────────────────────────────
  out.push(cyl('steelDark', 0.72, 1.8, 0, FLOOR_Y - 1.4, 0, 0, 0, 0, 12));
  out.push(torus('steelDark', 0.8, 0.12, 0, FLOOR_Y - 0.7, 0, Math.PI / 2));
  out.push(cyl('steelDark', 0.55, 1.2, 0, FLOOR_Y - 2.6, 0, 0, 0, 0, 12));
  out.push(pipe('pipe', 0.12, [0.6, FLOOR_Y - 2.4, 0], [4.5, FLOOR_Y - 2.4, 3.0]));

  // ── Обстановка площадки ──────────────────────────────────────────────────
  out.push(...ladder(7.8, 0.5, 0, FLOOR_Y - 0.4));
  // Ёмкость ГСМ и склад
  out.push(cyl('insulation', 1.2, 5.0, 13, 1.7, -6, 0, 0, Math.PI / 2, 14));
  for (const dx of [11.2, 14.8]) out.push(box('steelDark', 0.4, 1.0, 2.4, dx, 0.7, -6));
  // Мачты освещения
  for (const [mx, mz] of [
    [-10, -9],
    [10, -9],
  ] as const) {
    out.push(cyl('steel', 0.11, 9, mx, 4.9, mz, 0, 0, 0, 8));
    out.push(box('steelDark', 1.5, 0.18, 0.3, mx, 9.3, mz, 0, -0.24));
  }
  out.push(sphere('accent', 0.22, 0, FLOOR_Y + MAST_H + 1.5, 0));

  return out;
}
