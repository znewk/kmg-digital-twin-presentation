import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  makeFieldLayer,
  ringRadius,
  resTopY,
  FIELD_STRATA,
  HD,
  HW,
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
import { strataOffset, Stratum } from './explode';
import { Interactive } from './Interactive';
import { useShow } from '../../store/useShow';

/**
 * Разрез недр Восточного Молдабека (ТЗ §4.3).
 *
 * ПРОЗРАЧНОСТЬ УБРАНА. Раньше два с половиной десятка поверхностей на весь
 * блок были полупрозрачными и двусторонними: каждый пиксель промысла
 * закрашивался двадцать пять раз подряд, и это съедало кадр целиком. Толща
 * земли непрозрачна в натуре и непрозрачна здесь; заглянуть внутрь дают режимы
 * разреза и разнесения слоёв — они для того и существуют.
 *
 * Залежь больше не отдельная линза поверх пласта. Продуктивный прослой делится
 * водонефтяным контактом на нефтенасыщенную и водонасыщенную части — это одна
 * и та же порода с разным заполнением, и граница между ними и есть контур
 * нефтеносности.
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
        emissiveIntensity={0.3}
        roughness={0.85}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Контур нефтеносности опорного горизонта — линия пересечения кровли пласта с
 * водонефтяным контактом. На карте её и рисуют как границу залежи.
 *
 * Луч на восток обрывается там, где коллектор замещён: контур не должен
 * замыкаться кольцом через зону, в которой залежи физически нет.
 */
function useOwcContour() {
  return useMemo(() => {
    const h = REFERENCE_HORIZON;
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
  }, []);
}

/**
 * Подписи горизонтов на западной грани блока.
 *
 * Разрез без имён — просто цветные полосы; §4.3 требует называть пласты
 * настоящими именами, и без подписи это требование не выполняется, сколько бы
 * правильных отметок ни было в коде.
 *
 * Показываются только когда разрез вскрыт — в режиме разнесения слоёв или
 * секущей плоскости. На обзорном плане они висели бы поверх промысла, подписывая
 * то, чего не видно.
 */
function HorizonLabels() {
  const exploded = useShow((s) => s.exploded);
  const clip = useShow((s) => s.clip);
  if (!exploded && !clip) return null;

  return (
    <group>
      {HORIZONS.map((h) => {
        const mid = absToSceneY((h.topAbs + h.botAbs) / 2);
        const strat = FIELD_STRATA.find((s) => s.horizon === h);
        const offset = strat ? strataOffset(strat.order) : 0;

        return (
          <Html
            key={h.id}
            position={[-HW - 60, mid + offset, -HD * 0.55]}
            center
            distanceFactor={900}
            zIndexRange={[5, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div className="whitespace-nowrap font-mono text-[13px] leading-tight">
              <span style={{ color: h.productive ? '#f0ae4a' : '#5fa8e8' }}>{h.name}</span>
              <span className="ml-2 text-[10px] text-[var(--color-txt-faint)]">
                {h.topAbs.toFixed(0)} м абс.
              </span>
            </div>
          </Html>
        );
      })}
    </group>
  );
}

export function EarthLayers() {
  const strata = useMemo(
    () => FIELD_STRATA.map((s) => ({ spec: s, geometry: makeFieldLayer(s.top, s.bot) })),
    [],
  );

  const owcContour = useOwcContour();

  return (
    <group>
      {strata.map((s) => (
        <Stratum key={s.spec.id} id={s.spec.id} offset={strataOffset(s.spec.order)}>
          <Interactive id={s.spec.id}>
            <mesh geometry={s.geometry} castShadow receiveShadow userData={{ id: s.spec.id }}>
              {/*
                Непрозрачно и односторонне. Двусторонний материал на слое
                разреза удваивает работу растеризатора без единого выигрыша:
                изнутри толщи зритель видит стенки блока, а они у слоя есть.
              */}
              <meshStandardMaterial
                color={s.spec.color}
                roughness={0.94}
                metalness={0.03}
                emissive={s.spec.phase === 'oil' ? '#3a2408' : '#000000'}
                emissiveIntensity={s.spec.phase === 'oil' ? 0.5 : 0}
              />
            </mesh>
          </Interactive>
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

      {/* Контур нефтеносности опорного горизонта */}
      {owcContour && (
        <Stratum id="res-owc" offset={0}>
          <mesh userData={{ id: 'res-owc' }}>
            <tubeGeometry args={[owcContour, 180, 3, 6, false]} />
            <meshBasicMaterial color="#f0ae4a" />
          </mesh>
        </Stratum>
      )}

      <HorizonLabels />
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
          <meshBasicMaterial color="#f0ae4a" transparent opacity={0.12} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Изолинии по кровле опорного горизонта — визуальный след Картопостроителя ABAI. */
export function TopIsolines() {
  const curves = useMemo(() => {
    const h = REFERENCE_HORIZON;
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
          <tubeGeometry args={[c, 110, 1.6, 5, false]} />
          <meshBasicMaterial color="#f0ae4a" transparent opacity={0.7} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
