import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { progressRef, useShow } from '../store/useShow';
import { panelReserve } from '../ui/panelReserve';
import { CAMS, FLAT_BEATS, TOTAL_BEATS } from '../data/stages';
import { focusFrameFor } from './focus';

/**
 * Камера как чистая функция прогресса скролла — плюс приоритетный режим
 * прицельного наведения на выбранный объект (ТЗ §8.3).
 *
 * Перелёт по таймлайну занимает первые 45% такта, дальше кадр стоит: зрителю
 * нужно время прочитать панель, а не догонять глазами едущую камеру. Ни одного
 * твина с собственным состоянием — только так скролл вверх честно отыгрывает
 * обратно.
 *
 * Когда объект выбран, кадр вычисляется под него и камера уходит туда,
 * игнорируя таймлайн. Возврат — тем же плавным смешиванием.
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
const _focusPos = new THREE.Vector3();
const _focusTgt = new THREE.Vector3();

interface Props {
  enabled?: boolean;
}

export function CameraRig({ enabled = true }: Props) {
  const { camera, size } = useThree();
  const selected = useShow((s) => s.selected);

  const smoothed = useRef(new THREE.Vector3());
  const smoothedTarget = useRef(new THREE.Vector3());
  const inited = useRef(false);
  /** Доля наведения на объект: 0 — таймлайн, 1 — объект. */
  const focusBlend = useRef(0);
  /** Последняя применённая доля плашки — чтобы не трогать проекцию впустую. */
  const appliedReserve = useRef(-1);

  useFrame((_, dt) => {
    /**
     * ПОДЪЁМ КАДРА НАД НИЖНЕЙ ПЛАШКОЙ.
     *
     * Когда снизу стоит плашка, предмет должен вставать в центр СВОБОДНОЙ
     * полосы, а не экрана. Раньше это делалось смещением цели камеры по
     * поверхности сферы — и работало плохо: кривизна съедает часть смещения
     * непредсказуемо, доля плашки была вписана числом по одному монитору, и на
     * другом разрешении кадр разъезжался.
     *
     * Здесь сдвигается само окно проекции. Камера смотрит ровно на предмет, а
     * отрисовывается сдвинутая по вертикали часть кадра — предмет поднимается
     * на экране ровно на заданную долю, без всякой геометрии сферы. Доля
     * измеряется плашкой в рантайме, поэтому Full HD, 4K и любое соотношение
     * сторон дают одинаковый результат.
     *
     * Сдвиг равен половине занятой снизу доли: центр свободной полосы лежит
     * ровно на столько выше центра экрана.
     */
    const perspectiveCam = camera as THREE.PerspectiveCamera;
    const reserve = panelReserve.current > 0.02 ? panelReserve.current : 0;

    // Пересчёт только при изменении: и установка, и сброс перестраивают матрицу
    // проекции, а делать это каждый кадр ради неизменного числа незачем.
    if (reserve !== appliedReserve.current) {
      appliedReserve.current = reserve;
      if (reserve > 0) {
        perspectiveCam.setViewOffset(
          size.width,
          size.height,
          0,
          (reserve / 2) * size.height,
          size.width,
          size.height,
        );
      } else {
        perspectiveCam.clearViewOffset();
      }
    }

    if (!enabled) return;

    // ── Кадр по таймлайну ────────────────────────────────────────────────
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

    /*
      Медленного дрейфа после прилёта здесь больше нет.

      Он оживлял кадр, пока этапов было восемь и камера всё равно ехала. На
      показе из трёх экранов, где два последних стоят на одном ракурсе, дрейф
      остался единственным источником движения — и заметным: к концу такта он
      разворачивается в обратную сторону, скорость меняет знак, и на границе
      это читается рывком фона. Неподвижный кадр честнее живого, если живость
      достигается качанием камеры.
    */

    // ── Прицельное наведение на объект ───────────────────────────────────
    const perspective = camera as THREE.PerspectiveCamera;
    const frame = selected
      ? focusFrameFor(selected, perspective.fov ?? 38, size.width / size.height)
      : null;

    const wanted = frame ? 1 : 0;
    focusBlend.current += (wanted - focusBlend.current) * (1 - Math.exp(-dt * 3.2));

    if (frame) {
      _focusPos.set(frame.p[0], frame.p[1], frame.p[2]);
      _focusTgt.set(frame.t[0], frame.t[1], frame.t[2]);
      _pos.lerp(_focusPos, focusBlend.current);
      _tgt.lerp(_focusTgt, focusBlend.current);
    } else if (focusBlend.current > 0.001) {
      // Возврат: пока смешивание не догасло, продолжаем тянуть от объекта.
      // Отдельная ветка нужна, иначе камера прыгает в кадр таймлайна рывком.
      _pos.lerp(_focusPos, focusBlend.current);
      _tgt.lerp(_focusTgt, focusBlend.current);
    }

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

    if (import.meta.env.DEV) {
      (globalThis as unknown as { __cam: unknown }).__cam = {
        px: smoothed.current.x,
        py: smoothed.current.y,
        pz: smoothed.current.z,
        tx: smoothedTarget.current.x,
        ty: smoothedTarget.current.y,
        tz: smoothedTarget.current.z,
        blend: focusBlend.current,
        fov: perspective.fov,
      };
    }
  });

  return null;
}
