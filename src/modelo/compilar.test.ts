import { describe, expect, it } from "vitest";
import { compilarConteudo, compilarDataJs, nomePacote } from "./compilar";
import { novoBloco, novoProjeto, novoSlide } from "./fabrica";
import { avaliarDataJs } from "./importar";

describe("nomePacote", () => {
  it("formato padrão", () => {
    expect(nomePacote({ curso: "CTGESTAO", ud: 11, atividade: "LEITURA", numero: 2 })).toBe("CTGESTAO_UD11_LEITURA2");
  });
  it("remove acentos e espaços, maiúsculas", () => {
    expect(nomePacote({ curso: "Mapij ", ud: 4, atividade: "Leitura São", numero: 3 })).toBe("MAPIJ_UD4_LEITURASAO3");
    expect(nomePacote({ curso: "ct gestão", ud: 1, atividade: "questionário", numero: 1 })).toBe("CTGESTAO_UD1_QUESTIONARIO1");
  });
});

describe("compilar", () => {
  function projeto() {
    const p = novoProjeto({ curso: "CTGESTAO", ud: 1, atividade: "LEITURA", numero: 2, titulo: "T", contexto: "C" });
    const s = novoSlide("conteudo");
    s.titulo = "Tela";
    const cards = novoBloco("cards");
    cards.colunas = 2;
    cards.cards = [{ cor: "green", titulo: "", breve: "b", paras: [], extras: { x: 1 } }];
    const ord = novoBloco("ordenar");
    ord.nota = "";
    s.blocos = [novoBloco("texto"), cards, ord, novoBloco("quiz")];
    s.extras = { segredo: true };
    p.slides.splice(1, 0, s);
    p.extras = { a: 1 };
    return p;
  }

  it("é determinístico", () => {
    const p = projeto();
    expect(compilarDataJs(p)).toBe(compilarDataJs(structuredClone(p)));
  });

  it("gera JS válido com cabeçalho, sem extras e sem opcionais vazios", () => {
    const p = projeto();
    const js = compilarDataJs(p);
    expect(js.startsWith("/* gerado pelo SCORM Builder */\nwindow.CONTEUDO = {\n  \"formato\": 2,")).toBe(true);
    expect(js.endsWith("};\n")).toBe(true);
    expect(js).not.toContain("extras");
    expect(js).not.toContain("segredo");
    const c = avaliarDataJs(js);
    expect(c).toEqual(compilarConteudo(p));
    const conteudo = compilarConteudo(p);
    expect(conteudo.id).toBe("CTGESTAO_UD1_LEITURA2");
    const blocos = (conteudo.slides[1] as { blocos: Array<Record<string, unknown>> }).blocos;
    expect(Object.keys(blocos[1])).toEqual(["id", "tipo", "colunas", "cards"]);
    expect(blocos[1].cards).toEqual([{ cor: "green", breve: "b" }]);
    expect(blocos[2]).not.toHaveProperty("nota");
  });
});
