// @vitest-environment jsdom
/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { criarMockScorm } from "./apiScorm";
import { ID_DADOS } from "./montarSrcdoc";
import { criarPonteScorm, lerMensagem, pedidoIr, type MensagemDaPrevia } from "./ponteScorm";

const codigoPonte = readFileSync(join(process.cwd(), "public", "previa", "ponte.js"), "utf8");

describe("lerMensagem", () => {
  it("aceita só mensagens da prévia com forma válida", () => {
    expect(lerMensagem(null)).toBeNull();
    expect(lerMensagem({ tipo: "pronto", tela: 0, total: 1 })).toBeNull();
    expect(lerMensagem({ cev: "previa", sessao: "s", tipo: "pronto", tela: -1, total: 1 })).toBeNull();
    expect(lerMensagem({ cev: "previa", sessao: "s", tipo: "scorm", metodo: "eval", args: [] })).toBeNull();
    expect(lerMensagem({ cev: "previa", sessao: "s", tipo: "scorm", metodo: "LMSSetValue", args: ["a", 1] })).toEqual({
      cev: "previa",
      sessao: "s",
      tipo: "scorm",
      metodo: "LMSSetValue",
      args: ["a", "1"],
    });
    expect(lerMensagem({ cev: "previa", sessao: "s", tipo: "tela", tela: 2, pedido: 7 })).toMatchObject({ tela: 2, pedido: 7 });
    expect(lerMensagem({ cev: "previa", sessao: "s", tipo: "falha", mensagem: 3 })).toMatchObject({ mensagem: "" });
  });
});

describe("criarPonteScorm", () => {
  it("repassa as chamadas ao mock pela sessão e ignora sessão desconhecida", () => {
    const mock = criarMockScorm(() => 1000);
    let n = 0;
    const ponte = criarPonteScorm(mock, () => `s${++n}`);
    mock.observar("k");
    const { sessao, estado } = ponte.abrirSessao("k");
    expect(estado.dados["cmi.core.lesson_status"]).toBe("not attempted");
    expect(estado.fixos["cmi.core.entry"]).toBe("ab-initio");
    const scorm = (metodo: string, args: string[] = [], s = sessao) =>
      ponte.repassar(lerMensagem({ cev: "previa", sessao: s, tipo: "scorm", metodo, args }) as Extract<MensagemDaPrevia, { tipo: "scorm" }>);
    scorm("LMSInitialize");
    scorm("LMSSetValue", ["cmi.core.lesson_status", "completed"]);
    scorm("LMSSetValue", ["cmi.suspend_data", '{"v":[0]}']);
    scorm("LMSSetValue", ["cmi.core.lesson_status", "inválido"]); // o mock recusa (405)
    scorm("LMSSetValue", ["cmi.core.lesson_location", "9"], "outra");
    scorm("LMSCommit");
    expect(mock.situacao()).toMatchObject({ conectado: true, lessonStatus: "completed", lessonLocation: "", ultimaGravacao: 1000 });
    expect(ponte.abrirSessao("k").estado.fixos["cmi.core.entry"]).toBe("resume");
  });

  it("reiniciar revoga a sessão antiga: o que ela grava depois é ignorado", () => {
    const mock = criarMockScorm();
    const ponte = criarPonteScorm(mock);
    const { sessao } = ponte.abrirSessao("k");
    const scorm = (metodo: string, args: string[] = []) =>
      ponte.repassar({ cev: "previa", sessao, tipo: "scorm", metodo: metodo as "LMSInitialize", args });
    scorm("LMSInitialize");
    mock.reiniciar("k");
    scorm("LMSSetValue", ["cmi.suspend_data", "velho"]);
    scorm("LMSFinish");
    expect(mock.dados("k")).toEqual({});
  });
});

// ---------- public/previa/ponte.js (roda dentro do iframe) ----------

interface HandleFalso {
  ir(i: number): void;
  tela(): number;
  total: number;
}

