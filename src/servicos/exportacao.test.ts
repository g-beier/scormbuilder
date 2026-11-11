import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));

import {
  exportarPacote,
  exportarPdf,
  jaExiste,
  juntarCaminho,
  lerPreferencias,
  mensagemJaExiste,
  salvarPreferencias,
  tamanhoLegivel,
} from "./exportacao";

beforeEach(() => invoke.mockReset());

describe("exportacao", () => {
  it("detecta o erro JA_EXISTE e tira o prefixo", () => {
    const e = "JA_EXISTE:Já existe o arquivo X.zip em /a. Substituir pelo pacote novo?";
    expect(jaExiste(e)).toBe(true);
    expect(mensagemJaExiste(e)).toBe("Já existe o arquivo X.zip em /a. Substituir pelo pacote novo?");
    expect(jaExiste("A pasta de destino não foi encontrada.")).toBe(false);
    expect(jaExiste(new Error("JA_EXISTE:x"))).toBe(false);
    expect(jaExiste(undefined)).toBe(false);
  });

  it("chama os comandos com os nomes de argumento do Rust", async () => {
    invoke.mockResolvedValue({ caminho: "/a/X.zip", arquivos: 14, bytes: 1000 });
    const entrada = { nomePacote: "X", titulo: "T", dataJs: "window.CONTEUDO = {};", projetoId: "p1", imagens: ["0123456789abcdef.png"] };
    await expect(exportarPacote(entrada, "/a", "zip")).resolves.toEqual({ caminho: "/a/X.zip", arquivos: 14, bytes: 1000 });
    expect(invoke).toHaveBeenLastCalledWith("exportar_pacote", { entrada, destino: "/a", formato: "zip", sobrescrever: false });
    await exportarPacote(entrada, "/a", "pasta", true);
    expect(invoke).toHaveBeenLastCalledWith("exportar_pacote", { entrada, destino: "/a", formato: "pasta", sobrescrever: true });

    const pdf = { nomePacote: "X", fonte: "= T", projetoId: "p1" };
    await exportarPdf(pdf, "/a");
    expect(invoke).toHaveBeenLastCalledWith("exportar_pdf", { entrada: pdf, destino: "/a", sobrescrever: false });

    invoke.mockResolvedValue({});
    await lerPreferencias();
    expect(invoke).toHaveBeenLastCalledWith("ler_preferencias");
    await salvarPreferencias({ ultimoDestino: "/b" });
    expect(invoke).toHaveBeenLastCalledWith("salvar_preferencias", { preferencias: { ultimoDestino: "/b" } });
  });

  it("formata tamanho e junta caminhos", () => {
    expect(tamanhoLegivel(1)).toBe("1 byte");
    expect(tamanhoLegivel(980)).toBe("980 bytes");
    expect(tamanhoLegivel(12_595)).toBe("12,3 KB");
    expect(tamanhoLegivel(1_468_006)).toBe("1,4 MB");
    expect(juntarCaminho("/Users/a/ead-scorm/", "X")).toBe("/Users/a/ead-scorm/X");
    expect(juntarCaminho("C:\\Users\\a", "X.zip")).toBe("C:\\Users\\a\\X.zip");
  });
});
