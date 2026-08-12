import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MATERIALS } from '../field/kit/Assembly';
import { mergeParts, type MatKey, type Part } from '../field/kit/parts';
import {
  buildPumpjackBeam,
  buildPumpjackCrank,
  buildPumpjackPitman,
  buildPumpjackStatic,
  pumpjackPose,
} from '../field/facilities/pumpjack';
import { buildGzu } from '../field/facilities/gzu';
import { buildSp } from '../field/facilities/sp';
import { buildKns } from '../field/facilities/kns';
import { buildPole10 } from '../field/facilities/pole';

/**
 * КАРИКАТУРА ПРОМЫСЛА НА ГЛОБУСЕ — вместо точки на карте.
 *
 * Пока докладчик говорит о цифровом двойнике, на фоне стояла оранжевая точка.
 * Точка сообщает «здесь», и больше ничего: аудитория, не связанная с отраслью,
 * из неё не поймёт, о каком именно производстве речь. Здесь на том же месте
 * стоит наглядная сценка — качалки качают, факел горит, по коллектору бежит
 * нефть, — и процесс читается без единого слова.
 *
 * КАРИКАТУРА, А НЕ МОДЕЛЬ. Масштаб намеренно нереальный: настоящий промысел
 * пять на четыре километра на глобусе радиусом в сотню единиц — пятнышко в
 * доли пикселя. Здесь это укрупнённый значок с узнаваемым силуэтом; он
 * означает «месторождение», а не «вот столько там качалок».
 *
 * Оборудование при этом НАСТОЯЩЕЕ — те же построители, что и в сцене промысла,
 * и та же четырёхзвенная кинематика качалки. Рисовать для значка отдельные
 * модели значило бы, что на глобусе одно, а внутри показа другое.
 */

/** Размер сценки в единицах глобуса. Подобран так, чтобы читалась силуэтом. */
const TOKEN_SCALE = 0.045;

/** Радиус площадки под сценкой. */
const PAD_R = 26;

function partsMesh(m: Map<MatKey, THREE.BufferGeometry>) {
  return [...m.entries()].map(([key, geometry]) => (
    <mesh key={key} geometry={geometry}>
      <meshStandardMaterial {...MATERIALS[key]} />
    </mesh>
  ));
}

/** Станок-качалка с той же кинематикой, что на промысле. */
function Pumpjack({ at, yaw, phase }: { at: [number, number]; yaw: number; phase: number }) {
  const beam = useRef<THREE.Group>(null);
  const crank = useRef<THREE.Group>(null);
  const pitman = useRef<THREE.Group>(null);

  const geo = useMemo(
    () => ({
      base: mergeParts(buildPumpjackStatic()),
      beam: mergeParts(buildPumpjackBeam()),
      crank: mergeParts(buildPumpjackCrank()),
      pitman: mergeParts(buildPumpjackPitman()),
    }),
    [],
  );

  useFrame(({ clock }) => {
    const pose = pumpjackPose((clock.elapsedTime * Math.PI * 2) / 6 + phase);
    if (beam.current) beam.current.rotation.z = pose.beamAngle;
    if (crank.current) crank.current.rotation.z = pose.crankAngle;
    if (pitman.current) {
      pitman.current.position.copy(pose.pitmanMid);
      pitman.current.quaternion.copy(pose.pitmanQuat);
      pitman.current.scale.set(1, pose.pitmanLength, 1);
    }
  });

  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, yaw, 0]}>
      {partsMesh(geo.base)}
      <group ref={beam}>{partsMesh(geo.beam)}</group>
      <group ref={crank}>{partsMesh(geo.crank)}</group>
      <group ref={pitman}>{partsMesh(geo.pitman)}</group>
    </group>
  );
}

function Static({
  parts,
  at,
  yaw = 0,
  scale = 1,
}: {
  parts: Part[];
  at: [number, number];
  yaw?: number;
  scale?: number;
}) {
  const merged = useMemo(() => mergeParts(parts), [parts]);
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, yaw, 0]} scale={scale}>
      {partsMesh(merged)}
    </group>
  );
}

