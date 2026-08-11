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
import { useShow } from '../store/useShow';

/**
 * Индикатор цепочки живёт только на этапах, где есть промысел. На глобусе и
 * карте страны показывать «где сейчас флюид» не о чем: самого флюида в кадре
 * ещё нет.
 */
const CYCLE_STAGES = new Set(['objectmap', 'reservoir', 'surface', 'well', 'production']);

export function App() {
  useKeyboard();
  const stageId = useShow((s) => s.stageId);
  const dive = useShow((s) => s.dive);

  return (
    <>
      <Stage />

      {/* Слой интерфейса поверх канваса. pointer-events включаются точечно. */}
      <div className="pointer-events-none fixed inset-0 z-10">
        <HeroOverlay />
        <PanelLayer />

        {/*
          В разборе модуля на экране остаётся только он.

          Панель управления сценой, титры этапа, карточка объекта и шкала
          прокрутки — всё это про линейный показ, а разбор из него вышел: зритель
          нажал на контур и смотрит конкретный модуль. Прежде они оставались на
          фоне и спорили с содержанием — панель сцены вообще стояла ровно под
          панелью раздела, титры сообщали про такт, к которому разбор отношения
          не имеет, а шкала показывала позицию в показе, из которого вышли.
        */}
        {!dive && (
          <>
            <SceneControls />
            <ObjectPanel />
            <StageCaption />
            {CYCLE_STAGES.has(stageId) && <CyclePanel />}
            <Progress />
          </>
        )}

        <DivePanel />
        <DebugHud />
      </div>

      <ScrollTrack />
    </>
  );
}
