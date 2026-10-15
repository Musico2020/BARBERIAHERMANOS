import { useEffect, useRef } from 'react';

/**
 * Ejecuta `load` al montar, cada `intervalMs` y cada vez que la pestaña vuelve a estar visible.
 * Así las citas nuevas aparecen en el panel sin tener que recargar la página.
 * Con `whenHidden` también se actualiza con la pestaña en segundo plano (para las notificaciones).
 */
export function useAutoRefresh(load: () => void, deps: unknown[], intervalMs = 30_000, { whenHidden = false } = {}) {
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    loadRef.current();
    const timer = window.setInterval(() => {
      if (whenHidden || document.visibilityState === 'visible') loadRef.current();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, intervalMs, whenHidden]);
}
