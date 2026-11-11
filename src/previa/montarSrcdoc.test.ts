/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compilarConteudo } from "../modelo/compilar";
import { novoBloco, novoProjeto, novoSlide } from "../modelo/fabrica";
import { cssComFontesEmbutidas, ID_DADOS, jsonParaScript, montarSrcdoc, type OpcoesPrevia } from "./montarSrcdoc";

const modelo = readFileSync(new URL("../../runtime/index.html", import.meta.url), "utf8");
const tema = readFileSync(new URL("../../runtime/css/tema.css", import.meta.url), "utf8");

describe("montarSrcdoc", () => {
  const p = novoProjeto({ curso: "CTGESTAO", ud: 1, atividade: "LEITURA", numero: 1, titulo: "A & <B>", contexto: "c" });
  p.slides[0] = { ...p.slides[0], titulo: "</script><script>alert(1)</script>" } as typeof p.slides[0];
  const opcoes: OpcoesPrevia = {
    base: "http://localhost:1420/runtime/",
    ponte: "http://localhost:1420/previa/ponte.js",
    css: "body{color:red}</style><script>alert(1)</script>",
    titulo: p.meta.titulo,
    conteudo: compilarConteudo(p),
    chave: "previa-x",
    telaInicial: 2,
    livre: true,
    sessao: "s-1",
    scorm: { dados: { "cmi.core.lesson_location": "1" }, fixos: { "cmi.core.entry": "resume" } },
  };
  const html = montarSrcdoc(modelo, opcoes);

  it("escapa o título, põe o base e não carrega data.js nem tema.css", () => {
    expect(html).toContain("<title>A &amp; &lt;B&gt;</title>");
    expect(html).not.toContain("{{TITULO}}");
    expect(html).toContain('<base href="http://localhost:1420/runtime/">');
    expect(html).not.toContain('src="js/data.js"');
    expect(html).not.toContain('href="css/tema.css"');
    expect(html).toContain('<script src="js/motor.js"></script>');
    expect(html).toContain('<script src="http://localhost:1420/previa/ponte.js"></script>');
  });

  it("nenhum script inline: a CSP do app (script-src 'self') vale no srcdoc", () => {
    const semEstilo = html.replace(/<style>[\s\S]*?<\/style>/g, "");
    const inline = semEstilo.match(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/json")[^>]*>/g) ?? [];
    expect(inline).toEqual([]);
  });

  it("CSS inline não fecha o <style>", () => {
    expect(html.match(/<\/style>/gi)).toHaveLength(1);
    expect(html).toContain("<\\/style><script>alert(1)</script>");
  });

  it("dados num bloco JSON que não fecha o <script>", () => {
    const m = new RegExp(`<script type="application/json" id="${ID_DADOS}">([\\s\\S]*?)</script>`).exec(html);
    expect(m).not.toBeNull();
    expect(m![1]).not.toMatch(/<\/script/i);
    expect(JSON.parse(m![1])).toEqual({
      sessao: "s-1",
      conteudo: compilarConteudo(p),
      opcoes: { chave: "previa-x", telaInicial: 2, livre: true },
      scorm: opcoes.scorm,
    });
  });

  it("troca img/<arquivo> pelo data: das imagens e mantém as que faltam", () => {
    const q = novoProjeto({ curso: "CTGESTAO", ud: 1, atividade: "LEITURA", numero: 1, titulo: "T", contexto: "c" });
    const s = novoSlide("conteudo");
    s.blocos = [
      { ...novoBloco("imagem"), arquivo: "0123456789abcdef.png", alt: "a" },
      { ...novoBloco("imagem"), arquivo: "fedcba9876543210.gif", alt: "b" },
    ];
    q.slides.splice(1, 0, s);
    const doc = montarSrcdoc(modelo, { ...opcoes, conteudo: compilarConteudo(q), imagens: { "0123456789abcdef.png": "data:image/png;base64,QUJD" } });
    const dados = JSON.parse(new RegExp(`<script type="application/json" id="${ID_DADOS}">([\\s\\S]*?)</script>`).exec(doc)![1]);
    const blocos = dados.conteudo.slides[1].blocos;
    expect(blocos[0].src).toBe("data:image/png;base64,QUJD");
    expect(blocos[1].src).toBe("img/fedcba9876543210.gif");
  });

  it("jsonParaScript escapa < > e separadores", () => {
    expect(jsonParaScript({ a: "</script>\u2028" })).toBe('{"a":"\\u003c/script\\u003e\\u2028"}');
  });

  it("falha com mensagem clara se o modelo mudar", () => {
    expect(() => montarSrcdoc("<html><head></head></html>", opcoes)).toThrow(/runtime\/index\.html mudou/);
  });
});

describe("cssComFontesEmbutidas", () => {
  it("troca as fontes do tema por data: e deixa o resto", () => {
    const nomes = [...tema.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
    expect(nomes.length).toBeGreaterThan(0);
    const fontes = Object.fromEntries(nomes.map((n) => [n, `data:font/woff2;base64,${n}`]));
    const css = cssComFontesEmbutidas(tema, fontes);
    expect(css).not.toContain("../fonts/");
    for (const n of nomes) expect(css).toContain(`url("data:font/woff2;base64,${n}")`);
    expect(css.length - tema.length).toBe(
      nomes.reduce((t, n) => t + `data:font/woff2;base64,${n}`.length - `../fonts/${n}`.length, 0),
    );
  });

  it("aceita aspas simples ou sem aspas e mantém fonte desconhecida", () => {
    expect(cssComFontesEmbutidas("a{src:url('../fonts/x.woff2')} b{src:url(../fonts/y.woff2)}", { "x.woff2": "data:X" })).toBe(
      'a{src:url("data:X")} b{src:url(../fonts/y.woff2)}',
    );
  });
});
