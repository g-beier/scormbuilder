/**
 * Executa o `data.js` importado fora do documento do app, num Web Worker
 * descartável. O código de terceiros não alcança o `window` do app nem os
 * comandos do Tauri, e um laço infinito é interrompido pelo tempo limite.
 *
 * Por que Worker, e não iframe `sandbox`: o iframe `srcdoc` herda a CSP do app,
 * que não permite `eval`/`new Function` (seria preciso `'unsafe-eval'` no app
 * inteiro), e um laço infinito num iframe trava a janela, porque roda na mesma
 * thread. O worker é carregado do próprio app (sem CSP de documento) e pode ser
 * encerrado com `terminate()`.
 */
import { ErroImportacao, type Avaliador } from "../modelo/avaliar";
import type { RespostaAvaliacao } from "./avaliadorNucleo";
import AvaliadorWorker from "./avaliador.worker.ts?worker";

/** O que este módulo usa de um Worker (para injetar um falso nos testes). */
export interface WorkerMinimo {
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
}

export interface OpcoesAvaliacaoIsolada {
  criarWorker?: () => WorkerMinimo;
  limiteMs?: number;
}

export const LIMITE_AVALIACAO_MS = 3000;

export function avaliarDataJsIsolado(fonte: string, opcoes: OpcoesAvaliacaoIsolada = {}): Promise<unknown> {
  const { criarWorker = () => new AvaliadorWorker(), limiteMs = LIMITE_AVALIACAO_MS } = opcoes;
  return new Promise((resolve, reject) => {
    let worker: WorkerMinimo;
    try {
      worker = criarWorker();
    } catch (e) {
      reject(new ErroImportacao(`Não foi possível preparar a leitura do data.js: ${(e as Error).message}`));
      return;
    }
    let terminou = false;
    const encerrar = () => {
      terminou = true;
      clearTimeout(relogio);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    };
    const relogio = setTimeout(() => {
      if (terminou) return;
      encerrar();
      reject(
        new ErroImportacao(
          `A leitura do data.js passou de ${Math.round(limiteMs / 1000)} segundos e foi interrompida. O arquivo pode estar corrompido.`,
        ),
      );
    }, limiteMs);
    worker.onmessage = (e) => {
      if (terminou) return;
      encerrar();
      const r = e.data as RespostaAvaliacao | null;
      if (r && r.ok === true) resolve(r.valor);
      else reject(new ErroImportacao(r && r.ok === false ? r.erro : "Não foi possível ler o data.js."));
    };
    worker.onerror = (e) => {
      if (terminou) return;
      encerrar();
      reject(new ErroImportacao(`Não foi possível ler o data.js: ${e.message || "erro desconhecido"}`));
    };
    worker.postMessage({ fonte });
  });
}

/** Avaliador padrão do app. */
export const avaliarIsolado: Avaliador = (fonte) => avaliarDataJsIsolado(fonte);
