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
    case "multipla":
      b.enunciado = "Marque as corretas.";
      b.opcoes = [
        { texto: "A", correta: true, fb: "Sim." },
        { texto: "B", correta: false, fb: "Não." },
      ];
      break;
    case "reflexao":
      b.pergunta = "O que você faria?";
      break;
    case "escolha":
      b.pergunta = "Como você se sente?";
      b.opcoes = [
        { texto: "Seguro", retorno: "Ótimo." },
        { texto: "Inseguro", retorno: "Revise a seção 2." },
      ];
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

  it("projeto novo sem meta: título da capa e UD a corrigir, aviso de meta", () => {
    const p = novoProjeto();
    expect(erros(p).map((e) => e.campo)).toEqual(["titulo", "meta"]);
    expect(avisos(p).map((a) => a.campo)).toEqual(["meta"]);
  });

  it("blocos novos têm defaults e ids únicos", () => {
    const ids = TIPOS_BLOCO.map((t) => novoBloco(t).id);
    expect(new Set(ids).size).toBe(ids.length);
    const q = novoBloco("quiz");
    expect(q.perguntas).toHaveLength(1);
    expect(q.perguntas[0].opcoes).toEqual(["", ""]);
    expect(novoBloco("cards").cards[0].cor).toBe("navy");
    const m = novoBloco("multipla");
    expect(m.opcoes).toEqual([{ texto: "", correta: false, fb: "" }, { texto: "", correta: false, fb: "" }]);
    expect(m).not.toHaveProperty("msgAcerto");
    expect(novoBloco("reflexao")).toEqual({ id: expect.stringMatching(/^b-/), tipo: "reflexao", pergunta: "" });
    expect(novoBloco("escolha").opcoes).toEqual([{ texto: "", retorno: "" }, { texto: "", retorno: "" }]);
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
    ["contraste sem título", (p) => bl(p, "contraste", (b) => (b.itens[0].titulo = "")), /título do lado 1/],
    ["ordenar sem porquê", (p) => bl(p, "ordenar", (b) => (b.porque = "")), /Por que esta ordem/],
    ["pergunta sem explicação", (p) => bl(p, "quiz", (b) => (b.perguntas[0].explica = "")), /explicação da resposta/],
    ["fim sem texto", (p) => ((p.slides[2] as { texto: string }).texto = ""), /falta a mensagem final/],
    ["multipla sem enunciado", (p) => bl(p, "multipla", (b) => (b.enunciado = "<p> </p>")), /“Múltipla escolha”, falta o enunciado/],
    ["multipla com 1 alternativa", (p) => bl(p, "multipla", (b) => b.opcoes.splice(1)), /pelo menos 2 alternativas/],
    ["multipla sem correta", (p) => bl(p, "multipla", (b) => (b.opcoes[0].correta = false)), /marque pelo menos uma alternativa como correta/],
    ["multipla alternativa vazia", (p) => bl(p, "multipla", (b) => (b.opcoes[1].texto = "")), /“Múltipla escolha”, a alternativa 2 está vazia/],
    ["reflexao sem pergunta", (p) => bl(p, "reflexao", (b) => (b.pergunta = "")), /falta a pergunta para reflexão/],
    ["reflexao min > max", (p) => bl(p, "reflexao", (b) => Object.assign(b, { minChars: 300, maxChars: 200 })), /Mínimo de caracteres” é maior/],
    ["reflexao min > padrão do max", (p) => bl(p, "reflexao", (b) => (b.minChars = 600)), /Mínimo de caracteres” é maior/],
    ["reflexao max > 2000", (p) => bl(p, "reflexao", (b) => (b.maxChars = 2001)), /passa de 2000/],
    ["reflexao min < 1", (p) => bl(p, "reflexao", (b) => (b.minChars = 0)), /“Mínimo de caracteres” precisa ser um número inteiro/],
    ["reflexao min fracionário", (p) => bl(p, "reflexao", (b) => (b.minChars = 2.5)), /“Mínimo de caracteres” precisa ser/],
    ["reflexao max < 1", (p) => bl(p, "reflexao", (b) => (b.maxChars = 0)), /“Máximo de caracteres” precisa ser/],
    ["escolha sem pergunta", (p) => bl(p, "escolha", (b) => (b.pergunta = "")), /“Escolha com retorno”, falta a pergunta\./],
    ["escolha com 1 alternativa", (p) => bl(p, "escolha", (b) => b.opcoes.pop()), /“Escolha com retorno”, são necessárias pelo menos 2/],
    ["escolha alternativa vazia", (p) => bl(p, "escolha", (b) => (b.opcoes[0].texto = "")), /a alternativa 1 está vazia/],
    ["escolha sem retorno", (p) => bl(p, "escolha", (b) => (b.opcoes[1].retorno = " ")), /falta o retorno da alternativa 2/],
    ["id duplicado", (p) => (conteudo(p).blocos[1].id = conteudo(p).blocos[0].id), /corrompido ou repetido/],
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
    expect(avisos(p).map((a) => a.mensagem)).toEqual(["Tela 2: a tela ainda não tem nenhum bloco de conteúdo. Use “Adicionar bloco”."]);
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
    expect(avisos(p).some((a) => /demais para o Moodle/.test(a.mensagem))).toBe(true);
  });

  it("meta incompleta", () => {
    const p = projetoValido();
    p.meta.ud = 0;
    expect(avisos(p)).toEqual([]);
    expect(erros(p).map((a) => a.mensagem)).toEqual([
      "Dados do pacote: falta o “Número da UD”. Ele faz parte do nome do pacote no Moodle.",
    ]);
  });

  it("meta com vários campos faltando usa plural", () => {
    const p = projetoValido();
    p.meta.contexto = "";
    p.meta.curso = "";
    expect(avisos(p).map((a) => a.mensagem)).toEqual(["Dados do pacote incompletos: faltam “Curso” e “Linha de contexto”."]);
    p.meta.curso = "CTGESTAO";
    expect(avisos(p).map((a) => a.mensagem)).toEqual(["Dados do pacote incompletos: falta “Linha de contexto”."]);
  });

  it("cartão vazio gera só um item a corrigir", () => {
    const p = projetoValido();
    bl(p, "cards", (b) => (b.cards = [{ cor: "navy", paras: [""] }]));
    expect(erros(p).map((e) => e.mensagem)).toEqual(["Tela 2: no bloco “Cartões”, o cartão 1 está vazio."]);
  });

  it("multipla: comentário vazio é aviso (um só, por bloco), não erro", () => {
    const p = projetoValido();
    bl(p, "multipla", (b) => {
      b.opcoes[0].fb = "";
      b.opcoes.push({ texto: "C", correta: false, fb: " " });
    });
    expect(erros(p)).toEqual([]);
    const a = avisos(p);
    expect(a.map((x) => x.mensagem)).toEqual([
      "Tela 2: no bloco “Múltipla escolha”, as alternativas 1 e 3 estão sem comentário. Escreva o que o aluno deve ler ao verificar a resposta.",
    ]);
    expect(a[0].campo).toBe("opcoes[0].fb");
    bl(p, "multipla", (b) => (b.opcoes[2].fb = "ok"));
    expect(avisos(p).map((x) => x.mensagem)[0]).toMatch(/a alternativa 1 está sem comentário/);
  });

  it("reflexao: limites no padrão e no máximo permitido são válidos", () => {
    const p = projetoValido();
    bl(p, "reflexao", (b) => Object.assign(b, { minChars: 1, maxChars: 2000, opcional: false, aviso: "" }));
    expect(validar(p)).toEqual([]);
    bl(p, "reflexao", (b) => Object.assign(b, { minChars: 50, maxChars: 50 }));
    expect(validar(p)).toEqual([]);
  });

  it("reflexao: min fora do intervalo não gera também “mínimo maior que máximo”", () => {
    const p = projetoValido();
    bl(p, "reflexao", (b) => Object.assign(b, { minChars: 0, maxChars: 3000 }));
    expect(erros(p).map((e) => e.campo)).toEqual(["minChars", "maxChars"]);
  });

  it("suspend_data conta os tipos novos", () => {
    const p = projetoValido();
    const base = estimarSuspendData(p);
    const s = novoSlide("conteudo");
    s.titulo = "x";
    const m = blocoValido("multipla");
    s.blocos = [m];
    p.slides.splice(1, 0, s);
    const comM = estimarSuspendData(p);
    expect(comM - base).toBe(s.id.length + 4 + m.id.length + 4 + 2 * 2 + 4);
    s.blocos.push(blocoValido("reflexao"), blocoValido("escolha"));
    expect(estimarSuspendData(p) - comM).toBe(2 * (10 + 4 + 8));
  });

  it("campo simples com “<” não conta como vazio", () => {
    const p = projetoValido();
    conteudo(p).titulo = "<b>";
    expect(erros(p)).toEqual([]);
  });
});

function bl<T extends Bloco["tipo"]>(p: Projeto, tipo: T, f: (b: Extract<Bloco, { tipo: T }>) => void) {
  const b = conteudo(p).blocos.find((x) => x.tipo === tipo) as Extract<Bloco, { tipo: T }>;
  f(b);
}
