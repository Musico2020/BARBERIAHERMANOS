// Tema claro u oscuro, elegido con el botón sol/luna. Se recuerda en este navegador.
// index.html lo aplica antes de pintar la página para que no parpadee.

export type Theme = 'dark' | 'light';
const KEY = 'sh-theme';

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Navegación privada o almacenamiento bloqueado: el tema dura solo esta visita
  }
  window.dispatchEvent(new CustomEvent('sh-theme', { detail: theme }));
}
