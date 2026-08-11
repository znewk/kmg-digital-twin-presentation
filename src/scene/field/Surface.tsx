import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { surfY, HD, HW } from './geology';
import { Bars, type BarSpec } from './Bars';
import { Interactive } from './Interactive';

/**
 * Наземная инфраструктура пилота Молдабек Восточный.
 *
 * Топология — с карты объектов сценария и из отчёта по обследованию:
 *   нефтяной фонд → МФНС → СП «В-Молдабек» → напорный нефтепровод → ЦППН «Кенбай»
 *   скважина ППД → КНС · БРХ · ВЛ (12 опор) от ПС к пяти КП
 *
 * Все размеры метрические: РВС-5000 диаметром 22,8 м и высотой 12 м, опора ВЛ
 * 22 м, факельный ствол 40 м. Ничего не подгоняется множителями по месту.
 */

const BLOCK = { color: '#5c6b80', metalness: 0.4, roughness: 0.6 } as const;
const UNIT = { color: '#7e8ca0', metalness: 0.7, roughness: 0.35 } as const;
const TANK = { color: '#93a0b2', metalness: 0.6, roughness: 0.4 } as const;

/** Пять кустовых площадок — периметр пилота по системе нефтесбора. */
export const KP_POS: [number, number][] = [
  [-650, 170],
  [-560, -50],
  [-430, -250],
  [-240, -390],
  [-80, -100],
];

