# Jornada Inteligente

RutaFlow separa tres conceptos que no deben mezclarse:

- Utilidad operativa: ingreso menos comision, combustible consumido y desgaste configurado.
- Flujo de efectivo: ingreso despues de comision menos gasolina comprada ese dia.
- Tanque estimado: combustible conocido mas cargas posteriores menos consumo registrado.

## Movimientos

La tabla `operational_events` guarda:

- `dead_km`: kilometros recorridos sin pasajero.
- `refuel`: litros e importe de una carga de gasolina.
- `tank_checkpoint`: estimacion conocida de litros actuales y odometro opcional.

Cada movimiento puede editarse eliminandolo y registrandolo de nuevo. Los viajes siguen viviendo en `trips` para mantener compatibilidad con los datos existentes.

## Preparar Supabase

Ejecuta una sola vez el archivo:

`supabase/migrations/202608290001_operational_events.sql`

La migracion activa RLS. Cada usuario solo puede consultar y modificar sus propios movimientos.

## Preparar Vercel

Variables necesarias:

- `REACT_APP_SUPABASE_URL`: URL publica del proyecto correcto.
- `REACT_APP_SUPABASE_ANON_KEY`: clave anonima o publishable.
- `GROQ_API_KEY`: clave privada de Groq, disponible en Production, Preview y Development.

Si el proyecto ya tiene `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`, el script de construccion los reutiliza automaticamente. No hay que duplicarlos.

La funcion `/api/groq` acepta peticiones unicamente de usuarios autenticados en RutaFlow. La clave de Groq ya no se incluye en el JavaScript del navegador.

Despues de guardar las variables hay que crear un nuevo deployment. Una variable agregada despues de un deployment no modifica ese deployment anterior.

Cuando el nuevo deployment funcione, elimina `REACT_APP_GROQ_API_KEY` y `VITE_GROQ_API_KEY` de Vercel. Ya no son necesarias y sus nombres indican que podrian exponerse en aplicaciones frontend.
