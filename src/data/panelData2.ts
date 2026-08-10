/**
 * Данные компоновки для схемных панелей: сеть сбора INFRAPLAN, мнемосхема
 * актива, модель данных и карта объектов Nedra.DATA.
 *
 * Координаты здесь — это раскладка схемы, а не география. Топология объектов
 * взята с карты объектов сценария (`image4.png`) и из отчёта по обследованию:
 * нефтяной фонд → МФНС → СП «В-Молдабек» → напорный нефтепровод → ЦППН
 * «Кенбай»; скважина ППД → КНС; БРХ, ВЛ, ПС.
 */

// ── Nedra.INFRAPLAN: ветка нефтесбора из 5 КП (периметр пилота) ─────────────

interface NetNode {
  x: number;
  y: number;
  label?: string;
  hub?: boolean;
}

const kp = (i: number, x: number, y: number): NetNode => ({ x, y, label: `КП-${i}` });

export const SURFACE_NETWORK: {
  nodes: NetNode[];
  links: { from: number; to: number; p: number; trunk?: boolean }[];
} = {
  nodes: [
    kp(1, 40, 40),
    kp(2, 46, 96),
    kp(3, 62, 150),
    kp(4, 104, 188),
    kp(5, 160, 176),
    { x: 214, y: 132, label: 'МФНС', hub: true },
    { x: 286, y: 120, label: 'СП «В-Молдабек»', hub: true },
    { x: 372, y: 96, label: 'ЦППН', hub: true },
    // Одиночные устья, подключённые к кустам
    { x: 22, y: 22 },
    { x: 24, y: 66 },
    { x: 34, y: 122 },
    { x: 86, y: 206 },
    { x: 182, y: 198 },
  ],
  links: [
    { from: 0, to: 1, p: 7.2 },
    { from: 1, to: 2, p: 8.4 },
    { from: 2, to: 3, p: 10.1 },
    { from: 3, to: 4, p: 13.6 },
    { from: 4, to: 5, p: 17.4, trunk: true },
    { from: 5, to: 6, p: 19.2, trunk: true },
    { from: 6, to: 7, p: 20.6, trunk: true },
    { from: 8, to: 0, p: 6.4 },
    { from: 9, to: 1, p: 6.8 },
    { from: 10, to: 2, p: 7.1 },
    { from: 11, to: 3, p: 9.2 },
    { from: 12, to: 4, p: 12.8 },
  ],
};

// ── Мнемосхема актива ───────────────────────────────────────────────────────

export const MNEMO = {
  counters: [
    { label: 'Добыча нефти', plan: '5 160', fact: '4 400', unit: 'т/сут' },
    { label: 'Закачка воды', plan: '9 800', fact: '9 240', unit: 'м³/сут' },
    { label: 'Обводнённость', plan: '64,0', fact: '67,4', unit: '%' },
  ],
  nodes: [
    { id: 'fund1', x: 70, y: 60, label: 'Нефтяной фонд', value: '2 454 т/сут' },
    { id: 'fund2', x: 70, y: 150, label: 'Нефтяной фонд', value: '1 946 т/сут' },
    { id: 'ppd', x: 70, y: 268, label: 'Скважина ППД', value: '1 207 м³/ч' },
    { id: 'mfns', x: 250, y: 105, label: 'МФНС', value: '0,38 МПа' },
    { id: 'kns', x: 250, y: 268, label: 'КНС', value: '1,79 МПа' },
    { id: 'sp', x: 430, y: 105, label: 'СП «В-Молдабек»', value: '1,30 МПа' },
    { id: 'brh', x: 430, y: 196, label: 'БРХ', value: '530 л/сут', alarm: true },
    { id: 'napor', x: 610, y: 105, label: 'Напорный н/п', value: '8,99 атм' },
    { id: 'cppn', x: 790, y: 105, label: 'ЦППН «Кенбай»', value: '4 400 т/сут' },
    { id: 'rvs', x: 790, y: 196, label: 'РВС 4×5000', value: '78% заполн.' },
    { id: 'ps', x: 610, y: 300, label: 'ПС · ВЛ', value: '6,3 МВт' },
  ],
  links: [
    { from: 'fund1', to: 'mfns', kind: 'oil' as const, value: '2 454 т/сут' },
    { from: 'fund2', to: 'mfns', kind: 'oil' as const, value: '1 946 т/сут' },
    { from: 'mfns', to: 'sp', kind: 'oil' as const, value: '6 822 м³/сут' },
    { from: 'sp', to: 'napor', kind: 'oil' as const },
    { from: 'napor', to: 'cppn', kind: 'oil' as const, value: '431,95 т/сут' },
    { from: 'cppn', to: 'rvs', kind: 'oil' as const },
    { from: 'ppd', to: 'kns', kind: 'water' as const, value: '1 207 м³/ч' },
    { from: 'kns', to: 'brh', kind: 'water' as const },
    { from: 'brh', to: 'sp', kind: 'gas' as const },
    { from: 'ps', to: 'kns', kind: 'gas' as const },
    { from: 'ps', to: 'cppn', kind: 'gas' as const },
  ],
};

// ── Nedra.DATA: модель данных ───────────────────────────────────────────────

export const NDP_ENTITIES = [
  { name: 'Месторождения', x: 450, y: 40, attrs: 18, parents: [] as string[] },
  { name: 'Лицензионные участки', x: 180, y: 40, attrs: 12, parents: [] as string[] },
  { name: 'Пласты', x: 300, y: 130, attrs: 26, parents: ['Месторождения'] },
  { name: 'Скважины', x: 600, y: 130, attrs: 41, parents: ['Месторождения'] },
  { name: 'Флюиды', x: 120, y: 130, attrs: 15, parents: ['Месторождения'] },
  { name: 'Керн и ФЕС', x: 160, y: 225, attrs: 22, parents: ['Пласты'] },
  { name: 'ГИС', x: 330, y: 225, attrs: 19, parents: ['Скважины'] },
  { name: 'Траектории', x: 500, y: 225, attrs: 9, parents: ['Скважины'] },
  { name: 'Добыча и закачка', x: 670, y: 225, attrs: 31, parents: ['Скважины'] },
  { name: 'Объекты обустройства', x: 810, y: 130, attrs: 24, parents: ['Месторождения'] },
  { name: 'Трубопроводы', x: 820, y: 225, attrs: 17, parents: ['Объекты обустройства'] },
];

// ── Nedra.DATA: карта объектов ──────────────────────────────────────────────

export const NDP_MAP_WELLS = (() => {
  const out: { name: string; kind: string; x: number; y: number }[] = [];
  let n = 1;
  for (let i = 0; i < 34; i++) {
    const a = i * 2.399;
    const r = Math.sqrt(i / 34);
    const inj = i % 6 === 0;
    out.push({
      name: `${n++}${inj ? 'i' : 'p'}`,
      kind: inj ? 'нагнетательная' : 'добывающая',
      x: 230 + Math.cos(a) * 108 * r,
      y: 132 + Math.sin(a) * 66 * r,
    });
  }
  return out;
})();
