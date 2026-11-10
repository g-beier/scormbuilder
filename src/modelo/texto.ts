/**
 * Campos de texto simples (sem editor rico) que o motor insere via `innerHTML`.
 * O projeto guarda texto puro; o `data.js` leva o texto escapado. A importação
 * desfaz o escape para que a ida e volta seja idempotente.
 *
 * Não passam por aqui: campos ricos (já são HTML sanitizado) e campos que o motor
 * insere via `textContent` (`explica` do quiz, `contexto`).
 */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const DESESCAPES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'" };

/** Texto puro → texto seguro para `innerHTML` (escapa &, <, > e "). */
export function escaparHtml(texto: string): string {
  if (typeof texto !== "string") return texto;
  return texto.replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

/** Inverso de `escaparHtml` (passada única: `&amp;lt;` vira `&lt;`, não `<`). */
export function desescaparHtml(texto: string): string {
  if (typeof texto !== "string") return texto;
  return texto.replace(/&(amp|lt|gt|quot|#39|#x27);/gi, (m, nome: string) => DESESCAPES[nome.toLowerCase()] ?? m);
}
