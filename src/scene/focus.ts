import * as THREE from 'three';
import { OBJECT_BY_ID, type FieldObject } from '../data/fieldObjects';
import { surfY } from './field/geology';
import { EQUIPMENT_SCALE } from './field/kit/scale';
import { getFieldData, type FieldDataset } from '../data/geo/fieldData';
import { objectAnchor } from '../data/cycle/objectState';
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

/**
 * Габаритный радиус объектов промысла, м — в натуральную величину, без учёта
 * коэффициента укрупнения: он применяется отдельно, общим множителем.
 *
 * Взято по фактическому размеру модели, а не по её «важности»: камера должна
 * встать так, чтобы объект занял кадр, а не так, чтобы он был красив.
 */
const REAL_RADIUS: Record<string, number> = {
  well: 9,
  gzu: 11,
  kns: 20,
  sp: 26,
  ktp: 5,
  flare: 22,
};

/** Радиус по типу объекта из датасета. */
function radiusForDataObject(id: string, data: FieldDataset): number | null {
  if (id.startsWith('well:')) return REAL_RADIUS.well;
  if (id === 'flare') return REAL_RADIUS.flare;
  if (id.startsWith('fac:')) {
    const name = id.slice(4);
    const f = data.facilities.find((x) => x.name === name);
    return f ? (REAL_RADIUS[f.kind] ?? 12) : null;
  }
  return null;
}

/**
 * Кадр под объект, взятый из датасета: скважину, ГЗУ, КНС, сборный пункт,
 * КТП или факел.
 *
 * Прежде наведение знало только выдуманный реестр объектов, и клик по
 * настоящей скважине открывал карточку, но камера оставалась на месте — а
 * §8.3 требует ровно обратного: зритель должен увидеть сам объект крупно, а
 * панель лишь дополняет вид.
 */
function dataObjectFrame(id: string, fovDeg: number, aspect: number): FocusFrame | null {
  const data = getFieldData();
  if (!data) return null;

  const anchor = objectAnchor(id, data);
  const real = radiusForDataObject(id, data);
  if (!anchor || real === null) return null;

  const radius = real * EQUIPMENT_SCALE;
  // Цель — на половине высоты объекта над землёй: смотреть в подошву качалки
  // значит показать зрителю фундамент вместо машины.
  const center = new THREE.Vector3(
    anchor.x,
    surfY(anchor.x, anchor.z) + radius * 0.55,
    anchor.z,
  );

  return frameAround(center, radius, DEFAULT_AZIMUTH, fovDeg, aspect);
}

export interface FrameOptions {
  /** Запас вокруг объекта. Меньше — крупнее план. */
  margin?: number;
  /** Угол возвышения, рад. Пологий — для машин, крутой — для планов сверху. */
  elevation?: number;
  /** Уводить ли объект из-под правой панели. */
  offsetForPanel?: boolean;
  /**
   * Ручной сдвиг объекта по экрану в долях кадра: больше нуля — влево.
   *
   * Нужен там, где панели стоят с обеих сторон и свободное место не по центру
   * экрана. Штатный сдвиг `offsetForPanel` знает только про правую панель и в
   * такой раскладке загоняет объект под левую.
   */
  shift?: number;
}

/** Общий расчёт положения камеры вокруг точки — один на оба реестра. */
export function frameAround(
  center: THREE.Vector3,
  radius: number,
  azimuth: number,
  fovDeg: number,
  aspect: number,
  opts: FrameOptions = {},
): FocusFrame {
  const margin = opts.margin ?? MARGIN;
  const elevation = opts.elevation ?? ELEVATION;
  const panel = opts.offsetForPanel === false ? 0 : PANEL_FRACTION;

  // Дистанция из габарита и угла обзора. Панель съедает часть кадра по
  // ширине, поэтому эффективный горизонтальный угол меньше — учитываем это,
  // иначе объект «вылезает» из свободной зоны.
  const vFov = (fovDeg * Math.PI) / 180;
  const usableAspect = aspect * (1 - panel);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * usableAspect);
  const limiting = Math.min(vFov, hFov);
  const distance = (radius * margin) / Math.tan(limiting / 2);

  const dir = new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  );
  const position = center.clone().addScaledVector(dir, distance);

  // Сдвиг цели вправо по экрану уводит объект влево — под свободную зону.
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const shift = radius * margin * (panel * 0.9 + (opts.shift ?? 0) * 2);
  const target = center.clone().addScaledVector(right, -shift);

  return {
    p: [position.x, position.y, position.z],
    t: [target.x, target.y, target.z],
    radius,
  };
}

export function focusFrameFor(
  id: string,
  fovDeg: number,
  aspect: number,
): FocusFrame | null {
  // Сначала объекты из датасета: их подавляющее большинство, и именно по ним
  // кликает зритель.
  const fromData = dataObjectFrame(id, fovDeg, aspect);
  if (fromData) return fromData;

  const obj: FieldObject | undefined = OBJECT_BY_ID.get(id);
  if (!obj) return null;

  // Габарит наведения растёт вместе с оборудованием: иначе при укрупнении
  // установок камера подходила бы к ним вплотную и объект не помещался в кадр.
  // Толщи недр не масштабируются — коэффициент относится только к железу.
  const isGeology = id.startsWith('g-') || id.startsWith('h-') || id.startsWith('res-');
  const radius = (FOCUS_RADIUS[id] ?? 50) * (isGeology ? 1 : EQUIPMENT_SCALE);

  // Центр объекта. У наземных — рельеф плюс половина видимой высоты; у недр
  // отметка задана явно, они не «стоят на земле».
  const center =
    obj.centerY !== undefined
      ? new THREE.Vector3(obj.x, obj.centerY, obj.z)
      : new THREE.Vector3(obj.x, surfY(obj.x, obj.z) + obj.anchorY * 0.5, obj.z);

  return frameAround(center, radius, VIEW_AZIMUTH[id] ?? DEFAULT_AZIMUTH, fovDeg, aspect);
}
