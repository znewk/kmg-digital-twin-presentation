import { useMemo } from 'react';
import * as THREE from 'three';
import {
  makeFieldLayer,
  makeGasCap,
  makeOilLens,
  ringRadius,
  resTopY,
  FIELD_STRATA,
  HD,
  HW,
  OWC_Y,
  PRODUCTIVE_STRATA,
  REFERENCE_HORIZON,
} from './geology';
import { absToSceneY } from '../../data/geo/fieldData';
import {
  faultTraceAt,
  owcAbs,
  reservoirPresence,
  FAULTS,
  HORIZONS,
  PRODUCTIVE_TOP_ABS,
  SECTION_BASE_ABS,
  type Fault,
} from '../../data/geo/stratigraphy';
import { EXPLODE_STEP, Stratum } from './explode';
import { Interactive } from './Interactive';

/**
 * Разрез недр Восточного Молдабека (ТЗ §4.3).
 *
 * Пятнадцать горизонтов с настоящими именами, разделённые непроницаемыми
 * перемычками, четыре разрывных нарушения, делящие залежь на блоки I–V,
 * газовая шапка только в блоке I и литологическое замещение на восточном крыле.
 *
 * Номенклатура и число скважин на горизонт — фактические. Геометрия —
 * реконструкция, и она обязана быть помечена в интерфейсе как условная
 * геологическая модель.
 *
 * Геометрия статична и мемоизируется один раз: анимируется только материал.
 * На показе пересборка меша недопустима.
 */

/**
 * Плоскость разрывного нарушения. Наклонена, поэтому её след смещается с
 * глубиной — рисуется по той же функции, что и разрывает слои, иначе
 * плоскость разойдётся со ступенькой в геометрии пластов.
 */
