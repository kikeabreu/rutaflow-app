# Activación de actualizaciones y notificaciones

El código de PWA, Android, panel, APIs y cola está en este repositorio. Estado de activación y pasos pendientes:

1. La migración `supabase/migrations/202609300002_update_notifications.sql` ya está aplicada en el proyecto Supabase de Ruleto. La cuenta `e.abreuespinoza@gmail.com` tiene `app_metadata.support_role=admin`; debe cerrar e iniciar sesión para renovar su JWT antes de abrir el panel.
2. `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` y `CRON_SECRET` están configurados en Vercel; `ruleto_cron_secret` está en Supabase Vault. El cron de Supabase llama al worker cada minuto y se verificó una respuesta HTTP 200. El cron de Vercel en `vercel.json` sirve como recuperación diaria.
3. Crear o seleccionar un proyecto Firebase para `mx.ruleto.drive`. Guardar `google-services.json` en `android/app/` (no contiene la clave privada de envío). En Vercel, configurar `FIREBASE_PROJECT_ID` y `FIREBASE_SERVICE_ACCOUNT_JSON` con una cuenta de servicio autorizada para Firebase Cloud Messaging HTTP v1. No compilar la APK antes de configurar Firebase.
4. La PWA ya está desplegada. La compilación web `1790817987804` (`2026-10-01-01-26`) está publicada en Supabase como línea base. El panel verifica que los siguientes números publicados coincidan con el despliegue.
5. Incrementar `versionCode` y `versionName` de Android, crear la APK y verificar que la firma SHA-256 coincida con la versión instalada. Publicar primero la APK en GitHub Releases. Actualizar `vercel.json` para que `/android/ruleto-drive.apk` apunte a ese asset; mantener `public/descargar.html` usando la ruta estable. Desplegar la redirección y verificarla antes de publicar la versión Android en el panel.
6. En un dispositivo de prueba, activar los avisos, enviar una campaña de prueba a la propia cuenta y comprobar el toque con la app abierta y cerrada. Verificar además la PWA en Android, iOS instalado en inicio y escritorio. Solo entonces enviar el aviso general.

El panel muestra aceptación por el proveedor, no lectura o entrega confirmada. Las APK anteriores a la primera con FCM necesitan actualizarse por la página existente antes de poder recibir avisos push.
