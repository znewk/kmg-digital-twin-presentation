import { Stage } from '../scene/Stage';
import { ScrollTrack } from './ScrollTrack';
import { HeroOverlay } from '../ui/HeroOverlay';
import { ObjectPanel } from '../ui/ObjectPanel';
import { SceneControls } from '../ui/SceneControls';
import { StageCaption } from '../ui/StageCaption';
import { Progress } from '../ui/Progress';
import { DebugHud } from '../ui/DebugHud';
import { PanelLayer } from '../ui/panels';
import { useKeyboard } from '../hooks/useKeyboard';

export function App() {
  useKeyboard();

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
        <Progress />
        <DebugHud />
      </div>

      <ScrollTrack />
    </>
  );
}
