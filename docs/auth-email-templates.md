# Correos de autenticacion de Ruleto Drive

Configurar el SMTP de Supabase con el buzon de cPanel:

- Remitente: `Ruleto Drive <no-reply@ruleto.mx>`
- Dominio de enlaces: `https://app.ruleto.mx`
- Activar SPF y DKIM del dominio antes de exigir confirmacion de correo.

## Restablecer contrasena

Asunto: `Restablece tu contraseña de Ruleto Drive`

Boton principal: `Crear nueva contraseña`

URL:

```text
https://app.ruleto.mx/auth/restablecer?token_hash={{ .TokenHash }}&type=recovery
```

Texto sugerido:

```html
<p>Recibimos una solicitud para crear una nueva contraseña de Ruleto Drive.</p>
<p><a href="https://app.ruleto.mx/auth/restablecer?token_hash={{ .TokenHash }}&type=recovery">Crear nueva contraseña</a></p>
<p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
```

## Verificar correo de cuenta nueva

Asunto: `Verifica tu correo para Ruleto Drive`

Codigo:

```text
{{ .Token }}
```

Texto sugerido:

```html
<p>Usa este codigo para confirmar tu correo en Ruleto Drive:</p>
<p style="font-size:24px;font-weight:700;letter-spacing:0.18em;">{{ .Token }}</p>
<p>El codigo vence pronto. Si no creaste esta cuenta, ignora este correo.</p>
```

## Confirmar correo nuevo

Asunto: `Confirma tu nuevo correo en Ruleto Drive`

Codigo:

```text
{{ .Token }}
```

Texto sugerido:

```html
<p>Usa este codigo para confirmar tu nuevo correo en Ruleto Drive:</p>
<p style="font-size:24px;font-weight:700;letter-spacing:0.18em;">{{ .Token }}</p>
<p>El cambio se completa solo despues de validar este codigo.</p>
```

## Excepcion de pruebas

Las direcciones `@ruleto.mx` se confirman desde endpoints serverless con service role. No deben recibir codigo de verificacion de cuenta nueva ni de cambio de correo. La recuperacion de contrasena sigue enviando correo, incluso para `@ruleto.mx`.
