#!/usr/bin/env bash
# Descarga los volcados OCR del copiloto desde el telefono conectado por USB.
#
# Uso:
#   1. Activa el copiloto en RutaFlow.
#   2. Baja la barra de notificaciones y toca "Diagnóstico" en el aviso de RutaFlow.
#   3. Vuelve a DiDi/inDrive/Uber y deja que lleguen ofertas durante 3 minutos.
#   4. Conecta el telefono por USB con depuracion activada y corre este script.
set -euo pipefail

PKG="mx.rutaflow.app"
REMOTE="/sdcard/Android/data/$PKG/files/ocr-dumps"
LOCAL="${1:-diagnostics/ocr-dumps}"

command -v adb >/dev/null || { echo "Falta adb. Instala Android Platform Tools."; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "Ningun telefono conectado. Activa depuracion USB y acepta el aviso."; exit 1; }

if ! adb shell "test -d $REMOTE" 2>/dev/null; then
  echo "No hay volcados en el telefono todavia."
  echo "Toca \"Diagnóstico\" en la notificacion del copiloto y deja entrar ofertas."
  exit 1
fi

mkdir -p "$LOCAL"
adb pull "$REMOTE/." "$LOCAL" >/dev/null
COUNT=$(find "$LOCAL" -name 'ocr-*.json' | wc -l | tr -d ' ')
echo "Listo: $COUNT volcado(s) en $LOCAL"

read -r -p "¿Borrar los volcados del telefono? [s/N] " answer
case "$answer" in
  [sS]) adb shell "rm -f $REMOTE/*.json"; echo "Telefono limpio." ;;
  *) echo "Se quedan en el telefono." ;;
esac
