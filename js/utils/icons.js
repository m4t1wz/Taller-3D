/** Reemplaza los <i data-lucide="..."> dentro de `root` por SVG de Lucide. */
export function renderIcons(root = document) {
  if (window.lucide) {
    window.lucide.createIcons({ root });
  }
}
