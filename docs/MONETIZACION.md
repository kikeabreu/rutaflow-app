# RutaFlow: plan de capitalizacion inicial

## Ruta recomendada

RutaFlow ya es una PWA en este repo, asi que la primera version vendible puede salir desde Vercel sin pasar por Play Store o App Store.

- Android: abrir la web en Chrome y tocar "Instalar app".
- iPhone: abrir la web en Safari, compartir y tocar "Agregar a pantalla de inicio".
- Tiendas despues: cuando haya pagos reales y usuarios activos, conviene empaquetar una app nativa para mejorar GPS en segundo plano.

## Modelo gratis / Pro

- Gratis: 30 viajes al mes, registro manual y resumen basico.
- Pro: viajes ilimitados, GPS, Foto IA, asesor IA y analiticas completas.
- Precio inicial sugerido para validar: MXN 99/mes o MXN 899/anio.

## Variables de pago

La app abre el primer link disponible:

```bash
REACT_APP_STRIPE_PAYMENT_LINK=
REACT_APP_MERCADOPAGO_PAYMENT_LINK=
```

Stripe Payment Links es el camino mas rapido si vas a cobrar suscripcion con tarjeta. Mercado Pago puede ser mejor si tus usuarios prefieren ese ecosistema.

## Activar Pro en Supabase

La app considera Pro a un usuario si en `profiles` existe cualquiera de estos valores:

```sql
alter table profiles add column if not exists plan text default 'free';
alter table profiles add column if not exists subscription_status text default 'inactive';
alter table profiles add column if not exists pro_until timestamptz;
alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists mercadopago_customer_id text;
```

Reglas:

- `plan = 'pro'`
- `subscription_status = 'active'` o `trialing`
- `pro_until` en el futuro

## Siguiente paso tecnico

1. Crear producto mensual/anual en Stripe o Mercado Pago.
2. Poner el link en Vercel como variable de entorno.
3. Crear webhook que actualice `profiles.subscription_status` cuando se pague o cancele.
4. Medir conversion: registro, click a Pro, pago, retencion y uso de GPS/IA.

## Mensaje de venta

Sabe si cada viaje te deja dinero antes de aceptar el siguiente.

Beneficios:

- Calcula gasolina, tiempo, comision y km reales.
- Registra viajes con GPS o captura de pantalla.
- Detecta horarios y plataformas que mas te convienen.
- Convierte tus viajes en decisiones, no en corazonadas.
