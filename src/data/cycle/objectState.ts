import type { ModuleId } from '../modules';
import {
  toSceneX,
  toSceneZ,
  type FacilityRecord,
  type FieldDataset,
  type WellRecord,
} from '../geo/fieldData';
import { FACILITY_KIND, WELL_CATEGORY, WELL_STATUS } from '../geo/fieldStyle';
import { resolveHorizon } from '../geo/stratigraphy';
import { wellMetrics } from '../geo/wellMetrics';

/**
 * Статусная модель объекта (ТЗ §4.4.4).
 *
 * Структура задана в ТЗ буквально: показатели, чего хватает, чего не хватает,
 * риск, прогноз и управляющие модули. Здесь она наполняется из датасета.
 *
 * ГЛАВНОЕ ПРАВИЛО. Каждое поле обязано знать, откуда оно взялось. Реестр фонда
 * и чертёж дают номер, категорию, состояние, горизонт, координаты, состав
 * оборудования — это факт. Дебит, обводнённость, давление, остаточный ресурс,
 * вероятность отказа — этого в переданных данных нет ни в каком виде, и они
 * иллюстративны. Признак `illustrative` стоит на самом поле, а не подписью
 * внизу карточки: подпись можно не заметить, а поле без пометки отрисовать
 * нельзя — оно её несёт.
 */

export type ObjectHealth = 'ok' | 'warning' | 'critical';

export interface StateParam {
  label: string;
  value: string;
  unit?: string;
  /** Норма или технологический режим, если он известен. */
  norm?: string;
  trend?: 'up' | 'down' | 'flat';
  illustrative?: boolean;
}

export interface StateRisk {
  level: ObjectHealth;
  what: string;
  probability?: string;
  horizon?: string;
  illustrative?: boolean;
}

export interface StateForecast {
  metric: string;
  value: string;
  confidence?: string;
  /** Какой модуль это считает — требование §4.4.4. */
  source: ModuleId;
  illustrative?: boolean;
}

export interface ModuleRef {
  id: ModuleId;
  role?: string;
}

export interface ObjectState {
  id: string;
  name: string;
  kind: string;
  /** Откуда взяты фактические поля. */
  origin: string;
  health: ObjectHealth;
  params: StateParam[];
  sufficient: string[];
  deficit: string[];
  risk?: StateRisk;
  forecast?: StateForecast;
  modules: ModuleRef[];
}

// ── Скважина ────────────────────────────────────────────────────────────────

const WELL_MODULES: Record<WellRecord['cat'], ModuleRef[]> = {
  oil: [
    { id: 'abaiTr', role: 'Технологический режим' },
    { id: 'abaiPgno', role: 'Подбор ГНО' },
    { id: 'digitalTwin', role: 'Потенциал добычи' },
    { id: 'abaiPaegtm', role: 'Подбор ГТМ' },
  ],
  inj: [
    { id: 'abaiUz', role: 'Управление заводнением' },
    { id: 'numexOptimize', role: 'Оптимизация закачки' },
    { id: 'digitalTwin', role: 'КНС и ППД' },
  ],
  obs: [{ id: 'abaiDb', role: 'База данных' }, { id: 'abaiPaegtm' }],
  water: [{ id: 'abaiDb', role: 'База данных' }, { id: 'infraplan', role: 'Водоснабжение' }],
};

