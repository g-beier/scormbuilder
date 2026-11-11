import { describe, expect, it } from "vitest";
import { compilarConteudo, compilarDataJs } from "./compilar";
import { novoBloco, novoProjeto, novoSlide } from "./fabrica";
import { imagensDeProjetos, imagensDoConteudo, imagensDoProjeto, nomeDoSrc, trocarImagens } from "./imagens";
import { importarDataJsSemIsolamento as importarDataJs } from "./importar";
import type { BlocoImagem, Projeto, SlideConteudo } from "./tipos";
import { validar } from "./validar";

const A = "0123456789abcdef.png";
const B = "fedcba9876543210.webp";

function projeto(...imagens: Array<Partial<BlocoImagem>>): Projeto {
  const p = novoProjeto({ curso: "CTGESTAO", ud: 9, atividade: "LEITURA", numero: 1, titulo: "T", contexto: "C" });
  p.slides[0] = { ...p.slides[0], titulo: "Capa" } as Projeto["slides"][0];
  const s = novoSlide("conteudo");
  s.titulo = "Tela";
  s.blocos = imagens.map((x) => ({ ...novoBloco("imagem"), ...x }));
  p.slides.splice(1, 0, s);
  return p;
}

const blocosV2 = (p: Projeto) => (compilarConteudo(p).slides[1] as { blocos: Array<Record<string, unknown>> }).blocos;
const problemas = (p: Projeto) => validar(p).map((x) => `${x.nivel}:${x.campo}:${x.mensagem}`);

describe("bloco imagem: fábrica e compilação", () => {
  it("nasce sem arquivo, sem descrição e não decorativa", () => {
    expect(novoBloco("imagem")).toEqual({ id: expect.stringMatching(/^b-/), tipo: "imagem", arquivo: "", alt: "", legenda: "", decorativa: false });
  });

  it("gera src img/<arquivo>, alt cru, legenda filtrada e opcionais só quando usados", () => {
    const p = projeto(
      { arquivo: A, alt: 'Gráfico "A" & <b>', legenda: "Fonte: <strong>IBGE</strong><img src=x onerror=alert(1)>", extras: { x: 1 } },
      { arquivo: B, alt: "guardada", legenda: "  ", decorativa: true },
    );
    const [a, b] = blocosV2(p);
    expect(a).toEqual({ id: a.id, tipo: "imagem", src: `img/${A}`, alt: 'Gráfico "A" & <b>', legenda: "Fonte: <strong>IBGE</strong>" });
    expect(Object.keys(a)).toEqual(["id", "tipo", "src", "alt", "legenda"]);
    // Decorativa: a descrição guardada não vai para o pacote
    expect(b).toEqual({ id: b.id, tipo: "imagem", src: `img/${B}`, alt: "", decorativa: true });
    expect(compilarDataJs(p)).toBe(compilarDataJs(structuredClone(p)));
    expect(compilarDataJs(p)).not.toContain("extras");
  });

  it("a importação traz alt, legenda e decorativa, mas pede a imagem de novo", () => {
    const p = projeto({ arquivo: A, alt: "Mapa & <rio>", legenda: "Leg <em>x</em>" }, { arquivo: B, decorativa: true });
    const { projeto: p2, avisos } = importarDataJs(compilarDataJs(p));
    const [a, b] = (p2.slides[1] as SlideConteudo).blocos as BlocoImagem[];
    expect(a).toMatchObject({ tipo: "imagem", arquivo: "", alt: "Mapa & <rio>", legenda: "Leg <em>x</em>", decorativa: false, extras: { src: `img/${A}` } });
    expect(b).toMatchObject({ arquivo: "", decorativa: true, extras: { src: `img/${B}` } });
    expect(avisos).toEqual([
      `Tela 2, bloco 1: a imagem “img/${A}” não vem junto com o data.js. Escolha o arquivo de novo no bloco “Imagem”.`,
      `Tela 2, bloco 2: a imagem “img/${B}” não vem junto com o data.js. Escolha o arquivo de novo no bloco “Imagem”.`,
    ]);
    expect(validar(p2).filter((x) => x.campo === "arquivo")).toHaveLength(2);
  });
});

