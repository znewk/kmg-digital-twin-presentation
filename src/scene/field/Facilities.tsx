import { useMemo } from 'react';
import { useFieldData, type FacilityKind } from '../../data/geo/fieldData';
import { Assembly, type Placement } from './kit/Assembly';
import { Flare } from './facilities/Flare';
import { buildGzu } from './facilities/gzu';
import { buildKns } from './facilities/kns';
import { buildKtp } from './facilities/ktp';
import { buildSp } from './facilities/sp';
import { facilityPlacements } from './placement';

/**
 * Промысловые объекты с настоящими подписями — 57 точек из текстового слоя
 * чертежа: 41 ГЗУ, 3 КНС, 3 сборных пункта, 10 КТП (ТЗ §4.1, §4.4.2).
 *
 * Ставятся ровно в свои координаты. Семантику угадывать не нужно — она
 * извлечена из чертежа вместе с подписями, поэтому ГЗУ-25 стоит там, где на
 * плане написано «ГЗУ-25», а не там, где было бы красиво.
 */

/**
 * Расстановка приходит из общего модуля: тот же расчёт разрешает якоря шагов
 * цикла, и считать его здесь во второй раз значило бы однажды разойтись с ними.
 */
function usePlacements(kind: FacilityKind): Placement[] {
  const data = useFieldData();
  return useMemo(() => facilityPlacements(data, kind), [data, kind]);
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
