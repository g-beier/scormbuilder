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
import { FormCategorizar } from "./FormCategorizar";
import { FormRamificado } from "./FormRamificado";

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
    expect(FORMS_BLOCO.categorizar).toBe(FormCategorizar);
    expect(FORMS_BLOCO.ramificado).toBe(FormRamificado);
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

  it("categorizar: escolhe categoria; mover e remover categorias acompanham os itens", async () => {
    const ref = montar(FormCategorizar, novoBloco("categorizar"));
    await act(async () => {});
    const nomes = screen.getAllByLabelText("Nome da categoria");
    fireEvent.change(nomes[0], { target: { value: "Adulto" } });
    fireEvent.change(nomes[1], { target: { value: "Autoridades" } });
    const sel = () => screen.getAllByLabelText("Categoria certa") as HTMLSelectElement[];
    expect(sel()[0].value).toBe("");
    expect([...sel()[0].options].map((o) => o.textContent)).toEqual(["Escolha a categoria…", "Adulto", "Autoridades"]);
    fireEvent.change(sel()[0], { target: { value: "0" } });
    fireEvent.change(sel()[1], { target: { value: "1" } });
    expect(ref.atual.itens.map((i) => i.categoria)).toEqual([0, 1]);
    // terceira categoria, ainda sem nome, aparece como "Categoria 3"
    fireEvent.click(screen.getByRole("button", { name: /Adicionar categoria/ }));
    expect([...sel()[0].options].map((o) => o.textContent)).toEqual(["Adulto", "Autoridades", "Categoria 3"]);
    fireEvent.change(sel()[1], { target: { value: "2" } });
    // mover a categoria 1 para baixo: itens trocam de índice junto
    fireEvent.click(screen.getByRole("button", { name: "Mover categoria 1 para baixo" }));
    expect(ref.atual.categorias).toEqual(["Autoridades", "Adulto", ""]);
    expect(ref.atual.itens.map((i) => i.categoria)).toEqual([1, 2]);
    // remover "Adulto": o item 1 fica sem categoria e o item 2 desce de índice
    fireEvent.click(screen.getByRole("button", { name: "Remover categoria 2" }));
    expect(ref.atual.categorias).toEqual(["Autoridades", ""]);
    expect(ref.atual.itens.map((i) => i.categoria)).toEqual([-1, 1]);
    expect(sel()[0].value).toBe("");
    expect((screen.getByRole("button", { name: "Remover categoria 1" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("categorizar: no máximo 4 categorias", async () => {
    montar(FormCategorizar, novoBloco("categorizar"));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /Adicionar categoria/ }));
    fireEvent.click(screen.getByRole("button", { name: /Adicionar categoria/ }));
    expect(screen.queryByRole("button", { name: /Adicionar categoria/ })).toBeNull();
    expect(screen.getByText("Máximo de 4.")).toBeTruthy();
  });

  it("ramificado: destino por alternativa; pergunta removida deixa o destino a escolher", async () => {
    const ref = montar(FormRamificado, novoBloco("ramificado"));
    await act(async () => {});
    const [q1, q2] = ref.atual.perguntas.map((p) => p.id);
    const destinos = () => screen.getAllByLabelText("Depois desta, ir para") as HTMLSelectElement[];
    expect(destinos().map((d) => d.value)).toEqual([q2, q2, "fim", "fim"]);
    // a pergunta não oferece ela mesma como destino
    expect([...destinos()[0].options].map((o) => o.textContent)).toEqual(["Pergunta 2", "Fim do questionário (resumo)"]);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar pergunta/ }));
    const q3 = ref.atual.perguntas[2].id;
    fireEvent.change(destinos()[1], { target: { value: q3 } });
    expect(ref.atual.perguntas[0].alternativas[1].proxima).toBe(q3);
    // nova alternativa na pergunta 1 vai, por padrão, para a pergunta 2
    fireEvent.click(screen.getAllByRole("button", { name: /Adicionar alternativa/ })[0]);
    expect(ref.atual.perguntas[0].alternativas[2].proxima).toBe(q2);
    fireEvent.click(screen.getByRole("button", { name: "Remover pergunta 3" }));
    expect(ref.atual.perguntas.map((p) => p.id)).toEqual([q1, q2]);
    expect(destinos()[1].value).toBe("");
    fireEvent.change(screen.getAllByLabelText("Retorno desta alternativa (opcional)")[0], { target: { value: "Siga." } });
    expect(ref.atual.perguntas[0].alternativas[0].retorno).toBe("Siga.");
  });
});
