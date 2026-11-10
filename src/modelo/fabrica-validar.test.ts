import { describe, expect, it } from "vitest";
import { duplicarBloco, duplicarProjeto, duplicarSlide, novoBloco, novoProjeto, novoSlide } from "./fabrica";
import { TIPOS_BLOCO, type Bloco, type Projeto, type SlideConteudo } from "./tipos";
import { estimarSuspendData, validar } from "./validar";

const META = {
  curso: "CTGESTAO",
  ud: 11,
  atividade: "LEITURA",
  numero: 2,
  titulo: "Título",
  contexto: "Curso · UD 11",
};

/** Bloco de cada tipo, preenchido de forma válida. */
function blocoValido(tipo: Bloco["tipo"]): Bloco {
  const b = novoBloco(tipo);
  switch (b.tipo) {
    case "texto":
      b.paras = ["Um parágrafo."];
      break;
    case "lista":
      b.itens = ["Item"];
      break;
    case "cards":
      b.cards = [{ cor: "navy", titulo: "Cartão", paras: ["Texto"] }];
      break;
    case "ordenar":
      Object.assign(b, { nome: "Fluxo", passos: ["A", "B"], porque: "Porque sim." });
      break;
    case "linha":
      b.itens = [{ titulo: "2020", texto: "Algo" }];
      break;
    case "quiz":
      b.perguntas = [{ pergunta: "P?", opcoes: ["a", "b"], correta: 1, explica: "Porque b." }];
      break;
    case "contraste":
      b.itens = [{ cor: "red", titulo: "Não", texto: "x" }, { cor: "green", titulo: "Sim", texto: "y" }];
      break;
    case "destaque":
    case "fonte":
      b.html = "Texto <strong>forte</strong>";
      break;
    case "confira":
      Object.assign(b, { titulo: "Confira: x", paras: ["Resposta"] });
      break;
  }
  return b;
}

function projetoValido(): Projeto {
  const p = novoProjeto(META);
  p.slides[0] = { ...p.slides[0], titulo: "Capa" } as Projeto["slides"][0];
  const s = novoSlide("conteudo");
  s.titulo = "Conteúdo";
  s.blocos = TIPOS_BLOCO.map(blocoValido);
  p.slides.splice(1, 0, s);
  return p;
}

const erros = (p: Projeto) => validar(p).filter((x) => x.nivel === "erro");
const avisos = (p: Projeto) => validar(p).filter((x) => x.nivel === "aviso");
const conteudo = (p: Projeto) => p.slides[1] as SlideConteudo;

describe("fábrica", () => {
  it("projeto novo tem capa + fim e só os avisos esperados", () => {
    const p = novoProjeto(META);
    expect(p.slides.map((s) => s.tipo)).toEqual(["capa", "fim"]);
    expect(p.formato).toBe("cev-scorm-builder");
    // título da capa vem do meta
    expect(erros(p)).toEqual([]);
  });

  it("projeto novo sem meta: só erro de título da capa e aviso de meta", () => {
    const p = novoProjeto();
    expect(erros(p).map((e) => e.campo)).toEqual(["titulo"]);
    expect(avisos(p).map((a) => a.campo)).toEqual(["meta"]);
  });

  it("blocos novos têm defaults e ids únicos", () => {
    const ids = TIPOS_BLOCO.map((t) => novoBloco(t).id);
    expect(new Set(ids).size).toBe(ids.length);
    const q = novoBloco("quiz");
    expect(q.perguntas).toHaveLength(1);
    expect(q.perguntas[0].opcoes).toEqual(["", ""]);
    expect(novoBloco("cards").cards[0].cor).toBe("navy");
  });

  it("um bloco de cada tipo, preenchido, é válido", () => {
    const p = projetoValido();
    expect(validar(p)).toEqual([]);
  });

  it("duplicar gera ids novos", () => {
    const p = projetoValido();
    const s = duplicarSlide(conteudo(p));
    expect(s.id).not.toBe(conteudo(p).id);
    s.blocos.forEach((b, i) => expect(b.id).not.toBe(conteudo(p).blocos[i].id));
    const b = duplicarBloco(conteudo(p).blocos[0]);
    expect(b.id).not.toBe(conteudo(p).blocos[0].id);
    const p2 = duplicarProjeto(p);
    expect(p2.id).not.toBe(p.id);
    p.slides.push(...p2.slides.slice(1, 2));
    // a cópia não colide com o original
    expect(erros(p).some((e) => e.campo === "id")).toBe(false);
  });
});

