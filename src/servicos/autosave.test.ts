import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarAutosave, type EstadoAutosave } from "./autosave";

function adiado() {
  let resolver!: () => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<void>((r, j) => {
    resolver = r;
    rejeitar = j;
  });
  return { promessa, resolver, rejeitar };
}

describe("criarAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("faz debounce e salva só o último valor", async () => {
    const salvar = vi.fn().mockResolvedValue(undefined);
    const estados: EstadoAutosave[] = [];
    const a = criarAutosave<number>(salvar, { aoMudarEstado: (e) => estados.push(e) });
    expect(a.estado).toBe("salvo");

    a.agendar(1);
    await vi.advanceTimersByTimeAsync(500);
    a.agendar(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(salvar).not.toHaveBeenCalled();
    expect(a.estado).toBe("pendente");

    await vi.advanceTimersByTimeAsync(1);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar).toHaveBeenCalledWith(2);
    expect(estados).toEqual(["pendente", "salvando", "salvo"]);
  });

  it("respeita atrasoMs", async () => {
    const salvar = vi.fn().mockResolvedValue(undefined);
    const a = criarAutosave<string>(salvar, { atrasoMs: 200 });
    a.agendar("x");
    await vi.advanceTimersByTimeAsync(199);
    expect(salvar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(salvar).toHaveBeenCalledWith("x");
  });

  it("informa erro e se recupera na próxima gravação", async () => {
    const falha = new Error("disco cheio");
    const salvar = vi.fn().mockRejectedValueOnce(falha).mockResolvedValue(undefined);
    const chamadas: [EstadoAutosave, unknown][] = [];
    const a = criarAutosave<number>(salvar, { aoMudarEstado: (e, err) => chamadas.push([e, err]) });

    a.agendar(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.estado).toBe("erro");
    expect(chamadas[chamadas.length - 1]).toEqual(["erro", falha]);

    a.agendar(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.estado).toBe("salvo");
    expect(salvar).toHaveBeenLastCalledWith(2);
  });

  it("flush salva imediatamente e cancela o timer", async () => {
    const salvar = vi.fn().mockResolvedValue(undefined);
    const a = criarAutosave<number>(salvar);
    a.agendar(7);
    await a.flush();
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar).toHaveBeenCalledWith(7);
    expect(a.estado).toBe("salvo");
    await vi.advanceTimersByTimeAsync(5000);
    expect(salvar).toHaveBeenCalledTimes(1);

    await a.flush(); // nada pendente: não salva de novo
    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it("não sobrepõe gravações e salva o valor novo depois da atual", async () => {
    const primeira = adiado();
    const salvar = vi
      .fn<(v: number) => Promise<void>>()
      .mockReturnValueOnce(primeira.promessa)
      .mockResolvedValue(undefined);
    const a = criarAutosave<number>(salvar);

    a.agendar(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.estado).toBe("salvando");

    a.agendar(2);
    await vi.advanceTimersByTimeAsync(1000); // atraso vence durante a gravação
    expect(salvar).toHaveBeenCalledTimes(1);

    primeira.resolver();
    await vi.advanceTimersByTimeAsync(0);
    expect(salvar).toHaveBeenCalledTimes(2);
    expect(salvar).toHaveBeenLastCalledWith(2);
    expect(a.estado).toBe("salvo");
  });

  it("flush espera a gravação em curso e o pendente", async () => {
    const primeira = adiado();
    const salvar = vi
      .fn<(v: number) => Promise<void>>()
      .mockReturnValueOnce(primeira.promessa)
      .mockResolvedValue(undefined);
    const a = criarAutosave<number>(salvar);

    a.agendar(1);
    await vi.advanceTimersByTimeAsync(1000);
    a.agendar(2);
    const f = a.flush();
    primeira.resolver();
    await f;
    expect(salvar.mock.calls).toEqual([[1], [2]]);
    expect(a.estado).toBe("salvo");
  });

  it("cancelar descarta o timer pendente", async () => {
    const salvar = vi.fn().mockResolvedValue(undefined);
    const a = criarAutosave<number>(salvar);
    a.agendar(1);
    a.cancelar();
    await vi.advanceTimersByTimeAsync(5000);
    expect(salvar).not.toHaveBeenCalled();
  });
});
