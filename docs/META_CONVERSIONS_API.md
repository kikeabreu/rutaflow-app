# Meta Conversions API de Ruleto.MX

Este proyecto incluye un endpoint aislado en `POST /api/meta/conversions` para enviar eventos server-side al dataset/pixel de **Ruleto.MX**.

## Alcance

- No modifica `vercel.json` ni Supabase migrations; Stripe se integra únicamente desde su webhook verificado.
- Solo acepta llamadas autenticadas con una sesión válida de Supabase.
- El cliente envía el nombre del evento y un `event_id`; el servidor construye `user_data`.
- Email, teléfono y `external_id` se normalizan y se envían con SHA-256.
- El token de Meta solo vive en variables privadas de Vercel y nunca se devuelve al cliente ni se registra.
- `event_name`, `action_source`, `event_id`, fechas, URL de origen y `custom_data` tienen allowlists y límites.
- Meta deduplica reintentos mediante la combinación `event_name` + `event_id`.

## Variables privadas de Vercel

Configurar únicamente en el proyecto Vercel que sirve `app.ruleto.mx`:

- `META_DATASET_ID`: ID del dataset/pixel de Ruleto.MX.
- `META_ACCESS_TOKEN`: token generado desde Events Manager para ese dataset.
- `META_GRAPH_API_VERSION`: opcional; por defecto `v26.0`.
- `META_TEST_EVENT_CODE`: opcional y temporal; solo para pruebas en Events Manager. Eliminarlo al pasar a producción.

Nunca anteponer `REACT_APP_` a estas variables, porque ese prefijo las haría candidatas a quedar expuestas en el frontend.

## Contrato del endpoint

Request:

```http
POST https://app.ruleto.mx/api/meta/conversions
Authorization: Bearer <sesion-de-Supabase>
Content-Type: application/json
```

Body mínimo:

```json
{
  "event_name": "CompleteRegistration",
  "event_id": "registration-<id-unico>"
}
```

Campos opcionales controlados:

- `action_source`: `website` o `app`.
- `event_time`: Unix timestamp; máximo 7 días de antigüedad y no más de 5 minutos en el futuro.
- `event_source_url`: solo `https://ruleto.mx`, `https://www.ruleto.mx` o `https://app.ruleto.mx`.
- `fbp` y `fbc`: identificadores del navegador con formato validado.
- `custom_data`: únicamente `value`, `currency`, `content_ids`, `content_type`, `num_items` y `order_id`.

Eventos permitidos inicialmente: `PageView`, `ViewContent`, `Search`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `Purchase`, `Lead`, `CompleteRegistration`, `Subscribe`, `StartTrial`, `Login`, `Contact` y `Download`.

Respuesta exitosa: `202 {"accepted":true,"events_received":1}`. Un `401` indica sesión inválida, un `400` payload inválido, un `503` configuración ausente y un `502` rechazo o falla de Meta.

## Flujos conectados

- `app.ruleto.mx`: `Login` se emite una vez por sesión de navegador después de que Supabase confirma la sesión; cubre correo y Google OAuth.
- `app.ruleto.mx`: `CompleteRegistration` se emite después de un registro que ya devuelve sesión.
- Stripe: `checkout.session.completed` envía `Subscribe` para suscripciones y `Purchase` para pagos únicos.
- Stripe usa `stripe-<event_id>` como `event_id`, por lo que los reintentos no duplican conversiones en Meta.
- Si Meta no está configurado o falla, el flujo principal de login, registro o Stripe continúa; el error queda únicamente en logs del servidor.

Los eventos de Stripe no se generan desde el botón del frontend: solo se envían después del webhook firmado y confirmado.

Referencia oficial: [Using the API - Meta Conversions API](https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api).