function montarIframeFalso(motor: ((c: unknown, o: unknown) => HandleFalso | null) | null) {
  document.body.innerHTML = `<p class="eyebrow" id="contexto"></p><span id="counter">01 / 03</span><main id="stage"></main>
    <script type="application/json" id="${ID_DADOS}">${JSON.stringify({
      sessao: "s-9",
      conteudo: { slides: [] },
      opcoes: { chave: "k", telaInicial: 1, livre: false },
      scorm: { dados: { "cmi.suspend_data": "x", "cmi.interactions.0.id": "r" }, fixos: { "cmi.core.entry": "resume" } },
    })}</script>`;
  const enviadas: Record<string, unknown>[] = [];
  vi.spyOn(window, "postMessage").mockImplementation((m: unknown) => void enviadas.push(m as Record<string, unknown>));
  const w = window as unknown as { Motor?: unknown; API?: Record<string, (...a: string[]) => string>; CONTEUDO?: unknown };
  w.Motor = motor ? { iniciar: motor } : undefined;
  const adicionar = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((tipo: string, f: EventListenerOrEventListenerObject) => {
    ouvintes.push([tipo, f]);
    adicionar(tipo, f);
  });
  new Function(codigoPonte)();
  return { enviadas, api: () => w.API! };
}

const ouvintes: [string, EventListenerOrEventListenerObject][] = [];

afterEach(() => {
  for (const [tipo, f] of ouvintes.splice(0)) window.removeEventListener(tipo, f);
  vi.restoreAllMocks();
  delete (window as { API?: unknown }).API;
  delete (window as { Motor?: unknown }).Motor;
});

describe("ponte.js", () => {
  it("cria a API com cache, repassa as gravações e avisa pronto", () => {
    let tela = 1;
    const iniciar = vi.fn((_c: unknown, _o: unknown): HandleFalso => {
      const api = (window as unknown as { API: Record<string, (...a: string[]) => string> }).API;
      api.LMSInitialize("");
      return { ir: (i) => void (tela = i), tela: () => tela, total: 3 };
    });
    const { enviadas, api } = montarIframeFalso(iniciar);
    expect(iniciar).toHaveBeenCalledWith({ slides: [] }, { chave: "k", telaInicial: 1, livre: false });
    const a = api();
    expect(a.LMSGetValue("cmi.core.entry")).toBe("resume");
    expect(a.LMSGetValue("cmi.suspend_data")).toBe("x");
    expect(a.LMSGetValue("cmi.core.lesson_status")).toBe("not attempted");
    expect(a.LMSGetValue("cmi.interactions._count")).toBe("1");
    expect(a.LMSSetValue("cmi.core.lesson_location", "2")).toBe("true");
    expect(a.LMSGetValue("cmi.core.lesson_location")).toBe("2");
    expect(enviadas.map((m) => [m.tipo, m.metodo ?? null, m.args ?? null])).toEqual([
      ["scorm", "LMSInitialize", []],
      ["pronto", null, null],
      ["scorm", "LMSSetValue", ["cmi.core.lesson_location", "2"]],
    ]);
    expect(enviadas[1]).toEqual({ cev: "previa", sessao: "s-9", tipo: "pronto", tela: 1, total: 3 });
    expect(a.LMSFinish("")).toBe("true");
    expect(a.LMSGetValue("cmi.suspend_data")).toBe("");
    expect(a.LMSGetLastError()).toBe("301");
  });

  it("atende o pedido 'ir' do app e responde a tela em que ficou", () => {
    let tela = 0;
    const { enviadas } = montarIframeFalso(() => ({ ir: (i) => void (i < 2 && (tela = i)), tela: () => tela, total: 3 }));
    const pedir = (t: number, n: number) =>
      window.dispatchEvent(new MessageEvent("message", { data: pedidoIr(t, n), source: window }));
    pedir(1, 1);
    pedir(2, 2); // bloqueado pelo motor (modo aluno)
    window.dispatchEvent(new MessageEvent("message", { data: pedidoIr(1, 3), source: null })); // outra origem
    const telas = enviadas.filter((m) => m.tipo === "tela");
    expect(telas).toEqual([
      { cev: "previa", sessao: "s-9", tipo: "tela", tela: 1, pedido: 1 },
      { cev: "previa", sessao: "s-9", tipo: "tela", tela: 1, pedido: 2 },
    ]);
  });

  it("avisa falha com o texto do motor quando ele não abre", () => {
    const { enviadas } = montarIframeFalso(() => {
      document.getElementById("stage")!.innerHTML = "<p> Conteúdo inválido. </p>";
      return null;
    });
    expect(enviadas).toEqual([{ cev: "previa", sessao: "s-9", tipo: "falha", mensagem: "Conteúdo inválido." }]);
  });

  it("sem o motor carregado também avisa falha", () => {
    const { enviadas } = montarIframeFalso(null);
    expect(enviadas).toEqual([{ cev: "previa", sessao: "s-9", tipo: "falha", mensagem: "" }]);
  });
});
