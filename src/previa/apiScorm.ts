/**
 * Mock da API SCORM 1.2 para a prévia ("o Moodle simulado"). Fica no app (pai do
 * iframe); o iframe isolado não o alcança. A `public/previa/ponte.js`, dentro do
 * iframe, expõe um `window.API` com cache local e repassa cada chamada por
 * `postMessage` (ver ponteScorm.ts). Os dados ficam em memória, separados por
 * chave de prévia ("previa-<id do projeto>").
 *
 * Cada carga do iframe recebe uma sessão nova (`novaSessao`). Reiniciar o
 * progresso revoga as sessões abertas: a gravação que o documento antigo faz no
 * `beforeunload` é ignorada e não ressuscita o progresso apagado.
 */

export const LIMITE_SUSPEND_DATA = 4096;

/** Interface da API SCORM 1.2 (RTE), como o LMS expõe em `window.API`. */
export interface ApiScorm12 {
  LMSInitialize(arg: string): string;
  LMSFinish(arg: string): string;
  LMSGetValue(el: string): string;
  LMSSetValue(el: string, valor: string): string;
  LMSCommit(arg: string): string;
  LMSGetLastError(): string;
  LMSGetErrorString(codigo: string): string;
  LMSGetDiagnostic(codigo: string): string;
}

export interface SituacaoScorm {
  chave: string | null;
  conectado: boolean;
  lessonStatus: string;
  lessonLocation: string;
  suspendData: string;
  interacoes: number;
  /** ms desde epoch do último LMSCommit (ou LMSFinish) com dados, ou null. */
  ultimaGravacao: number | null;
}

const ERROS: Record<string, string> = {
  "0": "No error",
  "101": "General exception",
  "201": "Invalid argument error",
  "202": "Element cannot have children",
  "203": "Element not an array - cannot have count",
  "301": "Not initialized",
  "401": "Not implemented error",
  "402": "Invalid set value, element is a keyword",
  "403": "Element is read only",
  "404": "Element is write only",
  "405": "Incorrect data type",
};

const STATUS_VALIDOS = ["passed", "completed", "failed", "incomplete", "browsed", "not attempted"];
const SO_LEITURA = new Set([
  "cmi.core.student_id",
  "cmi.core.student_name",
  "cmi.core.credit",
  "cmi.core.entry",
  "cmi.core.total_time",
  "cmi.core.lesson_mode",
  "cmi.launch_data",
  "cmi.interactions._count",
  "cmi.core._children",
  "cmi.interactions._children",
]);
const SO_ESCRITA = new Set(["cmi.core.exit", "cmi.core.session_time"]);
const RE_INTERACAO = /^cmi\.interactions\.(\d+)\.(id|type|student_response|result|time|weighting|latency|correct_responses\.\d+\.pattern|objectives\.\d+\.id)$/;

type Dados = Record<string, string>;

