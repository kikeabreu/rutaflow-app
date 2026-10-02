# Entrega de Android

- Siempre que se modifique la PWA, compilar y publicar también una nueva versión APK de Android, salvo que el usuario indique explícitamente lo contrario.
- Cuando se compile o publique una APK nueva, actualizar `android/app/build.gradle` (`versionCode` y `versionName`) y el destino de `/android/ruleto-drive.apk` en `vercel.json` para que apunte al archivo de la versión más reciente publicada en GitHub Releases.
- Mantener el botón de `public/descargar.html` apuntando a la ruta estable `/android/ruleto-drive.apk`; no enlazar allí una versión fija.
- Antes de dar por terminada una entrega de Android, comprobar que el release contiene la APK, que la redirección pública apunta a ese archivo y que `npm run test:api` pasa. Publicar el release antes de activar en producción el enlace nuevo.
- Si solo cambia la landing, verificar igualmente que la ruta estable todavía apunta a la APK publicada más reciente.
