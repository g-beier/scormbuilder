import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const open = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: (...a: unknown[]) => open(...a) }));

import {
  _definirDisponivel,
  _definirLeitorImagem,
  esquecerImagens,
  importarImagem,
  imagemEmCache,
  lerImagem,
  limparImagensOrfas,
  urlDaImagem,
  urlsDasImagens,
  urlsEmCache,
} from "./imagens";

beforeEach(() => {
  invoke.mockReset();
  esquecerImagens();
  _definirDisponivel(() => true);
});
afterEach(() => {
  _definirLeitorImagem(null);
  _definirDisponivel(null);
});

describe("servicos/imagens", () => {
  it("chama os comandos com os nomes de argumento do Rust", async () => {
    invoke.mockResolvedValue({ nome: "0123456789abcdef.png", largura: 1, altura: 1, bytes: 9 });
    await importarImagem("p1", "/a/b.png");
    expect(invoke).toHaveBeenLastCalledWith("importar_imagem", { id: "p1", caminho: "/a/b.png" });
    invoke.mockResolvedValue("data:x");
    await lerImagem("p1", "n.png");
    expect(invoke).toHaveBeenLastCalledWith("ler_imagem", { id: "p1", nome: "n.png" });
    invoke.mockResolvedValue([]);
    await limparImagensOrfas("p1", ["a.png"]);
    expect(invoke).toHaveBeenLastCalledWith("limpar_imagens_orfas", { id: "p1", usadas: ["a.png"] });
  });

  it("cache: lê uma vez, pedidos simultâneos compartilham a leitura, falha não fica guardada", async () => {
    const ler = vi.fn(async (_id: string, nome: string) => {
      if (nome === "ruim.png") throw new Error("não achou");
      return `data:${nome}`;
    });
    _definirLeitorImagem(ler);
    const [a, b] = await Promise.all([urlDaImagem("p1", "a.png"), urlDaImagem("p1", "a.png")]);
    expect(a).toBe("data:a.png");
    expect(b).toBe("data:a.png");
    expect(ler).toHaveBeenCalledTimes(1);
    expect(imagemEmCache("p1", "a.png")).toBe("data:a.png");
    expect(imagemEmCache("p2", "a.png")).toBeUndefined();

    expect(await urlsDasImagens("p1", ["a.png", "ruim.png"])).toEqual({ "a.png": "data:a.png" });
    expect(urlsEmCache("p1", ["a.png"])).toEqual({ "a.png": "data:a.png" });
    expect(urlsEmCache("p1", ["a.png", "ruim.png"])).toBeNull();
    await urlDaImagem("p1", "ruim.png");
    expect(ler.mock.calls.filter((c) => c[1] === "ruim.png")).toHaveLength(2);

    esquecerImagens();
    expect(imagemEmCache("p1", "a.png")).toBeUndefined();
  });

  it("fora do app (npm run dev) não tenta ler e devolve vazio", async () => {
    const ler = vi.fn();
    _definirLeitorImagem(ler);
    _definirDisponivel(() => false);
    expect(await urlDaImagem("p1", "a.png")).toBeNull();
    expect(await urlsDasImagens("p1", ["a.png"])).toEqual({});
    expect(ler).not.toHaveBeenCalled();
  });
});