describe("validar: erros", () => {
  const casos: Array<[string, (p: Projeto) => void, RegExp]> = [
    ["sem fim", (p) => p.slides.pop(), /Falta a tela de fim/],
    ["dois fins", (p) => p.slides.push(novoSlide("fim")), /mais de uma tela de fim/],
    ["fim não é a última", (p) => p.slides.splice(1, 0, novoSlide("fim")) && p.slides.pop(), /precisa ser a última/],
    ["capa fora da primeira", (p) => p.slides.splice(1, 0, { ...novoSlide("capa"), titulo: "x" }), /^Tela 2: a capa precisa ser a primeira/],
    ["título vazio", (p) => (conteudo(p).titulo = " "), /^Tela 2: falta o título/],
    ["quiz com 1 opção", (p) => bl(p, "quiz", (b) => (b.perguntas[0].opcoes = ["a"])), /pelo menos 2 alternativas/],
    ["quiz correta fora", (p) => bl(p, "quiz", (b) => (b.perguntas[0].correta = 2)), /alternativa correta/],
    ["ordenar com 1 passo", (p) => bl(p, "ordenar", (b) => (b.passos = ["A"])), /pelo menos 2 passos/],
    ["cards vazio", (p) => bl(p, "cards", (b) => (b.cards = [])), /pelo menos um cartão/],
    ["card sem conteúdo", (p) => bl(p, "cards", (b) => (b.cards = [{ cor: "navy" }])), /cartão 1 está vazio/],
    ["confira sem botão", (p) => bl(p, "confira", (b) => (b.botao = "")), /texto do botão/],
    ["confira sem título", (p) => bl(p, "confira", (b) => (b.titulo = "")), /título da janela/],
    ["confira sem texto", (p) => bl(p, "confira", (b) => (b.paras = [])), /texto que aparece ao abrir/],
    ["parágrafo vazio", (p) => bl(p, "texto", (b) => (b.paras = ["<p>&nbsp;</p>"])), /parágrafo 1 está vazio/],
    ["lista vazia", (p) => bl(p, "lista", (b) => (b.itens = [])), /pelo menos um item/],
    ["destaque vazio", (p) => bl(p, "destaque", (b) => (b.html = "")), /texto do destaque/],
    ["fonte vazia", (p) => bl(p, "fonte", (b) => (b.html = "")), /escreva a fonte/],
    ["linha sem texto", (p) => bl(p, "linha", (b) => (b.itens[0].texto = "")), /texto do marco 1/],
    ["contraste sem título", (p) => bl(p, "contraste", (b) => (b.itens[0].titulo = "")), /título do item 1/],
    ["ordenar sem porquê", (p) => bl(p, "ordenar", (b) => (b.porque = "")), /explicação da ordem/],
    ["pergunta sem explicação", (p) => bl(p, "quiz", (b) => (b.perguntas[0].explica = "")), /explicação da resposta/],
    ["fim sem texto", (p) => ((p.slides[2] as { texto: string }).texto = ""), /texto da tela de fim/],
    ["id duplicado", (p) => (conteudo(p).blocos[1].id = conteudo(p).blocos[0].id), /repete o identificador/],
  ];

  it.each(casos)("%s", (_nome, mexer, re) => {
    const p = projetoValido();
    mexer(p);
    const msgs = erros(p).map((e) => e.mensagem);
    expect(msgs.some((m) => re.test(m)), msgs.join("\n")).toBe(true);
  });
});

describe("validar: avisos", () => {
  it("link sem http e sem _blank", () => {
    const p = projetoValido();
    bl(p, "texto", (b) => (b.paras = ["Veja <a href='www.x.org'>aqui</a>"]));
    const msgs = avisos(p).map((a) => a.mensagem);
    expect(msgs.some((m) => /http/.test(m))).toBe(true);
    expect(msgs.some((m) => /nova aba/.test(m))).toBe(true);
    expect(erros(p)).toEqual([]);
  });

  it("link correto não gera aviso", () => {
    const p = projetoValido();
    bl(p, "texto", (b) => (b.paras = ["<a href='https://x.org' target='_blank' rel='noopener'>x</a>"]));
    expect(validar(p)).toEqual([]);
  });

  it("tela de conteúdo sem blocos", () => {
    const p = projetoValido();
    conteudo(p).blocos = [];
    expect(avisos(p).map((a) => a.mensagem)).toEqual(["Tela 2: a tela ainda não tem nenhum bloco de conteúdo."]);
  });

  it("suspend_data grande", () => {
    const p = projetoValido();
    const base = estimarSuspendData(p);
    for (let i = 0; i < 120; i++) {
      const s = novoSlide("conteudo");
      s.titulo = `T${i}`;
      s.blocos = [blocoValido("quiz"), blocoValido("confira"), blocoValido("ordenar")];
      p.slides.splice(1, 0, s);
    }
    expect(estimarSuspendData(p)).toBeGreaterThan(base);
    expect(avisos(p).some((a) => /grande demais/.test(a.mensagem))).toBe(true);
  });

  it("meta incompleta", () => {
    const p = projetoValido();
    p.meta.ud = 0;
    expect(avisos(p).map((a) => a.mensagem)).toEqual(["Dados do pacote incompletos: falta número da UD."]);
  });
});

function bl<T extends Bloco["tipo"]>(p: Projeto, tipo: T, f: (b: Extract<Bloco, { tipo: T }>) => void) {
  const b = conteudo(p).blocos.find((x) => x.tipo === tipo) as Extract<Bloco, { tipo: T }>;
  f(b);
}
