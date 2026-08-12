import * as THREE from 'three';

/**
 * Геометрия диорамы: блок неправильной формы с вырезанным сектором.
 *
 * Куб из коробок был честным, но тупым: прямые грани и плоские слои читаются
 * как схема в учебнике, а не как кусок земли. Здесь тот же принцип, что и у
 * блока недр в основной сцене, — полярная сетка по контуру, — только контур
 * задан не съёмкой, а мягкой неправильной кривой, и в нём вырезан сектор.
 *
 * Каждый слой строится одной функцией и получает сразу всё: рельефную кровлю,
 * боковую стенку по контуру и две плоскости реза. Поэтому слои гарантированно
 * стыкуются: подошва одного — та же функция, что кровля следующего, а не
 * похожее на неё число.
 */

/** Средний радиус блока в плане. */
export const R = 27;

/** Границы выреза: сектор, которого в блоке нет. */
export const NOTCH_FROM = -Math.PI * 0.5;
export const NOTCH_TO = 0;

/**
 * Контур блока — окружность, поведённая двумя гармониками.
 *
 * Ровный круг выглядит выточенным на станке, случайный шум — рваным. Две
 * синусоиды разной частоты дают мягкую неправильность: форма читается как
 * природная, но остаётся спокойной и не спорит с содержимым.
 */
export function outlineRadius(angle: number): number {
  return R * (1 + 0.11 * Math.sin(angle * 3 + 0.7) + 0.06 * Math.sin(angle * 5 - 1.2));
}

/**
 * Свод антиклинали — то, из-за чего нефть вообще собирается в залежь.
 *
 * Купол в середине блока: слои над ним выгнуты вверх, и лёгкая нефть, всплывая,
 * упирается в непроницаемую покрышку и скапливается в своде. Без этого купола
 * пласт был бы горизонтальной полосой, а залежь — раскрашенным её куском, то
 * есть неправдой о том, почему нефть здесь.
 */
export function dome(x: number, z: number): number {
  const d2 = (x * x + z * z) / (R * 0.62) ** 2;
  return Math.exp(-d2);
}

/** Мелкая складчатость рельефа — чтобы кровля не была плитой. */
export function relief(x: number, z: number): number {
  return (
    0.9 * Math.sin(x * 0.16 + 1.3) * Math.cos(z * 0.13 - 0.4) +
    0.45 * Math.sin(x * 0.31 - 2.1) * Math.sin(z * 0.27 + 0.9)
  );
}

export type Fn = (x: number, z: number) => number;

/**
 * Слой блока: кровля, подошва, стенка по контуру и две плоскости реза.
 *
 * Односторонние грани и правильный обход: изнутри выреза зритель смотрит на
 * плоскости реза, и если их нормали смотрят не туда, слой пропадает ровно в
 * том ракурсе, ради которого вырез и сделан.
 */
export function makeLayer(topFn: Fn, botFn: Fn, rays = 64, rings = 6): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const sweep = Math.PI * 2 - (NOTCH_TO - NOTCH_FROM);

  const push = (x: number, y: number, z: number) => {
    pos.push(x, y, z);
    return pos.length / 3 - 1;
  };

  // ── Кровля и подошва: веер от центра ─────────────────────────────────────
  const topRing: number[][] = [];
  const botRing: number[][] = [];

  for (let a = 0; a <= rays; a++) {
    const angle = NOTCH_TO + (sweep * a) / rays;
    const r = outlineRadius(angle);
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);

    const tCol: number[] = [];
    const bCol: number[] = [];
    for (let k = 0; k <= rings; k++) {
      const f = k / rings;
      const x = dx * r * f;
      const z = dz * r * f;
      tCol.push(push(x, topFn(x, z), z));
      bCol.push(push(x, botFn(x, z), z));
    }
    topRing.push(tCol);
    botRing.push(bCol);
  }

  for (let a = 0; a < rays; a++) {
    for (let k = 0; k < rings; k++) {
      const t00 = topRing[a][k];
      const t01 = topRing[a][k + 1];
      const t10 = topRing[a + 1][k];
      const t11 = topRing[a + 1][k + 1];
      idx.push(t00, t01, t11, t00, t11, t10);

      const b00 = botRing[a][k];
      const b01 = botRing[a][k + 1];
      const b10 = botRing[a + 1][k];
      const b11 = botRing[a + 1][k + 1];
      idx.push(b00, b11, b01, b00, b10, b11);
    }
  }

  // ── Боковая стенка по контуру ────────────────────────────────────────────
  for (let a = 0; a < rays; a++) {
    const t0 = topRing[a][rings];
    const t1 = topRing[a + 1][rings];
    const b0 = botRing[a][rings];
    const b1 = botRing[a + 1][rings];
    idx.push(t0, b0, b1, t0, b1, t1);
  }

  // ── Две плоскости реза по краям выреза ───────────────────────────────────
  const cutFace = (col: number, flip: boolean) => {
    for (let k = 0; k < rings; k++) {
      const t0 = topRing[col][k];
      const t1 = topRing[col][k + 1];
      const b0 = botRing[col][k];
      const b1 = botRing[col][k + 1];
      if (flip) idx.push(t0, b0, b1, t0, b1, t1);
      else idx.push(t0, b1, b0, t0, t1, b1);
    }
  };
  cutFace(0, false);
  cutFace(rays, true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
