# Copiloto Android

RutaFlow Android puede evaluar las tarjetas de viaje que aparecen en Uber, DiDi e inDrive sin conectarse a sus APIs.

## Funcionamiento

1. El conductor elige la plataforma activa en la tarjeta **Copiloto de ofertas**.
2. Al tocar **Activar**, Android solicita permiso para compartir la pantalla.
3. Un servicio visible toma un cuadro aproximadamente cada segundo.
4. ML Kit reconoce el texto en el teléfono. Las capturas no se guardan ni se envían a RutaFlow.
5. El analizador obtiene tarifa, kilómetros y minutos, aplica la configuración financiera del conductor y comunica el resultado por voz y mediante una notificación.
6. El botón **Apagar** de RutaFlow o de la notificación termina inmediatamente la captura.

El copiloto nunca toca ni automatiza los botones de las plataformas.

## Compilar el APK de prueba

Requisitos:

- Node.js 22 o posterior.
- JDK 21.
- Android SDK 36 y Build Tools 36.
- Licencias del Android SDK aceptadas por el propietario del entorno.

Comando:

```sh
npm run android:apk
```

El APK resultante se genera en `android/app/build/outputs/apk/debug/app-debug.apk`. Esta variante sirve para pruebas controladas; no debe publicarse como versión final.

## Distribución de producción

La versión para la web debe construirse con una llave privada de firma y conservar la misma llave durante toda la vida de la aplicación. No se debe guardar la llave ni sus contraseñas en este repositorio.

Antes de distribuir se debe:

- Cambiar `versionCode` y `versionName` para cada entrega.
- Configurar la firma de `release` mediante variables locales o un almacén seguro.
- Publicar una política de privacidad que explique la captura autorizada de pantalla.
- Probar ofertas reales de cada plataforma y tamaño de pantalla.
- Publicar el SHA-256 del APK en la página de descarga.

## Limitaciones conocidas del MVP

- Una plataforma puede impedir la captura de ciertas pantallas protegidas; en ese caso Android entrega una imagen negra.
- Los diseños y textos de Uber, DiDi e inDrive cambian. El analizador debe validarse y ajustarse con capturas reales, sin datos personales.
- Si una oferta no muestra minutos, RutaFlow utiliza una estimación conservadora basada en distancia.
- El usuario debe elegir la plataforma activa para aplicar la comisión correcta cuando su nombre no aparece en la tarjeta.
- La primera versión está diseñada para teléfonos en orientación vertical.
