import {
  CORES,
  NOMES_BLOCO,
  type Bloco,
  type Problema,
  type Projeto,
  type Slide,
} from "./tipos";

/** Limite prático do cmi.suspend_data (o SCORM 1.2 aceita 4096). */
export const LIMITE_SUSPEND_DATA = 3500;

/** Texto visível de um trecho HTML (sem tags, sem &nbsp;), aparado. */
export function textoVisivel(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;| /gi, " ")
    .trim();
}

function vazio(html: unknown): boolean {
  return textoVisivel(html) === "";
}

/** Todos os trechos de texto/HTML de um bloco, com o caminho do campo. */
export function textosDoBloco(b: Bloco): Array<[campo: string, html: string]> {
  const out: Array<[string, string]> = [];
  const lista = (campo: string, v: string[] | undefined) =>
    (v ?? []).forEach((t, i) => out.push([`${campo}[${i}]`, t]));
  switch (b.tipo) {
    case "texto":
      lista("paras", b.paras);
      break;
    case "lista":
      lista("itens", b.itens);
      break;
    case "cards":
      b.cards.forEach((c, i) => {
        if (c.titulo !== undefined) out.push([`cards[${i}].titulo`, c.titulo]);
        if (c.breve !== undefined) out.push([`cards[${i}].breve`, c.breve]);
        lista(`cards[${i}].paras`, c.paras);
        lista(`cards[${i}].lista`, c.lista);
      });
      break;
    case "ordenar":
      out.push(["nome", b.nome]);
      lista("passos", b.passos);
      out.push(["porque", b.porque]);
      if (b.nota !== undefined) out.push(["nota", b.nota]);
      break;
    case "linha":
    case "contraste":
      b.itens.forEach((it, i) => {
        out.push([`itens[${i}].titulo`, it.titulo]);
        out.push([`itens[${i}].texto`, it.texto]);
      });
      break;
    case "quiz":
      b.perguntas.forEach((p, i) => {
        out.push([`perguntas[${i}].pergunta`, p.pergunta]);
        lista(`perguntas[${i}].opcoes`, p.opcoes);
        out.push([`perguntas[${i}].explica`, p.explica]);
      });
      break;
    case "destaque":
    case "fonte":
      out.push(["html", b.html]);
      break;
    case "confira":
      out.push(["botao", b.botao]);
      out.push(["titulo", b.titulo]);
      lista("paras", b.paras);
      break;
  }
  return out;
}

function textosDoSlide(s: Slide): Array<[string, string]> {
  switch (s.tipo) {
    case "capa":
      return [["kicker", s.kicker], ["titulo", s.titulo], ["sub", s.sub]];
    case "conteudo":
      return [["kicker", s.kicker], ["titulo", s.titulo]];
    case "fim":
      return [["titulo", s.titulo], ["texto", s.texto]];
  }
}

/**
 * Estimativa conservadora do tamanho do suspend_data: supõe que o motor
 * guarda, por id, cada tela visitada, cada pergunta respondida (com índice),
 * cada fluxo de ordenar concluído e cada Confira aberto.
 */
export function estimarSuspendData(projeto: Projeto): number {
  let n = 60; // envelope JSON, chaves e lesson_location
  for (const s of projeto.slides) {
    n += s.id.length + 4;
    if (s.tipo !== "conteudo") continue;
    for (const b of s.blocos) {
      if (b.tipo === "quiz") n += b.perguntas.length * (b.id.length + 10);
      else if (b.tipo === "ordenar" || b.tipo === "confira") n += b.id.length + 4;
    }
  }
  return n;
}

const RE_LINK = /<a\b([^>]*)>/gi;

