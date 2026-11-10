import { describe, expect, it } from "vitest";
import { caminhosDoCampo, chaveFoco } from "./foco";

describe("foco", () => {
  it("gera caminhos do mais específico ao mais geral", () => {
    expect(caminhosDoCampo("perguntas[0].opcoes[1]")).toEqual([
      "perguntas[0].opcoes[1]",
      "perguntas[0].opcoes",
      "perguntas[0]",
      "perguntas",
      "",
    ]);
    expect(caminhosDoCampo("titulo")).toEqual(["titulo", ""]);
    expect(caminhosDoCampo("")).toEqual([""]);
  });
  it("monta a chave", () => {
    expect(chaveFoco("s-1", undefined, "titulo")).toBe("s-1||titulo");
    expect(chaveFoco("s-1", "b-2", "")).toBe("s-1|b-2|");
  });
});
