import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { perfFraction, perfPoint, wellCurve, resTopY } from './geology';
import { absToSceneY } from '../../data/geo/fieldData';
import { resolveHorizon } from '../../data/geo/stratigraphy';
import { makeFlowMaterial, makePulseMaterial } from './kit/flow';
import { useShow } from '../../store/useShow';
import type { StoryWell } from '../../data/geo/storyWells';
import { Assembly, type Placement } from './kit/Assembly';
import { EQUIPMENT_SCALE } from './kit/scale';
import {
  buildPumpjackBeam,
  buildPumpjackCrank,
  buildPumpjackPitman,
  buildPumpjackStatic,
  mergeSingle,
  pumpjackPose,
  CRANK_X,
  CRANK_Y,
  PIVOT_X,
  PIVOT_Y,
} from './facilities/pumpjack';
import { buildRigStatic } from './facilities/rig';
import { buildWorkoverStatic } from './facilities/workover';
import { Bars, type BarSpec } from './Bars';

/**
 * Сборка ставится в начало координат: родительская группа уже смещена на
 * устье скважины, и второе смещение увело бы установку с площадки.
 */
const ORIGIN: Placement[] = [{ x: 0, y: 0, z: 0 }];

/**
 * Скважина как один компонент с разными исполнениями устья и заканчивания.
 *
 * В прототипе всё это было одним циклом на 240 строк с ветвлениями по `kind`.
 * Здесь тот же состав деталей, но разнесён по компонентам — иначе правку
 * качалки невозможно сделать, не рискуя сломать буровую.
 */

/** Те же цвета, что у фонда: сюжетная скважина не может выглядеть иначе. */
const STEEL = { color: '#9aa2a6', metalness: 0.62, roughness: 0.44 } as const;
const STEEL_DARK = { color: '#7a5f4c', metalness: 0.35, roughness: 0.68 } as const;
const UNIT = { color: '#7e8ca0', metalness: 0.7, roughness: 0.35 } as const;

// ── Устья ───────────────────────────────────────────────────────────────────

/**
 * Станок-качалка сюжетной скважины. Модель та же самая, что у всего фонда, —
 * иначе одна и та же машина выглядела бы по-разному в зависимости от того,
 * попала она в сюжет или нет.
 */
function PumpjackHead({ y }: { y: number }) {
  const beam = useRef<THREE.Mesh>(null);
  const crank = useRef<THREE.Mesh>(null);
  const pitman = useRef<THREE.Mesh>(null);

  const geometry = useMemo(
    () => ({
      beam: mergeSingle(buildPumpjackBeam()),
      crank: mergeSingle(buildPumpjackCrank()),
      pitman: mergeSingle(buildPumpjackPitman()),
    }),
    [],
  );

  useFrame(({ clock }) => {
    const pose = pumpjackPose((clock.elapsedTime * Math.PI * 2) / 8);
    if (beam.current) beam.current.rotation.z = pose.beamAngle;
    if (crank.current) crank.current.rotation.z = pose.crankAngle;
    if (pitman.current) {
      pitman.current.position.copy(pose.pitmanMid);
      pitman.current.quaternion.copy(pose.pitmanQuat);
      pitman.current.scale.set(1, pose.pitmanLength, 1);
    }
  });

  return (
    <group position={[0, y, 0]}>
      <Assembly build={buildPumpjackStatic} placements={ORIGIN} id="pumpjack-static-story" scale={1} />
      <mesh ref={beam} geometry={geometry.beam} position={[PIVOT_X, PIVOT_Y, 0]} castShadow>
        <meshStandardMaterial {...STEEL} />
      </mesh>
      <mesh ref={crank} geometry={geometry.crank} position={[CRANK_X, CRANK_Y, 0]} castShadow>
        <meshStandardMaterial {...STEEL_DARK} />
      </mesh>
      <mesh ref={pitman} geometry={geometry.pitman} castShadow>
        <meshStandardMaterial {...STEEL} />
      </mesh>
    </group>
  );
}

/**
 * Буровая установка. Неподвижная часть — вышка, мостки со стеллажами,
 * циркуляционная система, насосный блок — собрана в одну инстансированную
 * сборку; здесь остаются только подвижные узлы.
 *
 * Талевый блок ходит вверх-вниз с периодом наращивания, ротор вращается.
 */
