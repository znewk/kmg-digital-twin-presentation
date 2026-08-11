import { useMemo } from 'react';
import {
  toSceneX,
  toSceneZ,
  useFieldData,
  type FacilityKind,
  type FieldDataset,
} from '../../data/geo/fieldData';
import { Assembly, type Placement } from './kit/Assembly';
import { Flare } from './facilities/Flare';
import { buildGzu } from './facilities/gzu';
import { buildKns } from './facilities/kns';
import { buildKtp } from './facilities/ktp';
import { buildSp } from './facilities/sp';
import { surfY } from './geology';

/**
 * Промысловые объекты с настоящими подписями — 57 точек из текстового слоя
 * чертежа: 41 ГЗУ, 3 КНС, 3 сборных пункта, 10 КТП (ТЗ §4.1, §4.4.2).
 *
 * Ставятся ровно в свои координаты. Семантику угадывать не нужно — она
 * извлечена из чертежа вместе с подписями, поэтому ГЗУ-25 стоит там, где на
 * плане написано «ГЗУ-25», а не там, где было бы красиво.
 */

/**
 * Разворот установки: гребёнка подводящих линий смотрит на ближайший узел
 * сбора. Установки, развёрнутые одинаково, сразу выдают процедурную
 * расстановку — в поле каждая стоит по своей обвязке.
 */
function yawToward(x: number, z: number, data: FieldDataset): number {
  let bestX = 0;
  let bestZ = 0;
  let bestD = Infinity;

  for (const hub of data.hubs) {
    const hx = toSceneX(hub.p[0]);
    const hz = toSceneZ(hub.p[1]);
    const d = (hx - x) ** 2 + (hz - z) ** 2;
    if (d < bestD && d > 1) {
      bestD = d;
      bestX = hx;
      bestZ = hz;
    }
  }

  if (bestD === Infinity) return 0;
  // Локальная ось −Z установки направляется на узел.
  return Math.atan2(-(bestX - x), -(bestZ - z));
}

function usePlacements(kind: FacilityKind): Placement[] {
  const data = useFieldData();

  return useMemo(() => {
    return data.facilities
      .filter((f) => f.kind === kind)
      .map((f) => {
        const x = toSceneX(f.p[0]);
        const z = toSceneZ(f.p[1]);
        return {
          x,
          y: surfY(x, z),
          z,
          yaw: yawToward(x, z, data),
          id: `fac:${f.name}`,
        };
      });
  }, [data, kind]);
}

export function Facilities() {
  const gzu = usePlacements('gzu');
  const kns = usePlacements('kns');
  const sp = usePlacements('sp');
  const ktp = usePlacements('ktp');

  return (
    <group>
      <Assembly build={buildGzu} placements={gzu} id="fac-gzu" />
      <Assembly build={buildKns} placements={kns} id="fac-kns" />
      <Assembly build={buildSp} placements={sp} id="fac-sp" />
      <Assembly build={buildKtp} placements={ktp} id="fac-ktp" />
      <Flare />
    </group>
  );
}
