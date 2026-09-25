# Ayuda de Ruleto Drive

Ruleto Drive ayuda a conductores a registrar jornadas, viajes, gastos operativos, bonos y resultados. La aplicación estima utilidad usando los datos capturados y tu configuración; no sustituye la contabilidad, los datos oficiales de la plataforma ni las decisiones de seguridad al conducir.

## Primeros pasos

1. Inicia sesión con correo y contraseña o con Google.
2. En **Config** ajusta rendimiento del vehículo, precio de gasolina, meta por hora, comisiones y costos de mantenimiento.
3. En **Hoy** pulsa **Iniciar jornada** cuando estés listo para trabajar.
4. Registra cada viaje y los movimientos relevantes.
5. Pulsa **Terminar jornada** para crear el cierre.

La sesión de Google regresa a la aplicación Android mediante un enlace seguro. Si el navegador no vuelve automáticamente, abre Ruleto Drive y revisa que la aplicación esté actualizada.

## Jornada y viajes

- **Viaje manual:** captura plataforma, tarifa, kilómetros y minutos de recogida y destino.
- **Foto IA:** intenta leer una captura de oferta. Revisa todos los valores antes de guardar; el reconocimiento puede equivocarse.
- **GPS del viaje:** requiere permiso de ubicación. La señal puede degradarse en interiores, túneles o por ahorro de batería.
- **Movimientos:** registra kilómetros sin pasaje, gasolina, nivel del tanque y propinas.
- **Bonos:** registra promociones pagadas o activas, su avance, vencimiento y esfuerzo adicional.
- **Cierre:** resume tiempo, kilómetros, productividad y utilidad calculada de la jornada.

No manipules el teléfono mientras conduces. Captura o corrige datos únicamente cuando estés detenido en un lugar seguro.

## Cómo se calculan los resultados

La estimación considera tarifa, comisión configurada, gasolina y, cuando están activos, llantas y mantenimiento por kilómetro. Los resultados dependen de que distancias, tiempos, comisiones y precios estén actualizados. Un valor estimado no garantiza el pago real de una plataforma.

## Copiloto de ofertas en Android

El Copiloto puede analizar texto visible en ofertas mediante captura de pantalla y mostrar una estimación. Solo está disponible en Android compatible.

- Android muestra una confirmación de captura cada vez que hace falta iniciar una sesión nueva.
- Ruleto Drive no reutiliza una autorización de captura terminada.
- Una notificación permanente indica que la captura está activa y permite apagarla.
- Si Android detiene la captura, vuelve a Ruleto Drive y autorízala otra vez.
- El reconocimiento ocurre en el dispositivo, pero una oferta borrosa, incompleta o con un diseño nuevo puede no detectarse.

La recomendación del Copiloto es orientativa. Verifica tarifa, destino y condiciones en la aplicación de viajes.

## Android y ubicación

Ruleto Drive solicita ubicación precisa únicamente para funciones iniciadas por el usuario. Android puede suspender o limitar el GPS por ahorro de batería, permisos, ubicación desactivada o políticas del fabricante.

El servicio nativo de seguimiento de jornada está preparado para integración, pero la interfaz publicada puede seguir usando el rastreo de la pantalla de jornada. Si desaparece la notificación de ubicación o el estado indica interrupción, vuelve a iniciar el rastreo desde Ruleto Drive. La aplicación no solicita `ACCESS_BACKGROUND_LOCATION`; cuando el seguimiento nativo está activo usa un servicio foreground visible.

## PWA e instalación

En navegadores compatibles puedes instalar Ruleto Drive desde la opción **Instalar app**. En iPhone/iPad usa **Compartir → Agregar a pantalla de inicio**. Algunas funciones nativas —como el Copiloto Android— no están disponibles en la PWA.

La PWA puede conservar la pestaña abierta, subsecciones, el borrador de viaje y una jornada activa para recuperarlos tras una recarga. Esto no significa que todas las operaciones funcionen sin conexión.

## Uso sin conexión y sincronización

- Ruleto Drive conserva localmente parte del estado de trabajo y lo separa por usuario.
- Un error al consultar la nube no debe borrar una jornada local recuperada.
- Guardar viajes, movimientos, bonos, cierres y configuración requiere conexión con el servidor.
- No cierres la jornada ni borres el borrador si una operación muestra error de conexión; vuelve a intentar con señal estable.
- Los puntos del nuevo rastreo nativo pueden quedar pendientes localmente hasta que la interfaz los sincronice y confirme. Esta sincronización todavía depende de la integración de la versión instalada.

## IA y privacidad

Las consultas del asistente y Foto IA necesitan conexión. Envía únicamente información necesaria y evita incluir nombres, teléfonos, documentos o datos de pasajeros. Las respuestas pueden ser incompletas o incorrectas; confirma decisiones importantes con tus registros originales.

## Cuenta y plan

Tu información se asocia al usuario autenticado. No compartas credenciales. Cerrar sesión no elimina los datos guardados en la nube.

La infraestructura segura de suscripciones puede no estar activa en todas las instalaciones. Un regreso exitoso desde una página de pago no concede acceso por sí solo: el estado del plan se confirma en el servidor. Si no aparece una opción de pago o portal, contacta a soporte.

## Solución rápida de problemas

### No puedo iniciar sesión

- Comprueba conexión y fecha/hora del dispositivo.
- Para Google, vuelve a intentarlo desde Ruleto Drive y permite que el navegador abra la aplicación.
- Para correo, usa la recuperación de contraseña.

### El GPS no registra o salta

- Activa ubicación precisa y revisa el permiso de Ruleto Drive.
- Desactiva temporalmente el ahorro de batería para una prueba.
- Espera al aire libre hasta obtener señal.
- No combines manualmente puntos separados por una pausa; Ruleto Drive identifica segmentos de continuidad cuando usa el rastreo nativo.

### El Copiloto aparece apagado

- Comprueba que su notificación siga visible.
- Si Android terminó la captura, pulsa iniciar y acepta un consentimiento nuevo.
- No es posible reanudar una captura anterior sin autorización.

### Mis datos no se guardaron

- Conserva la pantalla y vuelve a intentar con conexión.
- Comprueba que sigues en la cuenta correcta.
- Anota la hora aproximada y el mensaje mostrado antes de contactar a soporte.

## Contactar a soporte

La interfaz de soporte podrá crear tickets y sugerencias cuando se conecte al módulo preparado. Incluye:

- qué intentabas hacer;
- fecha y hora aproximadas;
- Android, iOS o navegador y su versión;
- mensaje de error exacto;
- pasos para reproducirlo.

No envíes contraseñas, tokens, datos bancarios ni información personal de pasajeros. Los agentes nunca necesitan tu contraseña.