function wellState(w: WellRecord): ObjectState {
  const cat = WELL_CATEGORY[w.cat];
  const st = WELL_STATUS[w.st];
  const horizon = resolveHorizon(w.hor);
  const working = st.working;

  const params: StateParam[] = [
    { label: 'Категория', value: cat.label },
    { label: 'Состояние', value: st.label },
    { label: 'Тип ствола', value: w.type === 'horiz' ? 'Горизонтальная' : 'Вертикальная' },
    { label: 'Продуктивный горизонт', value: w.hor ?? 'не указан' },
  ];

  if (horizon) {
    params.push({
      label: 'Отметка вскрытия',
      value: `${horizon.topAbs.toFixed(0)} … ${horizon.botAbs.toFixed(0)}`,
      unit: 'м абс.',
    });
  }

  for (const m of wellMetrics(w)) {
    params.push({ label: m.label, value: m.value, unit: m.unit, illustrative: true });
  }

  const sufficient: string[] = [];
  const deficit: string[] = [];

  if (working) {
    sufficient.push('Скважина в действующем фонде');
    sufficient.push('Горизонт вскрыт, интервал перфорации в работе');
  } else {
    deficit.push(`Скважина не даёт продукции: ${st.label.toLowerCase()}`);
  }

  if (!w.hor) deficit.push('Продуктивный горизонт в реестре не указан');
  // Эксплуатационных данных нет ни по одной скважине — это дефицит не
  // промысла, а нашей модели, и говорить о нём надо прямо.
  deficit.push('Замеры дебита и обводнённости — вне переданного реестра');

  return {
    id: `well:${w.uwi}`,
    name: w.uwi,
    kind: `Скважина · ${cat.label.toLowerCase()}`,
    origin: 'Реестр фонда Управления разработкой КМГ',
    health: working ? 'ok' : w.st === 'liquidated' ? 'critical' : 'warning',
    params,
    sufficient,
    deficit,
    risk: working
      ? undefined
      : {
          level: w.st === 'liquidated' ? 'critical' : 'warning',
          what:
            w.st === 'liquidated'
              ? 'Скважина ликвидирована, возврат в фонд невозможен'
              : 'Простой: потери добычи относительно потенциала',
        },
    forecast: working
      ? {
          metric: 'Межремонтный период',
          value: '— требуется история отказов',
          source: 'digitalTwin',
          illustrative: true,
        }
      : undefined,
    modules: WELL_MODULES[w.cat],
  };
}

// ── Промысловый объект ──────────────────────────────────────────────────────

const FACILITY_MODULES: Record<string, ModuleRef[]> = {
  gzu: [
    { id: 'abaiPdim', role: 'Дебиты и план добычи' },
    { id: 'abaiTr', role: 'Технологический режим' },
    { id: 'infraplan', role: 'Гидравлика сети сбора' },
  ],
  kns: [
    { id: 'digitalTwin', role: 'КНС и ППД' },
    { id: 'abaiUz', role: 'Управление заводнением' },
    { id: 'infraplan', role: 'Гидравлика ППД' },
  ],
  sp: [
    { id: 'digitalTwin', role: 'Подготовка' },
    { id: 'digitalTwinPipe', role: 'Трубопроводы' },
    { id: 'infraplan', role: 'Гидравлика' },
  ],
  ktp: [{ id: 'infraplan', role: 'Энергетика' }],
};

/** Что объект делает в цепочке — первая строка карточки. */
const FACILITY_ROLE: Record<string, string> = {
  gzu: 'Поочерёдный замер продукции скважин куста и сбор в общий коллектор',
  kns: 'Подъём давления воды до нагнетательного и распределение по водоводам',
  sp: 'Разделение продукции на нефть, воду и попутный газ',
  ktp: 'Понижение напряжения с 10 кВ до 0,4 кВ для приводов куста',
};

/** Сколько скважин тяготеет к объекту — считается по фактическим координатам. */
function wellsNear(data: FieldDataset, f: FacilityRecord, radius: number): number {
  let n = 0;
  const r2 = radius * radius;
  for (const w of data.wells) {
    const dx = w.p[0] - f.p[0];
    const dy = w.p[1] - f.p[1];
    if (dx * dx + dy * dy <= r2) n++;
  }
  return n;
}

