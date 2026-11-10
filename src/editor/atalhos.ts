/**
 * Cmd/Ctrl+Z desfaz e Cmd/Ctrl+Shift+Z (ou Ctrl+Y) refaz o projeto.
 *
 * Decisão: dentro de um campo de texto (input, textarea, editor rico) o
 * atalho NÃO é interceptado: o campo usa o próprio desfazer, que conhece o
 * cursor e a seleção. O desfazer do projeto vale fora dos campos (depois de
 * Esc ou de clicar fora) e pelos botões Desfazer/Refazer da barra, que
 * sempre desfazem o projeto inteiro.
 */
import { desfazer, refazer } from "../estado/projeto";

export function eCampoDeTexto(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return ["text", "search", "url", "email", "number", "tel", "password", ""].includes(el.type);
  }
  return false;
}

export function tratarAtalhoDesfazer(e: KeyboardEvent): boolean {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || e.altKey) return false;
  const k = e.key.toLowerCase();
  const eDesfazer = k === "z" && !e.shiftKey;
  const eRefazer = (k === "z" && e.shiftKey) || (k === "y" && e.ctrlKey && !e.metaKey);
  if (!eDesfazer && !eRefazer) return false;
  if (eCampoDeTexto(e.target)) return false;
  e.preventDefault();
  if (eDesfazer) desfazer();
  else refazer();
  return true;
}

/**
 * Esc dentro de um campo leva o foco ao título do bloco (ou da tela), para o
 * próximo ⌘Z desfazer o projeto, sem perder o lugar na navegação por teclado.
 */
export function tratarEsc(e: KeyboardEvent) {
  if (e.key !== "Escape" || e.defaultPrevented) return;
  const el = e.target as HTMLElement;
  if (!eCampoDeTexto(el) || el.closest("dialog")) return;
  const alvo =
    el.closest("[data-bloco]")?.querySelector<HTMLElement>(".bloco-nome") ??
    document.querySelector<HTMLElement>(".form-slide-titulo");
  if (alvo) alvo.focus();
  else el.blur();
}
