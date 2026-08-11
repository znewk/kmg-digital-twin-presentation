import { useMemo } from 'react';
import { toSceneX, toSceneZ, useFieldData } from '../../data/geo/fieldData';
import { NETWORK_STYLE } from '../../data/geo/fieldStyle';
import { Assembly, type Placement } from './kit/Assembly';
import { makeFlowMaterial } from './kit/flow';
import { box, cyl, type Part } from './kit/parts';
import { buildTubes } from './kit/tube';
import { surfY } from './geology';

/**
 * Надземная прокладка трубопроводов (ТЗ §4.4.2).
 *
 * По `meta.buried_note` наружу из линейного хозяйства выходят три вещи:
 * надземный участок газопровода, участки на опорах (169 фактических точек в
 * `points.pipe_support`) и четыре трубные эстакады. Всё остальное — в земле.
 *
 * Надземная прокладка на промысле не прихоть: газопровод выводят наверх там,
 * где грунт агрессивен или где нужен постоянный доступ к трубе, а эстакады
 * ставят на переходах через дороги и на подходах к площадкам, где под землёй
 * уже тесно от других коммуникаций.
 */

/** Высота оси надземной трубы над землёй, м. */
const PIPE_HEIGHT = 2.6;

/** Опора надземного трубопровода: две стойки, ригель и ложемент под трубу. */
function buildPipeSupport(): Part[] {
  const out: Part[] = [];

  out.push(box('concrete', 1.4, 0.3, 0.8, 0, 0.15, 0));
  for (const x of [-0.45, 0.45]) {
    out.push(box('steel', 0.16, PIPE_HEIGHT - 0.2, 0.16, x, (PIPE_HEIGHT - 0.2) / 2 + 0.3, 0));
  }
  out.push(box('steel', 1.3, 0.14, 0.2, 0, PIPE_HEIGHT + 0.12, 0));
  // Ложемент: труба лежит на подкладке, а не приварена к ригелю намертво —
  // ей нужно ходить при температурных деформациях.
  out.push(cyl('steelDark', 0.24, 0.34, 0, PIPE_HEIGHT + 0.24, 0, Math.PI / 2, 0, 0, 10));
  // Раскос жёсткости
  out.push(box('steel', 0.09, 1.1, 0.09, 0, 0.9, 0.28, 0, 0.42));

  return out;
}

/**
 * Трубная эстакада: рама из стоек и ригелей, по которой идут несколько ниток
 * сразу. В отличие от одиночной опоры несёт пучок труб на разных отметках.
 */
function buildRackBent(): Part[] {
  const out: Part[] = [];
  const H = 4.2;

  out.push(box('concrete', 3.4, 0.35, 1.0, 0, 0.18, 0));
  for (const x of [-1.35, 1.35]) {
    out.push(box('steel', 0.22, H, 0.22, x, H / 2 + 0.35, 0));
  }
  // Два яруса ригелей — по ним и разводят нитки разных сред.
  for (const y of [H * 0.62, H]) {
    out.push(box('steel', 3.1, 0.18, 0.24, 0, y + 0.35, 0));
  }
  // Крестовые связи в плоскости рамы
  out.push(box('steel', 0.1, 3.4, 0.1, 0, H * 0.5 + 0.35, 0, 0, 0.72));
  out.push(box('steel', 0.1, 3.4, 0.1, 0, H * 0.5 + 0.35, 0, 0, -0.72));

  return out;
}

/** Опоры надземного газопровода — в фактических точках чертежа. */
function usePipeSupports(): Placement[] {
  const data = useFieldData();

  return useMemo(() => {
    // Разворот ложемента поперёк трубы: направление берётся от ближайшего
    // звена надземного газопровода.
    const segments: [number, number, number, number][] = [];
    for (const line of data.networks.gas_overground) {
      for (let i = 0; i < line.length - 1; i++) {
        segments.push([
          toSceneX(line[i][0]),
          toSceneZ(line[i][1]),
          toSceneX(line[i + 1][0]),
          toSceneZ(line[i + 1][1]),
        ]);
      }
    }

    return data.points.pipe_support.map((p) => {
      const x = toSceneX(p[0]);
      const z = toSceneZ(p[1]);

      let yaw = 0;
      let bestD = Infinity;
      for (const [ax, az, bx, bz] of segments) {
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const d = (mx - x) ** 2 + (mz - z) ** 2;
        if (d < bestD) {
          bestD = d;
          yaw = Math.atan2(-(bz - az), bx - ax) + Math.PI / 2;
        }
      }

      return { x, y: surfY(x, z), z, yaw };
    });
  }, [data]);
}

