import * as THREE from 'three';
import { OBJECT_BY_ID, type FieldObject } from '../data/fieldObjects';
import { surfY } from './field/geology';
import type { CamKey } from '../data/stages';

/**
 * Прицельное наведение камеры на конкретный объект (ТЗ §8.3).
 *
 * Это ключевое отличие от референсного прототипа: там клик переключал общий
 * именованный ракурс контура («wellbore», «surface»), и зритель видел не тот
 * объект, по которому кликнул, а всю сцену под привычным углом. Здесь ракурс
 * вычисляется под конкретный инстанс от его габарита.
 *
 * Объект смещается в левую треть кадра — справа встаёт info-панель, и по
 * центру он оказался бы наполовину закрыт ею.
 */

/** Доля ширины кадра, которую занимает панель справа. */
const PANEL_FRACTION = 0.3;

/** Запас вокруг объекта, чтобы он не упирался в края. */
const MARGIN = 1.7;

export interface FocusFrame extends CamKey {
  /** Габаритный радиус — им же масштабируется обводка выделения. */
  radius: number;
}

/**
 * Радиус объекта в метрах. Явная таблица, а не расчёт по bounding box сцены:
 * габарит меша включает выносные элементы (провода ВЛ, шлейфы трубопроводов),
 * и камера отъезжала бы от качалки на километр.
 */
const FOCUS_RADIUS: Record<string, number> = {
  // Площадки и установки — по реальному габариту плиты/корпуса.
  's-pad-1': 75,
  's-pad-2': 68,
  's-kp': 55,
  's-mfns': 40,
  's-sp': 50,
  's-napor': 110,
  's-cppn': 110,
  's-flare': 26,
  's-brh': 28,
  's-kns': 42,
  's-ps': 34,
  's-vl': 130,
  's-cio': 32,

  // Скважины: радиус по видимому устьевому оборудованию, а не по стволу —
  // ствол уходит на 600 м вниз, и камера отъехала бы за пределы промысла.
  // Значения — половина реального габарита: качалка 9 м длиной и 7 м высотой
  // при радиусе 14 отъезжала на 78 м и занимала восьмую часть кадра.
  'w-prod-1': 9,
  'w-prod-2': 7,
  'w-prod-3': 7,
  'w-prod-4': 7,
  'w-inj-1': 7,
  'w-inj-2': 7,
  'w-drill': 25,
  'w-workover': 14,

  // Толщи: кадрируются как часть блока, а не целиком — иначе камера уходит
  // за полтора километра и слой перестаёт быть предметом разговора.
  'g-soil': 380,
  'g-over': 380,
  'g-cap': 340,
  'g-res': 340,
  'g-water': 380,
  'res-fault': 300,
};

/** Азимут обзора по объектам, где направление по умолчанию неудачно. */
const VIEW_AZIMUTH: Record<string, number> = {
  's-cppn': -0.7,
  's-flare': 0.4,
  's-vl': 1.2,
  's-kns': -1.4,
};

const DEFAULT_AZIMUTH = 0.9;

/**
 * Угол возвышения. На пологом ракурсе между камерой и устьем оказываются
 * трубопроводы и обваловка соседних площадок — объект тонет в наземной
 * обвязке. Взгляд сверху-сбоку проходит над ней.
 */
const ELEVATION = 0.78;

export function focusFrameFor(
  id: string,
  fovDeg: number,
  aspect: number,
): FocusFrame | null {
  const obj: FieldObject | undefined = OBJECT_BY_ID.get(id);
  if (!obj) return null;

  const radius = FOCUS_RADIUS[id] ?? 50;

  // Центр объекта. У наземных — рельеф плюс половина видимой высоты; у недр
  // отметка задана явно, они не «стоят на земле».
  const center =
    obj.centerY !== undefined
      ? new THREE.Vector3(obj.x, obj.centerY, obj.z)
      : new THREE.Vector3(obj.x, surfY(obj.x, obj.z) + obj.anchorY * 0.5, obj.z);

  // Дистанция из габарита и угла обзора. Панель съедает часть кадра по
  // ширине, поэтому эффективный горизонтальный угол меньше — учитываем это,
  // иначе объект «вылезает» из свободной зоны.
  const vFov = (fovDeg * Math.PI) / 180;
  const usableAspect = aspect * (1 - PANEL_FRACTION);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * usableAspect);
  const limiting = Math.min(vFov, hFov);
  const distance = (radius * MARGIN) / Math.tan(limiting / 2);

  const az = VIEW_AZIMUTH[id] ?? DEFAULT_AZIMUTH;
  const dir = new THREE.Vector3(
    Math.cos(ELEVATION) * Math.sin(az),
    Math.sin(ELEVATION),
    Math.cos(ELEVATION) * Math.cos(az),
  );
  const position = center.clone().addScaledVector(dir, distance);

  // Сдвиг цели вправо по экрану уводит объект влево — под свободную зону.
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const shift = radius * MARGIN * PANEL_FRACTION * 0.9;
  const target = center.clone().addScaledVector(right, -shift);

  return {
    p: [position.x, position.y, position.z],
    t: [target.x, target.y, target.z],
    radius,
  };
}
