// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const invoke = vi.fn();
const open = vi.fn();
const confirm = vi.fn();
const revealItemInDir = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...a: unknown[]) => open(...a),
  confirm: (...a: unknown[]) => confirm(...a),
  save: vi.fn(),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: (...a: unknown[]) => revealItemInDir(...a) }));

import { DialogoExportar } from "./DialogoExportar";
import { novoBloco, novoProjeto, novoSlide } from "../modelo/fabrica";
import { compilarDataJs } from "../modelo/compilar";

const META = { curso: "CTGESTAO", ud: 11, atividade: "LEITURA", numero: 2, titulo: "Gestão & ação", contexto: "Curso · UD 11" };

beforeAll(() => {
  // jsdom não implementa <dialog>.showModal/close.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
});
beforeEach(() => {
  invoke.mockReset();
  open.mockReset();
  confirm.mockReset();
  revealItemInDir.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

function comandos(prefs: object, exportar: (args: Record<string, unknown>) => unknown) {
  invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
    if (cmd === "ler_preferencias") return prefs;
    if (cmd === "salvar_preferencias") return undefined;
    if (cmd === "exportar_pacote") return exportar(args);
    throw new Error("comando inesperado " + cmd);
  });
}

describe("DialogoExportar", () => {
  it("com itens a corrigir, bloqueia e leva aos problemas", async () => {
    comandos({}, () => null);
    const p = novoProjeto({ ...META, titulo: "" });
    const aoFechar = vi.fn();
    const aoIr = vi.fn();
    render(<DialogoExportar projeto={p} aberto aoFechar={aoFechar} aoIrParaProblema={aoIr} />);
    await act(async () => {});
    expect(screen.getByText(/\d+ ite(m|ns) a corrigir/)).toBeTruthy();
    expect(screen.queryByText("Exportar")).toBeNull();
    const ver = screen.getByText("Ver itens a corrigir");
    expect(ver.hasAttribute("data-autofoco")).toBe(true);
    fireEvent.click(ver);
    expect(aoFechar).toHaveBeenCalled();
    expect(aoIr).toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalledWith("exportar_pacote", expect.anything());
  });

  it("exporta zip no último destino, confirma sobrescrita e mostra o resultado", async () => {
    const p = novoProjeto(META);
    let chamadas = 0;
    comandos({ ultimoDestino: "/Users/a/Mesa" }, (args) => {
      chamadas++;
      if (!args.sobrescrever) return Promise.reject("JA_EXISTE:Já existe o arquivo CTGESTAO_UD11_LEITURA2.zip em /Users/a/Mesa. Substituir?");
      return { caminho: "/Users/a/Mesa/CTGESTAO_UD11_LEITURA2.zip", arquivos: 14, bytes: 120_000 };
    });
    confirm.mockResolvedValue(true);
    render(<DialogoExportar projeto={p} aberto aoFechar={() => {}} />);
    await act(async () => {});

    expect(screen.getByText("CTGESTAO_UD11_LEITURA2")).toBeTruthy();
    const zip = screen.getByRole<HTMLInputElement>("radio", { name: /Zip para o Moodle/ });
    expect(zip.checked).toBe(true);
    expect(zip.hasAttribute("data-autofoco")).toBe(true);
    expect(screen.getByText("/Users/a/Mesa")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("Exportar"));
    });
    expect(chamadas).toBe(2);
    expect(confirm).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("exportar_pacote", {
      entrada: { nomePacote: "CTGESTAO_UD11_LEITURA2", titulo: "Gestão & ação", dataJs: compilarDataJs(p), projetoId: p.id, imagens: [] },
      destino: "/Users/a/Mesa",
      formato: "zip",
      sobrescrever: true,
    });
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Pacote exportado.");
    expect(status.textContent).toContain("14 arquivos · 117,2 KB");
    fireEvent.click(screen.getByText("Mostrar no Finder"));
    expect(revealItemInDir).toHaveBeenCalledWith("/Users/a/Mesa/CTGESTAO_UD11_LEITURA2.zip");
  });

  it("sobrescrita recusada não exporta; atalho do ead-scorm usa formato pasta", async () => {
    const p = novoProjeto(META);
    const formatos: unknown[] = [];
    comandos({ pastaEadScorm: "/Users/a/ead-scorm" }, (args) => {
      formatos.push([args.destino, args.formato, args.sobrescrever]);
      return Promise.reject("JA_EXISTE:Já existe uma pasta CTGESTAO_UD11_LEITURA2 em /Users/a/ead-scorm.");
    });
    confirm.mockResolvedValue(false);
    render(<DialogoExportar projeto={p} aberto aoFechar={() => {}} />);
    await act(async () => {});
    expect(screen.getByText("Exportar").closest("button")!.getAttribute("aria-disabled")).toBe("true");
    await act(async () => {
      fireEvent.click(screen.getByText("Exportar para o repositório ead-scorm"));
    });
    expect(formatos).toEqual([["/Users/a/ead-scorm", "pasta", false]]);
    expect(screen.queryByText("Pacote exportado.")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("envia o projeto e as imagens usadas (pacote e PDF)", async () => {
    const p = novoProjeto(META);
    const s = novoSlide("conteudo");
    s.titulo = "Mapa";
    s.blocos = [
      { ...novoBloco("imagem"), arquivo: "fedcba9876543210.jpg", alt: "Mapa" },
      { ...novoBloco("imagem"), arquivo: "0123456789abcdef.png", decorativa: true },
      { ...novoBloco("imagem"), arquivo: "fedcba9876543210.jpg", alt: "De novo" },
    ];
    p.slides.splice(1, 0, s);
    const chamadas: Array<[string, Record<string, unknown>]> = [];
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === "ler_preferencias") return { ultimoDestino: "/x" };
      if (cmd === "salvar_preferencias") return undefined;
      chamadas.push([cmd, args]);
      return { caminho: "/x/a", arquivos: 1, bytes: 1 };
    });
    render(<DialogoExportar projeto={p} aberto aoFechar={() => {}} />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByText("Exportar"));
    });
    const [cmd, args] = chamadas[0];
    expect(cmd).toBe("exportar_pacote");
    expect(args.entrada).toMatchObject({ projetoId: p.id, imagens: ["0123456789abcdef.png", "fedcba9876543210.jpg"] });
    expect((args.entrada as { dataJs: string }).dataJs).toContain('"src": "img/fedcba9876543210.jpg"');

    fireEvent.click(screen.getByRole("radio", { name: /PDF/ }));
    await act(async () => {
      fireEvent.click(screen.getByText("Exportar"));
    });
    const [cmdPdf, argsPdf] = chamadas[1];
    expect(cmdPdf).toBe("exportar_pdf");
    expect(argsPdf.entrada).toMatchObject({ nomePacote: "CTGESTAO_UD11_LEITURA2", projetoId: p.id });
  });

  it("erro comum aparece como alerta", async () => {
    const p = novoProjeto(META);
    comandos({ ultimoDestino: "/x" }, () => Promise.reject("A pasta de destino não foi encontrada. Escolha outra pasta."));
    render(<DialogoExportar projeto={p} aberto aoFechar={() => {}} />);
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByText("Exportar"));
    });
    expect(screen.getByRole("alert").textContent).toContain("destino não foi encontrada");
  });
});
