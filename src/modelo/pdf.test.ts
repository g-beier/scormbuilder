import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { embaralharFixo, gerarTypst, html } from "./pdf";
import type { ConteudoV2 } from "./tipos";

/** Lê um data.js (window.CONTEUDO = …) sem executar nada além do literal. */
function lerDataJs(caminho: string): ConteudoV2 {
  const fonte = readFileSync(caminho, "utf8");
  const ini = fonte.indexOf("window.CONTEUDO");
  const expr = fonte.slice(fonte.indexOf("=", ini) + 1).trim().replace(/;\s*$/, "");
  return new Function(`return (${expr});`)() as ConteudoV2;
}

const FIXTURES = join(__dirname, "../../runtime/test/fixtures");
const fixtures = ["kit-v2", "categorizar-v2", "ramificado-v2"].map((f) => lerDataJs(join(FIXTURES, `${f}.data.js`)));

describe("html → Typst", () => {
  it("texto vira string literal; formatação vira função", () => {
    expect(html('A <strong>b</strong> & "c" #x *y* <em>d</em>')).toBe('#"A "#strong[#"b"]#" & \\"c\\" #x *y* "#emph[#"d"]');
  });
  it("entidades, link seguro, br e tags estranhas", () => {
    expect(html("5 &lt; 6 &amp; ok")).toBe('#"5 < 6 & ok"');
    expect(html("<a href='https://x.org/a?b=1&amp;c=2' target='_blank'>site</a>")).toBe('#link("https://x.org/a?b=1&c=2")[#"site"]');
    expect(html('<a href="javascript:alert(1)">x</a>')).toBe('#"x"');
    expect(html("um<br>dois<br/>")).toBe('#"um"#linebreak()#"dois"');
    expect(html("<span>x</span> <b>y")).toBe('#"x"#" "#strong[#"y"]');
  });
  it("barra invertida e aspas não escapam do literal", () => {
    expect(html('C:\\pasta "x"')).toBe('#"C:\\\\pasta \\"x\\""');
  });
});

describe("gerarTypst", () => {
  it("é determinístico e segue as regras do registro", () => {
    for (const C of fixtures) {
      const a = gerarTypst(C, { gerado: "10/11/2026" });
      expect(gerarTypst(C, { gerado: "10/11/2026" })).toBe(a);
      expect(a).toContain(`#set document(title: `);
      expect(a).toContain('lang: "pt", region: "br"');
      expect(a).toContain('campo[#"Nome:"]');
      const fim = C.slides.find((s) => s.tipo === "fim");
      if (fim && fim.tipo === "fim") expect(a).not.toContain(fim.texto);
    }
  });

  it("não leva gabarito nem retornos", () => {
    const tudo = fixtures.map((C) => gerarTypst(C)).join("\n");
    for (const C of fixtures)
      for (const s of C.slides)
        if (s.tipo === "conteudo")
          for (const b of s.blocos) {
            const segredos: string[] = [];
            if (b.tipo === "multipla") b.opcoes.forEach((o) => o.fb && segredos.push(o.fb));
            if (b.tipo === "escolha") b.opcoes.forEach((o) => segredos.push(o.retorno));
            if (b.tipo === "categorizar") b.itens.forEach((i) => i.fb && segredos.push(i.fb));
            if (b.tipo === "ramificado") b.perguntas.forEach((p) => p.alternativas.forEach((x) => x.retorno && segredos.push(x.retorno)));
            for (const t of segredos.filter((t) => t.length > 8)) expect(tudo).not.toContain(t.slice(0, 20));
          }
  });

  it("questionário com caminhos vira roteiro; ordem embaralhada é fixa", () => {
    const t = gerarTypst(fixtures[2]);
    expect(t).toContain("→ vá para a pergunta 3");
    expect(t).toContain("→ fim do questionário");
    expect(embaralharFixo(5, "b-c3")).toEqual(embaralharFixo(5, "b-c3"));
    expect(embaralharFixo(5, "b-c3")).not.toEqual([0, 1, 2, 3, 4]);
  });

  // Gera os .typ para o teste Rust `pdf::testes::compila_fixtures` (PDF_SAIDA=pasta npx vitest run src/modelo/pdf.test.ts)
  it("grava os .typ das fixtures e dos LEITURA2 quando PDF_SAIDA estiver definido", () => {
    const saida = process.env.PDF_SAIDA;
    if (!saida) return;
    mkdirSync(saida, { recursive: true });
    const todos = [...fixtures];
    for (const raiz of [join(tmpdir(), "cev-m0", "v2"), join(homedir(), "Dev", "ead-scorm")]) {
      if (!existsSync(raiz)) continue;
      for (const d of readdirSync(raiz).filter((x) => x.endsWith("_LEITURA2")).sort()) {
        const dj = join(raiz, d, "js", "data.js");
        if (existsSync(dj) && raiz.includes("cev-m0")) todos.push(lerDataJs(dj));
      }
    }
    for (const C of todos) writeFileSync(join(saida, `${C.id}.typ`), gerarTypst(C, { gerado: "10/11/2026" }));
    expect(todos.length).toBeGreaterThanOrEqual(3);
  });
});
