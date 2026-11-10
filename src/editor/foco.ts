/**
 * Ligação entre os problemas do `validar()` e os campos da tela.
 * Cada campo focável tem `data-foco="<slideId>|<blocoId>|<campo>"`, com o
 * mesmo caminho de campo que o validador usa (ex. `perguntas[0].opcoes[1]`).
 */
import { create } from "zustand";

export function chaveFoco(slideId: string, blocoId: string | undefined, campo: string): string {
  return `${slideId}|${blocoId ?? ""}|${campo}`;
}

/** Caminhos do mais específico ao mais geral: `a[0].b[1]` → `a[0].b[1]`, `a[0].b`, `a[0]`, `a`, ``. */
export function caminhosDoCampo(campo: string): string[] {
  const out = [campo];
  let c = campo;
  while (c) {
    const m = /^(.*?)(?:\[\d+\]|\.[^.[\]]+)$/.exec(c);
    c = m ? m[1] : "";
    out.push(c);
  }
  return out;
}

/** Pedido de foco pendente (o FormSlide atende depois de renderizar). */
interface PedidoFoco {
  slideId: string;
  blocoId?: string;
  campo?: string;
  n: number;
}
export const usePedidoFoco = create<{ pedido: PedidoFoco | null }>(() => ({ pedido: null }));

export function pedirFoco(slideId: string, blocoId?: string, campo?: string) {
  usePedidoFoco.setState((s) => ({ pedido: { slideId, blocoId, campo, n: (s.pedido?.n ?? 0) + 1 } }));
}

/** Foca o campo mais específico que existir na página. Devolve se conseguiu. */
export function focarCampo(raiz: ParentNode, slideId: string, blocoId?: string, campo = ""): boolean {
  for (const c of caminhosDoCampo(campo)) {
    const el = raiz.querySelector<HTMLElement>(`[data-foco="${CSS.escape(chaveFoco(slideId, blocoId, c))}"]`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      el.focus({ preventScroll: true });
      return true;
    }
  }
  if (blocoId) return focarCampo(raiz, slideId, undefined, "");
  return false;
}
