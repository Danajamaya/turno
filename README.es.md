# Turno

Horarios, reloj checador y hojas de horas para equipos que cobran por hora.
Es un SaaS para muchos negocios a la vez; por ahora es web, y después vienen
las apps de iPhone y Android. Es una versión propia del ciclo principal de
herramientas como Homebase, planeada en `replica/` (análisis, arquitectura,
base de datos y diseño).

Estado: el ciclo principal ya funciona con una base de datos Postgres real,
entrada con enlace por correo y cobros con Stripe listos en el código. Ver
`replica/build-log.md`, `replica/backend.md` y `replica/features.csv`: de 21
funciones imprescindibles, 6 están completas y 9 a medias.

## Cómo correrla

Necesitas Node 22, pnpm y una base de datos Postgres. Copia `.env.example` a
`apps/web/.env.local` y pon al menos `DATABASE_URL`.

```bash
pnpm install
pnpm migrate
TEST_DATABASE_URL=postgres://.../turno_test pnpm test   # borra esa base de datos
pnpm build
TURNO_DEV_LOGIN=1 pnpm --filter @turno/web start -p 3100
```

Abre http://localhost:3100, crea un negocio, agrega gente, pon turnos en la
semana y publica. Sin `RESEND_API_KEY`, los correos (incluido el enlace para
entrar) se guardan en `apps/web/.data/outbox.jsonl`. `/dev/login` entra como
cualquier persona y solo existe con `TURNO_DEV_LOGIN=1`.

## Turno Guías

Un marketplace y CRM para guías turísticos, sobre la misma base (plan en
`replica/guias/`):

- **Plataformas:** cada negocio tiene una dirección de reenvío; los correos
  de reserva de GuruWalk, Freetour.com, Strawberry Tours, GetYourGuide,
  Viator y Civitatis llegan a un solo calendario, y los dudosos a revisión.
- **Calendario y app del guía:** guía por tour, check-in, cierre con
  propinas; calendario privado para Google, Apple y Outlook.
- **Equipo:** chat interno con canales, mensajes directos y tarjetas de tour.
- **Viajeros:** un contacto por persona aunque venga de varias plataformas,
  y una cola diaria de recordatorios y peticiones de reseña (correo, o
  WhatsApp desde el teléfono del guía).
- **Marketplace:** buscador público (`/guias`), perfil y paquetes del guía
  (`/g/<slug>`), reserva con precio y comisión según plan, reseñas
  verificadas, en español e inglés.
- **Dinero:** ingresos por plataforma para el guía (`/ingresos`),
  suscripciones y comisiones para Turno (`/admin`).
- **Crecer:** lista de espera para tours llenos, aviso de sobreventa entre
  plataformas, propinas con tarjeta por QR, fotos, preguntas de viajeros con
  respuestas sugeridas, tarjetas regalo, ideas de precio según la demanda,
  reparto de guías y pagos del mes, resumen semanal por correo y app
  instalable con avisos.

Falta lo que necesita tus cuentas: verificación de Google para Gmail, Stripe
Connect y precios, un número de WhatsApp Business, una clave de Anthropic
para formatos de correo desconocidos, y correos reales de cada plataforma.
Estado de cada función: `replica/guias/features.csv`.

## Siguiente

1. Conectar los servicios con tus propias cuentas: ver `replica/backend.md`.
2. Lo que falta de lo imprescindible: kiosco con PIN, descansos,
   disponibilidad y vacaciones, editar y arrastrar turnos, exportar CSV,
   alertas automáticas.
3. App de Expo para iPhone y Android.
