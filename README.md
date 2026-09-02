# Tablero de Ausentismo y Deserción por Programa — UNIMINUTO Sede Tolima-Huila

Tablero de control interactivo construido a partir de
`3__Historico_Ausentismo_y_Deserción_STH_-_Programas_31-8-2026.xlsx`.

## Contenido

```
index.html      → estructura de la página
styles.css      → estilos (mismos tokens visuales que los demás tableros)
app.js          → filtros, agregación y gráficos (Chart.js)
data.json       → datos agregados por CU, programa y periodo
build_data.py   → script que genera data.json a partir del Excel fuente
```

## De dónde sale cada dato

El Excel trae dos hojas en formato ordenado (una fila por Centro Universitario,
Programa y Periodo): **"Ausentismo por Programa"** y **"Deserción por Programa"**.
`build_data.py`:

1. Suma Modalidad (no se usa como filtro, igual que en el tablero de CU) y agrega
   población + ausentes/desertores por (CU, Programa, Periodo).
2. Calcula además una serie por Centro Universitario (y el total de la Sede) sumando
   todos los programas — así se alimentan los gráficos de evolución y comparación.
3. Para cada programa calcula el promedio, la tendencia (pendiente de una regresión
   lineal simple) y los semestres activos, sobre el histórico completo (2010-1/2014-1
   a 2026-2 según la hoja).

## Filtros disponibles

- **Año** y **Semestre** — se combinan (ej. 2024+2025+2026 y Semestre 1 → solo
  2024-1, 2025-1, 2026-1).
- **Centro Universitario** — sin selección, la evolución muestra el total de la
  Sede; al elegir uno o más CU, se comparan esos.
- **Programa** — buscador de texto.

La tabla de detalle muestra los últimos 8 periodos por defecto; si filtras por Año
y/o Semestre, muestra exactamente los periodos que caen dentro de ese filtro.

## Actualizar los datos

1. Reemplaza la ruta `SRC` en `build_data.py` por el nuevo Excel.
2. `python3 build_data.py` (requiere `pip install openpyxl`).
3. Sube el nuevo `data.json` al repositorio.

## Publicar / actualizar en GitHub Pages

Mismo proceso que los tableros anteriores: sube estos archivos a un repositorio y
activa GitHub Pages en Settings → Pages.
