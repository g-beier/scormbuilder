/**
 * Lógica do Web Worker que executa o `data.js` importado (ver `avaliarIsolado.ts`).
 * Separada do arquivo do worker para poder ser testada no vitest.
 */
import { avaliarDataJsDireto } from "../modelo/avaliar";

/** Pedido do app ao worker. */
export interface PedidoAvaliacao {
  fonte: string;
}

/** Resposta do worker: o CONTEUDO já clonado como JSON, ou a mensagem de erro (pt-BR). */
export type RespostaAvaliacao = { ok: true; valor: unknown } | { ok: false; erro: string };

/**
 * APIs do worker que o data.js não precisa e que dariam saída para a rede ou
 * acesso a armazenamento da origem do app. São sombreadas antes da execução,
 * inclusive para quem alcança o escopo global por `constructor.constructor`.
 */
export const APIS_BLOQUEADAS = [
  "fetch",
  "XMLHttpRequest",
  "WebSocket",
  "WebTransport",
  "EventSource",
  "importScripts",
  "indexedDB",
  "caches",
  "Worker",
  "SharedWorker",
  "BroadcastChannel",
  "Request",
  "navigator",
  "postMessage",
] as const;

export function bloquearApis(escopo: object): void {
  for (const nome of APIS_BLOQUEADAS) {
    try {
      Object.defineProperty(escopo, nome, { value: undefined, writable: false, configurable: false });
    } catch {
      /* propriedade não configurável: segue */
    }
  }
}

/** Executa o data.js e devolve uma cópia JSON do CONTEUDO (sem funções nem protótipos). */
export function avaliarParaResposta(fonte: string): RespostaAvaliacao {
  try {
    const valor = avaliarDataJsDireto(fonte);
    const json = JSON.stringify(valor);
    return { ok: true, valor: json === undefined ? undefined : JSON.parse(json) };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) };
  }
}