describe("bloco imagem: validação", () => {
  it("válida com arquivo e descrição", () => {
    expect(validar(projeto({ arquivo: A, alt: "Mapa" }))).toEqual([]);
  });

  it("sem imagem escolhida ou com nome estranho: a corrigir", () => {
    expect(problemas(projeto({ alt: "x" }))).toEqual([
      "erro:arquivo:Tela 2: no bloco “Imagem”, falta escolher a imagem. Use “Escolher imagem…”.",
    ]);
    expect(problemas(projeto({ arquivo: "../x.png", alt: "x" }))[0]).toMatch(/^erro:arquivo:.*escolha a imagem de novo/);
  });

  it("sem descrição: a corrigir, a menos que seja decorativa", () => {
    expect(problemas(projeto({ arquivo: A, alt: "  " }))).toEqual([
      "erro:alt:Tela 2: no bloco “Imagem”, descreva a imagem para quem usa leitor de tela, ou marque como decorativa.",
    ]);
    expect(validar(projeto({ arquivo: A, decorativa: true }))).toEqual([]);
  });

  it("descrição longa é aviso; legenda com link inválido também", () => {
    const longa = problemas(projeto({ arquivo: A, alt: "a".repeat(251) }));
    expect(longa).toHaveLength(1);
    expect(longa[0]).toMatch(/^aviso:alt:.*251 caracteres. Prefira até 250/);
    expect(validar(projeto({ arquivo: A, alt: "a".repeat(250) }))).toEqual([]);
    const link = validar(projeto({ arquivo: A, alt: "x", legenda: "<a href='ftp://x'>y</a>" }));
    expect(link.map((x) => [x.nivel, x.campo])).toEqual([
      ["aviso", "legenda"],
      ["aviso", "legenda"],
    ]);
  });
});

describe("imagens do projeto e da prévia", () => {
  it("lista as imagens usadas, sem repetição, ignorando vazias e nomes inválidos", () => {
    const p = projeto({ arquivo: B }, { arquivo: A }, { arquivo: A }, { arquivo: "" }, { arquivo: "../a.png" });
    expect(imagensDoProjeto(p)).toEqual([A, B]);
    expect(imagensDoProjeto(null)).toEqual([]);
    expect(imagensDeProjetos([projeto({ arquivo: A }), null, projeto({ arquivo: B })])).toEqual([A, B]);
    expect(imagensDoConteudo(compilarConteudo(p))).toEqual([A, B]);
  });

  it("troca img/<nome> pelo data: e mantém o resto", () => {
    const p = projeto({ arquivo: A, alt: "a" }, { arquivo: B, alt: "b" }, { alt: "c" });
    const c = compilarConteudo(p);
    const t = trocarImagens(c, { [A]: "data:image/png;base64,AAAA" });
    const [a, b, x] = (t.slides[1] as { blocos: Array<Record<string, unknown>> }).blocos;
    expect(a.src).toBe("data:image/png;base64,AAAA");
    expect(b.src).toBe(`img/${B}`);
    expect(x.src).toBe("img/");
    // não muda o original
    expect(((c.slides[1] as { blocos: Array<Record<string, unknown>> }).blocos[0]).src).toBe(`img/${A}`);
    expect(nomeDoSrc(`img/${A}`)).toBe(A);
    expect(nomeDoSrc("img/../x.png")).toBeNull();
  });
});

describe("importar: <img> dentro do texto", () => {
  it("remove, guarda a marca em extras e avisa com orientação", () => {
    const { projeto: p, avisos } = importarDataJs(
      `window.CONTEUDO = { contexto: "c", slides: [
        { tipo: "capa", kicker: "k", titulo: "Capa", sub: "s" },
        { kicker: "K", titulo: "T", paras: ["Veja <img src='img/mapa.png' alt='Mapa'> o mapa.", "<img src=x onerror=alert(1)>"] },
        { tipo: "fim", titulo: "Fim", texto: "t" } ] };`,
    );
    const s = p.slides[1] as SlideConteudo;
    expect(s.blocos[0]).toMatchObject({ tipo: "texto", paras: ["Veja  o mapa.", ""] });
    expect(s.extras).toEqual({ imagensRemovidas: ["<img src='img/mapa.png' alt='Mapa'>", "<img src=x onerror=alert(1)>"] });
    expect(avisos).toContain(
      "Tela 2: havia 2 imagens dentro do texto, que o editor não aceita; elas foram removidas. Para mostrar uma imagem, adicione um bloco “Imagem” e escolha o arquivo.",
    );
    expect(avisos.some((a) => a.startsWith("2 textos tinham formatação não permitida"))).toBe(true);
    expect(compilarDataJs(p)).not.toContain("imagensRemovidas");
  });
});
