import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  toSceneX,
  toSceneZ,
  useFieldData,
  type Polyline,
} from '../../data/geo/fieldData';
import { Assembly } from './kit/Assembly';
import { box, cyl, pipe, sphere, type Part } from './kit/parts';
import { surfY } from "./geology";
import { EQUIPMENT_SCALE } from "./kit/scale";

/**
 * Живой промысел: дороги полотном, транспорт, мачта связи с телеметрией
 * (ТЗ §8.4 — перенос из референсного прототипа).
 *
 * Про дороги важно понимать ограничение данных: в слое `road` четыре коротких
 * участка, все у промыслового комплекса на востоке. Кольцевого проезда по
 * промыслу в чертеже нет — то ли не снимали грунтовки, то ли их там и нет.
 * Поэтому транспорт ходит по тем дорогам, которые действительно есть, а не по
 * выдуманному кольцу вокруг месторождения.
 */

/** Полуширина дорожного полотна, м. */
const ROAD_HALF = 3.2;

/**
 * Дорожное полотно лентой по трассе.
 *
 * Линия толщиной в пиксель дорогой не выглядит: с высоты она неотличима от
 * трубопровода, а вблизи её просто нет. Лента даёт ширину, по которой дорога
 * читается дорогой.
 */
function buildRoadRibbon(lines: Polyline[], half: number, lift: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const normal: number[] = [];
  const index: number[] = [];

  for (const line of lines) {
    if (line.length < 2) continue;
    const start = pos.length / 3;

    for (let i = 0; i < line.length; i++) {
      const x = toSceneX(line[i][0]);
      const z = toSceneZ(line[i][1]);

      const a = line[Math.max(0, i - 1)];
      const b = line[Math.min(line.length - 1, i + 1)];
      const dx = toSceneX(b[0]) - toSceneX(a[0]);
      const dz = toSceneZ(b[1]) - toSceneZ(a[1]);
      const len = Math.hypot(dx, dz) || 1;
      // Поперечная нормаль в плане — по ней разносятся кромки полотна.
      const nx = -dz / len;
      const nz = dx / len;

      for (const s of [-1, 1]) {
        const px = x + nx * half * s;
        const pz = z + nz * half * s;
        pos.push(px, surfY(px, pz) + lift, pz);
        normal.push(0, 1, 0);
      }
    }

    for (let i = 0; i < line.length - 1; i++) {
      const a = start + i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

export function Roads() {
  const data = useFieldData();

  const { surface, shoulder } = useMemo(
    () => ({
      surface: buildRoadRibbon(data.networks.road, ROAD_HALF, 0.28),
      // Обочина шире полотна и лежит ниже — даёт дороге край.
      shoulder: buildRoadRibbon(data.networks.road, ROAD_HALF + 1.6, 0.12),
    }),
    [data],
  );

  return (
    <group userData={{ id: 's-roads' }}>
      <mesh geometry={shoulder} receiveShadow>
        <meshStandardMaterial color="#5b5647" roughness={1} metalness={0} />
      </mesh>
      <mesh geometry={surface} receiveShadow>
        <meshStandardMaterial color="#3f434a" roughness={0.92} metalness={0} />
      </mesh>
    </group>
  );
}

// ── Транспорт ───────────────────────────────────────────────────────────────

/** Автоцистерна: тягач с кабиной и цистерна на раме. */
function TankTruck() {
  return (
    <group>
      <mesh position={[2.6, 1.5, 0]} castShadow>
        <boxGeometry args={[2.2, 2.0, 2.3]} />
        <meshStandardMaterial color="#7b8794" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[3.5, 1.9, 0]} castShadow>
        <boxGeometry args={[0.12, 0.9, 2.0]} />
        <meshStandardMaterial color="#16212e" metalness={0.2} roughness={0.2} />
      </mesh>
      <mesh position={[-1.4, 1.7, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[1.05, 1.05, 6.4, 14]} />
        <meshStandardMaterial color="#b9bcae" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[-1.4, 0.75, 0]} castShadow>
        <boxGeometry args={[6.8, 0.3, 2.0]} />
        <meshStandardMaterial color="#5f6b7e" metalness={0.5} roughness={0.5} />
      </mesh>
      {[-3.4, -0.6, 2.6].map((x) =>
        [-1.05, 1.05].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.55, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.55, 0.55, 0.34, 10]} />
            <meshStandardMaterial color="#22262c" roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

/** Вахтовка: кунг на шасси повышенной проходимости. */
function CrewBus() {
  return (
    <group>
      <mesh position={[2.2, 1.5, 0]} castShadow>
        <boxGeometry args={[1.9, 1.9, 2.2]} />
        <meshStandardMaterial color="#6f7f74" metalness={0.25} roughness={0.65} />
      </mesh>
      <mesh position={[3.0, 1.85, 0]} castShadow>
        <boxGeometry args={[0.1, 0.8, 1.9]} />
        <meshStandardMaterial color="#16212e" metalness={0.2} roughness={0.2} />
      </mesh>
      <mesh position={[-1.2, 1.85, 0]} castShadow>
        <boxGeometry args={[5.2, 2.4, 2.3]} />
        <meshStandardMaterial color="#6f7f74" metalness={0.25} roughness={0.7} />
      </mesh>
      {[-2.6, -1.2, 0.2].map((x) => (
        <mesh key={x} position={[x, 2.3, 1.16]}>
          <boxGeometry args={[0.85, 0.6, 0.06]} />
          <meshStandardMaterial
            color="#16212e"
            emissive="#2a5b7a"
            emissiveIntensity={0.3}
            roughness={0.2}
          />
        </mesh>
      ))}
      {[-2.6, 0.4, 2.4].map((x) =>
        [-1.0, 1.0].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.6, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.6, 0.6, 0.36, 10]} />
            <meshStandardMaterial color="#22262c" roughness={0.9} />
          </mesh>
        )),
      )}
    </group>
  );
}

