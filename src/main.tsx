import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles.css';

// Скролл ведёт таймлайн — восстановление позиции браузером сломало бы первый кадр.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// Доступ к стору в разработке: позволяет проверять наведение камеры на
// конкретный объект без попадания мышью в трёхметровую качалку на общем плане.
if (import.meta.env.DEV) {
  void import('./store/useShow').then((m) => {
    (globalThis as unknown as { __show: unknown }).__show = m.useShow;
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
