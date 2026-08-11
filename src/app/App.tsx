import { Stage } from '../scene/Stage';
import { ScrollTrack } from './ScrollTrack';
import { HeroOverlay } from '../ui/HeroOverlay';
import { ObjectPanel } from '../ui/ObjectPanel';
import { SceneControls } from '../ui/SceneControls';
import { StageCaption } from '../ui/StageCaption';
import { Progress } from '../ui/Progress';
import { DebugHud } from '../ui/DebugHud';
import { PanelLayer } from '../ui/panels';
import { CycleTrack } from '../ui/CycleTrack';
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

  return (
    <>
      <Stage />

      {/* Слой интерфейса поверх канваса. pointer-events включаются точечно. */}
      <div className="pointer-events-none fixed inset-0 z-10">
        <HeroOverlay />
        <PanelLayer />
        <SceneControls />
        <ObjectPanel />
        <StageCaption />
        {CYCLE_STAGES.has(stageId) && <CycleTrack />}
        <Progress />
        <DebugHud />
      </div>

      <ScrollTrack />
    </>
  );
}
