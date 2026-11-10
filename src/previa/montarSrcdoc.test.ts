/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compilarConteudo } from "../modelo/compilar";
import { novoProjeto } from "../modelo/fabrica";
import { jsonParaScript, montarSrcdoc } from "./montarSrcdoc";

const modelo = readFileSync(new URL("../../runtime/index.html", import.meta.url), "utf8");

describe("montarSrcdoc", () => {
  const p = novoProjeto({ curso: "CTGESTAO", ud: 1, atividade: "LEITURA", numero: 1, titulo: "A & <B>", contexto: "c" });
  p.slides[0] = { ...p.slides[0], titulo: "</script><script>alert(1)</script>" } as typeof p.slides[0];
  const html = montarSrcdoc(modelo, {
    base: "http://localhost:1420/runtime/",
    titulo: p.meta.titulo,
    conteudo: compilarConteudo(p),
    chave: "previa-x",
    telaInicial: 2,
    livre: true,
  });

  it("escapa o título, põe o base e não carrega data.js", () => {
    expect(html).toContain("<title>A &amp; &lt;B&gt;</title>");
    expect(html).not.toContain("{{TITULO}}");
    expect(html).toContain('<base href="http://localhost:1420/runtime/">');
    expect(html).not.toContain('src="js/data.js"');
    expect(html).toContain('<script src="js/motor.js"></script>');
  });

  it("CONTEUDO inline não fecha o <script> e o Motor recebe as opções", () => {
    const scripts = html.match(/<script>[\s\S]*?<\/script>/g) ?? [];
    expect(scripts).toHaveLength(2);
    expect(scripts[0]!).toMatch(/^<script>window\.CONTEUDO = \{/);
    expect(scripts[1]).toContain('Motor.iniciar(window.CONTEUDO, {"chave":"previa-x","telaInicial":2,"livre":true})');
    const json = scripts[0]!.slice("<script>window.CONTEUDO = ".length, -"};</script>".length + 1);
    expect(JSON.parse(json)).toEqual(compilarConteudo(p));
  });

  it("jsonParaScript escapa < > e separadores", () => {
    expect(jsonParaScript({ a: "</script>\u2028" })).toBe('{"a":"\\u003c/script\\u003e\\u2028"}');
  });

  it("falha com mensagem clara se o modelo mudar", () => {
    expect(() => montarSrcdoc("<html><head></head></html>", { base: "/", titulo: "", conteudo: compilarConteudo(p), chave: "k", telaInicial: 0, livre: true })).toThrow(/runtime\/index\.html mudou/);
  });
});