function facilityState(data: FieldDataset, f: FacilityRecord): ObjectState {
  const style = FACILITY_KIND[f.kind];
  const params: StateParam[] = [
    { label: 'Тип объекта', value: style.full },
    { label: 'Роль в цепочке', value: FACILITY_ROLE[f.kind] ?? '—' },
    { label: 'Обозначение на плане', value: f.name },
  ];

  const sufficient: string[] = ['Объект присутствует в исполнительной съёмке 2023 г.'];
  const deficit: string[] = [];

  if (f.kind === 'gzu') {
    const near = wellsNear(data, f, 400);
    params.push({ label: 'Скважин в радиусе 400 м', value: String(near) });
    sufficient.push('Замерная линия и общий коллектор в работе');
    deficit.push('Показания счётчиков и график замеров — вне переданных данных');
  }

  if (f.kind === 'kns') {
    params.push({ label: 'Нагнетательный фонд промысла', value: '210', unit: 'скв.' });
    sufficient.push('Насосная группа с резервом');
    deficit.push('Давление на выкиде и приёмистость по кустам — вне переданных данных');
  }

  if (f.kind === 'sp') {
    params.push({ label: 'Ступеней сепарации', value: '3' });
    sufficient.push('Разделение на нефть, воду и газ; выход на напорный нефтепровод');
    deficit.push('Товарные показатели и обводнённость на выходе — вне переданных данных');
  }

  if (f.kind === 'ktp') {
    deficit.push('Загрузка трансформатора — вне переданных данных');
  }

  return {
    id: `fac:${f.name}`,
    name: f.name,
    kind: style.full,
    origin: 'Текстовый слой исполнительного чертежа · подпись фактическая',
    health: 'ok',
    params,
    sufficient,
    deficit,
    forecast:
      f.kind === 'sp'
        ? {
            metric: 'Остаточный ресурс напорного нефтепровода',
            value: '— требуется история диагностики',
            source: 'digitalTwinPipe',
            illustrative: true,
          }
        : undefined,
    modules: FACILITY_MODULES[f.kind] ?? [],
  };
}

// ── Разрешение по идентификатору ────────────────────────────────────────────

/**
 * Идентификаторы те же, что и на плоской схеме: `well:VMB_0001`, `fac:ГЗУ-25`.
 * Один словарь на 2D и 3D — иначе клик по одному и тому же объекту открывал бы
 * разные карточки в зависимости от того, где по нему кликнули.
 */
export function resolveObjectState(id: string, data: FieldDataset): ObjectState | null {
  if (id.startsWith('well:')) {
    const uwi = id.slice(5);
    const well = data.wells.find((w) => w.uwi === uwi);
    return well ? wellState(well) : null;
  }

  if (id.startsWith('fac:')) {
    const name = id.slice(4);
    const f = data.facilities.find((x) => x.name === name);
    return f ? facilityState(data, f) : null;
  }

  if (id === 'flare') {
    return {
      id,
      name: 'Факельная установка',
      kind: 'Утилизация попутного газа',
      origin: 'Точка из чертежа · фактическое положение',
      health: 'warning',
      params: [
        { label: 'Положение', value: 'рядом с СП «Молдабек»' },
        { label: 'Газопровод промысла', value: '40', unit: 'трасс' },
      ],
      sufficient: ['Сброс газа со сборного пункта обеспечен'],
      deficit: [
        'Объём сжигаемого газа — вне переданных данных',
        'Полезная утилизация газа на промысле не показана: данных о ней нет',
      ],
      risk: {
        level: 'warning',
        what: 'Сжигание попутного газа вместо утилизации',
        illustrative: true,
      },
      modules: [{ id: 'infraplan', role: 'Энергетика' }, { id: 'digitalTwin', role: 'Подготовка' }],
    };
  }

  return null;
}

/** Экранные координаты объекта — нужны наведению камеры (§8.3). */
export function objectAnchor(
  id: string,
  data: FieldDataset,
): { x: number; z: number } | null {
  if (id.startsWith('well:')) {
    const w = data.wells.find((x) => `well:${x.uwi}` === id);
    return w ? { x: toSceneX(w.p[0]), z: toSceneZ(w.p[1]) } : null;
  }
  if (id.startsWith('fac:')) {
    const f = data.facilities.find((x) => `fac:${x.name}` === id);
    return f ? { x: toSceneX(f.p[0]), z: toSceneZ(f.p[1]) } : null;
  }
  if (id === 'flare') {
    const p = data.points.flare[0];
    return p ? { x: toSceneX(p[0]), z: toSceneZ(p[1]) } : null;
  }
  return null;
}
