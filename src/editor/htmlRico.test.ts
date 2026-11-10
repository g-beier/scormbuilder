import { describe, expect, it } from "vitest";
import { limparColagemHtml, limparColagemTexto, normalizarSaida, normalizarUrl, urlPermitida } from "./htmlRico";

describe("normalizarUrl", () => {
  it("completa e recusa endereços", () => {
    expect(normalizarUrl("https://escoteiros.org.br")).toBe("https://escoteiros.org.br");
    expect(normalizarUrl(" escoteiros.org.br/x ")).toBe("https://escoteiros.org.br/x");
    expect(normalizarUrl("fulano@escoteiros.org.br")).toBe("mailto:fulano@escoteiros.org.br");
    expect(normalizarUrl("javascript:alert(1)")).toBeNull();
    expect(normalizarUrl("file:///etc/passwd")).toBeNull();
    expect(normalizarUrl("texto solto")).toBeNull();
    expect(normalizarUrl("")).toBeNull();
  });
  it("urlPermitida só aceita http(s) e mailto", () => {
    expect(urlPermitida("http://a.b")).toBe(true);
    expect(urlPermitida("mailto:a@b.c")).toBe(true);
    expect(urlPermitida("javascript:x")).toBe(false);
  });
});

describe("colagem", () => {
  it("tira blocos, scripts e quebras", () => {
    expect(limparColagemHtml("<h1>T</h1><p>a <b>b</b></p><script>x()</script><ul><li>c</li></ul>")).toBe(
      "T a <b>b</b> c  ",
    );
    expect(limparColagemTexto("linha 1\n\n  linha 2")).toBe("linha 1 linha 2");
  });
});

describe("normalizarSaida", () => {
  it("força target/rel nos links e esvazia parágrafo vazio", () => {
    expect(normalizarSaida('<a target="_blank" rel="noopener noreferrer nofollow" href="https://x.y">x</a>', true)).toBe(
      '<a href="https://x.y" target="_blank" rel="noopener">x</a>',
    );
    expect(normalizarSaida("<p></p>", false)).toBe("");
    expect(normalizarSaida("<strong>a</strong>", true)).toBe("<strong>a</strong>");
  });
});
