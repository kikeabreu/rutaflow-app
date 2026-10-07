# Ruleto Drive: acompañamiento del trial por correo

Incluye dos flujos importables de n8n, plantillas, migraciones SQL y la preferencia visual en registro y Configuración. No envía correos al importar; el flujo de envío queda inactivo y `sendEnabled=false`. La migración no habilita marketing para usuarios existentes. Los avisos dentro de la app y push de remarketing quedan para una segunda entrega con actualización de la app y APK.

## Secuencia

| Ventana desde el inicio real de prueba | Campaña |
| --- | --- |
| Primer día | Bienvenida con vencimiento exacto |
| Días 2–3, sin viajes | Ayuda para el primer viaje |
| Días 7–8 | Mensaje basado en el número real de viajes |
| Entre 3 y 2 días antes del vencimiento | Continuar con Pro |
| Primer día después del vencimiento | Explicar Free y Pro |
| Entre 7 y 8 días después, sin viajes recientes | Regreso a Free |

Se usan `profiles.ruleto_trial_granted_at` y `pro_until`, no la fecha de registro. Se excluyen cuentas de pago o con suscripción pendiente de resolver. Cada campaña es única por usuario e inicio de prueba. Máximo un correo de acompañamiento cada 36 horas por usuario y uno por ejecución (seis por hora con la programación incluida). Los candidatos fuera de su ventana se cancelan. El resumen inicial personaliza nombre, uso y vencimiento; no inventa ganancias ni ahorro.

## Conexiones necesarias

1. Supabase del proyecto que utiliza `app.ruleto.mx`: aplicar la migración en un entorno de prueba primero. Requiere las tablas y migraciones de trial existentes. La migración se aplica una vez, mediante el sistema habitual de migraciones.
2. En n8n, importar `automations/n8n/ruleto-lifecycle-email.json` y `ruleto-email-preferences.json`.
3. En cada nodo **Configuración**, sustituir `supabaseUrl` y `unsubscribeUrl` por las URL reales. El enlace de baja debe ser el webhook de producción, accesible por HTTPS, no el webhook de prueba. Mantener `sendEnabled=false` hasta terminar el piloto.
4. Crear una credencial **Custom Auth** de HTTP Request para Supabase, con JSON `{"headers":{"apikey":"CLAVE_SERVICE_ROLE","Authorization":"Bearer CLAVE_SERVICE_ROLE"}}`. Seleccionarla en todos los nodos HTTP de ambos flujos. Guardar la clave en la credencial, nunca en los archivos del flujo o GitHub. El rol tiene acceso administrativo a la base de datos: limitar quién puede usar esta credencial en n8n.
5. Crear credencial **SMTP** para Neubox y seleccionarla en **Enviar por Neubox**: usuario `no-reply@ruleto.mx`, contraseña del buzón y servidor/puerto/cifrado exactos que muestra cPanel → Cuentas de correo → Conectar dispositivos. No adivinar el servidor. Verificar SPF, DKIM y DMARC y la cuota del plan antes de activar.
6. Activar primero el flujo de baja y comprobar GET y POST. GET presenta un formulario; POST desactiva el acompañamiento. Los analizadores de enlaces no deben dar de baja al usuario con solo abrir el enlace.

## Permisos de correo

Se necesita una preferencia independiente para correos de acompañamiento. La aceptación de privacidad y las notificaciones de actualizaciones existentes no se reutilizan como autorización de marketing. No habilitar a todos los usuarios con una actualización SQL masiva.

La app podrá llamar con la sesión autenticada:

```js
await supabase.rpc('set_lifecycle_email_preference', { p_enabled: true });
// Desactivar:
await supabase.rpc('set_lifecycle_email_preference', { p_enabled: false });
```

El registro muestra una casilla opcional, desmarcada, independiente de los términos. Explica consejos para aprovechar Pro, recordatorios de la prueba y novedades, y la baja en cualquier momento desde el correo o Configuración. La selección se guarda al crear la cuenta; Google y usuarios existentes pueden elegir en Configuración. La migración de consentimiento registra fecha, origen y versión del texto. No cambia preferencias existentes ni reutiliza actualizaciones de metadatos para reactivar una baja. Para el piloto usar únicamente una cuenta propia con aceptación explícita y correo verificado. El remitente es `Ruleto Drive <no-reply@ruleto.mx>`. Las bajas no alteran correos de recuperación o seguridad.

## Piloto y activación

- En una base de prueba, comprobar inicio, ausencia de viajes, uso del trial, vencimiento y cuenta pagada; confirmar que la cuenta pagada no se selecciona.
- Confirmar que el opt-in funciona, que una baja cancela pendientes y que llamadas concurrentes a `claim_lifecycle_email()` no reservan el mismo correo.
- Probar con una cuenta propia, su dirección y datos reales. Antes de enviar, revisar asunto, destinatario, fecha y enlace de baja. Habilitar `sendEnabled=true` solo en el piloto y ejecutar manualmente.
- Verificar recepción y baja. Revisar `lifecycle_deliveries`, después activar el horario para los usuarios con opt-in.

El envío SMTP no tiene una clave de idempotencia. Si n8n falla después de que Neubox acepta el correo, un reintento podría duplicarlo. Por eso no hay reintentos automáticos: un registro `processing` por más de 30 minutos pasa a `uncertain` en la siguiente ejecución. Verificar los registros de n8n/Neubox antes de decidir manualmente si se reencola. `sent` significa aceptado por SMTP, no confirma entrega a bandeja. No reejecutar manualmente el nodo SMTP para recuperar un fallo. Existe una pequeña ventana entre revalidación y envío: una baja o contratación en ese instante puede coincidir con un correo ya en curso.

Por defecto no se guardan datos de ejecuciones exitosas, fallidas o manuales en n8n porque incluyen correo y token de baja. Para depurar, usar una cuenta propia y eliminar los datos de prueba después. No publicar tokens ni enlaces personales en incidencias.

## Validación del paquete

```sh
node automations/n8n/build-workflows.cjs
node --test tests/lifecycle-email.test.js
```

Las pruebas locales cubren plantillas, escape HTML, datos inválidos y conexiones del JSON. Se verificaron la migración en Supabase con casos dentro de una transacción revertida, una entrega SMTP a la cuenta de prueba del propietario y el webhook GET/POST de baja. El flujo de baja está activo en la instancia de Neubox; el de campañas permanece inactivo y con sendEnabled=false. El formulario de baja usa una acción HTTPS absoluta, compatible con el aislamiento HTML de n8n. Si se importa en otra instancia, ajustar también esa URL en Formulario de baja.

Fuentes de configuración:
- Neubox: https://neubox.com/tutoriales/base-de-conocimientos/configurar-correo-neubox-en-gmail-guia-pop3-imap-completa/
- n8n SMTP: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.sendemail/
- n8n credenciales HTTP: https://docs.n8n.io/integrations/builtin/credentials/httprequest/

## Publicación de la app

La entrega está preparada para Android 1.4.19-beta. El cambio de redirección solo debe publicarse después de subir la APK firmada con la misma clave de la versión anterior. La versión anterior está firmada con un certificado Android Debug cuyo SHA-256 es `08491fa5e04980c34292ab48683d818baf04b578af1b1364d16648f9e8142fac`. Esa clave privada no está disponible en este entorno. No sustituirla por una nueva: impediría actualizar las instalaciones existentes.
