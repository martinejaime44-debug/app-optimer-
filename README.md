# NÍTIDO — Compresor de videos 1080p

App estática de compresión local de video con FFmpeg WebAssembly.

## Características
- Objetivo de tamaño ajustable de 50 MB a 500 MB.
- Conserva hasta 1080p cuando la fuente lo permite.
- MP4 H.264 + AAC, descarga local.
- Compresión 100% dentro del navegador; no se suben videos a un servidor.
- Ajustes de velocidad/calidad, progreso, cancelación y reintentos cuando se supera el tamaño máximo.

## Ejecutar
```bash
npm install
npm run dev
```

## Publicar
Un workflow de GitHub Actions compila y publica automáticamente en la rama `gh-pages`.
En Settings → Pages del repositorio, elegir **Deploy from a branch**, branch **gh-pages**, folder **/(root)**.
URL prevista: https://martinejaime44-debug.github.io/app-optimer-/

## Limitaciones
La compresión H.264 es con pérdida: nunca se garantiza calidad idéntica ni un tamaño exacto.
FFmpeg WASM exige bastante RAM y puede fallar con archivos grandes; la interfaz limita archivos de más de 1 GB.
La carga inicial requiere internet para FFmpeg WASM. Para videos de producción grandes, usar FFmpeg nativo.
