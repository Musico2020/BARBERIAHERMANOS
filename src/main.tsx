import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './light-theme.css';
import { loadSettings } from './services/settings';

// Primero se lee la configuración guardada desde el panel (horarios, días especiales, redes)
// y luego se carga la web, para que todo muestre los datos actualizados desde el inicio.
// Si tarda más de 4 segundos, la web arranca con los valores por defecto.
const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));

Promise.race([loadSettings(), timeout])
  .then(() => import('./App.tsx'))
  .then(({ default: App }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
