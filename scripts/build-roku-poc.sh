#!/usr/bin/env sh
# Empaqueta el POC de Roku en un .zip listo para subir desde el navegador al Roku en modo desarrollador.
set -eu
cd "$(dirname "$0")/../poc/roku"
mkdir -p ../../dist
rm -f ../../dist/T-Max-Roku-POC.zip
zip -qr ../../dist/T-Max-Roku-POC.zip manifest source components images
echo "Listo: dist/T-Max-Roku-POC.zip"
