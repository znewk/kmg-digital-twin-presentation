import * as THREE from 'three';

/**
 * Проекция географических координат на сферу глобуса.
 *
 * Ключевое решение открывающей последовательности (ТЗ §3.1): карта Казахстана
 * и call-out Атырауской области живут не отдельной плоской сценой, а прямо на
 * поверхности глобуса. Камера просто подлетает ближе — сфера такого радиуса
 * вблизи читается плоской. Так zoom получается физически непрерывным, без
 * склеек между разномасштабными сценами и без борьбы с точностью глубины.
 */

/** Радиус глобуса в единицах сцены. */
export const GLOBE_R = 300;

export function lonLatToVec3(lon: number, lat: number, radius = GLOBE_R): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/**
 * Точка обзора над заданной географической координатой.
 * `altitude` — во сколько раз камера дальше поверхности.
 */
export function orbitAbove(lon: number, lat: number, altitude: number): [number, number, number] {
  const v = lonLatToVec3(lon, lat, GLOBE_R * altitude);
  return [v.x, v.y, v.z];
}

// ── Опорные точки последовательности ────────────────────────────────────────

/** Географический центр Казахстана. */
export const KZ_CENTER: [number, number] = [67.0, 48.2];

/** Атырау — административный центр области. */
export const ATYRAU: [number, number] = [51.92, 47.11];

/**
 * Молдабек Восточный, Кызылкогинский район Атырауской области.
 * Координата ПРИБЛИЖЁННАЯ — точная привязка площадки в материалах не дана.
 * Требует подтверждения перед показом.
 */
export const MOLDABEK: [number, number] = [54.15, 47.62];

/**
 * Ломаная границы в виде отрезков для LineSegments.
 * GeoJSON-кольца превращаются в пары точек, приподнятые над поверхностью,
 * иначе линия тонет в сфере и мерцает.
 */
export function ringsToSegments(
  rings: number[][][],
  radius: number,
  out: number[] = [],
): number[] {
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const a = lonLatToVec3(ring[i][0], ring[i][1], radius);
      const b = lonLatToVec3(ring[i + 1][0], ring[i + 1][1], radius);
      out.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  return out;
}

/** Извлекает кольца из Polygon/MultiPolygon единообразно. */
export function geometryRings(g: {
  type: string;
  coordinates: unknown;
}): number[][][] {
  if (g.type === 'Polygon') return g.coordinates as number[][][];
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).flat();
  return [];
}

/**
 * Заливка области по поверхности сферы.
 *
 * Триангуляция веером от центроида здесь не работает: контур Атырауской
 * области сильно вогнут со стороны Каспия, и веер даёт лучи наружу через
 * залив. Поэтому кольцо триангулируется как плоская фигура в координатах
 * долгота/широта штатным ушным отсечением three, а уже готовые вершины
 * проецируются на сферу. Область небольшая (~9° × 3,5°), сферическим
 * искажением плоской триангуляции можно пренебречь.
 */
export function ringToSurface(ring: number[][], radius: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(ring.map(([lon, lat]) => new THREE.Vector2(lon, lat)));
  const flat = new THREE.ShapeGeometry(shape);

  const src = flat.getAttribute('position');
  const pos = new Float32Array(src.count * 3);
  for (let i = 0; i < src.count; i++) {
    const v = lonLatToVec3(src.getX(i), src.getY(i), radius);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (flat.index) g.setIndex(flat.index);
  g.computeVertexNormals();
  flat.dispose();
  return g;
}
