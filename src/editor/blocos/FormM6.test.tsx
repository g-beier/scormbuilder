// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { produce, type Draft } from "immer";
import { useState, type ComponentType } from "react";
import { novoBloco } from "../../modelo/fabrica";
import type { Bloco } from "../../modelo/tipos";
import type { PropsFormBloco } from "./comum";
import { FORMS_BLOCO } from "./index";
import { FormMultipla } from "./FormMultipla";
import { FormReflexao } from "./FormReflexao";
import { FormEscolha } from "./FormEscolha";

afterEach(cleanup);

/** Monta o form com estado real (immer), como o editor faz. */
function montar<B extends Bloco>(Form: ComponentType<PropsFormBloco<B>>, inicial: B) {
  const ref: { atual: B } = { atual: inicial };
  function Teste() {
    const [b, setB] = useState(inicial);
    ref.atual = b;
    return (
      <Form
        bloco={b}
        f={(c) => `s|${b.id}|${c}`}
        editar={(receita: (d: Draft<B>) => void) => setB((x) => produce(x, receita))}
      />
    );
  }
  render(<Teste />);
  return ref;
}

describe("forms dos tipos do M6", () => {
  it("estão registrados", () => {
    expect(FORMS_BLOCO.multipla).toBe(FormMultipla);
    expect(FORMS_BLOCO.reflexao).toBe(FormReflexao);
    expect(FORMS_BLOCO.escolha).toBe(FormEscolha);
  });

  it("reflexão: obrigatória liga opcional=false e desliga removendo o campo", async () => {
    const ref = montar(FormReflexao, novoBloco("reflexao"));
    await act(async () => {});
    const caixa = screen.getByLabelText("Resposta obrigatória para avançar");
    expect((caixa as HTMLInputElement).checked).toBe(false);
    fireEvent.click(caixa);
    expect(ref.atual.opcional).toBe(false);
    fireEvent.click(caixa);
    expect(ref.atual).not.toHaveProperty("opcional");
  });

  it("reflexão: números vazios voltam ao padrão; aviso vazio é omitido", async () => {
    const ref = montar(FormReflexao, novoBloco("reflexao"));
    await act(async () => {});
    const max = screen.getByLabelText("Máximo de caracteres") as HTMLInputElement;
    expect(max.placeholder).toBe("500");
    fireEvent.change(max, { target: { value: "800" } });
    expect(ref.atual.maxChars).toBe(800);
    fireEvent.change(max, { target: { value: "" } });
    expect(ref.atual).not.toHaveProperty("maxChars");
    const aviso = screen.getByLabelText("Aviso ao aluno (opcional)") as HTMLTextAreaElement;
    expect(aviso.placeholder).toMatch(/Não escreva nomes nem dados/);
    expect(aviso.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.change(aviso, { target: { value: "Cuidado." } });
    expect(ref.atual.aviso).toBe("Cuidado.");
    fireEvent.change(aviso, { target: { value: "" } });
    expect(ref.atual).not.toHaveProperty("aviso");
  });

  it("múltipla: marca correta por alternativa, adiciona e não remove abaixo de 2", async () => {
    const ref = montar(FormMultipla, novoBloco("multipla"));
    await act(async () => {});
    const marcas = screen.getAllByLabelText("Esta alternativa é correta");
    expect(marcas).toHaveLength(2);
    fireEvent.click(marcas[1]);
    expect(ref.atual.opcoes.map((o) => o.correta)).toEqual([false, true]);
    expect((screen.getByRole("button", { name: "Remover alternativa 1" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar alternativa/ }));
    expect(ref.atual.opcoes).toHaveLength(3);
    fireEvent.change(screen.getAllByLabelText("Comentário desta alternativa")[2], { target: { value: "Nada." } });
    expect(ref.atual.opcoes[2]).toEqual({ texto: "", correta: false, fb: "Nada." });
    // mover leva a marca junto
    fireEvent.click(screen.getByRole("button", { name: "Mover alternativa 2 para baixo" }));
    expect(ref.atual.opcoes.map((o) => o.correta)).toEqual([false, false, true]);
    const acerto = screen.getByLabelText("Mensagem quando acertar tudo (opcional)");
    fireEvent.change(acerto, { target: { value: "Boa!" } });
    expect(ref.atual.msgAcerto).toBe("Boa!");
    fireEvent.change(acerto, { target: { value: "" } });
    expect(ref.atual).not.toHaveProperty("msgAcerto");
  });

  it("escolha: retorno por alternativa", async () => {
    const ref = montar(FormEscolha, novoBloco("escolha"));
    await act(async () => {});
    const retornos = screen.getAllByLabelText("Retorno desta alternativa");
    fireEvent.change(retornos[1], { target: { value: "Releia a seção 2." } });
    expect(ref.atual.opcoes[1].retorno).toBe("Releia a seção 2.");
    expect((screen.getByRole("button", { name: "Remover alternativa 2" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
