# ADR-0004: Compilación y distribución

**Estado:** Aceptado
**Fecha:** 2026-11-22
**Decide:** Arturo

## Contexto

El desarrollo se hace desde Windows 11, sin Mac. iOS exige macOS y Xcode para compilar. Desde el 28-10-2026, la cuota gratuita de GitHub Actions para repositorios privados es una bolsa en dólares; con el precio de macOS daría para unos 190 minutos al mes. En repositorios públicos los runners estándar son gratuitos.

## Decisión

- **Repositorio público:** `github.com/muguiwara23/t-max`.
- **Todo se compila en GitHub Actions:**
  - Pruebas de `core` y empaquetado de Tizen (`.wgt`), webOS (`.ipk`) y Roku (`.zip`) en Linux.
  - iOS en macOS: `.ipa` **sin firmar** como artefacto descargable.
- **Firma iOS:** Arturo firma el `.ipa` con su cuenta de Flarestore.
- **Instalación en TVs:** desde la PC de Arturo, en la misma red que la TV:
  - Tizen: Tizen Studio / CLI con certificado ligado a la TV.
  - webOS: app Developer Mode + `ares-cli`.
  - Roku: modo desarrollador + subida del `.zip` por la página web del Roku.

## Consecuencias

- Al ser público, **nada privado puede entrar al repo** (ver ADR-0005 y `CLAUDE.md`).
- Los certificados de Tizen y cualquier dato privado, si alguna vez se necesitan en CI, van en GitHub Secrets.
- Las compilaciones de iOS se lanzan a mano (`workflow_dispatch`) o al crear un tag, no en cada commit.

## Pendiente

- Elegir la licencia del código. Si se usan componentes GPL (por ejemplo, expo-mpv), conviene publicar T-Max como GPL-3.0.