function FaultPlane({ fault }: { fault: Fault }) {
  const geometry = useMemo(() => {
    const nz = 18;
    const nd = 14;
    const pos: number[] = [];
    const idx: number[] = [];
    const topAbs = PRODUCTIVE_TOP_ABS + 120;

    for (let j = 0; j <= nd; j++) {
      for (let i = 0; i <= nz; i++) {
        const z = -HD + (2 * HD * i) / nz;
        const abs = topAbs + ((SECTION_BASE_ABS - topAbs) * j) / nd;
        pos.push(faultTraceAt(fault, z, abs), absToSceneY(abs), z);
      }
    }
    for (let j = 0; j < nd; j++) {
      for (let i = 0; i < nz; i++) {
        const a = j * (nz + 1) + i;
        idx.push(a, a + nz + 1, a + 1, a + 1, a + nz + 1, a + nz + 2);
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [fault]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#6e4a3a"
        emissive="#3a2118"
        emissiveIntensity={0.25}
        roughness={0.85}
        transparent
        opacity={0.32}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

/**
 * Контур нефтеносности горизонта по его ВНК.
 *
 * Луч на восток обрывается там, где коллектор замещён: контур не должен
 * замыкаться кольцом через зону, в которой залежи физически нет.
 */
function useOwcContour(horizonIndex: number) {
  return useMemo(() => {
    const h = HORIZONS[horizonIndex];
    const level = absToSceneY(owcAbs(h)) + 1.5;
    const pts: THREE.Vector3[] = [];
    const N = 128;

    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      const r = ringRadius(h, cx, cz, level);
      const x = cx * r;
      if (reservoirPresence(x) < 0.5) continue;
      pts.push(new THREE.Vector3(x, level, cz * r));
    }

    return pts.length > 8 ? new THREE.CatmullRomCurve3(pts, false) : null;
  }, [horizonIndex]);
}

export function EarthLayers() {
  const strata = useMemo(
    () => FIELD_STRATA.map((s) => ({ spec: s, geometry: makeFieldLayer(s.top, s.bot) })),
    [],
  );

  /**
   * Залежи строятся не по всем четырнадцати продуктивным прослоям, а по шести
   * самым разбуренным. Остальные восемь дали бы ещё сорок тысяч вершин ради
   * линз толщиной в несколько метров, неразличимых на обзорном ракурсе, —
   * прослои при этом остаются на месте и подписаны, отсутствует только
   * подсветка нефтенасыщенной части.
   */
  const lenses = useMemo(() => {
    const top = PRODUCTIVE_STRATA.slice(0, 6);
    return top.map((s) => ({ id: s.id, geometry: makeOilLens(s.horizon!) }));
  }, []);

  /** Газовая шапка — в блоке I, то есть западнее следа первого разлома. */
  const gasCap = useMemo(() => {
    const westEdge = faultTraceAt(FAULTS[0], 0, REFERENCE_HORIZON.topAbs);
    return makeGasCap(REFERENCE_HORIZON, westEdge);
  }, []);

  const owcContour = useOwcContour(HORIZONS.indexOf(REFERENCE_HORIZON));

  const refIndex = FIELD_STRATA.findIndex((s) => s.horizon === REFERENCE_HORIZON);

  return (
    <group>
      {strata.map((s, i) => (
        <Stratum key={s.spec.id} id={s.spec.id} offset={(refIndex - i) * EXPLODE_STEP}>
          <Interactive id={s.spec.id}>
            <mesh geometry={s.geometry} castShadow receiveShadow userData={{ id: s.spec.id }}>
              <meshStandardMaterial
                color={s.spec.color}
                roughness={0.92}
                metalness={0.04}
                transparent={s.spec.opacity < 1}
                opacity={s.spec.opacity}
                side={THREE.DoubleSide}
              />
            </mesh>
          </Interactive>

          {/* Нефтенасыщенная часть прослоя — выше ВНК и западнее замещения */}
          {lenses
            .filter((l) => l.id === s.spec.id)
            .map((l) => (
              <mesh key={l.id} geometry={l.geometry} userData={{ id: `oil-${s.spec.id}` }}>
                <meshStandardMaterial
                  color="#8a5a16"
                  emissive="#c07b20"
                  emissiveIntensity={0.45}
                  roughness={0.5}
                  metalness={0.1}
                  transparent
                  opacity={0.9}
                  side={THREE.DoubleSide}
                  polygonOffset
                  polygonOffsetFactor={-3}
                  polygonOffsetUnits={-3}
                />
              </mesh>
            ))}

          {/* Газовая шапка присутствует только в блоке I */}
          {s.spec.horizon === REFERENCE_HORIZON && (
            <mesh geometry={gasCap} userData={{ id: 'res-gascap' }}>
              <meshStandardMaterial
                color="#cfe8e4"
                emissive="#7fd4c8"
                emissiveIntensity={0.35}
                roughness={0.4}
                transparent
                opacity={0.55}
                side={THREE.DoubleSide}
                polygonOffset
                polygonOffsetFactor={-4}
                polygonOffsetUnits={-4}
              />
            </mesh>
          )}
        </Stratum>
      ))}

      {/* Разломы живут вне слоёв: они их и разрывают, а не принадлежат одному */}
      <Stratum id="res-faults" offset={0}>
        {FAULTS.map((f) => (
          <Interactive key={f.id} id={`res-fault-${f.id}`}>
            <FaultPlane fault={f} />
          </Interactive>
        ))}
      </Stratum>

      {/* Контур нефтеносности и плоскость ВНК опорного горизонта */}
      <Stratum id="res-owc" offset={0}>
        {owcContour && (
          <mesh userData={{ id: 'res-owc' }}>
            <tubeGeometry args={[owcContour, 180, 2.4, 6, false]} />
            <meshBasicMaterial color="#f0ae4a" transparent opacity={0.85} depthWrite={false} />
          </mesh>
        )}

        <mesh position={[0, OWC_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} userData={{ id: 'res-owc' }}>
          <planeGeometry args={[2 * HW * 0.98, 2 * HD * 0.98]} />
          <meshBasicMaterial
            color="#5fa8e8"
            transparent
            opacity={0.1}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </Stratum>
    </group>
  );
}

/** Зоны дренирования вокруг интервалов перфорации добывающих скважин. */
export function DrainageZones({ points }: { points: THREE.Vector3[] }) {
  return (
    <group userData={{ id: 'res-drainage' }}>
      {points.map((p, i) => (
        <mesh key={i} position={p} scale={[130, 26, 130]}>
          <sphereGeometry args={[1, 18, 12]} />
          <meshBasicMaterial color="#f0ae4a" transparent opacity={0.1} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Изолинии по кровле опорного горизонта — визуальный след Картопостроителя ABAI. */
export function TopIsolines() {
  const curves = useMemo(() => {
    const h = REFERENCE_HORIZON;
    // Уровни от свода вниз по кровле — пять изогипс с шагом около шести метров
    // абсолютной отметки, что при тройном преувеличении даёт читаемый интервал.
    const levels = [-6, -12, -18, -24, -30].map((d) => absToSceneY(h.topAbs + 30 + d));

    return levels
      .map((level) => {
        const pts: THREE.Vector3[] = [];
        const N = 104;
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const cx = Math.cos(a);
          const cz = Math.sin(a);
          const r = ringRadius(h, cx, cz, level);
          const x = cx * r;
          if (reservoirPresence(x) < 0.5) continue;
          pts.push(new THREE.Vector3(x, resTopY(x, cz * r) + 3, cz * r));
        }
        return pts.length > 8 ? new THREE.CatmullRomCurve3(pts, false) : null;
      })
      .filter((c): c is THREE.CatmullRomCurve3 => c !== null);
  }, []);

  return (
    <group userData={{ id: 'res-map' }}>
      {curves.map((c, i) => (
        <mesh key={i}>
          <tubeGeometry args={[c, 110, 1.2, 5, false]} />
          <meshBasicMaterial color="#f0ae4a" transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