function DerrickHead({ y }: { y: number }) {
  const block = useRef<THREE.Mesh>(null);
  const rotor = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (block.current) {
      block.current.position.y = 32 - 12 * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 11));
    }
    if (rotor.current) rotor.current.rotation.y = t * 2.2;
  });

  return (
    <group position={[0, y, 0]}>
      {/* scale=1: родительская группа устья уже масштабирована, иначе коэффициент
          применился бы дважды */}
      <Assembly build={buildRigStatic} placements={ORIGIN} id="rig-static" scale={1} />

      <mesh ref={block} position={[0, 32, 0]} castShadow>
        <boxGeometry args={[2.2, 3.6, 2.2]} />
        <meshStandardMaterial {...UNIT} />
      </mesh>
      <mesh ref={rotor} position={[0, 6.3, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 0.55, 16]} />
        <meshStandardMaterial {...UNIT} />
      </mesh>
    </group>
  );
}

/**
 * Агрегат ТКРС А-50 с выложенными НКТ. Подвижный узел один — талевый блок на
 * мачте: при подъёме колонны он и ходит.
 */
function WorkoverHead({ y }: { y: number }) {
  const block = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!block.current) return;
    const k = 0.5 + 0.5 * Math.sin((clock.elapsedTime * Math.PI * 2) / 14);
    // Ходит вдоль наклонной мачты, а не строго по вертикали.
    block.current.position.set(-Math.sin(0.13) * (4 + 14 * k), 2.6 + Math.cos(0.13) * (4 + 14 * k), 0);
  });

  return (
    <group position={[0, y, 0]}>
      <Assembly build={buildWorkoverStatic} placements={ORIGIN} id="workover-static" scale={1} />
      <mesh ref={block} castShadow>
        <boxGeometry args={[0.9, 1.6, 1.1]} />
        <meshStandardMaterial {...UNIT} />
      </mesh>
    </group>
  );
}

/**
 * Фонтанная арматура — добывающие ГРП/горизонтальные, нагнетательные и
 * водозаборные. У исполнения под УЭЦН добавляется кабельный ввод: питание
 * погружного насоса заходит в скважину через устьевой сальник, и без него
 * устье ЭЦН неотличимо от любого другого (§4.4.2).
 */
function ChristmasTree({ y, cableEntry = false }: { y: number; cableEntry?: boolean }) {
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 3.9, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.8, 7.8, 10]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      <mesh position={[0, 5.4, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.48, 0.48, 6.6, 8]} />
        <meshStandardMaterial {...STEEL} />
      </mesh>
      {[3, 5.4, 7.2].map((dy) => (
        <mesh key={dy} position={[0, dy, 0]}>
          <cylinderGeometry args={[0.9, 0.9, 0.5, 10]} />
          <meshStandardMaterial {...STEEL_DARK} />
        </mesh>
      ))}

      {cableEntry && (
        <group>
          {/* Устьевой кабельный ввод и станция управления рядом с устьем */}
          <mesh position={[0.95, 2.4, 0]} rotation={[0, 0, -0.5]} castShadow>
            <cylinderGeometry args={[0.28, 0.28, 1.8, 8]} />
            <meshStandardMaterial {...STEEL_DARK} />
          </mesh>
          <mesh position={[3.2, 1.5, 1.6]} castShadow>
            <boxGeometry args={[1.5, 2.6, 1.1]} />
            <meshStandardMaterial color="#5a6b58" metalness={0.4} roughness={0.6} />
          </mesh>
          <mesh position={[2.1, 0.35, 0.9]} rotation={[0, 0.6, 0]}>
            <boxGeometry args={[3.2, 0.14, 0.3]} />
            <meshStandardMaterial color="#2b3038" roughness={0.9} />
          </mesh>
        </group>
      )}
    </group>
  );
}

// ── Движение флюида ─────────────────────────────────────────────────────────

/**
 * Приток к забою (ТЗ §4.4.1, шаг 1).
 *
 * Того, ради чего вся модель и строится, в сцене не было вовсе: нефть не шла
 * из пласта в скважину. Показывается сходящимися к перфорации лучами внутри
 * продуктивного прослоя — именно внутри, по толщине своего горизонта, а не
 * произвольным облаком в толще.
 *
 * У нагнетательной всё наоборот: лучи расходятся от ствола, потому что вода
 * идёт из скважины в пласт. Это не косметика — направление и есть смысл
 * объекта, и перепутать нагнетание с отбором нельзя.
 */