function Pad({ x, z, w, d }: { x: number; z: number; w: number; d: number }) {
  const y = surfY(x, z);
  const berm = useMemo<BarSpec[]>(() => [], []);
  void berm;
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[w, 1, d]} />
        <meshStandardMaterial color="#37475c" roughness={1} />
      </mesh>
      {/* Обваловка */}
      {(
        [
          [w, 5, 0, -d / 2],
          [w, 5, 0, d / 2],
          [5, d, -w / 2, 0],
          [5, d, w / 2, 0],
        ] as [number, number, number, number][]
      ).map(([ww, dd, px, pz], i) => (
        <mesh key={i} position={[px, 1.6, pz]} receiveShadow>
          <boxGeometry args={[ww, 3.2, dd]} />
          <meshStandardMaterial color="#3b4456" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Многофазная насосная станция. */
function Mfns() {
  const [x, z] = [100, -20];
  const y = surfY(x, z);
  return (
    <group position={[x, y, z]} userData={{ id: 's-mfns' }}>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[70, 1, 46]} />
        <meshStandardMaterial color="#37475c" roughness={1} />
      </mesh>
      <mesh position={[0, 5, 0]} castShadow>
        <boxGeometry args={[42, 9, 22]} />
        <meshStandardMaterial {...BLOCK} />
      </mesh>
      {[-12, 0, 12].map((dx) => (
        <mesh key={dx} position={[dx, 2.4, 18]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[1.8, 1.8, 6, 10]} />
          <meshStandardMaterial {...UNIT} />
        </mesh>
      ))}
      <mesh position={[0, 1.8, 24]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.1, 1.1, 44, 8]} />
        <meshStandardMaterial {...UNIT} />
      </mesh>
    </group>
  );
}

/** СП «В-Молдабек»: сепараторы на опорах и узел замера. */
function SeparationPoint() {
  const [x, z] = [320, -40];
  const y = surfY(x, z);
  return (
    <group position={[x, y, z]} userData={{ id: 's-sp' }}>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[92, 1, 60]} />
        <meshStandardMaterial color="#37475c" roughness={1} />
      </mesh>
      {[-14, 6].map((dz) => (
        <group key={dz}>
          <mesh position={[-6, 8, dz]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[3.4, 3.4, 22, 14]} />
            <meshStandardMaterial {...UNIT} />
          </mesh>
          {[-9, 6].map((dx) => (
            <mesh key={dx} position={[-6 + dx, 3, dz]} castShadow>
              <boxGeometry args={[1.4, 5, 4]} />
              <meshStandardMaterial color="#5f6b7e" metalness={0.6} roughness={0.45} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[26, 3.5, 18]} castShadow>
        <boxGeometry args={[14, 6, 10]} />
        <meshStandardMaterial {...BLOCK} />
      </mesh>
    </group>
  );
}

/** ЦППН «Кенбай»: техблоки, колонна, теплообменники, 4 × РВС-5000, факел. */
function Cppn() {
  const [x, z] = [620, -60];
  const y = surfY(x, z);
  const flame = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const f = flame.current;
    if (!f) return;
    f.scale.set(1 + 0.12 * Math.sin(t * 11), 1 + 0.2 * Math.sin(t * 13), 1 + 0.12 * Math.cos(t * 9));
    (f.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.2 * Math.sin(t * 17);
  });

  const flareGuys = useMemo<BarSpec[]>(
    () =>
      [0, 2.1, 4.2].map(
        (a) =>
          [
            new THREE.Vector3(Math.cos(a) * 0.8, 38, Math.sin(a) * 0.8),
            new THREE.Vector3(Math.cos(a) * 14, 0.5, Math.sin(a) * 14),
            0.14,
          ] as BarSpec,
      ),
    [],
  );

  return (
    <group position={[x, y, z]} userData={{ id: 's-cppn' }}>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[210, 1, 180]} />
        <meshStandardMaterial color="#37475c" roughness={1} />
      </mesh>

      {/* Технологическая зона */}
      <mesh position={[-56, 7, -50]} castShadow>
        <boxGeometry args={[52, 13, 32]} />
        <meshStandardMaterial {...BLOCK} />
      </mesh>
      {[-60, -50, -40].map((dz) => (
        <mesh key={dz} position={[-64, 15, dz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[1.8, 1.8, 16, 12]} />
          <meshStandardMaterial {...UNIT} />
        </mesh>
      ))}
      <mesh position={[-18, 16, -58]} castShadow>
        <cylinderGeometry args={[2.6, 2.6, 30, 12]} />
        <meshStandardMaterial {...UNIT} />
      </mesh>

      {/* Резервуарный парк: РВС-5000, Ø 22,8 м, высота 12 м */}
      {(
        [
          [28, 18],
          [28, 64],
          [74, 18],
          [74, 64],
        ] as [number, number][]
      ).map(([dx, dz], i) => (
        <group key={i} position={[dx, 0, dz]}>
          <mesh position={[0, 6, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[11.4, 11.4, 12, 24]} />
            <meshStandardMaterial {...TANK} />
          </mesh>
          {i === 3 ? (
            <mesh position={[0, 12.3, 0]}>
              <cylinderGeometry args={[10.6, 10.6, 0.5, 24]} />
              <meshStandardMaterial color="#5f6b7e" metalness={0.6} roughness={0.45} />
            </mesh>
          ) : (
            <mesh position={[0, 13.4, 0]} castShadow>
              <coneGeometry args={[11.7, 2.8, 24]} />
              <meshStandardMaterial {...TANK} />
            </mesh>
          )}
        </group>
      ))}

      {/* Факельная установка */}
      <group position={[80, 0, -100]} userData={{ id: 's-flare' }}>
        <mesh position={[0, 20, 0]} castShadow>
          <cylinderGeometry args={[0.9, 1.2, 40, 10]} />
          <meshStandardMaterial {...UNIT} />
        </mesh>
        <Bars bars={flareGuys} material={{ color: '#5f6b7e', metalness: 0.6, roughness: 0.45 }} />
        <mesh ref={flame} position={[0, 44, 0]}>
          <coneGeometry args={[2, 8, 10]} />
          <meshBasicMaterial
            color="#ffb25e"
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}

/** КНС: ряд ЦНС с резервным агрегатом (периметр пилота — одна КНС). */
function Kns() {
  const [x, z] = [-360, 220];
  const y = surfY(x, z);
  return (
    <group position={[x, y, z]} userData={{ id: 's-kns' }}>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[76, 1, 44]} />
        <meshStandardMaterial color="#37475c" roughness={1} />
      </mesh>
      <mesh position={[0, 5.5, 0]} castShadow>
        <boxGeometry args={[50, 10, 24]} />
        <meshStandardMaterial {...BLOCK} />
      </mesh>
      {[0, 1, 2, 3].map((q) => (
        <mesh key={q} position={[-18 + q * 12, 2.6, 20]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[1.8, 1.8, 6.5, 10]} />
          <meshStandardMaterial
            color={q === 3 ? '#5f6b7e' : '#7e8ca0'}
            metalness={0.65}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

/** БРХ: ёмкости реагентов и узлы дозирования УДР. */
function Brh() {
  const [x, z] = [240, 120];
  const y = surfY(x, z);
  return (
    <group position={[x, y, z]} userData={{ id: 's-brh' }}>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[50, 1, 34]} />
        <meshStandardMaterial color="#37475c" roughness={1} />
      </mesh>
      {[-14, -3, 8].map((dx) => (
        <mesh key={dx} position={[dx, 4, -5]} castShadow>
          <cylinderGeometry args={[2.2, 2.2, 7, 10]} />
          <meshStandardMaterial {...UNIT} />
        </mesh>
      ))}
      <mesh position={[16, 3, 7]} castShadow>
        <boxGeometry args={[12, 5, 8]} />
        <meshStandardMaterial {...BLOCK} />
      </mesh>
    </group>
  );
}

/** Подстанция. */
function Substation() {
  const [x, z] = [-140, 320];
  const y = surfY(x, z);
  return (
    <group position={[x, y, z]} userData={{ id: 's-ps' }}>
      <mesh position={[0, 0.5, 0]} receiveShadow>
        <boxGeometry args={[58, 1, 42]} />
        <meshStandardMaterial color="#37475c" roughness={1} />
      </mesh>
      {[-13, 8].map((dx) => (
        <mesh key={dx} position={[dx, 4.5, 3]} castShadow>
          <boxGeometry args={[11, 8, 8]} />
          <meshStandardMaterial {...UNIT} />
        </mesh>
      ))}
      <mesh position={[2, 3.5, -12]} castShadow>
        <boxGeometry args={[20, 6, 8]} />
        <meshStandardMaterial {...BLOCK} />
      </mesh>
    </group>
  );
}

/** ВЛ: 12 опор от ПС к пяти КП, провода провисают. */
function PowerLine() {
  const towers: [number, number][] = useMemo(
    () => [
      [-140, 320], [-300, 260], [-460, 220], [-650, 170], [-590, 60], [-560, -50],
      [-500, -150], [-430, -250], [-330, -320], [-240, -390], [-160, -250], [-80, -100],
    ],
    [],
  );

  const ARM_Y = 22;
  const ARM_W = 5;

  const bars = useMemo<BarSpec[]>(() => {
    const out: BarSpec[] = [];
    for (const [x, z] of towers) {
      const gy = surfY(x, z);
      const A = (dx: number, dy: number, dz: number) => new THREE.Vector3(x + dx, gy + dy, z + dz);
      out.push(
        [A(-2, 0, -2), A(-0.6, ARM_Y + 2.8, -0.6), 0.44],
        [A(2, 0, -2), A(0.6, ARM_Y + 2.8, -0.6), 0.44],
        [A(-2, 0, 2), A(-0.6, ARM_Y + 2.8, 0.6), 0.44],
        [A(2, 0, 2), A(0.6, ARM_Y + 2.8, 0.6), 0.44],
      );
      for (const h of [7, 14, 20]) {
        const k = 2 - 1.4 * (h / (ARM_Y + 2.8));
        out.push(
          [A(-k, h, -k), A(k, h, -k), 0.28],
          [A(-k, h, k), A(k, h, k), 0.28],
          [A(-k, h, -k), A(-k, h, k), 0.28],
          [A(k, h, -k), A(k, h, k), 0.28],
        );
      }
      out.push([A(-ARM_W, ARM_Y, 0), A(ARM_W, ARM_Y, 0), 0.4]);
    }
    return out;
  }, [towers]);

  const wires = useMemo(() => {
    const tip = (i: number, s: number) => {
      const [x, z] = towers[i];
      return new THREE.Vector3(x + s * ARM_W, surfY(x, z) + ARM_Y, z);
    };
    const out: THREE.CatmullRomCurve3[] = [];
    for (let i = 0; i < towers.length - 1; i++) {
      for (const s of [-1, 1]) {
        const a = tip(i, s);
        const b = tip(i + 1, s);
        const mid = a.clone().lerp(b, 0.5);
        mid.y -= 6;
        out.push(new THREE.CatmullRomCurve3([a, mid, b]));
      }
    }
    return out;
  }, [towers]);

  return (
    <group userData={{ id: 's-vl' }}>
      <Bars bars={bars} />
      {wires.map((w, i) => (
        <mesh key={i}>
          <tubeGeometry args={[w, 12, 0.28, 4, false]} />
          <meshStandardMaterial color="#7a8ca6" roughness={0.7} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/** Трубопроводы: нефтесбор, напорный нефтепровод, водовод ППД, реагент. */
function Pipelines() {
  const root = useRef<THREE.Group>(null);

  const flowTexture = useMemo(() => {
    const make = (hex: string) => {
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 4;
      const c = cv.getContext('2d')!;
      const g = c.createLinearGradient(0, 0, 42, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.7, hex);
      g.addColorStop(1, '#ffffff');
      c.fillStyle = g;
      c.fillRect(0, 0, 42, 4);
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = THREE.RepeatWrapping;
      return tex;
    };
    return { oil: make('#f0ae4a'), water: make('#5fa8e8'), chem: make('#cfe8e4') };
  }, []);

  const routes = useMemo(() => {
    type Sys = 'oil' | 'water' | 'chem';
    // Диаметры. Настоящий нефтесборный коллектор — DN 150–300, то есть на
    // промысле в полтора километра он тоньше пикселя. Прототип решал это
    // радиусом 2,4 м, но при клике по объекту (§8.3) камера подходит на
    // тридцать метров, и труба толщиной с дом рушит всю сцену. Здесь принято
    // умеренное преувеличение — примерно вдвое от DN 500: на общем плане линия
    // читается за счёт светящегося потока внутри, вблизи выглядит правдоподобно.
    const spec: { pts: [number, number][]; sys: Sys; r: number; id: string }[] = [
      { pts: [...KP_POS, [100, -20]], sys: 'oil', r: 0.8, id: 's-neftesbor' },
      { pts: [[180, -120], [140, -70], [100, -20]], sys: 'oil', r: 0.8, id: 's-pipes' },
      { pts: [[420, 160], [260, 60], [100, -20]], sys: 'oil', r: 0.8, id: 's-pipes' },
      { pts: [[60, 300], [80, 140], [100, -20]], sys: 'oil', r: 0.8, id: 's-pipes' },
      { pts: [[300, -340], [200, -180], [100, -20]], sys: 'oil', r: 0.8, id: 's-pipes' },
      { pts: [[100, -20], [210, -30], [320, -40]], sys: 'oil', r: 0.9, id: 's-pipes' },
      { pts: [[320, -40], [460, -50], [562, -56]], sys: 'oil', r: 1.1, id: 's-napor' },
      { pts: [[-360, 220], [-320, 150], [-280, 80]], sys: 'water', r: 0.75, id: 's-ppd-line' },
      { pts: [[-360, 220], [-260, -40], [-180, -200], [-120, -320]], sys: 'water', r: 0.75, id: 's-ppd-line' },
      { pts: [[240, 120], [210, 0], [180, -120]], sys: 'chem', r: 0.45, id: 's-chem' },
      { pts: [[240, 120], [280, 40], [320, -40]], sys: 'chem', r: 0.45, id: 's-chem' },
    ];
    const speeds: Record<Sys, number> = { oil: 0.5, water: 0.32, chem: 0.75 };
    const colors: Record<Sys, string> = { oil: '#7a7466', water: '#5a7490', chem: '#6e8280' };
    return spec.map((s) => {
      // Высота эстакады тоже уменьшена: труба на четырёхметровых опорах при
      // диаметре 1,6 м выглядела мостом, а не нефтесбором.
      const curve = new THREE.CatmullRomCurve3(
        s.pts.map(([x, z]) => new THREE.Vector3(x, surfY(x, z) + 1.6, z)),
      );
      const len = curve.getLength();
      return {
        ...s,
        curve,
        segments: Math.max(18, Math.round(len / 24)),
        repeat: Math.max(3, Math.round(len / 95)),
        speed: speeds[s.sys],
        shellColor: colors[s.sys],
      };
    });
  }, []);

  // Скорость потока хранится в userData самих мешей, а не в собранном при
  // рендере массиве: сбор через ref-колбэки задваивается в StrictMode и
  // накапливает мёртвые ссылки при перемонтировании этапа.
  useFrame((_, dt) => {
    root.current?.traverse((o) => {
      const speed = o.userData.flowSpeed as number | undefined;
      if (speed === undefined) return;
      const mat = (o as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (mat.map) mat.map.offset.x -= dt * speed;
    });
  });

  return (
    <group ref={root}>
      {routes.map((r, i) => {
        const tex = flowTexture[r.sys].clone();
        tex.wrapS = THREE.RepeatWrapping;
        tex.repeat.set(r.repeat, 1);
        return (
          <group key={i} userData={{ id: r.id }}>
            <mesh castShadow>
              <tubeGeometry args={[r.curve, r.segments, r.r, 8, false]} />
              <meshStandardMaterial color={r.shellColor} metalness={0.7} roughness={0.35} />
            </mesh>
            <mesh userData={{ flowSpeed: r.speed }}>
              <tubeGeometry args={[r.curve, r.segments, r.r * 0.55, 6, false]} />
              <meshBasicMaterial
                map={tex}
                transparent
                opacity={0.95}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Рельеф промысла. */
function Terrain() {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(2 * HW, 2 * HD, 72, 48);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, surfY(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    return g;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow userData={{ id: 's-terrain' }}>
      {/* Почти непрозрачный: полупрозрачная поверхность на тёмном фоне даёт
          провал по светлоте, и промысел с высоты читается чёрным пятном.
          Прозрачность под разрез включается отдельно, на этапе ЦД Пласта. */}
      <meshStandardMaterial
        color="#465d73"
        roughness={0.96}
        metalness={0}
        transparent
        opacity={0.92}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

export function SurfaceFacilities() {
  return (
    <group>
      {/* Рельеф вне интерактива: он подложка, а не объект двойника — иначе
          любой промах мимо установки выделял бы «поверхность». */}
      <Terrain />

      <Interactive id="s-kp">
        {KP_POS.map(([x, z], i) => (
          <Pad key={i} x={x} z={z} w={90} d={62} />
        ))}
      </Interactive>

      <Interactive id="s-pad-1">
        <Pad x={180} z={-120} w={140} d={94} />
      </Interactive>
      <Interactive id="s-pad-2">
        <Pad x={420} z={160} w={124} d={88} />
      </Interactive>

      <Interactive id="s-mfns">
        <Mfns />
      </Interactive>
      <Interactive id="s-sp">
        <SeparationPoint />
      </Interactive>
      <Interactive id="s-cppn">
        <Cppn />
      </Interactive>
      <Interactive id="s-kns">
        <Kns />
      </Interactive>
      <Interactive id="s-brh">
        <Brh />
      </Interactive>
      <Interactive id="s-ps">
        <Substation />
      </Interactive>
      <Interactive id="s-vl">
        <PowerLine />
      </Interactive>

      <Pipelines />
    </group>
  );
}
