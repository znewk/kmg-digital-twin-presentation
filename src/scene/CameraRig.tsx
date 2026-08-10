import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { progressRef } from '../store/useShow';
import { CAMS, FLAT_BEATS, TOTAL_BEATS } from '../data/stages';

/**
 * Камера как чистая функция прогресса скролла.
 *
 * Перелёт занимает первые 45% такта, дальше кадр стоит — зрителю нужно время
 * прочитать панель, а не догонять глазами едущую камеру. Ни одного твина с
 * собственным состоянием: только так скролл вверх честно отыгрывает обратно.
 */

const TRANSIT = 0.45;
const easeInOutCubic = (k: number) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _tgtFrom = new THREE.Vector3();
const _tgtTo = new THREE.Vector3();
const _tgt = new THREE.Vector3();

interface Props {
  /** Цель орбиты, если пользователь встал на паузу и крутит сцену сам. */
  enabled?: boolean;
}

export function CameraRig({ enabled = true }: Props) {
  const { camera } = useThree();
  const smoothed = useRef(new THREE.Vector3());
  const smoothedTarget = useRef(new THREE.Vector3());
  const inited = useRef(false);

  useFrame((_, dt) => {
    if (!enabled) return;

    const p = THREE.MathUtils.clamp(progressRef.current, 0, 0.999999);
    const raw = p * TOTAL_BEATS;
    const i = Math.min(TOTAL_BEATS - 1, Math.floor(raw));
    const t = raw - i;

    const to = CAMS[FLAT_BEATS[i].cam];
    const from = CAMS[FLAT_BEATS[Math.max(0, i - 1)].cam];
    const k = easeInOutCubic(THREE.MathUtils.clamp(t / TRANSIT, 0, 1));

    _from.set(from.p[0], from.p[1], from.p[2]);
    _to.set(to.p[0], to.p[1], to.p[2]);
    _pos.lerpVectors(_from, _to, k);

    _tgtFrom.set(from.t[0], from.t[1], from.t[2]);
    _tgtTo.set(to.t[0], to.t[1], to.t[2]);
    _tgt.lerpVectors(_tgtFrom, _tgtTo, k);

    // Медленный дрейф после прилёта: кадр остаётся живым, но не мешает читать.
    const hold = THREE.MathUtils.clamp((t - TRANSIT) / (1 - TRANSIT), 0, 1);
    const drift = Math.sin(hold * Math.PI) * 0.02;
    _pos.applyAxisAngle(new THREE.Vector3(0, 1, 0), drift);

    if (!inited.current) {
      smoothed.current.copy(_pos);
      smoothedTarget.current.copy(_tgt);
      inited.current = true;
    }

    // Критическое демпфирование поверх скраба: гасит рывки колеса мыши,
    // не внося задержки, заметной на реверсе.
    const a = 1 - Math.exp(-dt * 9);
    smoothed.current.lerp(_pos, a);
    smoothedTarget.current.lerp(_tgt, a);

    camera.position.copy(smoothed.current);
    camera.lookAt(smoothedTarget.current);
  });

  return null;
}
