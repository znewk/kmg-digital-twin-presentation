import { useEffect } from 'react';
import { useShow } from '../store/useShow';

/**
 * Кликер-фолбэк (ТЗ §10): если на площадке подведёт трекпад или колесо мыши,
 * показ ведётся с пульта стрелками. Раскладка учитывается по `event.code`, а не
 * по `key`, — иначе на русской раскладке половина хоткеев отваливается, что в
 * прототипе приходилось латать перечислением букв «А», «Ф» и так далее.
 */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useShow.getState();

      switch (e.code) {
        case 'ArrowRight':
        case 'Space':
        case 'PageDown':
          e.preventDefault();
          s.step(1);
          return;

        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault();
          s.step(-1);
          return;

        case 'Escape':
          e.preventDefault();
          if (s.paused) s.togglePaused();
          else if (s.selected) s.select(null);
          else s.reset();
          return;

        // F — полный экран (работает и на русской раскладке: код клавиши тот же).
        case 'KeyF':
          e.preventDefault();
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen();
          return;

        // P — пауза таймлайна для детального разбора объектов.
        case 'KeyP':
          e.preventDefault();
          s.togglePaused();
          return;

        // N — раскладка именования модулей: гибрид → Nedra → ABAI.
        case 'KeyN':
          e.preventDefault();
          s.cycleNaming();
          return;

        // L — язык интерфейса.
        case 'KeyL':
          e.preventDefault();
          s.toggleLang();
          return;

        // D — служебный оверлей: FPS, тир качества, дыры в переводе.
        case 'KeyD':
          if (!e.ctrlKey) return;
          e.preventDefault();
          s.toggleDebug();
          return;

        default:
      }
    };

    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}
