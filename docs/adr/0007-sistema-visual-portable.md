# ADR-0007: Sistema visual portable

**Estado:** Aceptado
**Fecha:** 2026-11-22
**Decide:** Arturo

## Contexto

T-Max debe verse igual en iPhone/iPad, Samsung Tizen, LG webOS y Roku. Arturo dio dos referencias: una app de streaming oscura con acento lima y paneles redondeados, y una interfaz tipo visionOS con paneles de vidrio sobre el video. Las referencias inspiran, no se copian.

Cada plataforma dibuja de forma distinta:
- **iOS:** puede usar materiales de vidrio con desenfoque.
- **Tizen y webOS:** son motores web en hardware modesto. `backdrop-filter`, sombras grandes y animaciones de desenfoque cuestan mucho.
- **Roku (SceneGraph):** solo tiene rectángulos sólidos, texto e imágenes. Las esquinas redondeadas se hacen con imágenes 9-patch (`.9.png`) y las imágenes recortadas con `MaskGroup`.

## Decisión

1. **Una sola fuente de verdad:** `design/tokens.json`. Cada cliente genera sus constantes desde ahí; ningún valor se edita a mano en una plataforma.
2. **Mínimo común denominador como base, mejoras opcionales encima:**
   - Profundidad por tonos de fondo (`base < panel < raised`), sin sombras.
   - **Sin desenfoque en ninguna plataforma**, iPad incluido, para no gastar RAM ni GPU. Los paneles sobre el video usan `overlay.panel` (oscuro semitransparente). *Cambio del 2026-11-22 a petición de Arturo; antes el vidrio era una mejora solo de iOS.*
   - Animaciones solo de opacidad, traslación y escala.
3. **Dos densidades:** `touch` (pt, objetivos de 44 pt) y `tv` (px a 1920×1080, texto mínimo de 20 px, margen seguro del 5%).
4. **Foco en TV:** anillo lima de 4 px + escala 1.04. Nunca solo color.
5. **Tipografía:** Manrope (OFL), con 3-4 pesos estáticos. **Íconos:** Lucide (ISC), SVG en iOS/web y PNG por tamaño en Roku.
6. **Acento lima** `#D7F36A` con texto `#0A0B0D` encima (contraste 15.9:1). Rojo `#FF5A4E` solo para "EN VIVO".

## Consecuencias

- Al no haber efectos exclusivos de una plataforma, la misma maqueta vale para todas.
- Roku necesita un set de imágenes 9-patch por radio (`sm`, `md`, `lg`, `pill`), exportadas para FHD y HD.
- El texto terciario (`#6C727C`, contraste 3.7:1) solo se usa en tamaños grandes o información no esencial.
- La maqueta se revisa en dos tamaños (iPad y TV 1080p) antes de escribir código.
