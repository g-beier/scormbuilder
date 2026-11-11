/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compilarDataJs, nomePacote } from "./compilar";
import { avaliarDataJsDireto as avaliarDataJs, importarDataJsSemIsolamento as importarDataJs } from "./importar";
import type { SlideConteudo } from "./tipos";
import { validar } from "./validar";

describe("importar: casos sintéticos", () => {
  it("aceita var CONTEUDO e não toca o window real", () => {
    const g = globalThis as { CONTEUDO?: unknown };
    delete g.CONTEUDO;
    const { projeto } = importarDataJs(
      `var CONTEUDO = { contexto: "Curso Técnico de Gestão de UELs · UD 7 – X", slides: [
        { tipo: "capa", kicker: "k", titulo: "Capa", sub: "s" },
        { tipo: "fim", titulo: "Fim", texto: "t" } ] };
       window.vazou = 1;`,
    );
    expect(g.CONTEUDO).toBeUndefined();
    expect((globalThis as { vazou?: unknown }).vazou).toBeUndefined();
    expect(projeto.meta.ud).toBe(7);
    expect(projeto.meta.curso).toBe("CTGESTAO");
    expect(projeto.meta.titulo).toBe("Capa");
  });

  it("preserva campos desconhecidos em extras e divide fluxos", () => {
    const { projeto, avisos } = importarDataJs(
      `window.CONTEUDO = { contexto: "c", novo: 1, slides: [
        { tipo: "capa", kicker: "k", titulo: "Capa", sub: "s" },
        { kicker: "K", titulo: "T", estranho: "x", paras: ["p"], fonte: "f", destaque: "d",
          fluxos: [ { nome: "a", passos: ["1","2"], porque: "p", cor: "z" }, { nome: "b", passos: ["1","2"], porque: "p" } ],
          modais: [{ id: "m-1", botao: "b", titulo: "t", paras: ["x"] }] },
        { tipo: "fim", titulo: "Fim", texto: "t" } ] };`,
      undefined,
      "/x/MAPIJ_UD4_LEITURA3",
    );
    expect(projeto.extras).toEqual({ novo: 1 });
    expect(projeto.meta).toMatchObject({ curso: "MAPIJ", ud: 4, atividade: "LEITURA", numero: 3 });
    const [s1, s2] = projeto.slides.slice(1, 3) as SlideConteudo[];
    expect(s1.kicker).toBe("K · 1 de 2");
    expect(s2.kicker).toBe("K · 2 de 2");
    expect(s1.extras).toEqual({ estranho: "x" });
    expect(s1.blocos.map((b) => b.tipo)).toEqual(["texto", "confira", "ordenar"]);
    expect(s1.blocos[1].id).toBe("m-1");
    expect(s1.blocos[2].extras).toEqual({ cor: "z" });
    expect(s2.blocos.map((b) => b.tipo)).toEqual(["ordenar", "destaque", "fonte"]);
    expect(avisos.some((a) => /primeira das 2 telas/.test(a))).toBe(true);
  });
});

describe("importar v2: tipos do M6", () => {
  const fonte = `window.CONTEUDO = { formato: 2, id: "MAPIJ_UD4_LEITURA3", contexto: "c", titulo: "T", slides: [
    { id: "s-capa", tipo: "capa", kicker: "k", titulo: "Capa", sub: "s" },
    { id: "s-1", tipo: "conteudo", kicker: "K", titulo: "Tela", blocos: [
      { id: "b-m", tipo: "multipla", enunciado: "Marque", novo: 1,
        opcoes: [ { texto: "A", correta: true, fb: "Sim", cor: "z" }, { texto: "B", correta: "não", fb: "Não" } ],
        msgAcerto: "Boa!" },
      { id: "b-r", tipo: "reflexao", pergunta: "P?", minChars: 10, maxChars: "muito", opcional: false },
      { id: "b-e", tipo: "escolha", pergunta: "E?", opcoes: [ { texto: "1", retorno: "r1" }, { texto: "2", retorno: "r2" } ] }
    ] },
    { id: "s-fim", tipo: "fim", titulo: "Fim", texto: "t" } ] };`;

  it("lê os 3 tipos, guarda desconhecidos e formatos inesperados em extras", () => {
    const { projeto, avisos } = importarDataJs(fonte);
    const [m, r, e] = (projeto.slides[1] as SlideConteudo).blocos;
    expect(m).toEqual({
      id: "b-m",
      tipo: "multipla",
      enunciado: "Marque",
      opcoes: [
        { texto: "A", correta: true, fb: "Sim", extras: { cor: "z" } },
        { texto: "B", correta: false, fb: "Não", extras: { correta: "não" } },
      ],
      msgAcerto: "Boa!",
      extras: { novo: 1 },
    });
    expect(r).toEqual({ id: "b-r", tipo: "reflexao", pergunta: "P?", minChars: 10, opcional: false, extras: { maxChars: "muito" } });
    expect(e).toEqual({ id: "b-e", tipo: "escolha", pergunta: "E?", opcoes: [{ texto: "1", retorno: "r1" }, { texto: "2", retorno: "r2" }] });
    expect(avisos.filter((a) => /formato inesperado/.test(a))).toHaveLength(2);
  });

  it("ida e volta: compilar → importar → compilar é idêntico", () => {
    const { projeto } = importarDataJs(fonte);
    const js1 = compilarDataJs(projeto);
    expect(js1).not.toContain("minChars"); // 10 é o padrão
    const js2 = compilarDataJs(importarDataJs(js1).projeto);
    expect(js2).toBe(js1);
  });
});