/**
 * Рамы эстакад. Ставятся вдоль трасс `pipe_rack` с постоянным шагом — в
 * чертеже эстакада задана осевой линией, отдельных точек под рамы нет.
 */
function useRackBents(): Placement[] {
  const data = useFieldData();

  return useMemo(() => {
    const out: Placement[] = [];
    const STEP = 6;

    for (const line of data.networks.pipe_rack) {
      for (let i = 0; i < line.length - 1; i++) {
        const ax = toSceneX(line[i][0]);
        const az = toSceneZ(line[i][1]);
        const bx = toSceneX(line[i + 1][0]);
        const bz = toSceneZ(line[i + 1][1]);
        const len = Math.hypot(bx - ax, bz - az);
        const n = Math.max(1, Math.round(len / STEP));
        const yaw = Math.atan2(-(bz - az), bx - ax) + Math.PI / 2;

        for (let s = 0; s <= n; s++) {
          const t = s / n;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          out.push({ x, y: surfY(x, z), z, yaw });
        }
      }
    }

    return out;
  }, [data]);
}

export function AbovegroundPipes() {
  const data = useFieldData();
  const supports = usePipeSupports();
  const bents = useRackBents();

  /** Надземный участок газопровода — единственный в чертеже. */
  const gasTube = useMemo(
    () =>
      buildTubes(data.networks.gas_overground, {
        radius: 0.14,
        offset: PIPE_HEIGHT + 0.24,
        elevation: surfY,
        radialSegments: 8,
      }),
    [data],
  );

  /**
   * Нитки на эстакадах: три трубы на двух ярусах. Отдельных трасс по каждой
   * нитке в чертеже нет — есть ось эстакады, поэтому нитки разносятся от неё
   * поперёк и по высоте, как они и лежат на ригелях.
   */
  /** Надземный газопровод течёт так же, как подземный: среда одна. */
  const gasMaterial = useMemo(
    () =>
      makeFlowMaterial({
        color: NETWORK_STYLE.gas_overground.color,
        flowColor: '#ffffff',
        period: 60,
        speed: 26,
        intensity: 1.4,
      }),
    [],
  );

  const rackTubes = useMemo(() => {
    const specs: {
      offsetY: number;
      shift: number;
      radius: number;
      color: string;
      speed: number;
      period: number;
    }[] = [
      {
        offsetY: 4.55,
        shift: -0.85,
        radius: 0.16,
        color: NETWORK_STYLE.oil_pipeline.color,
        speed: 9,
        period: 46,
      },
      {
        offsetY: 4.55,
        shift: 0.85,
        radius: 0.14,
        color: NETWORK_STYLE.water_pipeline.color,
        speed: 16,
        period: 52,
      },
      {
        offsetY: 2.95,
        shift: 0,
        radius: 0.11,
        color: NETWORK_STYLE.gas_pipeline.color,
        speed: 26,
        period: 60,
      },
    ];

    return specs.map((spec) => ({
      material: makeFlowMaterial({
        color: spec.color,
        flowColor: '#ffffff',
        period: spec.period,
        speed: spec.speed,
        intensity: 1.4,
      }),
      geometry: buildTubes(
        data.networks.pipe_rack.map((line) =>
          // Поперечное смещение считается по звену: эстакады короткие и почти
          // прямые, поэтому хватает направления первого звена трассы.
          line.map(([lx, ly], i, arr) => {
            const j = i < arr.length - 1 ? i + 1 : i - 1;
            const dx = arr[j][0] - lx;
            const dy = arr[j][1] - ly;
            const len = Math.hypot(dx, dy) || 1;
            const sign = i < arr.length - 1 ? 1 : -1;
            return [
              lx + ((-dy / len) * spec.shift * sign),
              ly + ((dx / len) * spec.shift * sign),
            ] as [number, number];
          }),
        ),
        {
          radius: spec.radius,
          offset: spec.offsetY,
          elevation: surfY,
          radialSegments: 8,
        },
      ),
    }));
  }, [data]);

  return (
    <group userData={{ id: 'aboveground' }}>
      <Assembly build={buildPipeSupport} placements={supports} id="pipe-supports" />
      <Assembly build={buildRackBent} placements={bents} id="rack-bents" />

      <mesh
        geometry={gasTube}
        material={gasMaterial}
        castShadow
        userData={{ id: 's-gas-overground' }}
      />

      {rackTubes.map((t, i) => (
        <mesh
          key={i}
          geometry={t.geometry}
          material={t.material}
          castShadow
          userData={{ id: `rack-line-${i}` }}
        />
      ))}
    </group>
  );
}
