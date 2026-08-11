import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { useShow } from '../store/useShow';
import { CAMS, FLAT_BEATS } from '../data/stages';
import { focusFrameFor, type FocusFrame } from './focus';
import { shotFrame } from './cycle/shotFrame';
import { cycleRoutes } from '../data/cycle/route';
import { SHOT_BY_ID } from '../data/cycle/storyboard';
import { DIVE_BY_ID } from '../data/dives';
import { getFieldData } from '../data/geo/fieldData';

/**
 * Свободный осмотр сцены.
 *
 * По ТЗ §2 скролл — основной способ навигации, но на этапе нужно уметь
 * «застрять» и разглядеть объекты. Поэтому орбита не борется со скроллом
 * постоянно, а включается режимом паузы: скролл замирает, камера переходит
 * под мышь, выход — тем же переключателем или Esc.
 *
 * При входе орбита подхватывает текущее положение камеры, чтобы кадр не
 * прыгнул, а при выходе таймлайн плавно забирает управление обратно.
 */
export function FreeLook() {
  const paused = useShow((s) => s.paused);
  const beatIndex = useShow((s) => s.beatIndex);
  const selected = useShow((s) => s.selected);
  const { camera, size } = useThree();
  const ref = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    if (!paused || !ref.current) return;
    // Цель берём из ракурса текущего такта: камера уже смотрит туда, и орбита
    // начинает вращение вокруг той же точки, а не вокруг начала координат.
    const cam = CAMS[FLAT_BEATS[beatIndex].cam];
    ref.current.target.set(cam.t[0], cam.t[1], cam.t[2]);
    ref.current.update();
  }, [paused, beatIndex, camera]);

  /**
   * Наведение на выбранный объект в свободном осмотре.
   *
   * В обычном режиме камеру ведёт таймлайн, и наведение делает `CameraRig`.
   * Но кликают чаще всего именно в свободном осмотре — а там камерой владеет
   * орбита, и таймлайн отступает. Без этого клик открывал карточку, оставляя
   * сам объект где-то вдали, тогда как §8.3 требует ровно обратного: зритель
   * видит объект крупно, а панель лишь дополняет вид.
   *
   * Положение задаётся один раз на выбор, а не каждый кадр: иначе орбита
   * перестала бы слушаться мыши — камеру заклинило бы на объекте.
   */
  useEffect(() => {
    const controls = ref.current;
    if (!paused || !controls || !selected) return;

    const perspective = camera as THREE.PerspectiveCamera;
    const frame = focusFrameFor(selected, perspective.fov ?? 38, size.width / size.height);
    if (!frame) return;

    camera.position.set(frame.p[0], frame.p[1], frame.p[2]);
    controls.target.set(frame.t[0], frame.t[1], frame.t[2]);
    controls.update();
  }, [selected, paused, camera, size.width, size.height]);

  /**
   * Подлёт камеры к текущему переделу цепочки.
   *
   * Не мгновенная перестановка, как при клике по объекту, а перелёт: цепочка
   * идёт сама, и рывок кадра каждые несколько секунд читался бы как склейка
   * видео, а не как обход промысла. Заодно по движению видно, КУДА переехали, —
   * связь между соседними переделами и есть то, ради чего цепочка сквозная.
   *
   * Управление возвращается пользователю, как только камера пришла: дальше
   * орбита слушается мыши, и разглядеть передел можно с любой стороны. Пока
   * держим цель силой — мышь не работает, и это было бы хуже цепочки без
   * камеры вовсе.
   */
  const cycleShot = useShow((s) => s.cycleShot);
  const dive = useShow((s) => s.dive);
  const flight = useRef<FocusFrame | null>(null);

  useEffect(() => {
    // Кадр берётся либо из раскадровки цикла, либо из шага раздела: механизм
    // постановки один, источник разный.
    const framed = cycleShot
      ? SHOT_BY_ID.get(cycleShot)
      : dive
        ? DIVE_BY_ID.get(dive.id)?.steps[dive.step]
        : null;

    if (!framed) {
      flight.current = null;
      return;
    }
    const data = getFieldData();
    const shot = framed;
    if (!data) return;

    const { oil, ppd } = cycleRoutes(data);
    if (!oil) return;

    const perspective = camera as THREE.PerspectiveCamera;
    flight.current = shotFrame(
      shot,
      oil,
      ppd,
      data,
      perspective.fov ?? 38,
      size.width / size.height,
      cycleShot ? 'cycle' : 'dive',
    );
  }, [cycleShot, dive, camera, size.width, size.height]);

  const wantPos = useRef(new THREE.Vector3());
  const wantTarget = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    const frame = flight.current;
    const controls = ref.current;
    if (!frame || !controls) return;

    wantPos.current.set(frame.p[0], frame.p[1], frame.p[2]);
    wantTarget.current.set(frame.t[0], frame.t[1], frame.t[2]);

    const k = 1 - Math.exp(-dt * 2.2);
    camera.position.lerp(wantPos.current, k);
    controls.target.lerp(wantTarget.current, k);
    controls.update();

    // Пришли — отпускаем. Порог в метрах от габарита кадра: у шага на весь
    // промысел «пришли» это сотня метров, у отдельной установки — метр.
    if (camera.position.distanceTo(wantPos.current) < frame.radius * 0.02) {
      flight.current = null;
    }
  });

  return (
    <OrbitControls
      ref={ref}
      // В режиме полного цикла орбита выключена: камерой владеет раскадровка,
      // и мышь, дерущаяся с подлётом, не даст ни того ни другого. Сам объект
      // контролов при этом жив — через него раскадровка и ведёт камеру.
      enabled={paused && !cycleShot && !dive}
      enableDamping
      dampingFactor={0.08}
      // Под землю пускаем: разглядывать стволы и залежь нужно именно снизу.
      maxPolarAngle={Math.PI * 0.98}
      /**
       * Диапазон приближения на весь масштаб сцены.
       *
       * Прежние 20…4000 м не давали ни того, ни другого края. Вблизи двадцать
       * метров — это вся качалка в кадре целиком, а разглядеть кабельный ввод
       * или головку балансира уже нельзя. Вдали четыре километра меньше
       * диагонали участка: промысел 5352 × 4682 м, и целиком он в кадр не
       * помещался, а с разнесёнными недрами блок уходит ещё на два километра
       * вниз.
       *
       * Теперь от двух метров до четырнадцати километров. Ближний предел
       * работает только вместе с логарифмическим буфером глубины — без него
       * ближняя плоскость отсечения съедала бы всё, что ближе десяти метров.
       */
      minDistance={2}
      maxDistance={14000}
      // Шаг колеса заметно крупнее: пройти четыре порядка расстояния прежним
      // шагом означало крутить колесо до бесконечности.
      zoomSpeed={1.6}
      // Приближение к точке под курсором, а не к центру орбиты: иначе, чтобы
      // подойти к дальней качалке, её сначала надо вывести в центр кадра.
      zoomToCursor
      makeDefault={false}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
    />
  );
}
