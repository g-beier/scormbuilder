/** Mensagens rápidas para o usuário (sucesso/erro), mostradas por <Avisos/>. */
import { create } from "zustand";

export interface Aviso {
  id: number;
  tipo: "ok" | "erro" | "info";
  texto: string;
  /** Lista opcional (ex. avisos da importação). */
  detalhes?: string[];
}

let seq = 0;
export const useAvisos = create<{ avisos: Aviso[] }>(() => ({ avisos: [] }));

export function avisar(texto: string, tipo: Aviso["tipo"] = "info", detalhes?: string[]) {
  const aviso = { id: ++seq, tipo, texto, detalhes };
  useAvisos.setState((s) => ({ avisos: [...s.avisos, aviso] }));
  // Mensagens simples somem sozinhas; erros e listas ficam até fechar.
  if (tipo === "ok" && !detalhes) setTimeout(() => dispensar(aviso.id), 5000);
}

export function dispensar(id: number) {
  useAvisos.setState((s) => ({ avisos: s.avisos.filter((a) => a.id !== id) }));
}