/**
 * Факел. Пламя — конус с бегущим шумом в цвете, а не частицы: частиц на значке
 * не разглядеть, а вертикальный язык с дрожащей яркостью читается сразу.
 */
function Flare({ at }: { at: [number, number] }) {
  const flame = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const m = flame.current;
    if (!m) return;
    const t = clock.elapsedTime;
    // Дрожание по двум несовпадающим частотам: одна синусоида читается
    // механическим миганием, две дают живой огонь.
    const k = 1 + 0.16 * Math.sin(t * 7.3) + 0.09 * Math.sin(t * 11.7);
    m.scale.set(1, k, 1);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.2 * Math.sin(t * 9.1);
  });

  return (
    <group position={[at[0], 0, at[1]]}>
      {/* Ствол факельной установки */}
      <mesh position={[0, 9, 0]}>
        <cylinderGeometry args={[0.7, 1, 18, 8]} />
        <meshStandardMaterial color="#8c8f95" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh ref={flame} position={[0, 21, 0]}>
        <coneGeometry args={[1.8, 7, 10]} />
        <meshBasicMaterial color="#ff9a3c" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Нитка нефтесбора от куста к сборному пункту — с бегущей волной. */
function Gathering({ from, to }: { from: [number, number]; to: [number, number] }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);

  const geometry = useMemo(() => {
    const a = new THREE.Vector3(from[0], 1.2, from[1]);
    const b = new THREE.Vector3(to[0], 1.2, to[1]);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 2;
    const curve = new THREE.CatmullRomCurve3([a, mid, b]);
    return new THREE.TubeGeometry(curve, 24, 0.5, 6, false);
  }, [from, to]);

  useFrame(({ clock }) => {
    const m = material.current;
    if (!m) return;
    m.opacity = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 3));
  });

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial ref={material} color="#f0ae4a" transparent opacity={0.6} />
    </mesh>
  );
}

/**
 * Расстановка. Куст качалок слева, замерная установка между ними, сборный пункт
 * справа, факел рядом с ним, линия электропередачи по краю — минимальный набор,
 * по которому промысел узнаётся силуэтом.
 */
const WELLS: { at: [number, number]; yaw: number; phase: number }[] = [
  { at: [-16, -6], yaw: 0.3, phase: 0 },
  { at: [-9, 8], yaw: -0.5, phase: 2.1 },
  { at: [-20, 9], yaw: 0.9, phase: 4.2 },
  { at: [-3, -12], yaw: 1.3, phase: 1.2 },
];

const GZU: [number, number] = [-2, 2];
const SP: [number, number] = [17, -2];
const FLARE: [number, number] = [24, 9];

export function FieldToken() {
  return (
    <group scale={TOKEN_SCALE}>
      {/* Площадка: тёмное основание, чтобы силуэт не терялся на заливке области */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.4, 0]}>
        <circleGeometry args={[PAD_R, 40]} />
        <meshBasicMaterial color="#1a1206" transparent opacity={0.82} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
        <ringGeometry args={[PAD_R * 0.97, PAD_R, 40]} />
        <meshBasicMaterial color="#f0ae4a" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>

      {WELLS.map((w, i) => (
        <Pumpjack key={i} at={w.at} yaw={w.yaw} phase={w.phase} />
      ))}

      <Static parts={buildGzu()} at={GZU} yaw={0.4} />
      <Static parts={buildSp()} at={SP} yaw={-0.5} scale={0.6} />
      <Static parts={buildKns()} at={[6, 13]} yaw={1.1} scale={0.6} />
      <Flare at={FLARE} />

      {[-22, -12, -2, 8].map((x) => (
        <Static key={x} parts={buildPole10()} at={[x, -18]} scale={0.9} />
      ))}

      {/* Сбор: от каждой качалки к ГЗУ, от ГЗУ к сборному пункту */}
      {WELLS.map((w, i) => (
        <Gathering key={i} from={w.at} to={GZU} />
      ))}
      <Gathering from={GZU} to={SP} />
    </group>
  );
}
