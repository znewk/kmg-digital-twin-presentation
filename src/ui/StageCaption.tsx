import { FLAT_BEATS } from '../data/stages';
import { isMissing, t } from '../i18n';
import { useShow } from '../store/useShow';
import { ModuleBadge } from './ModuleBadge';
import { isFullPanel } from './panels/layout';

const TWIN_COLOR = {
  plast: 'var(--color-plast)',
  skv: 'var(--color-skv)',
  dob: 'var(--color-dob)',
} as const;

/**
 * Титры текущего такта. Тексты — из сценария демонстрации дословно, поэтому
 * блок работает и как суфлёр: спикер видит на экране ровно то, о чём говорит.
 *
 * Под полноэкранной схемой сворачивается в одну строку — развёрнутый блок туда
 * просто не помещается.
 */
export function StageCaption() {
  const beatIndex = useShow((s) => s.beatIndex);
  const lang = useShow((s) => s.lang);
  const debug = useShow((s) => s.debug);

  const beat = FLAT_BEATS[beatIndex];
  if (beat.stage.id === 'hero') return null;

  const accent = beat.stage.twin ? TWIN_COLOR[beat.stage.twin] : 'var(--color-plast)';
  const flag = (v: Parameters<typeof isMissing>[0]) =>
    debug && isMissing(v, lang) ? 'outline outline-1 outline-dashed outline-[var(--color-risk)]' : '';

  if (isFullPanel(beat.panel)) {
    return (
      <div className="pointer-events-auto absolute inset-x-16 bottom-12">
        <div className="panel flex items-baseline gap-4 px-6 py-3">
          <span className="kicker shrink-0" style={{ color: accent }}>
            {t(beat.stage.chapter, lang)}
          </span>
          <span className={`font-[family-name:var(--font-display)] text-[1.15rem] font-semibold ${flag(beat.stage.title)}`}>
            {t(beat.stage.title, lang)}
          </span>
          <span className={`min-w-0 flex-1 truncate text-[0.8rem] text-[var(--color-txt-dim)] ${flag(beat.title)}`}>
            {t(beat.title, lang)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-14 left-10 max-w-[34rem]">
      <div className="panel px-6 py-5">
        <div className="kicker" style={{ color: accent }}>
          {t(beat.stage.chapter, lang)}
          {beat.stage.scenarioBlock !== null && (
            <span className="ml-3 text-[var(--color-txt-faint)]">
              блок {beat.stage.scenarioBlock}
            </span>
          )}
        </div>

        <h2
          className={`mt-2 font-[family-name:var(--font-display)] text-[1.6rem] leading-tight font-semibold ${flag(beat.stage.title)}`}
        >
          {t(beat.stage.title, lang)}
        </h2>

        <p className={`mt-3 text-[0.92rem] leading-snug text-[var(--color-txt)] ${flag(beat.title)}`}>
          {t(beat.title, lang)}
        </p>

        {beat.body && (
          <p
            className={`mt-2 text-[0.82rem] leading-relaxed text-[var(--color-txt-dim)] ${flag(beat.body)}`}
          >
            {t(beat.body, lang)}
          </p>
        )}

        {beat.modules && beat.modules.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {beat.modules.map((id) => (
              <ModuleBadge key={id} id={id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
