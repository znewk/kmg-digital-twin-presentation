import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { perfPoint, wellCurve, resTopY } from './geology';
import type { StoryWell } from '../../data/geo/storyWells';
import { Assembly, type Placement } from './kit/Assembly';
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

const STEEL = { color: '#8c97a8', metalness: 0.7, roughness: 0.35 } as const;
const STEEL_DARK = { color: '#5f6b7e', metalness: 0.6, roughness: 0.45 } as const;
const UNIT = { color: '#7e8ca0', metalness: 0.7, roughness: 0.35 } as const;

// ── Устья ───────────────────────────────────────────────────────────────────

/** Станок-качалка, размеры настоящие: балансир 9,2 м, высота стойки 6 м. */
function PumpjackHead({ y }: { y: number }) {
  const beam = useRef<THREE.Group>(null);
  const crank = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const phase = (clock.elapsedTime * Math.PI * 2) / 8;
    if (beam.current) beam.current.rotation.z = Math.sin(phase) * 0.17;
    if (crank.current) crank.current.rotation.z = phase;
  });

  const legs = useMemo<BarSpec[]>(() => {
    const top = new THREE.Vector3(0.4, 6, 0);
    return (
      [
        [-1, -1.1],
        [-1, 1.1],
        [1.8, -1.1],
        [1.8, 1.1],
      ] as [number, number][]
    ).map(([x, z]) => [new THREE.Vector3(x, 0.5, z), top, 0.16] as BarSpec);
  }, []);

  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[7.8, 0.6, 2.8]} />
        <meshStandardMaterial {...STEEL_DARK} />
      </mesh>
      <Bars bars={legs} material={STEEL} />
      <group ref={beam} position={[0.4, 6, 0]}>
        <mesh castShadow>
          <boxGeometry args={[9.2, 0.6, 0.7]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
        <mesh position={[-4.6, -0.6, 0]} castShadow>
          <boxGeometry args={[1, 2.4, 1.4]} />
          <meshStandardMaterial {...STEEL} />
        </mesh>
      </group>
      <group ref={crank} position={[3.4, 1.8, 0]}>
        <mesh position={[0, 1.1, 0]} castShadow>
          <boxGeometry args={[0.48, 3.2, 0.56]} />
          <meshStandardMaterial {...STEEL_DARK} />
        </mesh>
        <mesh position={[0, 2.3, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[1.05, 1.05, 0.7, 14]} />
          <meshStandardMaterial {...STEEL_DARK} />
        </mesh>
      </group>
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
      <Assembly build={buildRigStatic} placements={ORIGIN} id="rig-static" />

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
      <Assembly build={buildWorkoverStatic} placements={ORIGIN} id="workover-static" />
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

// ── Скважина целиком ────────────────────────────────────────────────────────

export function Well({ spec, groundY }: { spec: StoryWell; groundY: number }) {
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

  return (
    <group userData={{ id: spec.id }}>
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

      {/* Устье */}
      <group position={[spec.x, 0, spec.z]}>
        {spec.kind === 'skn' && <PumpjackHead y={groundY} />}
        {spec.kind === 'drill' && <DerrickHead y={groundY} />}
        {spec.kind === 'wo' && <WorkoverHead y={groundY} />}
        {spec.kind === 'esp' && <ChristmasTree y={groundY} cableEntry />}
        {(spec.kind === 'frac' ||
          spec.kind === 'horiz' ||
          spec.kind === 'inj' ||
          spec.kind === 'water') && <ChristmasTree y={groundY} />}
      </group>
    </group>
  );
}