function contarInteracoes(d: Dados): number {
  let max = -1;
  for (const k of Object.keys(d)) {
    const m = /^cmi\.interactions\.(\d+)\./.exec(k);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/**
 * Respostas fixas do LMS simulado a `LMSGetValue` (dependem só dos dados gravados).
 * A ponte do iframe recebe uma cópia para responder sem esperar o app.
 */
export function valoresFixos(d: Dados): Record<string, string> {
  return {
    "cmi.core._children":
      "student_id,student_name,lesson_location,credit,lesson_status,entry,score,total_time,lesson_mode,exit,session_time",
    "cmi.interactions._children": "id,objectives,time,type,correct_responses,weighting,student_response,result,latency",
    "cmi.core.student_id": "previa",
    "cmi.core.student_name": "Prévia, Autor",
    "cmi.core.credit": "credit",
    "cmi.core.lesson_mode": "normal",
    "cmi.core.entry": d["cmi.suspend_data"] ? "resume" : "ab-initio",
    "cmi.core.total_time": "0000:00:00",
    "cmi.launch_data": "",
  };
}

export interface MockScorm {
  /** O que a ponte do iframe precisa para responder às leituras do motor. */
  leituraInicial(chave: string): { dados: Dados; fixos: Record<string, string> };
  /** Cria uma sessão (objeto `API`) para uma carga do iframe, gravando em `chave`. */
  novaSessao(chave: string): ApiScorm12;
  /** Apaga os dados de `chave` e revoga as sessões abertas nela. */
  reiniciar(chave: string): void;
  /** Escolhe qual chave o painel observa. */
  observar(chave: string | null): void;
  situacao(): SituacaoScorm;
  subscribe(ouvinte: () => void): () => void;
  /** Cópia dos dados gravados (para testes e depuração). */
  dados(chave: string): Dados;
}

export function criarMockScorm(agora: () => number = Date.now): MockScorm {
  const store = new Map<string, Dados>();
  const commits = new Map<string, number>();
  const geracao = new Map<string, number>();
  const ouvintes = new Set<() => void>();
  let observada: string | null = null;
  let conectados = new Map<string, number>();
  let snap: SituacaoScorm = calcular();

  function calcular(): SituacaoScorm {
    const d = (observada && store.get(observada)) || {};
    return {
      chave: observada,
      conectado: !!observada && (conectados.get(observada) ?? 0) > 0,
      lessonStatus: d["cmi.core.lesson_status"] ?? "not attempted",
      lessonLocation: d["cmi.core.lesson_location"] ?? "",
      suspendData: d["cmi.suspend_data"] ?? "",
      interacoes: contarInteracoes(d),
      ultimaGravacao: observada ? (commits.get(observada) ?? null) : null,
    };
  }

  function avisar(chave: string) {
    if (chave !== observada) return;
    snap = calcular();
    ouvintes.forEach((f) => f());
  }

  function dadosDe(chave: string): Dados {
    let d = store.get(chave);
    if (!d) store.set(chave, (d = {}));
    return d;
  }

  function novaSessao(chave: string): ApiScorm12 {
    const minhaGeracao = geracao.get(chave) ?? 0;
    let iniciada = false;
    let encerrada = false;
    let erro = "0";
    const revogada = () => (geracao.get(chave) ?? 0) !== minhaGeracao;
    const ok = () => ((erro = "0"), "true");
    const falha = (c: string) => ((erro = c), "false");

    const api: ApiScorm12 = {
      LMSInitialize(arg) {
        if (arg !== "" && arg != null) return falha("201");
        if (iniciada && !encerrada) return falha("101");
        if (revogada()) return falha("101");
        iniciada = true;
        encerrada = false;
        conectados.set(chave, (conectados.get(chave) ?? 0) + 1);
        const d = dadosDe(chave);
        if (!d["cmi.core.lesson_status"]) d["cmi.core.lesson_status"] = "not attempted";
        avisar(chave);
        return ok();
      },
      LMSFinish(arg) {
        if (arg !== "" && arg != null) return falha("201");
        if (!iniciada || encerrada) return falha("301");
        encerrada = true;
        conectados.set(chave, Math.max(0, (conectados.get(chave) ?? 1) - 1));
        if (!revogada()) commits.set(chave, agora());
        avisar(chave);
        return ok();
      },
      LMSGetValue(el) {
        if (!iniciada || encerrada) return (falha("301"), "");
        if (revogada()) return (falha("101"), "");
        const d = dadosDe(chave);
        if (SO_ESCRITA.has(el) || RE_INTERACAO.test(el)) return (falha("404"), "");
        if (el === "cmi.interactions._count") return (ok(), String(contarInteracoes(d)));
        const fixos = valoresFixos(d);
        if (Object.prototype.hasOwnProperty.call(fixos, el)) return (ok(), fixos[el]);
        if (!/^cmi\./.test(el)) return (falha("201"), "");
        ok();
        return d[el] ?? "";
      },
      LMSSetValue(el, valor) {
        if (!iniciada || encerrada) return falha("301");
        if (revogada()) return falha("101");
        const v = String(valor);
        if (/\._(children|count)$/.test(el)) return falha("402");
        if (SO_LEITURA.has(el)) return falha("403");
        if (el === "cmi.core.lesson_status" && !STATUS_VALIDOS.includes(v)) return falha("405");
        if (el === "cmi.suspend_data" && v.length > LIMITE_SUSPEND_DATA) return falha("405");
        if (el === "cmi.core.lesson_location" && v.length > 255) return falha("405");
        if (el === "cmi.core.session_time" && !/^\d{2,4}:\d{2}:\d{2}(\.\d{1,2})?$/.test(v)) return falha("405");
        if (el === "cmi.core.exit" && !["", "time-out", "suspend", "logout"].includes(v)) return falha("405");
        if (!/^cmi\./.test(el)) return falha("201");
        const m = RE_INTERACAO.exec(el);
        if (m) {
          const d = dadosDe(chave);
          const n = Number(m[1]);
          if (n > contarInteracoes(d)) return falha("201"); // índices em sequência
        }
        dadosDe(chave)[el] = v;
        avisar(chave);
        return ok();
      },
      LMSCommit(arg) {
        if (arg !== "" && arg != null) return falha("201");
        if (!iniciada || encerrada) return falha("301");
        if (revogada()) return falha("101");
        commits.set(chave, agora());
        avisar(chave);
        return ok();
      },
      LMSGetLastError: () => erro,
      LMSGetErrorString: (c) => ERROS[String(c)] ?? "",
      LMSGetDiagnostic: (c) => ERROS[String(c || erro)] ?? "",
    };
    return api;
  }

  return {
    novaSessao,
    leituraInicial(chave) {
      const d = { ...(store.get(chave) ?? {}) };
      if (!d["cmi.core.lesson_status"]) d["cmi.core.lesson_status"] = "not attempted";
      return { dados: d, fixos: valoresFixos(d) };
    },
    reiniciar(chave) {
      geracao.set(chave, (geracao.get(chave) ?? 0) + 1);
      store.delete(chave);
      commits.delete(chave);
      conectados = new Map([...conectados].filter(([k]) => k !== chave));
      avisar(chave);
    },
    observar(chave) {
      observada = chave;
      snap = calcular();
      ouvintes.forEach((f) => f());
    },
    situacao: () => snap,
    subscribe(f) {
      ouvintes.add(f);
      return () => void ouvintes.delete(f);
    },
    dados: (chave) => ({ ...(store.get(chave) ?? {}) }),
  };
}

/** Instância única do app (a prévia é uma só). */
export const mockScorm = criarMockScorm();