/**
 * Вылет лучей притока, м.
 *
 * Вынесен в экспорт, потому что по нему же строится кадр «как нефть попадает в
 * скважину»: предмет кадра — эта самая звезда, и её размер должен задаваться в
 * одном месте, а не совпадать с числом в постановке кадра по договорённости.
 */
export const INFLOW_REACH = 165;

function ReservoirFlow({ spec }: { spec: StoryWell }) {
  const injecting = spec.kind === 'inj' || spec.kind === 'water';

  const geometry = useMemo(() => {
    const perf = perfPoint(spec);
    const horizon = resolveHorizon(spec.record.hor);
    // Полутолщина пласта: лучи расходятся по его мощности, а не по случайной
    // высоте — приток идёт из всей вскрытой толщины.
    const half = horizon
      ? Math.abs(absToSceneY(horizon.topAbs) - absToSceneY(horizon.botAbs)) / 2
      : 20;

    const R = INFLOW_REACH;
    // Лучей больше: шестнадцать на кадре крупного плана читались отдельными
    // спицами, а приток идёт со всех сторон пласта, а не по шестнадцати
    // направлениям.
    const RAYS = 28;
    const STEPS = 12;
    const pos: number[] = [];
    const along: number[] = [];

    for (let r = 0; r < RAYS; r++) {
      const a = (r / RAYS) * Math.PI * 2;
      const level = ((r % 3) - 1) * half * 0.6;
      const sx = perf.x + Math.cos(a) * R;
      const sz = perf.z + Math.sin(a) * R;
      const sy = perf.y + level;

      for (let s = 0; s < STEPS; s++) {
        for (const t of [s / STEPS, (s + 1) / STEPS]) {
          pos.push(sx + (perf.x - sx) * t, sy + (perf.y - sy) * t, sz + (perf.z - sz) * t);
          // Волна бежит в сторону роста продольной координаты: у добывающей она
          // растёт к забою, у нагнетательной — от него.
          along.push(injecting ? R * (1 - t) : R * t);
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
    g.computeBoundingSphere();
    return g;
  }, [spec, injecting]);

  /**
   * ЦВЕТ ПРИТОКА СВЕТЛЕЕ ПЛАСТА, А НЕ ОДИНАКОВ С НИМ.
   *
   * Приток шёл янтарём по янтарю: лучи рисуются ВНУТРИ нефтенасыщенного
   * прослоя, а он с недавних пор почти плотный и подсвечен. Полупрозрачная
   * нитка того же тона на нём просто исчезала — на кадре о том, как нефть
   * входит в скважину, самой этой нефти видно не было.
   *
   * Взят светлый оттенок той же среды: смысловой код цвета сохраняется —
   * нефть тёплая, вода холодная, — но яркость выше фона, и звезда читается.
   * У нагнетательной та же логика: светлая синь на синей воде.
   */
  const material = useMemo(
    () =>
      makePulseMaterial({
        color: injecting ? '#bfe0ff' : '#ffdda6',
        pulseColor: '#ffffff',
        period: 52,
        speed: injecting ? 16 : 9,
        opacity: 0.62,
      }),
    [injecting],
  );

  return <lineSegments geometry={geometry} material={material} userData={{ id: `${spec.id}:inflow` }} />;
}

/**
 * Подъём флюида по НКТ (ТЗ §4.4.1, шаг 2).
 *
 * Столб внутри колонны от перфорации до устья. Направление задаётся тем, с
 * какого конца отсчитывается продольная координата: у добывающей она растёт
 * вверх, и волна идёт к устью, у нагнетательной — вниз.
 */
function LiftFlow({ spec }: { spec: StoryWell }) {
  const injecting = spec.kind === 'inj' || spec.kind === 'water';

  const geometry = useMemo(() => {
    const curve = wellCurve(spec);
    const end = perfFraction(spec.kind);
    const N = 48;

    // Ствол от устья до перфорации, точками по кривой.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) pts.push(curve.getPointAt((end * i) / N));

    const path = new THREE.CatmullRomCurve3(pts);
    const RADIAL = 6;
    const g = new THREE.TubeGeometry(path, N, 0.55, RADIAL, false);

    // Продольная координата по кольцам трубы: вершины идут кольцами вдоль пути.
    const count = g.attributes.position.count;
    const along = new Float32Array(count);
    const total = path.getLength();
    for (let i = 0; i < count; i++) {
      const ring = Math.floor(i / (RADIAL + 1));
      const t = ring / N;
      along[i] = injecting ? total * t : total * (1 - t);
    }
    g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
    return g;
  }, [spec, injecting]);

  const material = useMemo(
    () =>
      makeFlowMaterial({
        color: injecting ? '#3f6f96' : '#6b4a1c',
        flowColor: injecting ? '#9fd0ff' : '#ffd08a',
        period: 34,
        speed: injecting ? 22 : 13,
        intensity: 2.2,
        metalness: 0.3,
        roughness: 0.5,
      }),
    [injecting],
  );

  return <mesh geometry={geometry} material={material} userData={{ id: `${spec.id}:lift` }} />;
}

// ── Скважина целиком ────────────────────────────────────────────────────────

/**
 * Устье скважины — то, что стоит НА грунте: станок-качалка, фонтанная
 * арматура, буровая, агрегат ТКРС.
 *
 * Отделено от ствола намеренно. При разнесении слоёв устье обязано ехать
 * вместе с почвенным слоем, на котором оно стоит, а ствол — оставаться на
 * своих отметках: ради этого разнесение и нужно, под приподнятым грунтом
 * открывается колонна, ГНО и перфорация.
 */
/** Обработчики выбора объекта — общие для устья и ствола сюжетной скважины. */
function useSelect(id: string) {
  return useMemo(
    () => ({
      onClick: (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        const { selected, select } = useShow.getState();
        select(selected === id ? null : id);
      },
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        useShow.getState().hover(id);
        document.body.style.cursor = 'pointer';
      },
      onPointerOut: () => {
        useShow.getState().hover(null);
        document.body.style.cursor = '';
      },
    }),
    [id],
  );
}

export function WellHead({ spec, groundY }: { spec: StoryWell; groundY: number }) {
  const pick = useSelect(spec.id);

  return (
    // Отметка земли вынесена в положение группы, а масштаб — в саму группу:
    // если оставить её внутри, коэффициент умножит и высоту посадки, и устье
    // повиснет над землёй ровно во столько же раз.
    //
    // Идентификатор клика — сама скважина, а не «устье скважины»: зритель
    // тычет в качалку, а узнать хочет про скважину под ней.
    <group
      position={[spec.x, groundY, spec.z]}
      scale={EQUIPMENT_SCALE}
      onClick={pick.onClick}
      onPointerOver={pick.onPointerOver}
      onPointerOut={pick.onPointerOut}
      userData={{ id: spec.id }}
    >
      {spec.kind === 'skn' && <PumpjackHead y={0} />}
      {spec.kind === 'drill' && <DerrickHead y={0} />}
      {spec.kind === 'wo' && <WorkoverHead y={0} />}
      {spec.kind === 'esp' && <ChristmasTree y={0} cableEntry />}
      {(spec.kind === 'frac' ||
        spec.kind === 'horiz' ||
        spec.kind === 'inj' ||
        spec.kind === 'water') && <ChristmasTree y={0} />}
    </group>
  );
}

/** Ствол скважины со всем заканчиванием. Остаётся на месте при разнесении. */
export function Well({ spec }: { spec: StoryWell }) {
  const curve = useMemo(() => wellCurve(spec), [spec]);
  const perf = useMemo(() => perfPoint(spec), [spec]);

  const perfBars = useMemo<BarSpec[]>(() => {
    const out: BarSpec[] = [];
    const pts = curve.getPoints(200);
    const atY = (target: number) => {
      let best = pts[0];
      let bd = Infinity;
      for (const p of pts) {
        const d = Math.abs(p.y - target);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return best.clone();
    };

    if (spec.kind === 'drill') return out;

    if (spec.kind === 'horiz') {
      for (let s = 0; s < 6; s++) {
        const c = pts[Math.round(pts.length * (0.72 + 0.045 * s))];
        for (let q = 0; q < 4; q++) {
          const a = (q / 4) * Math.PI * 2 + s;
          out.push([
            c,
            c.clone().add(new THREE.Vector3(Math.cos(a) * 24, 0, Math.sin(a) * 10)),
            1.2,
          ]);
        }
      }
      return out;
    }

    const px = spec.x + spec.drift * 0.85;
    const pz = spec.z + spec.drift * 0.6;
    const topPay = resTopY(px, pz) - 12;
    for (const dy of [topPay, topPay - 28, topPay - 56]) {
      const c = atY(dy);
      for (let q = 0; q < 6; q++) {
        const a = (q / 6) * Math.PI * 2 + dy;
        out.push([
          c,
          c.clone().add(new THREE.Vector3(Math.cos(a) * 26, 0, Math.sin(a) * 26)),
          1.2,
        ]);
      }
    }
    return out;
  }, [curve, spec]);

  // Конусы закачки бегут вниз по стволу нагнетательной.
  const cones = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (spec.kind !== 'inj' || !cones.current) return;
    const t = clock.elapsedTime;
    cones.current.children.forEach((c, q) => {
      const k = ((t * 90 + q * 160) % 480) / 480;
      const p = curve.getPointAt(Math.min(0.98, 0.08 + k * 0.9));
      c.position.copy(p);
    });
  });

  const tracePoints = useMemo(() => curve.getPoints(64), [curve]);

  /**
   * Траектория кабеля УЭЦН — копия ствола, отведённая вбок на радиус колонны.
   * Смещение постоянное по горизонтали: ствол почти вертикален, и честный
   * расчёт нормали к кривой дал бы кабель, ныряющий сквозь трубу на изгибах.
   */
  const cableCurve = useMemo(() => {
    const pts = curve.getPoints(40);
    const end = Math.round(pts.length * 0.74);
    return new THREE.CatmullRomCurve3(
      pts.slice(0, end + 1).map((p) => new THREE.Vector3(p.x + 1.9, p.y, p.z)),
    );
  }, [curve]);

  const TRACE_COLOR = spec.kind === 'inj' ? '#5fa8e8' : '#8fbaf0';

  const pick = useSelect(spec.id);

  return (
    <group
      userData={{ id: spec.id }}
      onClick={pick.onClick}
      onPointerOver={pick.onPointerOver}
      onPointerOut={pick.onPointerOut}
    >
      {/* Экранная трасса ствола постоянной толщины.
          Геометрический диаметр колонны честный — около четырёх метров, и на
          обзорном плане с полутора километров это тоньше пикселя: разнесёшь
          слои, а скважин между ними не видно. Линия задаётся в пикселях, а не
          в метрах, поэтому траектория читается на любом удалении, тогда как
          вблизи работает уже настоящая геометрия колонны. */}
      <Line
        points={tracePoints}
        color={TRACE_COLOR}
        lineWidth={2.6}
        transparent
        opacity={0.95}
        depthWrite={false}
      />

      {/* Цементное кольцо → обсадная колонна → НКТ.
          Диаметры умеренно преувеличены: настоящая обсадная — 168–245 мм, на
          промысле в полтора километра это тоньше пикселя. Прототип задавал
          радиус 11 м, то есть ствол шириной с пятиэтажку, — при клике по
          скважине (§8.3) камера подходит на тридцать метров и это разрушало
          кадр. Здесь ~4 м на цементное кольцо: линия видна на разрезе и не
          выглядит тоннелем вблизи. */}
      <mesh>
        <tubeGeometry args={[curve, 48, 2, 8, false]} />
        <meshStandardMaterial color="#c9c2b2" roughness={0.8} transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh>
        <tubeGeometry args={[curve, 48, 1.5, 8, false]} />
        <meshStandardMaterial
          color="#9aa7b8"
          metalness={0.7}
          roughness={0.35}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <tubeGeometry args={[curve, 48, 0.8, 7, false]} />
        <meshStandardMaterial color="#c8d2e0" metalness={0.7} roughness={0.3} />
      </mesh>

      {perfBars.length > 0 && (
        <Bars
          bars={perfBars}
          material={{ color: '#e0b265', metalness: 0.3, roughness: 0.5 }}
          emissive="#b8741e"
        />
      )}

      {/* Трещина ГРП */}
      {spec.kind === 'frac' && (
        <mesh position={perf} rotation={[0, 0.5, Math.PI / 2]}>
          <cylinderGeometry args={[95, 95, 3, 28]} />
          <meshStandardMaterial
            color="#e8a94a"
            emissive="#c07b20"
            emissiveIntensity={0.5}
            transparent
            opacity={0.5}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/*
        ГНО — погружной насос. На этом промысле это УЭВН (электровинтовой),
        а не УЭЦН: так в отчёте по обследованию, и так и должно быть на
        высоковязкой нефти.

        ДИАМЕТР СОЗНАТЕЛЬНО ПРЕУВЕЛИЧЕН. Настоящий погружной насос — около
        100 мм в поперечнике при длине 10–20 м. На промысле шириной 5,3 км это
        тоньше пикселя: в истинном масштабе ГНО не существует для зрителя
        вовсе. Здесь радиус 1,4 м — примерно двадцативосьмикратно, ровно
        столько, чтобы узел читался при подлёте камеры к устью. Длина при этом
        оставлена настоящей.
      */}
      {(spec.kind === 'skn' || spec.kind === 'esp' || spec.kind === 'water') && (
        <mesh position={curve.getPointAt(0.74)} userData={{ id: `${spec.id}:gno` }}>
          <cylinderGeometry args={[1.4, 1.4, 16, 12]} />
          <meshStandardMaterial
            color="#35d0c2"
            emissive="#1e8a80"
            emissiveIntensity={0.4}
            metalness={0.6}
            roughness={0.35}
          />
        </mesh>
      )}

      {/* Кабель питания УЭЦН вдоль колонны — от устьевого ввода до насоса.
          Идёт снаружи НКТ, поэтому строится по смещённой копии траектории:
          прижать его к оси значило бы спрятать внутрь трубы. */}
      {spec.kind === 'esp' && (
        <mesh userData={{ id: `${spec.id}:cable` }}>
          <tubeGeometry args={[cableCurve, 36, 0.32, 5, false]} />
          <meshStandardMaterial color="#2b3038" roughness={0.9} metalness={0.1} />
        </mesh>
      )}

      {/* Пакер — разобщает затруб над интервалом перфорации */}
      {spec.kind !== 'drill' && spec.kind !== 'horiz' && (
        <mesh position={curve.getPointAt(0.86)} userData={{ id: `${spec.id}:packer` }}>
          <cylinderGeometry args={[1.9, 1.9, 3.2, 12]} />
          <meshStandardMaterial color="#6b5a4a" roughness={0.85} metalness={0.15} />
        </mesh>
      )}

      {/* Отложения АСПО на НКТ в верхней части ствола — профильная проблема
          высоковязкой нефти и повод для химизации (БРХ). Показываются только
          на скважинах с механизированной добычей. */}
      {(spec.kind === 'skn' || spec.kind === 'esp') &&
        [0.1, 0.17, 0.24, 0.31].map((t) => (
          <mesh key={t} position={curve.getPointAt(t)} userData={{ id: `${spec.id}:aspo` }}>
            <cylinderGeometry args={[1.15, 1.05, 7, 9]} />
            <meshStandardMaterial color="#3d3226" roughness={1} metalness={0} />
          </mesh>
        ))}

      {spec.kind === 'inj' && (
        <group ref={cones}>
          {[0, 1, 2].map((q) => (
            <mesh key={q} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[1.6, 5, 8]} />
              <meshBasicMaterial
                color="#5fa8e8"
                transparent
                opacity={0.9}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          ))}
        </group>
      )}

      {/* Приток к забою и подъём по колонне — процесс добычи, а не обозначение */}
      {spec.kind !== "drill" && (
        <>
          <ReservoirFlow spec={spec} />
          <LiftFlow spec={spec} />
        </>
      )}

      {/* Долото на забое бурящейся */}
      {spec.kind === 'drill' && (
        <mesh position={curve.getPointAt(0.995)} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[1.4, 4, 10]} />
          <meshStandardMaterial
            color="#b8c4d4"
            metalness={0.8}
            roughness={0.3}
            emissive="#4a6ea8"
            emissiveIntensity={0.35}
          />
        </mesh>
      )}

    </group>
  );
}
