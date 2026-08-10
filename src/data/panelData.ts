/**
 * Числа для 2D-панелей.
 *
 * Правило: у каждого набора явно указано происхождение. Где референсные
 * скриншоты сценария дали реальные значения — взяты они; где нет —
 * иллюстративные, и панель это подписывает. Подмена на данные DEV-контура ABAI
 * позже будет правкой этого файла, а не интерфейса (открытый вопрос ТЗ §12).
 */

export type Tone = 'plain' | 'ok' | 'warn' | 'risk';

// ── Nedra.NUMEX ─────────────────────────────────────────────────────────────
// Источник: скриншот NUMEX 3.0 из сценария — параметры демо-проекта.
export const NUMEX_RESERVOIR: { label: string; value: string; unit?: string }[] = [
  { label: 'Начальное пластовое давление', value: '250', unit: 'бар' },
  { label: 'Давление насыщения PBUB', value: '100', unit: 'бар' },
  { label: 'Эффективная толщина', value: '3', unit: 'м' },
  { label: 'Проницаемость', value: '2', unit: 'мД' },
  { label: 'Пористость', value: '0,16', unit: '' },
  { label: 'Нач. нефтенасыщенность', value: '0,13', unit: '' },
  { label: 'Отношение Kx/Kz', value: '10', unit: '' },
  { label: 'Сжимаемость породы', value: '1·10⁻⁴', unit: '1/бар' },
];

// ── Nedra.NUMEX Optimize ────────────────────────────────────────────────────
// Форма кривой воспроизводит реальный скриншот «Ход оптимизации»: ступенчатый
// рост целевой функции с плато между улучшениями, ~1600 расчётов.
export const OPTIMIZE_RUN: [number, number][] = (() => {
  const pts: [number, number][] = [];
  let level = 1.43;
  for (let i = 0; i < 1600; i++) {
    if (i % 180 === 0 && i > 0) level += 0.008 + Math.random() * 0.006;
    const jitter = (Math.random() - 0.5) * 0.006;
    pts.push([i, level + jitter + Math.min(0.02, i / 1600) * 0.4]);
  }
  return pts;
})();

// ── Nedra.DIGITAL TWIN · Трубопроводы ───────────────────────────────────────
// Источник: скриншот Digital Twin Pipe из сценария — значения реальные.
export const PIPE = {
  section: 'УЗ 25/1 — уз. 19А.1',
  length: 2699,
  metrics: [
    { label: 'Критических дефектов', value: '6', tone: 'risk' as Tone },
    { label: 'Остаточный ресурс, лет', value: '0,2', tone: 'risk' as Tone },
    { label: 'Мин. толщина стенки', value: '5,51', unit: 'мм', tone: 'warn' as Tone },
    { label: 'Скорость коррозии', value: '0,09', unit: 'мм/год', tone: 'ok' as Tone },
    { label: 'Рабочее давление', value: '8,99', unit: 'атм', tone: 'plain' as Tone },
    { label: 'Расход нефти', value: '431,95', unit: 'т/сут', tone: 'plain' as Tone },
    { label: 'Обводнённость', value: '67,36', unit: '%', tone: 'plain' as Tone },
  ],
  defects: (() => {
    const out: { kind: string; risk: string; depth: number; angle: number; at: number }[] = [];
    for (let i = 0; i < 420; i++) {
      out.push({
        kind: 'Утонение',
        risk: 'низкая',
        depth: 1.03 + Math.random() * 0.14,
        angle: 120 + Math.sin(i * 0.4) * 60 + Math.random() * 70,
        at: (i / 420) * 2699,
      });
    }
    // Шесть критических — ровно столько, сколько на референсном экране.
    for (const at of [412, 1297, 1521, 1874, 2143, 2488]) {
      out.push({ kind: 'Утонение', risk: 'высокая', depth: 2.08, angle: 157.8, at });
    }
    return out;
  })(),
};

