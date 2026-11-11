/**
 * Execução de um `data.js` para obter o objeto CONTEUDO.
 *
 * `avaliarDataJsDireto` roda o código **no contexto de quem chama**: não é
 * isolamento de segurança (o código escapa com `({}).constructor.constructor`).
 * No app, ela só é chamada dentro do Web Worker de `servicos/avaliarIsolado.ts`.
 * Nos testes (vitest), é usada diretamente.
 */

export class ErroImportacao extends Error {}

/** Avalia o texto de um data.js e devolve o CONTEUDO (assíncrono: pode rodar isolado). */
export type Avaliador = (fonte: string) => Promise<unknown>;

/** Nomes globais sombreados durante a avaliação do data.js. */
const SOMBRAS = ["window", "self", "globalThis", "top", "parent", "frames", "document", "CONTEUDO"];

/**
 * Executa o data.js com um `window` falso e devolve o CONTEUDO.
 * Aceita `window.CONTEUDO = …`, `var CONTEUDO = …` e `CONTEUDO = …`.
 */
export function avaliarDataJsDireto(fonte: string): unknown {
  const falso: Record<string, unknown> = {};
  const corpoTexto = `"use strict";\n${fonte}\n;return (typeof CONTEUDO !== "undefined" && CONTEUDO) || window.CONTEUDO;`;
  let corpo: (...args: unknown[]) => unknown;
  try {
    corpo = new Function(...SOMBRAS, corpoTexto) as (...args: unknown[]) => unknown;
  } catch {
    // `const/let CONTEUDO` colide com o parâmetro sombra: tenta sem ele.
    try {
      corpo = new Function(...SOMBRAS.slice(0, -1), corpoTexto) as (...args: unknown[]) => unknown;
    } catch (e) {
      throw new ErroImportacao(`O arquivo data.js tem um erro de sintaxe: ${(e as Error).message}`);
    }
  }
  try {
    // window, self, globalThis, top, parent, frames → o mesmo objeto falso
    return corpo.call(undefined, falso, falso, falso, falso, falso, falso, undefined, undefined);
  } catch (e) {
    throw new ErroImportacao(`Não foi possível ler o data.js: ${(e as Error).message}`);
  }
}

/** Avaliador direto, sem isolamento (testes). */
export const avaliarSemIsolamento: Avaliador = async (fonte) => avaliarDataJsDireto(fonte);
