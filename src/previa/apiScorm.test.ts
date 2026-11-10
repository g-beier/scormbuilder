import { describe, expect, it, vi } from "vitest";
import { criarMockScorm, LIMITE_SUSPEND_DATA } from "./apiScorm";

describe("mock SCORM 1.2", () => {
  it("exige LMSInitialize e informa o erro 301", () => {
    const m = criarMockScorm();
    const api = m.novaSessao("k");
    expect(api.LMSGetValue("cmi.core.lesson_status")).toBe("");
    expect(api.LMSGetLastError()).toBe("301");
    expect(api.LMSGetErrorString("301")).toBe("Not initialized");
    expect(api.LMSSetValue("cmi.core.lesson_status", "completed")).toBe("false");
    expect(api.LMSInitialize("")).toBe("true");
    expect(api.LMSGetLastError()).toBe("0");
    expect(api.LMSGetValue("cmi.core.lesson_status")).toBe("not attempted");
    expect(api.LMSGetValue("cmi.core.entry")).toBe("ab-initio");
  });

  it("grava, valida e notifica; situação reflete a chave observada", () => {
    let t = 1000;
    const m = criarMockScorm(() => t);
    m.observar("k");
    const ouvinte = vi.fn();
    const sair = m.subscribe(ouvinte);
    const api = m.novaSessao("k");
    api.LMSInitialize("");
    expect(api.LMSSetValue("cmi.core.lesson_status", "feito")).toBe("false");
    expect(api.LMSGetLastError()).toBe("405");
    expect(api.LMSSetValue("cmi.core.lesson_status", "completed")).toBe("true");
    expect(api.LMSSetValue("cmi.core.lesson_location", "3")).toBe("true");
    expect(api.LMSSetValue("cmi.suspend_data", '{"v":[0,1]}')).toBe("true");
    expect(api.LMSSetValue("cmi.suspend_data", "x".repeat(LIMITE_SUSPEND_DATA + 1))).toBe("false");
    expect(api.LMSSetValue("cmi.core.student_name", "x")).toBe("false");
    expect(api.LMSGetLastError()).toBe("403");
    expect(api.LMSGetValue("cmi.core.exit")).toBe("");
    expect(api.LMSGetLastError()).toBe("404");
    t = 2000;
    expect(api.LMSCommit("")).toBe("true");
    expect(ouvinte).toHaveBeenCalled();
    expect(m.situacao()).toMatchObject({
      chave: "k",
      conectado: true,
      lessonStatus: "completed",
      lessonLocation: "3",
      suspendData: '{"v":[0,1]}',
      interacoes: 0,
      ultimaGravacao: 2000,
    });
    // snapshot estável entre mudanças (useSyncExternalStore)
    expect(m.situacao()).toBe(m.situacao());
    sair();
  });

  it("conta interações e exige índices em sequência", () => {
    const m = criarMockScorm();
    const api = m.novaSessao("k");
    api.LMSInitialize("");
    expect(api.LMSGetValue("cmi.interactions._count")).toBe("0");
    expect(api.LMSSetValue("cmi.interactions.1.id", "x")).toBe("false");
    expect(api.LMSSetValue("cmi.interactions.0.id", "r1")).toBe("true");
    expect(api.LMSSetValue("cmi.interactions.0.student_response", "oi")).toBe("true");
    expect(api.LMSSetValue("cmi.interactions.1.id", "r2")).toBe("true");
    expect(api.LMSGetValue("cmi.interactions._count")).toBe("2");
    expect(api.LMSGetValue("cmi.interactions.0.id")).toBe("");
    expect(api.LMSGetLastError()).toBe("404");
  });

  it("separa chaves e retoma numa sessão nova", () => {
    const m = criarMockScorm();
    const a = m.novaSessao("a");
    a.LMSInitialize("");
    a.LMSSetValue("cmi.suspend_data", "A");
    a.LMSFinish("");
    expect(a.LMSSetValue("cmi.suspend_data", "depois")).toBe("false");
    const b = m.novaSessao("b");
    b.LMSInitialize("");
    expect(b.LMSGetValue("cmi.suspend_data")).toBe("");
    const a2 = m.novaSessao("a");
    a2.LMSInitialize("");
    expect(a2.LMSGetValue("cmi.suspend_data")).toBe("A");
    expect(a2.LMSGetValue("cmi.core.entry")).toBe("resume");
  });

  it("reiniciar apaga e revoga sessões antigas (gravação tardia no unload é ignorada)", () => {
    const m = criarMockScorm();
    m.observar("k");
    const velha = m.novaSessao("k");
    velha.LMSInitialize("");
    velha.LMSSetValue("cmi.core.lesson_status", "completed");
    m.reiniciar("k");
    expect(m.situacao().lessonStatus).toBe("not attempted");
    expect(velha.LMSSetValue("cmi.suspend_data", "velho")).toBe("false");
    velha.LMSCommit("");
    velha.LMSFinish("");
    expect(m.dados("k")).toEqual({});
    const nova = m.novaSessao("k");
    expect(nova.LMSInitialize("")).toBe("true");
    expect(nova.LMSGetValue("cmi.suspend_data")).toBe("");
    expect(m.situacao().ultimaGravacao).toBeNull();
  });
});
