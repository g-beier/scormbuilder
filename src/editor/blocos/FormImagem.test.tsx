// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { produce, type Draft } from "immer";
import { useState } from "react";

const escolher = vi.fn();
const importar = vi.fn();
const url = vi.fn();
vi.mock("../../servicos/imagens", () => ({
  escolherArquivoImagem: () => escolher(),
  importarImagem: (...a: unknown[]) => importar(...a),
  urlDaImagem: (...a: unknown[]) => url(...a),
}));
vi.mock("../../servicos/ambiente", () => ({
  mensagemDeErro: (e: unknown) => (typeof e === "string" ? e : String((e as Error).message)),
  emTauri: () => true,
  MSG_SO_NO_APP: "",
}));

import { novoBloco, novoProjeto } from "../../modelo/fabrica";
import type { BlocoImagem } from "../../modelo/tipos";
import { useProjeto } from "../../estado/projeto";
import { FORMS_BLOCO } from "./index";
import { bytesDaDataUrl, FormImagem } from "./FormImagem";

afterEach(cleanup);
beforeEach(() => {
  escolher.mockReset();
  importar.mockReset();
  url.mockReset();
  useProjeto.getState().abrir({ ...novoProjeto(), id: "proj-1" });
});

function montar(inicial: BlocoImagem) {
  const ref = { atual: inicial };
  function Teste() {
    const [b, setB] = useState(inicial);
    ref.atual = b;
    return <FormImagem bloco={b} f={(c) => `s|${b.id}|${c}`} editar={(r: (d: Draft<BlocoImagem>) => void) => setB((x) => produce(x, r))} />;
  }
  render(<Teste />);
  return ref;
}

describe("FormImagem", () => {
  it("está registrado", () => {
    expect(FORMS_BLOCO.imagem).toBe(FormImagem);
  });

  it("escolhe a imagem: importa no rascunho do projeto e grava o nome", async () => {
    escolher.mockResolvedValue("/Users/x/foto.png");
    importar.mockResolvedValue({ nome: "0123456789abcdef.png", largura: 640, altura: 480, bytes: 2048 });
    url.mockResolvedValue("data:image/png;base64,AAAA");
    const ref = montar(novoBloco("imagem"));
    const botao = screen.getByRole("button", { name: "Escolher imagem…" });
    expect(botao.getAttribute("data-foco")).toBe(`s|${ref.atual.id}|arquivo`);
    await act(async () => fireEvent.click(botao));
    expect(importar).toHaveBeenCalledWith("proj-1", "/Users/x/foto.png");
    expect(ref.atual.arquivo).toBe("0123456789abcdef.png");
    expect(url).toHaveBeenCalledWith("proj-1", "0123456789abcdef.png");
    expect(screen.getByRole("button", { name: "Trocar imagem" })).toBeTruthy();
    expect(screen.getByText(/640 × 480 px/)).toBeTruthy();
  });

  it("cancelar o diálogo não muda nada; erro do backend aparece perto do botão", async () => {
    escolher.mockResolvedValueOnce(null);
    const ref = montar(novoBloco("imagem"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Escolher imagem…" })));
    expect(importar).not.toHaveBeenCalled();
    expect(ref.atual.arquivo).toBe("");
    escolher.mockResolvedValueOnce("/x.svg");
    importar.mockRejectedValueOnce("Imagens SVG não são aceitas, porque podem conter código. Exporte a imagem como PNG e tente de novo.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Escolher imagem…" })));
    expect(screen.getByRole("alert").textContent).toMatch(/SVG não são aceitas/);
    expect(screen.getByRole("button", { name: "Escolher imagem…" }).getAttribute("aria-describedby")).toContain(screen.getByRole("alert").id);
    expect(ref.atual.arquivo).toBe("");
  });

  it("decorativa desabilita a descrição (o texto fica guardado)", async () => {
    const ref = montar({ ...novoBloco("imagem"), alt: "Mapa" });
    const desc = screen.getByLabelText("Descrição da imagem (texto alternativo)") as HTMLTextAreaElement;
    expect(desc.disabled).toBe(false);
    fireEvent.change(desc, { target: { value: "Mapa do RS" } });
    expect(ref.atual.alt).toBe("Mapa do RS");
    fireEvent.click(screen.getByLabelText("Imagem decorativa (não precisa de descrição)"));
    expect(ref.atual.decorativa).toBe(true);
    expect(desc.disabled).toBe(true);
    expect(ref.atual.alt).toBe("Mapa do RS");
  });

  it("miniatura que não carrega mostra aviso", async () => {
    url.mockResolvedValue(null);
    montar({ ...novoBloco("imagem"), arquivo: "0123456789abcdef.png", alt: "x" });
    await act(async () => {});
    expect(screen.getByText("Não foi possível mostrar a miniatura.")).toBeTruthy();
  });

  it("tamanho a partir da data: URL", () => {
    expect(bytesDaDataUrl("data:image/png;base64,AAAA")).toBe(3);
    expect(bytesDaDataUrl("data:image/png;base64,AAA=")).toBe(2);
  });
});
