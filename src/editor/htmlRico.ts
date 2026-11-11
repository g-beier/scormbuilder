/**
 * Regras puras do texto rico: o que o motor aceita é só <strong>, <em> e
 * <a href target="_blank" rel="noopener">. O TipTap já restringe o esquema;
 * estas funções tratam as bordas (URL digitada, colagem, saída do editor).
 */

/** Completa e valida o endereço do link. `null` = endereço inaceitável. */
export function normalizarUrl(bruto: string): string | null {
  const url = bruto.trim();
  if (!url) return null;
  if (/^(https?:\/\/|mailto:)/i.test(url)) return /\s/.test(url) ? null : url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null; // javascript:, file:, ftp:…
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`;
  if (/^[^\s/]+\.[^\s]+$/.test(url)) return `https://${url}`;
  return null;
}

/** Só http(s) e mailto viram link (vale para colagem e autolink; a mesma regra filtra importação e compilação). */
export { urlPermitida } from "../modelo/sanitizar";

/** Antes de colar: tira blocos (parágrafos, títulos, listas) e quebras, que o motor não aceita aqui. */
export function limparColagemHtml(html: string): string {
  return html
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|pre)>/gi, " ")
    .replace(/<(p|div|h[1-6]|ul|ol|li|blockquote|table|tbody|thead|tr|td|th|pre)\b[^>]*>/gi, "")
    .replace(/<\/(ul|ol|table|tbody|thead|td|th)>/gi, " ");
}

/** Texto puro colado: quebras de linha viram espaço. */
export function limparColagemTexto(texto: string): string {
  return texto.replace(/\s*\r?\n+\s*/g, " ");
}

/**
 * Saída do editor no formato do motor. No modo de parágrafos, um documento
 * vazio (`<p></p>`) vira "". Links sempre com target/rel corretos.
 */
export function normalizarSaida(html: string, inline: boolean): string {
  let out = html;
  if (!inline && /^(<p><\/p>)*$/.test(out)) return "";
  out = out.replace(/<a\b([^>]*)>/gi, (_, attrs: string) => {
    const href = /\bhref\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? "";
    return `<a href="${href}" target="_blank" rel="noopener">`;
  });
  return out;
}
