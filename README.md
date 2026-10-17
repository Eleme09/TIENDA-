# TIENDA- : registro de consumo/fiado + inventario

Para una tienda de autoservicio (ej. dulcería) donde los clientes/empleados
se sirven solos y anotan lo que sacaron. Reemplaza la libreta de fiado en
papel: cada persona registra su propio consumo con un PIN de 4 dígitos, el
dueño ve el reporte de quincena y el stock se ajusta editando cada producto.

## Setup

1. Crear proyecto en Supabase (cuenta nueva, dedicada a este cliente).
2. Correr `schema.sql` completo en el SQL Editor de ese proyecto.
3. Crear bucket... no aplica — no hay subida de fotos de producto en esta v1.
4. Variables de entorno (`.env` local o Render):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET`
5. `npm install`
6. `npm run seed` (opcional) — carga productos y personas de ejemplo (inventados) para probar el flujo antes de tener los datos reales del cliente.
7. `npm run dev` — corre en `http://localhost:3000`.
8. Abrir `/admin.html` y crear la cuenta del dueño (primer arranque).

## Cómo funciona

- **`/` (autoservicio):** elegís tu nombre de una lista, ponés tu PIN, y
  anotás lo que sacaste. Podés ver tu propio historial y anular un consumo
  tuyo (con motivo obligatorio — nunca se borra, queda marcado como
  anulado). El PIN es lo único que te identifica, no hay contraseña por
  persona.
- **`/admin.html` (panel del dueño):** login propio (usuario/contraseña,
  igual que VENTA-WEB). Desde ahí: reporte de consumo por rango de fechas
  (total a cobrar por persona), alta de personas y productos.

## Reutilizado de VENTA-WEB

Patrón de auth del dueño (scrypt, sesión, setup del primer admin), sistema
de toasts/confirmación (`ui.js`), tokens de diseño y componentes base
(`.btn`, `.field`, `.card-box`, tablas). El carrito, WhatsApp y catálogo
público de VENTA-WEB no aplican acá y no están.
