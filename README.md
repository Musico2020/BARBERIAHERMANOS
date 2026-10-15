# Salón Hermanos — web de reservas

Barbería tradicional · Club de Caballeros. Barrio Tobías Daza, Valledupar.

Web pública con reserva de turnos en línea, panel de administración y portal de cada barbero.
React 18 + Vite + TypeScript + Tailwind CSS, con base de datos en Supabase.

## Correr en local

Requisitos: Node.js 20+ y Docker Desktop abierto.

```bash
npm install
npx supabase start        # base de datos local con los datos de Salón Hermanos (supabase/seed.sql)
npm run dev               # http://localhost:5173
```

Al terminar `supabase start` copia `API URL` y `anon key` en un archivo `.env` (no se sube a git):

```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key que muestra supabase start>
```

| Qué | Dónde | Acceso local |
|---|---|---|
| Web | http://localhost:5173 | — |
| Panel | http://localhost:5173/admin | `admin@salonhermanos.local` / `Hermanos2026` |
| Portal del barbero | http://localhost:5173/barber | PIN Walter `1111`, Nelson `2222`, Gerardo `3333` |
| Base de datos (Studio) | http://127.0.0.1:54323 | — |

Estas claves son **solo para la base local de pruebas**.

Para borrar todo y volver a los datos iniciales: `npx supabase db reset`.

## Identidad visual

Según el manual de marca (`identidad_visual_salon_hermanos_actualizada.pdf`):

- Colores: negro carbón `#111111`, dorado `#D9AD50`, marfil `#F5F0E6`; rojo `#D71920` y azul `#174A9C`
  del poste de barbería solo como acentos.
- Tipografías: Alfa Slab One / Roboto Slab (HERMANOS), Lobster (Salón), Montserrat (textos).
- Están en `tailwind.config.js` y `src/index.css` (clases `barber-stripe`, `gold-rule`, `brand-ribbon`, `frame-gold`).

## Datos pendientes

Se cambian en Panel → Configuración sin tocar código:

- Número de WhatsApp y teléfono.
- Horario real (hoy: lunes a sábado 8:00 a 19:00, domingos y festivos 9:00 a 13:00, almuerzo 12:00 a 13:00).
- Redes sociales.
- Duración real de cada servicio (Panel → Servicios).

## Comprobaciones antes de publicar

```bash
npm run typecheck
npm run lint
npm run build
```
