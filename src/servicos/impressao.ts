/** Abre a janela "PDF da leitura" (M7) com o conteúdo compilado do projeto. */
import { invoke } from "@tauri-apps/api/core";
import { compilarConteudo } from "../modelo/compilar";
import type { ConteudoV2, Projeto } from "../modelo/tipos";
import { emTauri } from "./ambiente";

export const CHAVE_IMPRESSAO = "scorm-builder:impressao";

export interface DadosImpressao {
  conteudo: ConteudoV2;
}

export async function abrirImpressao(projeto: Projeto): Promise<void> {
  const dados: DadosImpressao = { conteudo: compilarConteudo(projeto) };
  localStorage.setItem(CHAVE_IMPRESSAO, JSON.stringify(dados));
  if (emTauri()) {
    await invoke("abrir_impressao");
  } else {
    const w = window.open("/imprimir.html", "impressao");
    if (!w) throw new Error("O navegador bloqueou a nova janela. Permita pop-ups para este endereço.");
  }
}
