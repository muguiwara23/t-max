# POC Roku (desechable)

Prueba de viabilidad del POC 4 (`docs/poc-plan.md`): qué formatos reproduce el Roku con tus fuentes reales,
cuánto tarda en bajar y procesar la lista de canales y cuánta memoria queda. No es la app final.

## Instalar (una vez por Roku)

1. Modo desarrollador: en el control, **Inicio ×3, Arriba ×2, Derecha, Izquierda, Derecha, Izquierda, Derecha**.
   Anota la IP que aparece, acepta y elige una contraseña (es del Roku, no de T-Max). El Roku se reinicia.
2. En la PC (misma red), abre `http://IP-DEL-ROKU` en el navegador, usuario `rokudev` y la contraseña que elegiste.
3. **Upload** → el `.zip` del POC → **Install with zip**. Se abre solo.

## Qué probar

1. *Configurar Xtream* y *Configurar Stalker* (tip: el teclado de la app Roku del teléfono es más cómodo).
2. *Xtream: cargar canales*: elige un canal. Con el botón **\*** cambias el formato del siguiente canal:
   `.ts` sin formato → `.ts` como `ts` → `.m3u8` (HLS). Prueba los tres en el mismo canal.
3. *Xtream: probar una película*.
4. *Stalker: cargar canales*.
5. Toma foto del panel de resultados (derecha).

Compilar el `.zip`: `scripts/build-roku-poc.sh` (o el flujo manual de GitHub Actions *POC Roku*).
