import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroImportacao } from "../modelo/avaliar";
import { importarDataJs } from "../modelo/importar";
import { APIS_BLOQUEADAS, avaliarParaResposta, bloquearApis } from "./avaliadorNucleo";
import { avaliarDataJsIsolado, type WorkerMinimo } from "./avaliarIsolado";

vi.mock("./avaliador.worker.ts?worker", () => ({ default: class {} }));

/** Worker falso: roda o núcleo do worker de forma assíncrona (ou não responde). */
function workerFalso(modo: "responde" | "trava" | "quebra" = "responde") {
  const w: WorkerMinimo & { encerrado: boolean } = {
    onmessage: null,
    onerror: null,
    encerrado: false,
    postMessage(m: unknown) {
      const { fonte } = m as { fonte: string };
      if (modo === "trava") return;
      setTimeout(() => {
        if (modo === "quebra") w.onerror?.({ message: "falhou" } as ErrorEvent);
        else w.onmessage?.({ data: avaliarParaResposta(fonte) } as MessageEvent);
      }, 0);
    },
    terminate() {
      w.encerrado = true;
    },
  };
  return w;
}

afterEach(() => vi.useRealTimers());

describe("avaliarDataJsIsolado", () => {
  it("devolve o CONTEUDO e encerra o worker", async () => {
    const w = workerFalso();
    const v = await avaliarDataJsIsolado("window.CONTEUDO = { slides: [1, 2] };", { criarWorker: () => w });
    expect(v).toEqual({ slides: [1, 2] });
    expect(w.encerrado).toBe(true);
  });

  it("interrompe um data.js que não termina", async () => {
    vi.useFakeTimers();
    const w = workerFalso("trava");
    const p = avaliarDataJsIsolado("while (true) {}", { criarWorker: () => w, limiteMs: 3000 });
    const conferido = expect(p).rejects.toThrow(/passou de 3 segundos e foi interrompida/);
    await vi.advanceTimersByTimeAsync(3000);
    await conferido;
    expect(w.encerrado).toBe(true);
  });

  it("erro de sintaxe e erro do worker viram ErroImportacao em pt-BR", async () => {
    await expect(avaliarDataJsIsolado("window.CONTEUDO = {", { criarWorker: () => workerFalso() })).rejects.toThrow(
      /erro de sintaxe/,
    );
    const p = avaliarDataJsIsolado("x", { criarWorker: () => workerFalso("quebra") });
    await expect(p).rejects.toBeInstanceOf(ErroImportacao);
    await expect(p).rejects.toThrow(/Não foi possível ler o data.js: falhou/);
  });

  it("importarDataJs usa o avaliador injetado", async () => {
    const w = workerFalso();
    const { projeto } = await importarDataJs(
      `window.CONTEUDO = { contexto: "c", slides: [{ tipo: "capa", kicker: "k", titulo: "T", sub: "s" }, { tipo: "fim", titulo: "F", texto: "t" }] };`,
      { avaliar: (f) => avaliarDataJsIsolado(f, { criarWorker: () => w }), pasta: "CTGESTAO_UD2_LEITURA2" },
    );
    expect(projeto.meta.ud).toBe(2);
    expect(projeto.slides.map((s) => s.tipo)).toEqual(["capa", "fim"]);
  });
});

describe("núcleo do worker", () => {
  it("clona como JSON: funções e protótipos não passam", () => {
    const r = avaliarParaResposta(
      `window.CONTEUDO = { slides: [], f: function () { return 1; }, d: new Date(0), get x() { return 2; } };`,
    );
    expect(r).toEqual({ ok: true, valor: { slides: [], d: "1970-01-01T00:00:00.000Z", x: 2 } });
  });

  it("estrutura cíclica vira erro, sem lançar", () => {
    const r = avaliarParaResposta(`var CONTEUDO = { slides: [] }; CONTEUDO.eu = CONTEUDO;`);
    expect(r.ok).toBe(false);
  });

  it("bloquearApis sombreia rede e armazenamento sem permitir recolocar", () => {
    const escopo: Record<string, unknown> = { fetch: () => "rede", importScripts: () => 0, indexedDB: {}, outro: 1 };
    bloquearApis(escopo);
    for (const nome of APIS_BLOQUEADAS) expect(escopo[nome]).toBeUndefined();
    expect(escopo.outro).toBe(1);
    expect(() => {
      "use strict";
      escopo.fetch = () => "de novo";
    }).toThrow(TypeError);
    expect(Object.getOwnPropertyDescriptor(escopo, "fetch")?.configurable).toBe(false);
  });
});
