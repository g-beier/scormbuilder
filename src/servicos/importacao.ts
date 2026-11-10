/** Leitura do `js/data.js` de um pacote existente (comando Rust `ler_data_js`). */
import { invoke } from "@tauri-apps/api/core";

/** Lê `<pasta>/js/data.js` (UTF-8, até 5 MB). Erros em pt-BR. */
export function lerDataJs(pasta: string): Promise<string> {
  return invoke<string>("ler_data_js", { pasta });
}

/** Último segmento de um caminho (`/a/CTGESTAO_UD11_LEITURA2/` → `CTGESTAO_UD11_LEITURA2`). */
export function nomeDaPasta(caminho: string): string {
  return caminho.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
}
