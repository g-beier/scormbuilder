import { describe, expect, it } from "vitest";
import { produce } from "immer";
import type { Pergunta } from "../../modelo/tipos";
import { moverOpcao, removerOpcao } from "./FormQuiz";

const p: Pergunta = { pergunta: "?", opcoes: ["A", "B", "C"], correta: 1, explica: "" };

describe("alternativas do quiz", () => {
  it("a correta acompanha a alternativa ao mover", () => {
    const r = produce(p, (d) => moverOpcao(d, 1, 2));
    expect(r.opcoes).toEqual(["A", "C", "B"]);
    expect(r.correta).toBe(2);
    expect(produce(p, (d) => moverOpcao(d, 0, 1)).correta).toBe(0);
  });
  it("remover ajusta a correta", () => {
    expect(produce(p, (d) => removerOpcao(d, 0)).correta).toBe(0);
    expect(produce(p, (d) => removerOpcao(d, 2)).correta).toBe(1);
    expect(produce(p, (d) => removerOpcao(d, 1)).correta).toBe(0);
  });
});