// ── Nedra.DIGITAL TWIN · Потенциалы ─────────────────────────────────────────
// Иллюстративные значения; структура — из дашборда потенциалов в сценарии.
export const POTENTIAL = {
  operational: -4.5,
  technological: -10.6,
  deviations: [
    { label: 'Отказ ГНО', value: -38 },
    { label: 'Ожидание ТКРС', value: -27 },
    { label: 'Ограничение системы сбора', value: -19, color: 'var(--color-warn)' },
    { label: 'Нехватка химии в точках подачи', value: -12, color: 'var(--color-warn)' },
    { label: 'Отключение электроэнергии', value: -9, color: 'var(--color-warn)' },
    { label: 'Вывод на режим после ГТМ', value: 14, color: 'var(--color-ok)' },
  ],
};

// ── Nedra.RTM ───────────────────────────────────────────────────────────────
// Иллюстративные значения, порядок величин — из референсного экрана RTM.
export const RTM_PARAMS: { label: string; value: string; unit?: string; tone?: Tone }[] = [
  { label: 'Глубина забоя', value: '3 761', unit: 'м' },
  { label: 'Глубина долота', value: '3 790', unit: 'м' },
  { label: 'Давление на входе', value: '162,1', unit: 'атм' },
  { label: 'Вес на крюке', value: '110,5', unit: 'т', tone: 'warn' },
  { label: 'Мех. скорость', value: '19,2', unit: 'м/ч' },
  { label: 'Расход', value: '0,57', unit: 'м³/с' },
];

// ── Nedra.WWO ───────────────────────────────────────────────────────────────
// Иллюстративный график; периметр пилота — 3 бригады ПРС с ДЭЛ (отчёт, стр. 92).
const C_PREP = '#8fbaf0';
const C_WORK = '#f0ae4a';
const C_TEST = '#35d0c2';

export const WWO_ROWS = [
  {
    label: 'Бригада ПРС-1',
    bars: [
      { from: 0.02, to: 0.16, kind: 'подготовка', color: C_PREP },
      { from: 0.16, to: 0.48, kind: 'смена ГНО', color: C_WORK },
      { from: 0.48, to: 0.6, kind: 'освоение', color: C_TEST },
    ],
  },
  {
    label: 'Бригада ПРС-2',
    bars: [
      { from: 0.1, to: 0.2, kind: 'подготовка', color: C_PREP },
      { from: 0.2, to: 0.58, kind: 'ремонт НКТ', color: C_WORK },
      { from: 0.58, to: 0.72, kind: 'ВНР', color: C_TEST },
    ],
  },
  {
    label: 'Бригада ПРС-3',
    bars: [
      { from: 0.26, to: 0.36, kind: 'подготовка', color: C_PREP },
      { from: 0.36, to: 0.82, kind: 'ГРП', color: C_WORK },
      { from: 0.82, to: 0.96, kind: 'освоение', color: C_TEST },
    ],
  },
];

// ── Nedra.DATA ──────────────────────────────────────────────────────────────
// Состав повторяет реестр источников с референсного экрана NDP.
export const NDP_SOURCES = [
  { name: 'ABAI · База данных', description: 'Режимы фонда, факт добычи и закачки', marts: 4, files: 0 },
  { name: 'Trajectories', description: 'Траектории скважин', marts: 1, files: 13 },
  { name: 'LAS', description: 'Геофизические исследования скважин', marts: 4, files: 28 },
  { name: 'Production', description: 'Показатели добычи по фонду', marts: 1, files: 2 },
  { name: 'Core_FES', description: 'Фильтрационно-ёмкостные свойства керна', marts: 1, files: 2 },
  { name: 'Geological_maps', description: 'Карты толщин, пористости, проницаемости', marts: 1, files: 8 },
  { name: 'Geological_images', description: 'Карты, изолинии и разрезы', marts: 1, files: 5 },
  { name: 'Velocities', description: 'Скоростные характеристики по скважинам', marts: 1, files: 13 },
  { name: 'SCADA / АСУ ТП', description: 'Телеметрия площадных объектов', marts: 2, files: 0 },
];