function verificarLinks(html: string): Array<"sem-http" | "sem-blank"> {
  const achados: Array<"sem-http" | "sem-blank"> = [];
  for (const m of html.matchAll(RE_LINK)) {
    const attrs = m[1];
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
    if (!/^https?:\/\//i.test(href.trim()) && !/^mailto:/i.test(href.trim())) achados.push("sem-http");
    if (!/\btarget\s*=\s*["']_blank["']/i.test(attrs)) achados.push("sem-blank");
  }
  return achados;
}

export function validar(projeto: Projeto): Problema[] {
  const probs: Problema[] = [];
  const slides = projeto.slides ?? [];
  const tela = (i: number) => `Tela ${i + 1}`;

  // ---------- Estrutura ----------
  const fins = slides.map((s, i) => [s, i] as const).filter(([s]) => s.tipo === "fim");
  if (fins.length === 0) {
    probs.push({ nivel: "erro", mensagem: "Falta a tela de fim. Todo SCORM precisa terminar com uma tela de fim." });
  } else {
    if (fins.length > 1) {
      for (const [s, i] of fins.slice(0, -1)) {
        probs.push({
          nivel: "erro",
          slideId: s.id,
          mensagem: `${tela(i)}: há mais de uma tela de fim. Deixe só uma, no final.`,
        });
      }
    }
    const [ultimoFim, iFim] = fins[fins.length - 1];
    if (iFim !== slides.length - 1) {
      probs.push({
        nivel: "erro",
        slideId: ultimoFim.id,
        mensagem: `${tela(iFim)}: a tela de fim precisa ser a última.`,
      });
    }
  }
  slides.forEach((s, i) => {
    if (s.tipo === "capa" && i !== 0) {
      probs.push({ nivel: "erro", slideId: s.id, mensagem: `${tela(i)}: a capa precisa ser a primeira tela.` });
    }
  });

  // ---------- Ids ----------
  const vistos = new Set<string>();
  const checarId = (id: string, i: number, slideId: string, blocoId?: string) => {
    const onde = blocoId ? "um bloco" : "a tela";
    if (!id) {
      probs.push({ nivel: "erro", slideId, blocoId, campo: "id", mensagem: `${tela(i)}: ${onde} está sem identificador interno.` });
    } else if (vistos.has(id)) {
      probs.push({
        nivel: "erro",
        slideId,
        blocoId,
        campo: "id",
        mensagem: `${tela(i)}: ${onde} repete o identificador interno "${id}". Duplique o item pelo editor em vez de copiar o arquivo.`,
      });
    } else vistos.add(id);
  };

  // ---------- Telas ----------
  slides.forEach((s, i) => {
    checarId(s.id, i, s.id);
    const erroSlide = (campo: string, mensagem: string) =>
      probs.push({ nivel: "erro", slideId: s.id, campo, mensagem: `${tela(i)}: ${mensagem}` });

    if (vazio(s.titulo)) erroSlide("titulo", "falta o título.");
    if (s.tipo === "fim" && vazio(s.texto)) erroSlide("texto", "falta o texto da tela de fim.");

    for (const [campo, html] of textosDoSlide(s)) linkAvisos(html, i, s.id, undefined, campo);

    if (s.tipo !== "conteudo") return;
    if (!s.blocos || s.blocos.length === 0) {
      probs.push({
        nivel: "aviso",
        slideId: s.id,
        mensagem: `${tela(i)}: a tela ainda não tem nenhum bloco de conteúdo.`,
      });
      return;
    }
    s.blocos.forEach((b) => {
      checarId(b.id, i, s.id, b.id);
      validarBloco(b, i, s.id);
      for (const [campo, html] of textosDoBloco(b)) linkAvisos(html, i, s.id, b.id, campo);
    });
  });

  function linkAvisos(html: string, i: number, slideId: string, blocoId: string | undefined, campo: string) {
    if (typeof html !== "string") return;
    const achados = new Set(verificarLinks(html));
    if (achados.has("sem-http")) {
      probs.push({
        nivel: "aviso",
        slideId,
        blocoId,
        campo,
        mensagem: `${tela(i)}: há um link que não começa com http:// ou https://. Confira o endereço.`,
      });
    }
    if (achados.has("sem-blank")) {
      probs.push({
        nivel: "aviso",
        slideId,
        blocoId,
        campo,
        mensagem: `${tela(i)}: há um link que não abre em nova aba. Dentro do Moodle, ele tiraria o aluno da atividade.`,
      });
    }
  }

  function validarBloco(b: Bloco, i: number, slideId: string) {
    const nome = NOMES_BLOCO[b.tipo] ?? b.tipo;
    const erro = (campo: string | undefined, msg: string) =>
      probs.push({ nivel: "erro", slideId, blocoId: b.id, campo, mensagem: `${tela(i)}: no bloco "${nome}", ${msg}` });
    const listaObrigatoria = (campo: string, v: string[] | undefined, falta: string, itemVazio: string) => {
      if (!v || v.length === 0) erro(campo, falta);
      else v.forEach((t, k) => vazio(t) && erro(`${campo}[${k}]`, itemVazio.replace("{n}", String(k + 1))));
    };

    switch (b.tipo) {
      case "texto":
        listaObrigatoria("paras", b.paras, "escreva pelo menos um parágrafo.", "o parágrafo {n} está vazio.");
        break;
      case "lista":
        listaObrigatoria("itens", b.itens, "escreva pelo menos um item.", "o item {n} está vazio.");
        break;
      case "cards":
        if (!b.cards || b.cards.length === 0) {
          erro("cards", "adicione pelo menos um cartão.");
          break;
        }
        b.cards.forEach((c, k) => {
          const base = `cards[${k}]`;
          if (!CORES.includes(c.cor)) erro(`${base}.cor`, `escolha a cor do cartão ${k + 1}.`);
          const temAlgo =
            !vazio(c.titulo) ||
            !vazio(c.breve) ||
            (c.paras ?? []).some((t) => !vazio(t)) ||
            (c.lista ?? []).some((t) => !vazio(t));
          if (!temAlgo) erro(base, `o cartão ${k + 1} está vazio.`);
          (c.paras ?? []).forEach((t, j) => vazio(t) && erro(`${base}.paras[${j}]`, `o cartão ${k + 1} tem um parágrafo vazio.`));
          (c.lista ?? []).forEach((t, j) => vazio(t) && erro(`${base}.lista[${j}]`, `o cartão ${k + 1} tem um item de lista vazio.`));
        });
        break;
      case "ordenar":
        if (vazio(b.nome)) erro("nome", "falta o nome da sequência.");
        if (!b.passos || b.passos.length < 2) erro("passos", "são necessários pelo menos 2 passos para ordenar.");
        else b.passos.forEach((t, k) => vazio(t) && erro(`passos[${k}]`, `o passo ${k + 1} está vazio.`));
        if (vazio(b.porque)) erro("porque", "falta a explicação da ordem correta.");
        break;
      case "linha":
        if (!b.itens || b.itens.length === 0) erro("itens", "adicione pelo menos um marco.");
        else
          b.itens.forEach((it, k) => {
            if (vazio(it.titulo)) erro(`itens[${k}].titulo`, `falta o título do marco ${k + 1}.`);
            if (vazio(it.texto)) erro(`itens[${k}].texto`, `falta o texto do marco ${k + 1}.`);
          });
        break;
      case "quiz":
        if (!b.perguntas || b.perguntas.length === 0) {
          erro("perguntas", "adicione pelo menos uma pergunta.");
          break;
        }
        b.perguntas.forEach((p, k) => {
          const base = `perguntas[${k}]`;
          const n = k + 1;
          if (vazio(p.pergunta)) erro(`${base}.pergunta`, `falta o enunciado da pergunta ${n}.`);
          const opcoes = p.opcoes ?? [];
          if (opcoes.length < 2) erro(`${base}.opcoes`, `a pergunta ${n} precisa de pelo menos 2 alternativas.`);
          opcoes.forEach((t, j) => vazio(t) && erro(`${base}.opcoes[${j}]`, `a alternativa ${j + 1} da pergunta ${n} está vazia.`));
          if (!Number.isInteger(p.correta) || p.correta < 0 || p.correta >= opcoes.length) {
            erro(`${base}.correta`, `marque qual é a alternativa correta da pergunta ${n}.`);
          }
          if (vazio(p.explica)) erro(`${base}.explica`, `falta a explicação da resposta da pergunta ${n}.`);
        });
        break;
      case "contraste":
        if (!b.itens || b.itens.length === 0) erro("itens", "adicione pelo menos um item.");
        else
          b.itens.forEach((it, k) => {
            if (!CORES.includes(it.cor)) erro(`itens[${k}].cor`, `escolha a cor do item ${k + 1}.`);
            if (vazio(it.titulo)) erro(`itens[${k}].titulo`, `falta o título do item ${k + 1}.`);
            if (vazio(it.texto)) erro(`itens[${k}].texto`, `falta o texto do item ${k + 1}.`);
          });
        break;
      case "destaque":
        if (vazio(b.html)) erro("html", "escreva o texto do destaque.");
        break;
      case "fonte":
        if (vazio(b.html)) erro("html", "escreva a fonte.");
        break;
      case "confira":
        if (vazio(b.botao)) erro("botao", "falta o texto do botão.");
        if (vazio(b.titulo)) erro("titulo", "falta o título da janela.");
        listaObrigatoria("paras", b.paras, "escreva o texto que aparece ao abrir.", "o parágrafo {n} está vazio.");
        break;
      default:
        erro(undefined, `o tipo de bloco "${(b as { tipo: string }).tipo}" não é conhecido.`);
    }
  }

  // ---------- Tamanho do progresso salvo ----------
  const estimativa = estimarSuspendData(projeto);
  if (estimativa > LIMITE_SUSPEND_DATA) {
    probs.push({
      nivel: "aviso",
      mensagem: `O SCORM está grande demais para o Moodle guardar o progresso com segurança (estimativa de ${estimativa} de ${LIMITE_SUSPEND_DATA} caracteres). Considere dividir em duas atividades ou reduzir telas, perguntas e Confiras.`,
    });
  }

  // ---------- Dados do pacote ----------
  const m = projeto.meta;
  const faltas: string[] = [];
  if (!m?.curso?.trim()) faltas.push("curso");
  if (!(m?.ud > 0)) faltas.push("número da UD");
  if (!m?.atividade?.trim()) faltas.push("tipo de atividade");
  if (!(m?.numero > 0)) faltas.push("número da atividade");
  if (!m?.titulo?.trim()) faltas.push("título");
  if (!m?.contexto?.trim()) faltas.push("contexto (linha do cabeçalho)");
  if (faltas.length) {
    probs.push({
      nivel: "aviso",
      campo: "meta",
      mensagem: `Dados do pacote incompletos: falta ${faltas.join(", ")}.`,
    });
  }

  return probs;
}

export function temErros(problemas: Problema[]): boolean {
  return problemas.some((p) => p.nivel === "erro");
}
