#!/usr/bin/env sh
# Empaqueta T-Max para Roku en un .zip para subir desde el navegador al Roku en modo desarrollador.
set -eu
cd "$(dirname "$0")/../clients/roku"
mkdir -p ../../dist
rm -f ../../dist/T-Max-Roku.zip
zip -qr ../../dist/T-Max-Roku.zip manifest source components images
echo "Listo: dist/T-Max-Roku.zip"
