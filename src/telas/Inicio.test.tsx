// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BloqueioAtualizacao } from "./Atualizacao";

const listarRascunhos = vi.fn();
const escolherArquivoCevscorm = vi.fn();
let mudarBloqueio: (b: BloqueioAtualizacao) => void = () => {};

vi.mock("./Atualizacao", () => ({
  Atualizacao: ({ aoMudarBloqueio }: { aoMudarBloqueio(b: BloqueioAtualizacao): void }) => {
    mudarBloqueio = aoMudarBloqueio;
    return null;
  },
}));
vi.mock("../servicos/rascunhos", () => ({
  listarRascunhos: () => listarRascunhos(),
  abrirRascunho: vi.fn(),
  abrirArquivo: vi.fn(),
  excluirRascunho: vi.fn(),
}));
vi.mock("../servicos/dialogos", () => ({
  confirmar: vi.fn(),
  escolherArquivoCevscorm: () => escolherArquivoCevscorm(),
  escolherPastaPacote: vi.fn(),
}));

import { Inicio } from "./Inicio";

const flush = () => act(async () => {});

beforeAll(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Inicio durante a atualização", () => {
  it("ações ficam com aria-disabled, descritas por uma frase visível, e ignoram cliques", async () => {
    listarRascunhos.mockResolvedValue([
      { id: "r1", titulo: "Rascunho", curso: "CTGESTAO", ud: 1, telas: 3, atualizadoEm: new Date().toISOString() },
    ]);
    render(<Inicio aoAbrir={vi.fn()} />);
    await flush();
    const acoes = () => [
      screen.getByRole("button", { name: /Novo SCORM/ }),
      screen.getByRole("button", { name: /Abrir arquivo/ }),
      screen.getByRole("button", { name: /Importar SCORM/ }),
      screen.getByRole("button", { name: /^Rascunho/ }),
      screen.getByRole("button", { name: /Excluir rascunho/ }),
    ];
    for (const b of acoes()) expect(b.hasAttribute("aria-disabled")).toBe(false);

    act(() => mudarBloqueio("baixando"));
    for (const b of acoes()) {
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.hasAttribute("disabled")).toBe(false);
      expect(b.getAttribute("aria-describedby")).toBe("inicio-bloqueio");
    }
    const frase = document.getElementById("inicio-bloqueio");
    expect(frase?.textContent).toBe("Enquanto a atualização não termina, não é possível abrir projetos.");
    expect(acoes().some((b) => b.contains(frase))).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Abrir arquivo/ }));
    await flush();
    expect(escolherArquivoCevscorm).not.toHaveBeenCalled();

    act(() => mudarBloqueio("reiniciar"));
    expect(document.getElementById("inicio-bloqueio")?.textContent).toBe("Reinicie o aplicativo para continuar.");

    act(() => mudarBloqueio(null));
    expect(document.getElementById("inicio-bloqueio")).toBeNull();
    for (const b of acoes()) expect(b.hasAttribute("aria-disabled")).toBe(false);
  });
});
