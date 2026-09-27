# Dominios Ruleto

Este proyecto de Vercel sirve tres hosts:

- `https://ruleto.mx/`: landing, `/carrito`, `/descargar`, términos y privacidad.
- `https://app.ruleto.mx/`: registro, inicio de sesión y PWA.
- `https://rutaflow-app.vercel.app/`: redirige a la landing, pero mantiene sus rutas `/api/*` para las APK existentes y los webhooks de Stripe durante la transición.

Los dominios `ruleto.mx`, `www.ruleto.mx` y `app.ruleto.mx` ya están asociados al proyecto `rutaflow-app` en Vercel. En el proveedor donde se administra el DNS, crear:

| Nombre | Tipo | Valor |
| --- | --- | --- |
| `@` | A | `216.198.79.1` |
| `@` | A | `64.29.17.1` |
| `app` | CNAME | `9d53d4dddda7ffe5.vercel-dns-017.com` |
| `www` | CNAME | `9d53d4dddda7ffe5.vercel-dns-017.com` |

No cambiar registros MX ni nameservers si el correo u otros servicios dependen del proveedor DNS actual. Esperar a que Vercel marque los tres hosts con configuración válida y HTTPS.

En Supabase Auth > URL Configuration, poner `https://app.ruleto.mx` como Site URL y permitir por lo menos `https://app.ruleto.mx/**` y `mx.ruleto.drive://auth/callback` en Redirect URLs. Conservar la URL anterior durante la transición si hay correos de confirmación pendientes.

En Vercel, `APP_URL` ya está configurada como `https://app.ruleto.mx` para los retornos de Stripe. El endpoint de webhook anterior puede seguir activo bajo `/api/billing/webhook`; después de validar el nuevo host, añadir `https://app.ruleto.mx/api/billing/webhook` en Stripe y retirar el antiguo solo tras comprobar entregas correctas.

La descarga `https://ruleto.mx/android/ruleto-drive.apk` redirige al release oficial de GitHub. No subir la APK al repositorio. La PWA instalada desde el host viejo tiene otro origen: cada usuario tendrá que abrir `https://app.ruleto.mx` en Safari o Chrome y añadirla de nuevo a su pantalla de inicio.
