/**
 * Wrappers tipados da exportação do pacote e das preferências
 * (`src-tauri/src/exportar.rs`). Erros chegam em pt-BR; o erro de alvo já
 * existente vem com o prefixo `JA_EXISTE:` para a UI pedir confirmação.
 */
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

export type FormatoExportacao = "pasta" | "zip" | "pdf";

/** Espelha `EntradaExportacao` do Rust (camelCase). */
export interface EntradaExportacao {
  /** `CURSO_UD<n>_<ATIVIDADE><n>`, só `[A-Z0-9_]`. */
  nomePacote: string;
  titulo: string;
  /** Texto completo do `js/data.js` (de `compilarDataJs`). */
  dataJs: string;
}

/** Espelha `ResultadoExportacao` do Rust. */
export interface ResultadoExportacao {
  /** Pasta do pacote ou arquivo .zip gerado. */
  caminho: string;
  /** Arquivos do pacote (inclui o imsmanifest.xml). */
  arquivos: number;
  /** Soma dos arquivos (pasta) ou tamanho do .zip. */
  bytes: number;
}

/** Espelha `Preferencias` do Rust; campos ausentes = não definidos. */
export interface Preferencias {
  ultimoDestino?: string;
  pastaEadScorm?: string;
}

export const PREFIXO_JA_EXISTE = "JA_EXISTE:";

/**
 * Exporta para `<destino>/<nomePacote>/` (pasta) ou `<destino>/<nomePacote>.zip`.
 * Se o alvo existir e `sobrescrever` for falso, rejeita com `JA_EXISTE:…`
 * (use `jaExiste`/`mensagemJaExiste`).
 */
export function exportarPacote(
  entrada: EntradaExportacao,
  destino: string,
  formato: FormatoExportacao,
  sobrescrever = false,
): Promise<ResultadoExportacao> {
  return invoke<ResultadoExportacao>("exportar_pacote", { entrada, destino, formato, sobrescrever });
}

/**
 * Gera `<destino>/<nomePacote>.pdf`, o PDF da leitura (M7): marcado (PDF/UA-1),
 * compilado pelo Typst no backend a partir de `fonte` (de `gerarTypst`).
 */
export function exportarPdf(
  entrada: { nomePacote: string; fonte: string },
  destino: string,
  sobrescrever = false,
): Promise<ResultadoExportacao> {
  return invoke<ResultadoExportacao>("exportar_pdf", { entrada, destino, sobrescrever });
}

export function lerPreferencias(): Promise<Preferencias> {
  return invoke<Preferencias>("ler_preferencias");
}

export function salvarPreferencias(preferencias: Preferencias): Promise<void> {
  return invoke<void>("salvar_preferencias", { preferencias });
}

/** O erro indica que o pacote já existe no destino (pedir confirmação)? */
export function jaExiste(erro: unknown): erro is string {
  return typeof erro === "string" && erro.startsWith(PREFIXO_JA_EXISTE);
}

/** Mensagem do erro JA_EXISTE sem o prefixo (pronta para a confirmação). */
export function mensagemJaExiste(erro: string): string {
  return erro.slice(PREFIXO_JA_EXISTE.length).trim();
}

/** Bytes em texto curto pt-BR: "980 bytes", "12,3 KB", "1,4 MB". */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const kb = bytes / 1024;
  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (kb < 1024) return `${fmt(kb)} KB`;
  return `${fmt(kb / 1024)} MB`;
}

/** Junta pasta-mãe e nome com o separador que a pasta já usa. */
export function juntarCaminho(pasta: string, nome: string): string {
  const sep = pasta.includes("\\") && !pasta.includes("/") ? "\\" : "/";
  return pasta.replace(/[\\/]+$/, "") + sep + nome;
}

/** Diálogo nativo de escolha de pasta; `null` = cancelou. */
export async function escolherPasta(titulo: string, padrao?: string): Promise<string | null> {
  const r = await open({ multiple: false, directory: true, title: titulo, defaultPath: padrao });
  return typeof r === "string" ? r : null;
}

/** Abre o Finder (Explorer) com o pacote selecionado. */
export function mostrarNoFinder(caminho: string): Promise<void> {
  return revealItemInDir(caminho);
}
