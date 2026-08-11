import type { ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useShow } from '../../store/useShow';

/**
 * Обёртка кликабельного объекта сцены (ТЗ §8.3).
 *
 * Клик выбирает объект, камера прицельно уходит к нему, справа поднимается
 * info-панель. Повторный клик по тому же объекту снимает выделение.
 *
 * `stopPropagation` обязателен: объекты вложены в группы, и без него один клик
 * доходил бы до нескольких обработчиков сразу, а выигрывал бы случайный.
 */
export function Interactive({ id, children }: { id: string; children: ReactNode }) {
  const select = useShow((s) => s.select);
  const hover = useShow((s) => s.hover);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const { selected } = useShow.getState();
    select(selected === id ? null : id);
  };

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hover(id);
    document.body.style.cursor = 'pointer';
  };

  const onPointerOut = () => {
    hover(null);
    document.body.style.cursor = '';
  };

  return (
    <group userData={{ id }} onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      {children}
    </group>
  );
}
