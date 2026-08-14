import { useRef } from 'react';
import { useShow } from '../store/useShow';
import { usePanelReserve } from './panelReserve';

/**
 * ПОДПИСЬ К ПРОМЫСЛУ, КОГДА НА НЕГО СМОТРЯТ ВБЛИЗИ.
 *
 * Осмотр значка снимает с экрана плашку целевого образа: она занимает нижнюю
 * половину кадра, а показывать в этот момент нужно ровно то, что под ней. Но
 * оставить кадр совсем без подписи нельзя — зритель видит модель промысла и не
 * знает, чью. Отсюда узкая полоса: что за объект, чем он значим и куда отсюда
 * идти.
 *
 * Два выхода, и оба явные. Назад — к карте области, откуда пришли; вперёд — на
 * сам промысел, в трёхмерную сцену. Осмотр значка для того и появился, чтобы
 * между картой и сценой была ступень, а не прыжок.
 *
 * Полоса СООБЩАЕТ свою высоту камере (`usePanelReserve`): от неё зависит и
 * подъём кадра, и то, на какую дистанцию камера отходит от промысла. Иначе
 * нижний край модели уходил бы под полосу.
 */
export function TokenCloseup() {
  const box = useRef<HTMLDivElement>(null);
  usePanelReserve(box);

  const setTokenView = useShow((s) => s.setTokenView);
  const enterExplore = useShow((s) => s.enterExplore);

  return (
    <div
      ref={box}
      className="plate-in panel pointer-events-auto absolute inset-x-8 bottom-8 flex items-center gap-5 px-5 py-3"
    >
      <div className="min-w-0">
        <div className="kicker">Пилотный актив программы</div>
        <div className="mt-0.5 text-[0.95rem] leading-tight font-semibold">
          Молдабек Восточный · Кызылкогинский район Атырауской области
        </div>
        <div className="mt-1 text-[0.66rem] leading-snug text-[var(--color-txt-dim)]">
          Схема промысла в масштабе значка: разбросанный фонд качалок, выкидные линии
          на замерную установку, сборный пункт с факелом, насосная поддержания
          пластового давления.
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setTokenView(false)}
          className="rounded border border-[var(--color-line)] px-3 py-1 font-mono text-[9.5px] tracking-[0.12em] uppercase transition-colors hover:border-[var(--color-accent)]"
        >
          ← К карте области
        </button>
        <button
          type="button"
          onClick={enterExplore}
          className="rounded border px-3 py-1 font-mono text-[9.5px] tracking-[0.12em] uppercase transition-colors hover:brightness-125"
          style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
        >
          Перейти к ЦД Молдабек Восточный
        </button>
      </div>
    </div>
  );
}
