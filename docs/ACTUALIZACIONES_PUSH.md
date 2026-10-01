# Activación de actualizaciones y notificaciones

El código de PWA, Android, panel, APIs y cola está en este repositorio. Estado de activación y pasos pendientes:

1. La migración `supabase/migrations/202609300002_update_notifications.sql` ya está aplicada en el proyecto Supabase de Ruleto. La cuenta `e.abreuespinoza@gmail.com` tiene `app_metadata.support_role=admin`; debe cerrar e iniciar sesión para renovar su JWT antes de abrir el panel.
2. `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` y `CRON_SECRET` están configurados en Vercel; `ruleto_cron_secret` está en Supabase Vault. El cron de Supabase llama al worker cada minuto y se verificó una respuesta HTTP 200. El cron de Vercel en `vercel.json` sirve como recuperación diaria.
3. El proyecto Firebase `ruleto-drive` tiene registrada la aplicación `mx.ruleto.drive`. `android/app/google-services.json` corresponde a ella. `FIREBASE_PROJECT_ID` y `FIREBASE_SERVICE_ACCOUNT_JSON` están guardados como secretos de producción en Vercel; se verificó que la cuenta de servicio obtiene un token OAuth para FCM HTTP v1.
4. La PWA está desplegada. La compilación web `1790835215193` (`2026-10-01-06-13`) está publicada en Supabase como línea base. El panel verifica que los siguientes números publicados coincidan con el despliegue.
5. La APK [1.4.8-beta](https://github.com/kikeabreu/rutaflow-app/releases/tag/v1.4.8-beta) (`versionCode` 13) está publicada. Su firma SHA-256 coincide con la versión anterior. La ruta pública `/android/ruleto-drive.apk` apunta a ese archivo; `public/descargar.html` conserva la ruta estable. La publicación Android con mínimo 0 también está activa en Supabase. La siguiente APK que se compile o publique deberá volver a cumplir el procedimiento de `AGENTS.md`.
6. Falta verificar en un Android físico que la APK se instale sobre la anterior sin perder datos, activar los avisos y comprobar FCM con la app abierta y cerrada. Verificar además Web Push en PWA Android, iOS instalado en inicio y escritorio. Solo entonces enviar un aviso general.

El panel muestra aceptación por el proveedor, no lectura o entrega confirmada. Las APK anteriores a la primera con FCM necesitan actualizarse por la página existente antes de poder recibir avisos push.
