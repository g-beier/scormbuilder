/**
 * Lado do app da ponte com o iframe da prévia (o outro lado é `public/previa/ponte.js`).
 *
 * O iframe tem origem opaca: não há acesso direto em nenhum sentido, só
 * `postMessage`. Mensagens do iframe para o app:
 * - `scorm`: chamada à API SCORM simulada (`LMSInitialize`, `LMSSetValue`, `LMSCommit`, `LMSFinish`);
 * - `pronto`: o motor abriu (`tela`, `total`);
 * - `tela`: a tela mudou (ou resposta a um pedido `ir`, com o mesmo `pedido`);
 * - `falha`: o motor não abriu (`mensagem`).
 * Do app para o iframe: `ir` (`tela`, `pedido`).
 *
 * Toda mensagem leva `cev: "previa"` e a `sessao` da carga. Cada carga do iframe
 * abre uma sessão nova no mock; reiniciar o progresso revoga as anteriores (ver
 * apiScorm.ts), então o que o documento antigo grava ao sair é ignorado.
 */
import type { ApiScorm12, MockScorm } from "./apiScorm";
import type { EstadoScormInicial } from "./montarSrcdoc";

export const MARCA = "previa";

const METODOS = ["LMSInitialize", "LMSSetValue", "LMSCommit", "LMSFinish"] as const;
export type MetodoRepassado = (typeof METODOS)[number];

interface Base {
  cev: typeof MARCA;
  sessao: string;
}
export type MensagemDaPrevia =
  | (Base & { tipo: "scorm"; metodo: MetodoRepassado; args: string[] })
  | (Base & { tipo: "pronto"; tela: number; total: number })
  | (Base & { tipo: "tela"; tela: number; pedido?: number })
  | (Base & { tipo: "falha"; mensagem: string });

export interface PedidoIr {
  cev: typeof MARCA;
  tipo: "ir";
  tela: number;
  pedido: number;
}

const inteiro = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Valida a forma de uma mensagem vinda do iframe (conteúdo de terceiros: nada é presumido). */
export function lerMensagem(data: unknown): MensagemDaPrevia | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  if (m.cev !== MARCA || typeof m.sessao !== "string") return null;
  const base = { cev: MARCA, sessao: m.sessao } as const;
  switch (m.tipo) {
    case "scorm": {
      const metodo = METODOS.find((x) => x === m.metodo);
      if (!metodo || !Array.isArray(m.args) || m.args.length > 2) return null;
      return { ...base, tipo: "scorm", metodo, args: m.args.map((a) => String(a)) };
    }
    case "pronto":
      return inteiro(m.tela) && inteiro(m.total) ? { ...base, tipo: "pronto", tela: m.tela, total: m.total } : null;
    case "tela":
      if (!inteiro(m.tela)) return null;
      return inteiro(m.pedido) ? { ...base, tipo: "tela", tela: m.tela, pedido: m.pedido } : { ...base, tipo: "tela", tela: m.tela };
    case "falha":
      return { ...base, tipo: "falha", mensagem: typeof m.mensagem === "string" ? m.mensagem.slice(0, 500) : "" };
  }
  return null;
}

export function pedidoIr(tela: number, pedido: number): PedidoIr {
  return { cev: MARCA, tipo: "ir", tela, pedido };
}

export interface PonteScorm {
  /** Sessão para uma nova carga do iframe e o estado que vai no srcdoc. */
  abrirSessao(chave: string): { sessao: string; estado: EstadoScormInicial };
  /** Repassa uma chamada `scorm` ao mock. Sessão desconhecida: ignorada. */
  repassar(m: Extract<MensagemDaPrevia, { tipo: "scorm" }>): void;
}

/** Quantas sessões antigas continuam recebendo (o `LMSFinish` do documento que sai). */
const SESSOES_GUARDADAS = 4;

export function criarPonteScorm(mock: MockScorm, gerarId: () => string = () => crypto.randomUUID()): PonteScorm {
  const sessoes = new Map<string, ApiScorm12>();
  return {
    abrirSessao(chave) {
      const sessao = gerarId();
      sessoes.set(sessao, mock.novaSessao(chave));
      while (sessoes.size > SESSOES_GUARDADAS) sessoes.delete(sessoes.keys().next().value as string);
      return { sessao, estado: mock.leituraInicial(chave) };
    },
    repassar(m) {
      const api = sessoes.get(m.sessao);
      if (!api) return;
      switch (m.metodo) {
        case "LMSInitialize":
          api.LMSInitialize("");
          break;
        case "LMSSetValue":
          api.LMSSetValue(m.args[0] ?? "", m.args[1] ?? "");
          break;
        case "LMSCommit":
          api.LMSCommit("");
          break;
        case "LMSFinish":
          api.LMSFinish("");
          break;
      }
    },
  };
}
