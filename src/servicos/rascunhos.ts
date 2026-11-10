/**
 * Wrappers tipados dos comandos Rust de rascunhos e arquivos .cevscorm
 * (`src-tauri/src/projetos.rs`). Os erros chegam como string em pt-BR,
 * prontos para mostrar ao usuário.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Projeto } from "../modelo/tipos";

/** Espelha `ResumoRascunho` do Rust (camelCase). */
export interface ResumoRascunho {
  id: string;
  titulo: string;
  curso: string;
  /** Número da UD (0 = não informado). */
  ud: number;
  /** ISO 8601. */
  atualizadoEm: string;
  /** Quantidade de slides do projeto. */
  telas: number;
}

export function salvarRascunho(projeto: Projeto): Promise<ResumoRascunho> {
  return invoke<ResumoRascunho>("salvar_rascunho", { projeto });
}

/** Do mais recente para o mais antigo; arquivos corrompidos são ignorados. */
export function listarRascunhos(): Promise<ResumoRascunho[]> {
  return invoke<ResumoRascunho[]>("listar_rascunhos");
}

export function abrirRascunho(id: string): Promise<Projeto> {
  return invoke<Projeto>("abrir_rascunho", { id });
}

/** Não confirma: a confirmação é responsabilidade da UI. */
export function excluirRascunho(id: string): Promise<void> {
  return invoke<void>("excluir_rascunho", { id });
}

/**
 * Grava o projeto em `caminho` (vindo do diálogo "Salvar como…").
 * Acrescenta `.cevscorm` se faltar e devolve o caminho final.
 */
export function salvarArquivo(caminho: string, projeto: Projeto): Promise<string> {
  return invoke<string>("salvar_arquivo", { caminho, projeto });
}

export function abrirArquivo(caminho: string): Promise<Projeto> {
  return invoke<Projeto>("abrir_arquivo", { caminho });
}

/** Filtro para os diálogos open/save do `@tauri-apps/plugin-dialog`. */
export const FILTRO_CEVSCORM = [{ name: "Projeto SCORM Builder", extensions: ["cevscorm"] }];