describe("importar v2: categorizar", () => {
  it("desescapa categorias; categoria inválida vira -1 e vai para extras", () => {
    const fonte = `window.CONTEUDO = { formato: 2, id: "X_UD1_Y1", contexto: "c", titulo: "T", slides: [
      { id: "s-1", tipo: "conteudo", titulo: "Tela", blocos: [
        { id: "b-c", tipo: "categorizar", enunciado: "E", categorias: ["A &amp; B", "C"],
          itens: [ { texto: "i1", categoria: 1, fb: "f" }, { texto: "i2", categoria: "a" } ], msgRevisar: "R" } ] },
      { id: "s-fim", tipo: "fim", titulo: "Fim", texto: "t" } ] };`;
    const { projeto, avisos } = importarDataJs(fonte);
    const [c] = (projeto.slides[0] as SlideConteudo).blocos;
    expect(c).toEqual({
      id: "b-c",
      tipo: "categorizar",
      enunciado: "E",
      categorias: ["A & B", "C"],
      itens: [
        { texto: "i1", categoria: 1, fb: "f" },
        { texto: "i2", categoria: -1, fb: "", extras: { categoria: "a" } },
      ],
      msgRevisar: "R",
    });
    expect(avisos.filter((a) => /formato inesperado/.test(a))).toHaveLength(1);
  });
});

// ---------- Teste de ouro com os pacotes reais do ead-scorm ----------

const RAIZ = join(homedir(), "Dev", "ead-scorm");
const pastas = existsSync(RAIZ)
  ? readdirSync(RAIZ)
      .filter((d) => d.endsWith("_LEITURA2") && existsSync(join(RAIZ, d, "js", "data.js")))
      .sort()
  : [];

/** Multiconjunto de todas as strings, ignorando chaves estruturais. */
function strings(v: unknown, out: string[] = [], chave = ""): string[] {
  if (typeof v === "string") {
    if (chave !== "tipo" && chave !== "id") out.push(v);
  } else if (Array.isArray(v)) v.forEach((x) => strings(x, out, chave));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) strings(x, out, k);
  return out;
}

/** Strings do v2, desfazendo o que a divisão de fluxos gera. */
function stringsV2(c: { slides: Array<Record<string, unknown>> }): string[] {
  const out: string[] = [];
  for (const s of c.slides) {
    const m = typeof s.kicker === "string" ? /^(.*) · (\d+) de (\d+)$/.exec(s.kicker) : null;
    if (m) {
      // tela gerada: o kicker original conta uma vez; o título só na 1ª
      const { kicker: _k, titulo, ...resto } = s;
      if (m[2] === "1") out.push(m[1], titulo as string);
      strings(resto, out);
    } else strings(s, out);
  }
  out.push(...strings((c as Record<string, unknown>).contexto));
  return out;
}

const contar = (xs: string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

describe.skipIf(pastas.length === 0)(`teste de ouro: ${pastas.length} pacotes LEITURA2 em ${RAIZ}`, () => {
  if (pastas.length === 0) it.skip(`pasta ${RAIZ} não encontrada`, () => {});

  it.each(pastas)("%s: importar → compilar → importar → compilar é idempotente e sem perdas", (pasta) => {
    const fonte = readFileSync(join(RAIZ, pasta, "js", "data.js"), "utf8");
    const legado = avaliarDataJs(fonte) as { contexto: string; slides: unknown[] };

    const { projeto, avisos } = importarDataJs(fonte, undefined, pasta);
    expect(nomePacote(projeto.meta)).toBe(pasta);
    // O filtro de HTML não mexe em nada dos pacotes aprovados.
    expect(avisos.filter((a) => /elementos que o editor não aceita/.test(a))).toEqual([]);
    const erros = validar(projeto).filter((p) => p.nivel === "erro");
    expect(erros.map((e) => e.mensagem)).toEqual([]);

    const js1 = compilarDataJs(projeto);
    const { projeto: p2 } = importarDataJs(js1);
    const js2 = compilarDataJs(p2);
    expect(js2).toBe(js1);
    expect(p2.meta).toEqual(projeto.meta);

    const v2 = avaliarDataJs(js1) as { slides: Array<Record<string, unknown>> };
    const a = contar(strings(legado));
    const b = contar(stringsV2(v2));
    expect(Object.fromEntries(b)).toEqual(Object.fromEntries(a));
  });
});
