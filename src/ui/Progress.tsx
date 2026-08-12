import { FLAT_BEATS, STAGES, TOTAL_BEATS } from '../data/stages';
import { useShow } from '../store/useShow';

/**
 * Прогресс показа: по клетке на такт, разрывы между этапами. Спикер видит,
 * сколько осталось, — на девятнадцатиминутном показе это важнее эстетики.
 */
export function Progress() {
  const beatIndex = useShow((s) => s.beatIndex);

  let cursor = 0;
  return (
    <div className="absolute top-8 left-1/2 flex -translate-x-1/2 items-center gap-2">
      {STAGES.map((stage, si) => {
        const cells = stage.beats.map(() => cursor++);
        return (
          <div key={stage.id} className="flex gap-[3px]" title={stage.title.ru}>
            {cells.map((c) => (
              <span
                key={c}
                className="h-[3px] w-7 transition-colors duration-300"
                style={{
                  background:
                    c <= beatIndex
                      ? si === FLAT_BEATS[beatIndex].stageIndex
                        ? 'var(--color-plast)'
                        : 'oklch(72% 0.05 250 / 0.55)'
                      : 'oklch(72% 0.05 250 / 0.16)',
                }}
              />
            ))}
          </div>
        );
      })}
      <span className="kicker ml-2 text-[var(--color-txt-faint)]">
        {String(beatIndex + 1).padStart(2, '0')} / {TOTAL_BEATS}
      </span>
    </div>
  );
}
