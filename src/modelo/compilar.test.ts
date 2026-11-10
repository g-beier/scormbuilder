import { describe, expect, it } from "vitest";
import { compilarConteudo, compilarDataJs, nomePacote } from "./compilar";
import { novoBloco, novoProjeto, novoSlide } from "./fabrica";
import { avaliarDataJs, importarDataJs } from "./importar";
import { desescaparHtml, escaparHtml } from "./texto";
import type { BlocoConfira, BlocoOrdenar, BlocoQuiz, SlideConteudo } from "./tipos";

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

describe("escape de texto simples", () => {
  const SUJO = 'A & B <c> "d"';
  const ESC = "A &amp; B &lt;c&gt; &quot;d&quot;";

  function projetoSujo() {
    const p = novoProjeto({ curso: "CTGESTAO", ud: 1, atividade: "LEITURA", numero: 2, titulo: SUJO, contexto: SUJO });
    const capa = p.slides[0] as { kicker: string; titulo: string; sub: string };
    capa.kicker = SUJO;
    capa.titulo = SUJO;
    capa.sub = "<strong>rico</strong>";
    const s = novoSlide("conteudo");
    s.kicker = SUJO;
    s.titulo = SUJO;
    const conf = novoBloco("confira");
    conf.botao = SUJO;
    conf.titulo = SUJO;
    conf.paras = ["<em>rico</em> &amp; já escapado"];
    const quiz = novoBloco("quiz");
    quiz.perguntas[0].explica = SUJO;
    quiz.perguntas[0].pergunta = "<strong>rico</strong>";
    const ord = novoBloco("ordenar");
    ord.nome = SUJO;
    const cards = novoBloco("cards");
    cards.cards = [{ cor: "navy", titulo: SUJO, paras: ["x"] }];
    const linha = novoBloco("linha");
    linha.itens = [{ titulo: SUJO, texto: "t" }];
    const contraste = novoBloco("contraste");
    contraste.itens = [{ cor: "red", titulo: SUJO, texto: "t" }];
    s.blocos = [conf, quiz, ord, cards, linha, contraste];
    p.slides.splice(1, 0, s);
    (p.slides[p.slides.length - 1] as { titulo: string }).titulo = SUJO;
    return p;
  }

  it("escapa campos simples que vão por innerHTML e preserva explica, contexto e ricos", () => {
    const c = compilarConteudo(projetoSujo()) as unknown as {
      contexto: string;
      titulo: string;
      slides: Array<Record<string, any>>;
    };
    const [capa, tela, fim] = c.slides;
    expect(capa.kicker).toBe(ESC);
    expect(capa.titulo).toBe(ESC);
    expect(capa.sub).toBe("<strong>rico</strong>");
    expect(tela.kicker).toBe(ESC);
    expect(tela.titulo).toBe(ESC);
    const [conf, quiz, ord, cards, linha, contraste] = tela.blocos;
    expect(conf.botao).toBe(ESC);
    expect(conf.titulo).toBe(ESC);
    expect(conf.paras).toEqual(["<em>rico</em> &amp; já escapado"]);
    expect(quiz.perguntas[0].explica).toBe(SUJO); // motor usa textContent
    expect(quiz.perguntas[0].pergunta).toBe("<strong>rico</strong>");
    expect(ord.nome).toBe(ESC);
    expect(cards.cards[0].titulo).toBe(ESC);
    expect(linha.itens[0].titulo).toBe(ESC);
    expect(contraste.itens[0].titulo).toBe(ESC);
    expect(fim.titulo).toBe(ESC);
    expect(c.contexto).toBe(SUJO); // textContent
    expect(c.titulo).toBe(SUJO); // não vai pelo motor; o index.html escapa
  });

  it("importar desfaz o escape e a ida e volta é idempotente", () => {
    const p = projetoSujo();
    const js1 = compilarDataJs(p);
    const { projeto: p2 } = importarDataJs(js1);
    const tela = p2.slides[1] as SlideConteudo;
    expect(tela.titulo).toBe(SUJO);
    expect(tela.kicker).toBe(SUJO);
    const conf = tela.blocos[0] as BlocoConfira;
    expect(conf.botao).toBe(SUJO);
    expect(conf.titulo).toBe(SUJO);
    expect(conf.paras).toEqual(["<em>rico</em> &amp; já escapado"]);
    expect((tela.blocos[1] as BlocoQuiz).perguntas[0].explica).toBe(SUJO);
    expect((tela.blocos[2] as BlocoOrdenar).nome).toBe(SUJO);
    expect(compilarDataJs(p2)).toBe(js1);
  });

  it("legado: título com entidade vira texto puro no projeto", () => {
    const { projeto } = importarDataJs(
      `window.CONTEUDO = { contexto: "c", slides: [
        { tipo: "capa", kicker: "k", titulo: "P &amp; D", sub: "s" },
        { kicker: "K &lt;1&gt;", titulo: "T", modais: [{ id: "m-1", botao: "Ver &amp; ler", titulo: "t", paras: ["x"] }] },
        { tipo: "fim", titulo: "Fim", texto: "t" } ] };`,
    );
    expect(projeto.slides[0]).toMatchObject({ titulo: "P & D" });
    expect(projeto.meta.titulo).toBe("P & D");
    const s = projeto.slides[1] as SlideConteudo;
    expect(s.kicker).toBe("K <1>");
    expect((s.blocos[0] as BlocoConfira).botao).toBe("Ver & ler");
  });

  it("texto que já contém entidade literal sobrevive à ida e volta", () => {
    expect(desescaparHtml(escaparHtml("&amp; e &lt;"))).toBe("&amp; e &lt;");
  });
});
