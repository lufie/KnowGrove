# KnowGrove

[English](https://github.com/lufie/KnowGrove/blob/main/README.md) · [简体中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-CN.md) · [繁體中文](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.zh-TW.md) · [日本語](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ja.md) · [한국어](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ko.md) · [Deutsch](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.de.md) · [Français](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.fr.md) · **Español** · [Português (Brasil)](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.pt-BR.md) · [Русский](https://github.com/lufie/KnowGrove/blob/main/docs/locales/README.ru.md)

KnowGrove es un flujo de conocimiento local para quienes recopilan más rápido de lo que pueden organizar. Conserva las fuentes en el vault de Obsidian, extrae su estructura, las conecta con temas y evidencias y las convierte en resultados reutilizables.

Versión actual del código fuente: `2.8.30`

## Un flujo desde la fuente hasta el resultado

| Capturar | Procesar | Organizar | Crear |
| --- | --- | --- | --- |
| Guarda artículos, enlaces, audio/vídeo local, grabaciones e imágenes. | Extrae contenido web, convierte imágenes en Markdown estructurado y transcribe audio o vídeo. | Lee más tarde, gestiona propiedades y conecta temas, comentarios, bloques y evidencias. | Crea esquemas, informes, textos extensos y versiones por canal a partir de las fuentes elegidas. |

El vault sigue siendo la fuente de verdad. KnowGrove no recopila telemetría del cliente; solo las herramientas locales o los proveedores compatibles que elijas procesan el contenido correspondiente.

## Funciones principales

- **Leer más tarde:** una bandeja de entrada, filtros de no leído/leído y marcado opcional al llegar al final de la nota.
- **Captura desde navegador y móvil:** guarda artículos, vídeos, enlaces y notas de voz breves en el vault.
- **Procesamiento de contenido:** conserva las imágenes de los artículos, prioriza los subtítulos y usa transcripción local cuando no hay subtítulos.
- **Imagen a texto con IA:** convierte una imagen o todas las imágenes de una nota y coloca tablas y texto estructurado debajo de la imagen original. El proceso en segundo plano muestra fases reales, permite cancelar con seguridad y localizar el resultado.
- **Edición en vista previa como en Word:** mantiene el formato de títulos, listas, tareas, imágenes, bloques de código y tablas. Al eliminar líneas vacías de una selección, conserva o repara los límites de las tablas GFM para que sigan renderizándose en la vista previa y en lectura.
- **Captura rápida y recuperable:** crea y vuelve a leer una nota Markdown mínima que se puede abrir antes de entrar en la cola de procesamiento; la IA y los medios continúan en segundo plano.
- **Navegación en documentos largos:** mantiene accesibles el primer y el último encabezado y visible la acción para localizar el archivo, sin interceptar el desplazamiento del documento.
- **Gestión de propiedades:** revisa los cambios sugeridos antes de aplicarlos por lotes y no sobrescribe campos desconocidos.
- **Temas e investigación:** explora todos los temas y sus fuentes y organiza áreas, temas y preguntas de investigación.
- **Comentarios y referencias de bloques:** comenta el texto seleccionado y reutilízalo con las incrustaciones de bloques nativas de Obsidian.
- **Redacción basada en evidencias:** crea esquemas, informes, artículos extensos y versiones para distintos canales.
- **Limpieza segura de adjuntos:** solo sigue archivos que estuvieron referenciados y solicita confirmación antes de moverlos a la papelera de Obsidian.

## Idioma y datos

KnowGrove utiliza el idioma seleccionado en Obsidian. Nunca traduce ni modifica títulos, rutas, comentarios, áreas, temas, valores de propiedades, frontmatter, Bases ni contenido Markdown.

## Instalación

Busca e instala KnowGrove en **Ajustes → Complementos de la comunidad → Explorar**.

Para instalarlo manualmente, descarga `main.js`, `manifest.json` y `styles.css` de la última versión de GitHub, cópialos en `<vault>/.obsidian/plugins/knowgrove/`, recarga Obsidian y activa KnowGrove. No copies el `data.json` de otra persona.

Consulta [Privacidad](../../PRIVACY.md), [Seguridad](../../SECURITY.md) y la [licencia MIT](../../LICENSE).
