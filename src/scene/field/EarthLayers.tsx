import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  makeFieldLayer,
  ringRadius,
  resTopY,
  FIELD_STRATA,
  HD,
  REFERENCE_HORIZON,
} from './geology';
import { absToSceneY } from '../../data/geo/fieldData';
import { insideOutline, outlineCentroid, outlineRadius } from '../../data/geo/outline';
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
import { useFieldData } from '../../data/geo/fieldData';
import { perfPoint } from './geology';
import { resolveHorizon } from '../../data/geo/stratigraphy';
import type { StoryWell } from '../../data/geo/storyWells';

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
 * Контур нефтеносности принадлежит опорному горизонту и при разнесении слоёв
 * обязан ехать вместе с ним, а не оставаться на месте: иначе линия контакта
 * отрывается от пласта, границу которого она и очерчивает.
 */
const OWC_ORDER = FIELD_STRATA.find((s) => s.horizon === REFERENCE_HORIZON)?.order ?? 0;

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
    const zAt = (i: number) => -HD + (2 * HD * i) / nz;
    const absAt = (j: number) => topAbs + ((SECTION_BASE_ABS - topAbs) * j) / nd;

    for (let j = 0; j <= nd; j++) {
      for (let i = 0; i <= nz; i++) {
        const z = zAt(i);
        const abs = absAt(j);
        pos.push(faultTraceAt(fault, z, abs), absToSceneY(abs), z);
      }
    }
    for (let j = 0; j < nd; j++) {
      for (let i = 0; i < nz; i++) {
        // Плоскость строится на полный габарит, а блок обрезан по контуру
        // снятой площади — за его краем нарушение выходило наружу
        // прямоугольным языком, висящим в пустоте. Ячейки за контуром просто
        // не выпускаются: разлом обрывается там же, где кончается порода.
        const zc = (zAt(i) + zAt(i + 1)) / 2;
        const absC = (absAt(j) + absAt(j + 1)) / 2;
        if (!insideOutline(faultTraceAt(fault, zc, absC), zc)) continue;
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
      const z = cz * r;
      if (reservoirPresence(x) < 0.5) continue;
      // Контур ищется по структуре, а структура задана на весь габарит: там,
      // где кровля не опускается до уровня контакта, поиск упирался в предел
      // и выносил точку далеко за блок. Снаружи снятой площади контура нет —
      // он обрывается на её границе, как и обрывается сама модель.
      if (!insideOutline(x, z)) continue;
      pts.push(new THREE.Vector3(x, level, z));
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
function HorizonLabels({ open }: { open: boolean }) {
  // Число скважин на горизонт — из сводки реестра фонда. Оно и делает подпись
  // содержательной: видно не только имя пласта, но и сколько на него пробурено.
  const WELL_COUNT = useFieldData().well_stats.by_horizon;

  /**
   * Подписи прижимаются к западной грани БЛОКА, а не к рамке габарита.
   *
   * Стояли на `-HW`, то есть по объявленному прямоугольнику 5352 × 4682. Блок
   * с тех пор идёт по контуру снятой площади и заметно уже рамки — подписи
   * повисли в стороне от разреза, оторванные от слоёв, которые называют.
   */
  const anchor = useMemo(() => {
    const [cx, cz] = outlineCentroid();
    return { x: cx - outlineRadius(Math.PI) - 25, z: cz };
  }, []);

  if (!open) return null;

  return (
    <group>
      {HORIZONS.map((h) => {
        const mid = absToSceneY((h.topAbs + h.botAbs) / 2);
        const strat = FIELD_STRATA.find((s) => s.horizon === h);
        const offset = strat ? strataOffset(strat.order) : 0;
        const wells = WELL_COUNT[h.name] ?? 0;

        return (
          <Html
            key={h.id}
            // У самой западной грани блока: подпись стоит вплотную к срезу.
            position={[anchor.x, mid + offset, anchor.z]}
            zIndexRange={[8, 0]}
            /**
             * Подписи живут внутри канваса, а не в слое интерфейса, и общий
             * масштаб их не касается: на большом экране они остались бы
             * набранными десятью пикселями. Множитель тот же самый, поэтому
             * названия пластов растут вместе с остальными надписями показа.
             */
            style={{
              pointerEvents: 'none',
              transform: 'scale(var(--ui-scale, 1))',
              transformOrigin: 'left center',
            }}
          >
            {/*
              Размер экранный, а не мировой. С привязкой к расстоянию подпись
              на обзорном ракурсе съёживалась в точку, а вблизи разрасталась на
              полэкрана — прочитать её удавалось ровно на одной дистанции.
            */}
            <div className="-translate-y-1/2 whitespace-nowrap font-mono text-[10px] leading-tight">
              <span
                className="tracking-[0.08em]"
                style={{ color: h.productive ? '#f0ae4a' : '#5fa8e8' }}
              >
                {h.name}
              </span>
              <span className="ml-2 text-[9px] text-[var(--color-txt-dim)]">
                {h.topAbs.toFixed(0)} м абс.
              </span>
              {wells > 0 && (
                <span className="ml-2 text-[9px] text-[var(--color-txt-faint)]">
                  {wells} скв.
                </span>
              )}
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

  /**
   * Разрез считается вскрытым при разнесении слоёв или секущей плоскости.
   *
   * От этого зависит не только показ подписей, но и кликабельность толщ. Пока
   * разрез закрыт, толщи ловить курсор не должны: это плиты во весь промысел,
   * они лежат под всем и при каждом повороте камеры перехватывали клик,
   * подменяя кадр видом на почвенный слой. Выбирать пласт имеет смысл тогда,
   * когда он виден, — то есть в разрезе.
   */
  const exploded = useShow((s) => s.exploded);
  const sectionOpen = useShow((s) => s.exploded || s.clip);

  return (
    <group>
      {strata.map((s) => {
        // Тень слой не отбрасывает: полупрозрачная порода бросала бы её как
        // глухая плита, и приглушать слой ради просвета не имело бы смысла.
        const body = (
          <mesh geometry={s.geometry} receiveShadow userData={{ id: s.spec.id }}>
            {/*
              Плотность у каждого слоя своя и задана в разрезе по тому, чем он
              насыщен: порода — дымка, вода — вполсилы, нефть — почти тело.
              Общий множитель прозрачности на все слои разом даёт кашу, потому
              что прозрачность копится вдоль луча зрения.

              Материал односторонний: двусторонний удваивает работу
              растеризатора без выигрыша — изнутри толщи зритель видит стенки
              блока, а они у слоя есть.

              В буфер глубины не пишет никто: запись обрезала бы всё, что лежит
              за слоем, — то есть ровно то, ради чего его и просвечивают.
              Порядок наложения даёт сортировка по дальности, а слои друг друга
              не пересекают, и этого достаточно.
            */}
            <meshStandardMaterial
              color={s.spec.color}
              roughness={0.94}
              metalness={0.03}
              emissive={s.spec.phase === 'oil' ? '#3a2408' : '#000000'}
              emissiveIntensity={s.spec.phase === 'oil' ? 0.5 : 0}
              transparent={s.spec.opacity < 1}
              opacity={s.spec.opacity}
              depthWrite={s.spec.opacity > 0.9}
            />
          </mesh>
        );

        return (
          <Stratum key={s.spec.id} id={s.spec.id} offset={strataOffset(s.spec.order)}>
            {sectionOpen ? <Interactive id={s.spec.id}>{body}</Interactive> : body}
          </Stratum>
        );
      })}

      {/*
        Разломы живут вне слоёв: они их и разрывают, а не принадлежат одному.

        При разнесении слоёв они скрываются. Разлом имеет смысл ровно как
        поверхность, вдоль которой смещены блоки породы; когда пласты
        растащены по вертикали, смещать нечего — и плоскость превращается в
        полотно, висящее между разъехавшимися толщами и ни к чему не
        относящееся. В сомкнутом блоке и в секущей плоскости она на месте.
      */}
      <Stratum id="res-faults" offset={0}>
        {!exploded &&
          FAULTS.map((f) =>
            sectionOpen ? (
              <Interactive key={f.id} id={`res-fault-${f.id}`}>
                <FaultPlane fault={f} />
              </Interactive>
            ) : (
              <FaultPlane key={f.id} fault={f} />
            ),
          )}
      </Stratum>

      {/* Контур нефтеносности опорного горизонта. Толщина в метрах: на блоке
          шириной под пять километров трёхметровая нить была тоньше пикселя. */}
      {owcContour && (
        <Stratum id="res-owc" offset={strataOffset(OWC_ORDER)}>
          <mesh userData={{ id: 'res-owc' }}>
            <tubeGeometry args={[owcContour, 180, 9, 6, false]} />
            <meshBasicMaterial color="#ffc061" />
          </mesh>
        </Stratum>
      )}

      <HorizonLabels open={sectionOpen} />
    </group>
  );
}

/**
 * Зоны дренирования вокруг интервалов перфорации.
 *
 * Область пласта, из которой скважина реально отбирает. Прежде она была
 * блином фиксированной высоты, посаженным на опорный горизонт М-I-А для всех
 * скважин разом, — при том что в реестре у каждой свой пласт, и между меловым
 * и юрским двести метров разреза. Зона висела в чужой толще.
 *
 * Теперь высота линзы равна мощности СВОЕГО прослоя: дренирование идёт по
 * вскрытой толщине, не выше кровли и не ниже подошвы. Тонкий пласт даёт
 * тонкую линзу, и это видно.
 */
export function DrainageZones({ wells }: { wells: StoryWell[] }) {
  const zones = useMemo(
    () =>
      wells
        .filter((w) => ['skn', 'esp', 'frac', 'horiz'].includes(w.kind))
        .map((w) => {
          const p = perfPoint(w);
          const h = resolveHorizon(w.record.hor);
          const half = h
            ? Math.abs(absToSceneY(h.topAbs) - absToSceneY(h.botAbs)) / 2
            : 18;
          return { id: w.id, p, half };
        }),
    [wells],
  );

  return (
    <group userData={{ id: 'res-drainage' }}>
      {zones.map((z) => (
        <mesh key={z.id} position={z.p} scale={[150, Math.max(6, z.half), 150]}>
          <sphereGeometry args={[1, 18, 12]} />
          <meshBasicMaterial color="#f0ae4a" transparent opacity={0.14} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Изолинии по кровле опорного горизонта — визуальный след Картопостроителя ABAI.
 *
 * Их не было видно по двум причинам сразу, и обе от масштаба. Нить радиусом
 * 1,6 м на блоке шириной под пять километров тоньше пикселя — линия рисовалась
 * и не занимала на экране ничего. А сами кольца искались по структуре, заданной
 * на весь габарит: где кровля не опускалась до нужной отметки, поиск упирался в
 * предел и выносил изолинию далеко за пределы блока, в пустоту.
 */
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
          const z = cz * r;
          if (reservoirPresence(x) < 0.5) continue;
          if (!insideOutline(x, z)) continue;
          pts.push(new THREE.Vector3(x, resTopY(x, z) + 6, z));
        }
        return pts.length > 8 ? new THREE.CatmullRomCurve3(pts, false) : null;
      })
      .filter((c): c is THREE.CatmullRomCurve3 => c !== null);
  }, []);

  return (
    <group userData={{ id: 'res-map' }}>
      {curves.map((c, i) => (
        <mesh key={i}>
          <tubeGeometry args={[c, 110, 7, 5, false]} />
          <meshBasicMaterial color="#ffd48a" transparent opacity={0.85} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
