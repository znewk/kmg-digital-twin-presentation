import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { perfPoint, wellCurve, resTopY, type WellSpec } from './geology';
import { Bars, type BarSpec } from './Bars';

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

/** Буровая вышка: 41 м, талевый блок ходит, ротор вращается. */
function DerrickHead({ y }: { y: number }) {
  const block = useRef<THREE.Mesh>(null);
  const rotor = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (block.current) block.current.position.y = 26 - 9 * (0.5 + 0.5 * Math.sin((t * Math.PI * 2) / 11));
    if (rotor.current) rotor.current.rotation.y = t * 2.2;
  });

  const bars = useMemo<BarSpec[]>(() => {
    const H = 41;
    const b0 = 7;
    const b1 = 1.9;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const corner = (sx: number, sz: number, t: number) =>
      new THREE.Vector3(lerp(b0 * sx, b1 * sx, t), H * t, lerp(b0 * sz, b1 * sz, t));
    const S: [number, number][] = [
      [1, 1],
      [1, -1],
      [-1, -1],
      [-1, 1],
    ];
    const out: BarSpec[] = [];
    for (const [sx, sz] of S) out.push([corner(sx, sz, 0), corner(sx, sz, 1), 0.42]);
    const LV = 8;
    for (let l = 1; l <= LV; l++) {
      const t = l / LV;
      for (let k = 0; k < 4; k++) {
        const a = S[k];
        const b = S[(k + 1) % 4];
        out.push([corner(a[0], a[1], t), corner(b[0], b[1], t), 0.26]);
        out.push([corner(a[0], a[1], (l - 1) / LV), corner(b[0], b[1], t), 0.2]);
      }
    }
    return out;
  }, []);

  return (
    <group position={[0, y, 0]}>
      <Bars bars={bars} material={STEEL} />
      <mesh position={[0, 42, 0]} castShadow>
        <boxGeometry args={[4.6, 1.4, 4.6]} />
        <meshStandardMaterial {...STEEL_DARK} />
      </mesh>
      <mesh position={[0, 1.6, 0]} castShadow>
        <boxGeometry args={[18, 1.4, 15]} />
        <meshStandardMaterial {...STEEL_DARK} />
      </mesh>
      <mesh ref={block} position={[0, 26, 0]} castShadow>
        <boxGeometry args={[2.4, 4, 2.4]} />
        <meshStandardMaterial {...UNIT} />
      </mesh>
      <mesh ref={rotor} position={[0, 2.8, 0]}>
        <cylinderGeometry args={[2.6, 2.6, 0.9, 16]} />
        <meshStandardMaterial {...UNIT} />
      </mesh>
    </group>
  );
}

/** Подъёмник ПРС с наклонной мачтой и датчиком ДЭЛ. */
function WorkoverHead({ y }: { y: number }) {
  const bars = useMemo<BarSpec[]>(() => {
    const top = new THREE.Vector3(-1.8, 22, 0);
    const out: BarSpec[] = [
      [new THREE.Vector3(2.4, 2.4, -1.5), top.clone().setZ(-0.6), 0.34],
      [new THREE.Vector3(2.4, 2.4, 1.5), top.clone().setZ(0.6), 0.34],
      [top, new THREE.Vector3(9, 1.2, -5.4), 0.14],
      [top, new THREE.Vector3(9, 1.2, 5.4), 0.14],
    ];
    for (let l = 1; l < 5; l++) {
      const t = l / 5;
      out.push([
        new THREE.Vector3(2.4 + (top.x - 2.4) * t, 2.4 + (top.y - 2.4) * t, -1.5 + 0.9 * t),
        new THREE.Vector3(2.4 + (top.x - 2.4) * t, 2.4 + (top.y - 2.4) * t, 1.5 - 0.9 * t),
        0.18,
      ]);
    }
    return out;
  }, []);

  return (
    <group position={[0, y, 0]}>
      <mesh position={[6, 1.5, 0]} castShadow>
        <boxGeometry args={[12, 2.1, 4.2]} />
        <meshStandardMaterial {...STEEL_DARK} />
      </mesh>
      <mesh position={[11.4, 3.6, 0]} castShadow>
        <boxGeometry args={[3.3, 2.7, 3.9]} />
        <meshStandardMaterial {...UNIT} />
      </mesh>
      <Bars bars={bars} material={STEEL} />
      {/* Датчик ДЭЛ — периметр пилота: 3 бригады ПРС, оснащённые ДЭЛ */}
      <mesh position={[1.2, 7.8, -1.8]}>
        <boxGeometry args={[1, 1.4, 0.9]} />
        <meshStandardMaterial {...UNIT} />
      </mesh>
      <mesh position={[1.2, 8.8, -1.8]}>
        <sphereGeometry args={[0.34, 6, 5]} />
        <meshBasicMaterial color="#35d0c2" />
      </mesh>
    </group>
  );
}

/** Фонтанная арматура — добывающие УЭВН/ГРП/горизонтальные и нагнетательные. */
function ChristmasTree({ y }: { y: number }) {
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
    </group>
  );
}

// ── Скважина целиком ────────────────────────────────────────────────────────

export function Well({ spec, groundY }: { spec: WellSpec; groundY: number }) {
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

      {/* ГНО */}
      {/* ГНО: реальный ЭЦН — около 100 мм в диаметре и 10–20 м длиной. */}
      {(spec.kind === 'skn' || spec.kind === 'esp') && (
        <mesh position={curve.getPointAt(0.74)}>
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
        {(spec.kind === 'esp' || spec.kind === 'frac' || spec.kind === 'horiz' || spec.kind === 'inj') && (
          <ChristmasTree y={groundY} />
        )}
      </group>
    </group>
  );
}
