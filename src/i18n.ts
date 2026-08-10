/**
 * Двуязычие KZ/RU без библиотеки: на объёме этой презентации словарь-объект
 * дешевле и предсказуемее, чем i18next, и не тянет лишний вес в офлайн-бандл.
 *
 * Правило: русский обязателен, казахский опционален. Пока перевода нет —
 * подставляется русский, а `isMissing` позволяет подсветить дыры в служебном
 * режиме, чтобы они не уехали на показ незамеченными.
 */

export type Lang = 'ru' | 'kk';

/** Строка контента. `kk` заполняется по мере поступления переводов. */
export interface T {
  ru: string;
  kk?: string;
}

export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: 'kk', label: 'Қазақша', short: 'KZ' },
  { id: 'ru', label: 'Русский', short: 'RU' },
];

export function t(value: T | string | undefined, lang: Lang): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (lang === 'kk' && value.kk) return value.kk;
  return value.ru;
}

export function isMissing(value: T | string | undefined, lang: Lang): boolean {
  if (lang !== 'kk') return false;
  if (value === undefined || typeof value === 'string') return false;
  return !value.kk;
}

/** Короткие строки интерфейса (не контент сценария). */
export const UI = {
  scrollHint: { ru: 'Прокрутите вниз', kk: 'Төмен айналдырыңыз' },
  pilot: { ru: 'Пилот · Молдабек Восточный · ЭМГ', kk: 'Пилот · Шығыс Молдабек · ЭМГ' },
  programme: { ru: 'Программа «Цифровой двойник»', kk: '«Цифрлық егіз» бағдарламасы' },
  customer: { ru: 'АО НК «КазМунайГаз»', kk: '«ҚазМұнайГаз» ҰК АҚ' },
  next: { ru: 'дальше', kk: 'әрі қарай' },
  back: { ru: 'назад', kk: 'артқа' },
  reset: { ru: 'сброс', kk: 'қалпына келтіру' },
  fullscreen: { ru: 'весь экран', kk: 'толық экран' },
  demoData: { ru: 'иллюстративные значения', kk: 'иллюстрациялық мәндер' },
  devContour: { ru: 'DEV-контур ABAI', kk: 'ABAI DEV-контуры' },
} satisfies Record<string, T>;
