import { describe, expect, it } from "vitest";
import { compilarDataJs } from "./compilar";
import { novoBloco, novoProjeto, novoSlide } from "./fabrica";
import { importarDataJsSemIsolamento as importar } from "./importar";
import { limparHtml, limparHtmlDetalhado } from "./sanitizar";
import type { BlocoTexto, SlideConteudo } from "./tipos";

describe("limparHtml", () => {
  it("mantém byte a byte a marcação aceita (inclusive a dos pacotes existentes)", () => {
    const casos = [
      "Texto <strong>forte</strong> e <em>ênfase</em>.",
      "Veja <a href='https://www.escoteiros.org.br/x.pdf' target='_blank' rel='noopener'>o estatuto</a>.",
      'Link <a href="https://a.org/?a=1&amp;b=2" target="_blank" rel="noopener">aqui</a>',
      'Escreva para <a href="mailto:x@y.org" target="_blank" rel="noopener">x@y.org</a>',
      "Linha 1.<br/><em>Base: STF</em>",
      "A &lt; B &amp; C > D",
      "sem marcação",
      "",
    ];
    for (const c of casos) expect(limparHtmlDetalhado(c)).toEqual({ html: c, removeu: false });
  });

  it.each([
    ["<img src=x onerror=alert(1)>texto", "texto"],
    ["antes<script>alert(1)</script>depois", "antesdepois"],
    ["a<SCRIPT type='x'>alert(1)</ScRiPt >b", "ab"],
    ["<iframe src='https://mal.example'></iframe>ok", "ok"],
    ["<a href='javascript:alert(1)' target='_blank' rel='noopener'>clique</a>", "clique"],
    ["<a href='&#106;avascript:alert(1)'>x</a>", "x"],
    ["<a href=\"JaVaScRiPt:alert(1)\">x</a> <a href='data:text/html,oi'>y</a>", "x y"],
    ["<strong onclick='alert(1)'>forte</strong>", "<strong>forte</strong>"],
    ["<p><span style='color:red'>oi</span></p>", "oi"],
    ["<svg><script>alert(1)</script><a href='https://x.org'>z</a></svg>fim", "fim"],
    ["<style>body{display:none}</style>ok", "ok"],
    ["oi<!-- <img src=x onerror=alert(1)> -->!", "oi!"],
    ["<script>sem fim", ""],
    ["<br onload='alert(1)'>", "<br>"],
  ])("remove %s", (entrada, saida) => {
    expect(limparHtmlDetalhado(entrada)).toEqual({ html: saida, removeu: true });
  });

  it("refaz o link com target/rel corretos e fecha link aberto", () => {
    expect(limparHtml("<a href='https://x.org' onmouseover='alert(1)'>x</a>")).toBe(
      '<a href="https://x.org" target="_blank" rel="noopener">x</a>',
    );
    expect(limparHtml('<a target="_self" href="https://x.org">x')).toBe(
      '<a href="https://x.org" target="_blank" rel="noopener">x</a>',
    );
  });

  it("escapa < solto e marca malformada, sem contar como remoção", () => {
    expect(limparHtmlDetalhado("2 < 3")).toEqual({ html: "2 &lt; 3", removeu: false });
    expect(limparHtml("<img src=x onerror=alert(1)")).toBe("&lt;img src=x onerror=alert(1)");
  });

  it("é idempotente", () => {
    const sujo = "<b>x</b><a href='javascript:1'>y</a><img onerror=1>2 < 3<a href='https://ok.org'>z";
    const uma = limparHtml(sujo);
    expect(limparHtml(uma)).toBe(uma);
  });
});

describe("importação e compilação", () => {
  it("a importação limpa os campos ricos e avisa; os de texto simples ficam como estão", () => {
    const { projeto, avisos } = importar(`window.CONTEUDO = { formato: 2, id: "CTGESTAO_UD1_LEITURA1", contexto: "c", titulo: "t", slides: [
      { id: "s-capa0001", tipo: "capa", kicker: "k", titulo: "T", sub: "<img src=x onerror=alert(1)>Sub" },
      { id: "s-cont0001", tipo: "conteudo", kicker: "k", titulo: "C", blocos: [
        { id: "b-texto001", tipo: "texto", paras: ["<script>alert(1)</script>Oi", "<a href='javascript:x()'>link</a>"] },
        { id: "b-quiz0001", tipo: "quiz", perguntas: [{ pergunta: "<iframe src=x></iframe>P?", opcoes: ["<b>a</b>", "b"], correta: 0, explica: "<b>texto puro</b>" }] } ] },
      { id: "s-fim00001", tipo: "fim", titulo: "F", texto: "Fim" } ] };`);
    const [capa, cont] = projeto.slides as [{ sub: string }, SlideConteudo];
    expect(capa.sub).toBe("Sub");
    const texto = cont.blocos[0] as BlocoTexto;
    expect(texto.paras).toEqual(["Oi", "link"]);
    const quiz = cont.blocos[1] as Extract<SlideConteudo["blocos"][number], { tipo: "quiz" }>;
    expect(quiz.perguntas[0].pergunta).toBe("P?");
    expect(quiz.perguntas[0].opcoes).toEqual(["a", "b"]);
    expect(quiz.perguntas[0].explica).toBe("<b>texto puro</b>"); // textContent no motor
    expect(avisos.some((a) => /5 textos tinham formatação não permitida/.test(a))).toBe(true);
  });

  it("o compilador filtra também o que entrar por outro caminho (rascunho editado à mão)", () => {
    const p = novoProjeto();
    const b = novoBloco("texto") as BlocoTexto;
    b.paras = ["<img src=x onerror=alert(1)>Olá <strong>mundo</strong>"];
    const tela = novoSlide("conteudo") as SlideConteudo;
    tela.blocos = [b];
    p.slides.splice(1, 0, tela);
    const js = compilarDataJs(p);
    expect(js).not.toContain("onerror");
    expect(js).toContain('"Olá <strong>mundo</strong>"');
    expect(compilarDataJs(p)).toBe(js);
  });
});
