/**
 * Detecta se o front está rodando dentro do app Tauri ou só no navegador
 * (`npm run dev`). No navegador não há disco nem diálogos nativos: os
 * serviços falham com uma mensagem clara em vez de quebrar a tela.
 */
export function emTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const MSG_SO_NO_APP =
  "Este recurso só funciona no aplicativo instalado. No navegador, o projeto não é salvo em disco.";

/** Texto amigável de um erro vindo do invoke/diálogo (o Rust já manda pt-BR). */
export function mensagemDeErro(e: unknown): string {
  if (!emTauri()) return MSG_SO_NO_APP;
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return "Ocorreu um erro inesperado.";
}