/**
 * Маршрут по фактическим дорогам: машина идёт до конца трассы и возвращается.
 *
 * Кольца в данных нет, поэтому и движение маятниковое — это честнее, чем
 * пририсовать промыслу кольцевой проезд, которого в съёмке не оказалось.
 */
function useRoute(index: number) {
  const data = useFieldData();

  return useMemo(() => {
    const roads = [...data.networks.road].sort((a, b) => b.length - a.length);
    const line = roads[index % Math.max(1, roads.length)];
    if (!line || line.length < 2) return null;

    const pts = line.map(([x, y]) => {
      const sx = toSceneX(x);
      const sz = toSceneZ(y);
      return new THREE.Vector3(sx, surfY(sx, sz), sz);
    });

    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2);
  }, [data, index]);
}

function Vehicle({
  route,
  speed,
  offset,
  children,
}: {
  route: THREE.CatmullRomCurve3 | null;
  /** Доля маршрута в секунду. */
  speed: number;
  offset: number;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const scratch = useMemo(
    () => ({ p: new THREE.Vector3(), q: new THREE.Vector3() }),
    [],
  );

  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g || !route) return;

    // Маятник: пила по времени вместо пилообразного скачка в конце маршрута.
    const raw = (clock.elapsedTime * speed + offset) % 2;
    const t = raw < 1 ? raw : 2 - raw;
    const clamped = Math.min(0.999, Math.max(0.001, t));

    route.getPointAt(clamped, scratch.p);
    g.position.copy(scratch.p);
    g.position.y = surfY(scratch.p.x, scratch.p.z) + 0.1;

    route.getTangentAt(clamped, scratch.q);
    const dir = raw < 1 ? 1 : -1;
    g.rotation.y = Math.atan2(scratch.q.x * dir, scratch.q.z * dir) - Math.PI / 2;
  });

  if (!route) return null;
  return <group ref={ref}>{children}</group>;
}

export function Traffic() {
  const main = useRoute(0);
  const second = useRoute(1);

  return (
    <group userData={{ id: 's-vehicles' }}>
      <Vehicle route={main} speed={0.045} offset={0}>
        <TankTruck />
      </Vehicle>
      <Vehicle route={second} speed={0.06} offset={1.1}>
        <CrewBus />
      </Vehicle>
    </group>
  );
}

// ── Мачта связи и телеметрия ────────────────────────────────────────────────

