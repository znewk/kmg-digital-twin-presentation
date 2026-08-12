import type { PanelId } from '../../data/stages';

/**
 * Какие панели занимают весь кадр, а какие живут сбоку от 3D.
 *
 * От этого зависит компоновка титров: рядом с боковой панелью помещается
 * развёрнутый блок слева, а под полноэкранной схемой — только компактная
 * строка, иначе они наезжают друг на друга.
 */
const FULL: PanelId[] = [
  // Панель первого этапа занимает нижнюю половину кадра, но по компоновке
  // титров ведёт себя как полноэкранная: развёрнутый блок слева под ней не
  // помещается, и титры должны свернуться в строку.
  'intro',
  'architecture',
  'upstream-chain',
  'it-patchwork',
  'field-map-2d',
  'mnemoscheme',
  'ndp-model',
  'ndp-map',
  'asset-twin',
  'effects',
];

export function isFullPanel(panel?: PanelId): boolean {
  return panel !== undefined && FULL.includes(panel);
}
