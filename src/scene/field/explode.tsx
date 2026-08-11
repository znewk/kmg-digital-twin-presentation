import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useShow } from '../../store/useShow';
import { FIELD_STRATA, REFERENCE_HORIZON } from './geology';

/**
 * Разнесение слоёв (ТЗ §1, §8.4).
 *
 * Смещения из прототипа: поверхность уходит выше всех, продуктивный пласт
 * остаётся на месте как точка отсчёта, нижние толщи опускаются. Скважины
 * НЕ разносятся вместе со слоями — они остаются на своих отметках, и когда
 * поверхность поднимается, под ней открываются стволы, ГНО и перфорация.
 * Ради этого разнесение и нужно: «заглянуть под землю».
 */
/**
 * Шаг разнесения между соседними слоями разреза, м.
 *
 * Именованной таблицы смещений нет: слоёв тридцать один, и перечислять их
 * поимённо значит забыть один при первой же правке стратиграфии. Смещение
 * считается от положения слоя в разрезе, а точка отсчёта — опорный горизонт:
 * он остаётся на месте, остальное расходится от него вверх и вниз.
 */
export const EXPLODE_STEP = 38;

const REF_INDEX = FIELD_STRATA.findIndex((s) => s.horizon === REFERENCE_HORIZON);

/** Смещение слоя разреза по его положению в стратиграфии. */
export function strataOffset(index: number): number {
  return (REF_INDEX - index) * EXPLODE_STEP;
}

/**
 * Смещение всего, что принадлежит поверхности.
 *
 * КАЖДЫЙ ОБЪЕКТ ЕДЕТ СО СВОИМ СЛОЁМ. Станок-качалка стоит на грунте, ГЗУ стоит
 * на грунте, закопанный коллектор лежит в грунте — значит все они обязаны
 * двигаться вместе с почвенным слоем, а не отдельно от него и не отдельно друг
 * от друга. Иначе получается то, что и получалось: оборудование улетает от
 * своей же площадки, труба остаётся висеть без земли вокруг, и понять, что с
 * чем связано, невозможно.
 *
 * Значение то же самое, что у верхнего слоя разреза, — не «примерно такое же»,
 * а буквально одно и то же число.
 */
export const SURFACE_OFFSET = strataOffset(0);

export const EXPLODE_OFFSET: Record<string, number> = {
  surface: SURFACE_OFFSET,
};

/** Во сколько раз гасится непрозрачность породы в разнесённом виде. */
const EXPLODED_OPACITY = 0.42;

export function Stratum({
  id,
  offset,
  children,
}: {
  id: string;
  /** Смещение в разнесённом виде, м. Без него берётся из таблицы по id. */
  offset?: number;
  children: ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  /** Базовая непрозрачность материалов, снятая при первом кадре. */
  const base = useRef<Map<THREE.Material, number> | null>(null);
  const blend = useRef(0);

  // Целевое смещение читается из стора напрямую в кадре: подписка через
  // селектор дала бы ре-рендер поддерева на каждое переключение, а здесь
  // достаточно двигать трансформацию.
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const exploded = useShow.getState().exploded;

    const target = exploded ? (offset ?? EXPLODE_OFFSET[id] ?? 0) : 0;
    const k = 1 - Math.exp(-dt * 3);
    g.position.y += (target - g.position.y) * k;

    // Поверхность остаётся плотной: сквозь промысел смотреть незачем, а вот
    // породу нужно приглушить, иначе стволы и фронт заводнения видны только в
    // зазорах между толщами, а внутри них теряются.
    if (id === 'surface') return;

    if (!base.current) {
      base.current = new Map();
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) base.current!.set(m, m.opacity);
      });
    }

    blend.current += ((exploded ? 1 : 0) - blend.current) * k;
    if (blend.current < 0.002 && !exploded) return;

    for (const [m, b] of base.current) {
      const wanted = b * (1 - blend.current) + b * EXPLODED_OPACITY * blend.current;
      if (Math.abs(m.opacity - wanted) < 0.002) continue;
      m.opacity = wanted;
      m.transparent = true;
      m.depthWrite = wanted > 0.9;
    }
  });

  return <group ref={ref}>{children}</group>;
}