/** Решётчатая мачта связи с антеннами и лестницей. */
function buildCommMast(): Part[] {
  const out: Part[] = [];
  const H = 34;
  const base = 1.9;
  const top = 0.55;

  out.push(box('concrete', 5.2, 0.5, 5.2, 0, 0.25, 0));

  const corner = (sx: number, sz: number, t: number): [number, number, number] => {
    const half = base + (top - base) * t;
    return [half * sx, 0.5 + H * t, half * sz];
  };
  const S: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ];

  for (const [sx, sz] of S) out.push(pipe('steel', 0.1, corner(sx, sz, 0), corner(sx, sz, 1), 5));
  for (let l = 1; l <= 12; l++) {
    const t = l / 12;
    const p = (l - 1) / 12;
    for (let k = 0; k < 4; k++) {
      const a = S[k];
      const b = S[(k + 1) % 4];
      out.push(pipe('steel', 0.05, corner(a[0], a[1], t), corner(b[0], b[1], t), 4));
      out.push(pipe('steel', 0.04, corner(a[0], a[1], p), corner(b[0], b[1], t), 4));
    }
  }

  // Секторные антенны и параболическая тарелка
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    out.push(
      box('painted', 0.24, 1.5, 0.16, Math.cos(a) * 0.9, 0.5 + H * 0.88, Math.sin(a) * 0.9, -a),
    );
  }
  out.push(cyl('painted', 0.75, 0.14, 1.2, 0.5 + H * 0.66, 0, 0, 0, Math.PI / 2, 14));
  out.push(sphere('steelDark', 0.14, 0.75, 0.5 + H * 0.66, 0));
  // Заградительный огонь на вершине
  out.push(sphere('accent', 0.18, 0, 0.5 + H + 0.3, 0));

  // Блок-бокс аппаратной у основания
  out.push(box('painted', 3.0, 2.4, 2.4, -4.2, 1.45, 0));
  out.push(box('steelDark', 0.9, 1.9, 0.08, -4.2, 1.2, 1.24));

  return out;
}

/**
 * Импульсы телеметрии: кольца, уходящие вверх по мачте и растворяющиеся.
 *
 * Это единственное место в сцене, где показан не физический поток, а поток
 * данных. Поэтому и выглядит иначе — не бегущей волной по проводу, а
 * расходящимися кольцами: так его не спутать с электричеством или продукцией.
 */
function TelemetryPulses({ height }: { height: number }) {
  const rings = useRef<THREE.Group>(null);
  const COUNT = 4;

  useFrame(({ clock }) => {
    const g = rings.current;
    if (!g) return;
    const t = clock.elapsedTime;

    g.children.forEach((child, i) => {
      const k = ((t * 0.45 + i / COUNT) % 1 + 1) % 1;
      child.position.y = height * 0.55 + k * height * 0.5;
      const s = 0.6 + k * 5.5;
      child.scale.set(s, s, s);
      const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.5 * (1 - k) * (1 - k);
    });
  });

  return (
    <group ref={rings}>
      {Array.from({ length: COUNT }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1, 0.07, 6, 20]} />
          <meshBasicMaterial color="#35d0c2" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Мачта связи промысла.
 *
 * Точки в датасете у неё нет: в чертеже подписаны ГЗУ, КНС, СП и КТП, мачта
 * связи в текстовый слой не попала. Ставится у промыслового комплекса, рядом с
 * СП «Молдабек», — туда же, куда сходятся кабели связи. Объект УСЛОВНЫЙ по
 * положению, и это должно быть помечено в его карточке.
 */
export function CommMast() {
  const data = useFieldData();

  const spot = useMemo(() => {
    const sp = data.facilities.find((f) => f.kind === 'sp' && f.name.includes('Молдабек'));
    if (!sp) return null;
    const x = toSceneX(sp.p[0]) - 62;
    const z = toSceneZ(sp.p[1]) + 48;
    return { x, y: surfY(x, z), z };
  }, [data]);

  if (!spot) return null;

  return (
    <group userData={{ id: 's-cio' }}>
      <Assembly build={buildCommMast} placements={[spot]} id="comm-mast" />
      <group position={[spot.x, spot.y, spot.z]}>
        <TelemetryPulses height={34 * EQUIPMENT_SCALE} />
      </group>
    </group>
  );
}
