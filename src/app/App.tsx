import { Stage } from '../scene/Stage';
import { ScrollTrack } from './ScrollTrack';
import { HeroOverlay } from '../ui/HeroOverlay';
import { ObjectPanel } from '../ui/ObjectPanel';
import { SceneControls } from '../ui/SceneControls';
import { StageCaption } from '../ui/StageCaption';
import { Progress } from '../ui/Progress';
import { DebugHud } from '../ui/DebugHud';
import { PanelLayer } from '../ui/panels';
import { CyclePanel } from '../ui/CyclePanel';
import { DivePanel } from '../ui/DivePanel';
import { useKeyboard } from '../hooks/useKeyboard';
import { useUiScale } from '../hooks/useUiScale';
import { useShow } from '../store/useShow';

/**
 * Индикатор цепочки живёт только на этапах, где есть промысел. На глобусе и
 * карте страны показывать «где сейчас флюид» не о чем: самого флюида в кадре
 * ещё нет.
 */
const CYCLE_STAGES = new Set(['objectmap', 'reservoir', 'surface', 'well', 'production']);

export function App() {
  useKeyboard();
  useUiScale();
  const stageId = useShow((s) => s.stageId);
  const dive = useShow((s) => s.dive);
  const inCycle = useShow((s) => s.cycleShot !== null);

  /** Показ ведёт не прокрутка, а собственный режим — разбор или полный цикл. */
  const focusMode = dive !== null || inCycle;

  return (
    <>
      <Stage />

      {/*
        Слой интерфейса поверх канваса. pointer-events включаются точечно.

        Масштабируется целиком под размер экрана: показ идёт не на том мониторе,
        на котором собирали, и на экране зала пиксельная вёрстка осталась бы
        такой же по числу пикселей. Сцена при этом не масштабируется — она и так
        рисуется в разрешении окна.
      */}
      <div
        className="pointer-events-none fixed inset-0 z-10"
        style={{ zoom: 'var(--ui-scale, 1)' }}
      >
        <HeroOverlay />
        <PanelLayer />

        {/*
          ОБВЯЗКА ЛИНЕЙНОГО ПОКАЗА СНИМАЕТСЯ В ЛЮБОМ СОБСТВЕННОМ РЕЖИМЕ.

          Титры этапа, шкала прокрутки и карточка объекта относятся к
          последовательному показу. И разбор модуля, и полный цикл из него
          вышли: зритель нажал кнопку и смотрит своё. Оставленные на фоне, они
          не просто лишние — они физически налезают друг на друга. Титры стоят
          в левом нижнем углу шириной в двадцать шесть em, панель цикла идёт по
          низу во всю ширину, и на любом экране они пересекаются; карточка
          объекта занимает правый край до низа и упирается в неё же.

          Разводить их отступами бессмысленно: в каждом режиме свободно РАЗНОЕ
          место, и подобранный зазор ломается на первом же экране другого
          размера. Правильный ответ — показывать только то, что относится к
          текущему режиму.

          Панель управления сценой остаётся везде, кроме разбора: там она
          стоит ровно под панелью раздела, а в цикле не мешает и служит выходом
          из него.
        */}
        {!dive && <SceneControls />}

        {!focusMode && (
          <>
            <ObjectPanel />
            <StageCaption />
            <Progress />
          </>
        )}

        {!dive && CYCLE_STAGES.has(stageId) && <CyclePanel />}

        <DivePanel />
        <DebugHud />
      </div>

      <ScrollTrack />
    </>
  );
}
