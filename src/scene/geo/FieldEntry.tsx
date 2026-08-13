import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMS, FLAT_BEATS } from '../../data/stages';
import { terrainReady } from '../field/geology';
import { useShow } from '../../store/useShow';

/**
 * СНИЖЕНИЕ С ОРБИТЫ К ПРОМЫСЛУ.
 *
 * Единственное место, где камерой владеет переход. Глобус и месторождение —
 * сцены разного масштаба (планета радиусом 300 единиц и промысел шириной пять
 * километров), и переход между ними всегда подмена; задача перехода — сделать
 * её незаметной.
 *
 * Кадр идёт от текущего ракурса показа к точке над Молдабеком — ровно тот
 * ракурс `descend`, которым раньше заканчивалась гео-последовательность. К
 * концу снижения экран уже перекрыт заслонкой (`EntryCover`), под ней камера
 * переставляется на общий план промысла, и промысел монтируется.
 *
 * Заслонка держится до готовности рельефа. Ждать обязательно: датасет грузится
 * асинхронно, и без ожидания зритель получил бы пустой кадр там, где обещано
 * месторождение. Ограничение сверху есть на случай, если данные не приедут
 * вовсе — лучше показать пустую сцену, чем оставить чёрный экран.
 */

/** Длительность снижения. Согласована с временем проявления заслонки. */
const DESCENT_SECONDS = 1.6;

/** Сколько держать заслонку сверх готовности рельефа — на сборку геометрии. */
const SETTLE_SECONDS = 0.4;

/** Предел ожидания сцены: дальше заслонка уходит в любом случае. */
const WAIT_LIMIT_SECONDS = 8;

const easeInOutCubic = (k: number) =>
  k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

const _from = new THREE.Vector3();
const _fromTarget = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _toTarget = new THREE.Vector3();
const _target = new THREE.Vector3();

export function FieldEntry() {
  const entry = useShow((s) => s.entry);
  const { camera } = useThree();

  /** Время внутри текущей фазы перехода. */
  const elapsed = useRef(0);
  /** Откуда начали снижение — снимается на первом кадре фазы. */
  const started = useRef(false);

  useFrame((_, dt) => {
    if (!entry) {
      started.current = false;
      elapsed.current = 0;
      return;
    }

    if (entry.phase === 'descend') {
      if (!started.current) {
        started.current = true;
        elapsed.current = 0;
        _from.copy(camera.position);
        /**
         * Цель снимается с ФАКТИЧЕСКОГО направления взгляда, а не берётся из
         * ракурса такта.
         *
         * Пока камера всегда стояла на кадре такта, разницы не было. Но уйти на
         * промысел можно и из осмотра значка вблизи, где камера стоит у самой
         * площадки и смотрит на неё сбоку: цель такта в этот момент в стороне и
         * выше, и снижение начиналось бы с рывка взгляда. Расстояние до цели
         * берётся от ракурса такта — оно задаёт, насколько «дальний» взгляд
         * плавно сводится к точке снижения.
         */
        const cam = CAMS[FLAT_BEATS[useShow.getState().beatIndex].cam];
        _fromTarget.set(cam.t[0], cam.t[1], cam.t[2]);
        camera.getWorldDirection(_forward);
        _fromTarget
          .copy(camera.position)
          .addScaledVector(_forward, camera.position.distanceTo(_fromTarget));
      }

      elapsed.current += dt;
      const k = easeInOutCubic(Math.min(1, elapsed.current / DESCENT_SECONDS));

      const to = CAMS.descend;
      _pos.set(to.p[0], to.p[1], to.p[2]);
      _toTarget.set(to.t[0], to.t[1], to.t[2]);
      camera.position.lerpVectors(_from, _pos, k);
      _target.lerpVectors(_fromTarget, _toTarget, k);
      camera.lookAt(_target);

      if (elapsed.current < DESCENT_SECONDS) return;

      /**
       * ПОДМЕНА СЦЕНЫ ПОД ЗАСЛОНКОЙ.
       *
       * Камера переставляется на общий план промысла ДО того, как поле
       * смонтировано: первый же кадр новой сцены обязан быть снят с осмысленной
       * точки. Дальше её подхватывает `FreeLook` — он ведёт подлёт к кадру шага
       * раздела или к обзорному ракурсу осмотра.
       */
      const top = CAMS.top;
      camera.position.set(top.p[0], top.p[1], top.p[2]);
      camera.lookAt(top.t[0], top.t[1], top.t[2]);

      started.current = false;
      elapsed.current = 0;
      useShow.getState().arriveField();
      return;
    }

    // Фаза прибытия: ждём, пока сцена станет настоящей, и убираем заслонку.
    elapsed.current += dt;
    const ready = terrainReady() && elapsed.current > SETTLE_SECONDS;
    if (ready || elapsed.current > WAIT_LIMIT_SECONDS) {
      elapsed.current = 0;
      useShow.getState().endEntry();
    }
  });

  return null;
}
