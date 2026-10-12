# Copiloto Android

Ruleto Drive Android puede evaluar las tarjetas de viaje que aparecen en Uber, DiDi e inDrive sin conectarse a sus APIs.

## Funcionamiento

1. El conductor elige la plataforma activa en la tarjeta **Copiloto de ofertas**.
2. Al tocar **Activar**, Android solicita permiso para compartir la pantalla.
3. Un servicio visible toma un cuadro cada ~0.45 s.
4. ML Kit reconoce el texto en el teléfono. Las capturas no se guardan ni se envían a Ruleto Drive.
5. El analizador obtiene tarifa, kilómetros y minutos, aplica la configuración financiera del conductor y comunica el resultado por voz y mediante una notificación.
6. El botón **Apagar** de Ruleto Drive o de la notificación termina inmediatamente la captura.
7. El veredicto se anuncia solo cuando la lectura sale idéntica en 3 cuadros seguidos (~0.9 s); cualquier lectura distinta reinicia la cuenta. Así no cambia de opinión mientras la tarjeta entra animada.
   - Se descarta lo que el propio copiloto dibuja en pantalla (notificación, alerta expandida y la etiqueta `$85 · $350/h`), porque sale en la captura siguiente y sus netos y minutos contaminaban la lectura.
   - Una lectura que describe un viaje imposible no se anuncia: cada tramo debe ir entre 1.5 y 100 km/h, la tarifa entre $2 y $150 por km y como máximo $2,000 brutos por hora.
   - La tarifa es el importe de "Aceptar por $X" o, si el botón no lo trae (Uber), el importe más cercano por encima de los km y minutos; no el de ganancias del día.
   - Una relectura de la misma tarjeta (misma tarifa) en los 15 s siguientes no se vuelve a anunciar.
   - La voz dice primero el veredicto y el rendimiento, y luego lo que leyó: tarifa, distancia a la recogida, km totales y minutos totales. Ejemplo: *"Buen viaje, 223 por hora. 180 pesos, recoges a 3.2 kilómetros, 16 en total, 32 minutos."*
8. El botón de bocina de la tarjeta (o **Silenciar voz** en la notificación) apaga la voz; el veredicto sigue en la notificación y en el recuadro sobre la oferta.

### inDrive

- En la solicitud abierta se leen las etiquetas del mapa: la azul junto al punto A es la recogida y la verde junto al punto B es el destino. La distancia `~X km` bajo el mapa confirma cuál es la recogida.
- La lista de solicitudes no muestra datos del viaje (sus "2 min." son la antigüedad de la solicitud), así que el copiloto espera a que el conductor abra una.

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
- Si una oferta no muestra minutos, Ruleto Drive utiliza una estimación conservadora basada en distancia.
- El usuario debe elegir la plataforma activa para aplicar la comisión correcta cuando su nombre no aparece en la tarjeta.
- La primera versión está diseñada para teléfonos en orientación vertical.
