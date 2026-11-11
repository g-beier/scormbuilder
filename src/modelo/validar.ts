import {
  ALT_LONGO,
  CORES,
  RE_NOME_IMAGEM,
  MAX_CHARS_REFLEXAO,
  LIMITES_CATEGORIZAR,
  NOMES_BLOCO,
  PADRAO_REFLEXAO,
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

/** Campo rico (HTML): vazio se não sobra texto visível. */
function vazio(html: unknown): boolean {
  return textoVisivel(html) === "";
}

/** Campo simples (texto puro, sem HTML): vazio só se for só espaço. "<b>" é texto. */
function vazioSimples(v: unknown): boolean {
  return typeof v !== "string" || v.trim() === "";
}

/** "a", "a e b", "a, b e c". */
function juntar(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
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
    case "multipla":
      out.push(["enunciado", b.enunciado]);
      b.opcoes.forEach((o, i) => {
        out.push([`opcoes[${i}].texto`, o.texto]);
        out.push([`opcoes[${i}].fb`, o.fb]);
      });
      if (b.msgAcerto !== undefined) out.push(["msgAcerto", b.msgAcerto]);
      if (b.msgRevisar !== undefined) out.push(["msgRevisar", b.msgRevisar]);
      break;
    case "ramificado":
      b.perguntas.forEach((p, k) => {
        out.push([`perguntas[${k}].enunciado`, p.enunciado]);
        p.alternativas.forEach((a, j) => {
          out.push([`perguntas[${k}].alternativas[${j}].texto`, a.texto]);
          out.push([`perguntas[${k}].alternativas[${j}].retorno`, a.retorno]);
        });
      });
      break;
    case "categorizar":
      out.push(["enunciado", b.enunciado]);
      b.categorias.forEach((c, i) => out.push([`categorias[${i}]`, c]));
      b.itens.forEach((it, i) => {
        out.push([`itens[${i}].texto`, it.texto]);
        out.push([`itens[${i}].fb`, it.fb]);
      });
      if (b.msgAcerto !== undefined) out.push(["msgAcerto", b.msgAcerto]);
      if (b.msgRevisar !== undefined) out.push(["msgRevisar", b.msgRevisar]);
      break;
    case "reflexao":
      out.push(["pergunta", b.pergunta]);
      if (b.aviso !== undefined) out.push(["aviso", b.aviso]);
      break;
    case "escolha":
      out.push(["pergunta", b.pergunta]);
      b.opcoes.forEach((o, i) => {
        out.push([`opcoes[${i}].texto`, o.texto]);
        out.push([`opcoes[${i}].retorno`, o.retorno]);
      });
      break;
    case "imagem":
      out.push(["alt", b.alt]);
      out.push(["legenda", b.legenda]);
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
 * cada fluxo de ordenar concluído e cada Confira aberto. Múltipla escolha
 * guarda os índices marcados (≈ 2 caracteres por alternativa + colchetes),
 * reflexão guarda 1 (enviada) e escolha com retorno o índice escolhido;
 * para esses dois, 8 caracteres de folga. Classificar guarda a categoria de
 * cada item (≈ 2 caracteres por item + colchetes). Questionário com caminhos
 * guarda `{"r":[alternativa de cada pergunta],"e":1}` (≈ 3 por pergunta + 14).
 */
export function estimarSuspendData(projeto: Projeto): number {
  let n = 60; // envelope JSON, chaves e lesson_location
  for (const s of projeto.slides) {
    n += s.id.length + 4;
    if (s.tipo !== "conteudo") continue;
    for (const b of s.blocos) {
      if (b.tipo === "quiz") n += b.perguntas.length * (b.id.length + 10);
      else if (b.tipo === "ordenar" || b.tipo === "confira") n += b.id.length + 4;
      else if (b.tipo === "multipla") n += b.id.length + 4 + 2 * (b.opcoes?.length ?? 0) + 4;
      else if (b.tipo === "reflexao" || b.tipo === "escolha") n += b.id.length + 4 + 8;
      else if (b.tipo === "ramificado") n += b.id.length + 4 + 14 + 3 * (b.perguntas?.length ?? 0);
      else if (b.tipo === "categorizar") n += b.id.length + 4 + 2 * (b.itens?.length ?? 0) + 2;
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
    probs.push({ nivel: "erro", mensagem: "Falta a tela de fim. Todo SCORM precisa terminar com uma tela de fim. Use “+ Tela de fim” na lista de telas." });
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
        mensagem: `${tela(iFim)}: a tela de fim precisa ser a última. Arraste-a para o fim da lista.`,
      });
    }
  }
  slides.forEach((s, i) => {
    if (s.tipo === "capa" && i !== 0) {
      probs.push({ nivel: "erro", slideId: s.id, mensagem: `${tela(i)}: a capa precisa ser a primeira tela. Arraste-a para o início da lista.` });
    }
  });

  // ---------- Ids ----------
  const vistos = new Set<string>();
  const checarId = (id: string, i: number, slideId: string, bloco?: Bloco) => {
    if (id && !vistos.has(id)) {
      vistos.add(id);
      return;
    }
    const comum = "(comum quando o arquivo é copiado à mão)";
    const mensagem = bloco
      ? `${tela(i)}: o bloco “${NOMES_BLOCO[bloco.tipo] ?? bloco.tipo}” está corrompido ou repetido ${comum}. Duplique-o pelo editor e exclua o original.`
      : `${tela(i)}: esta tela está corrompida ou repetida ${comum}. Duplique-a pela lista de telas e exclua a original.`;
    probs.push({ nivel: "erro", slideId, blocoId: bloco?.id, campo: "id", mensagem });
  };

  // ---------- Telas ----------
  slides.forEach((s, i) => {
    checarId(s.id, i, s.id);
    const erroSlide = (campo: string, mensagem: string) =>
      probs.push({ nivel: "erro", slideId: s.id, campo, mensagem: `${tela(i)}: ${mensagem}` });

    if (vazioSimples(s.titulo)) erroSlide("titulo", "falta o título.");
    if (s.tipo === "fim" && vazio(s.texto)) erroSlide("texto", "falta a mensagem final.");

    for (const [campo, html] of textosDoSlide(s)) linkAvisos(html, i, s.id, undefined, campo);

    if (s.tipo !== "conteudo") return;
    if (!s.blocos || s.blocos.length === 0) {
      probs.push({
        nivel: "aviso",
        slideId: s.id,
        mensagem: `${tela(i)}: a tela ainda não tem nenhum bloco de conteúdo. Use “Adicionar bloco”.`,
      });
      return;
    }
    s.blocos.forEach((b) => {
      checarId(b.id, i, s.id, b);
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
        mensagem: `${tela(i)}: há um link que não começa com http:// ou https://. Verifique o endereço do link.`,
      });
    }
    if (achados.has("sem-blank")) {
      probs.push({
        nivel: "aviso",
        slideId,
        blocoId,
        campo,
        mensagem: `${tela(i)}: há um link que não abre em nova aba. Dentro do Moodle, ele tiraria o aluno da atividade. Selecione o link, use o botão de link (⌘K) e clique em Aplicar.`,
      });
    }
  }

  function validarBloco(b: Bloco, i: number, slideId: string) {
    const nome = NOMES_BLOCO[b.tipo] ?? b.tipo;
    const erro = (campo: string | undefined, msg: string) =>
      probs.push({ nivel: "erro", slideId, blocoId: b.id, campo, mensagem: `${tela(i)}: no bloco “${nome}”, ${msg}` });
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
            !vazioSimples(c.titulo) ||
            !vazio(c.breve) ||
            (c.paras ?? []).some((t) => !vazio(t)) ||
            (c.lista ?? []).some((t) => !vazio(t));
          if (!temAlgo) {
            erro(base, `o cartão ${k + 1} está vazio.`);
            return;
          }
          (c.paras ?? []).forEach((t, j) => vazio(t) && erro(`${base}.paras[${j}]`, `o cartão ${k + 1} tem um parágrafo vazio.`));
          (c.lista ?? []).forEach((t, j) => vazio(t) && erro(`${base}.lista[${j}]`, `o cartão ${k + 1} tem um item de lista vazio.`));
        });
        break;
      case "ordenar":
        if (vazioSimples(b.nome)) erro("nome", "falta o nome da sequência.");
        if (!b.passos || b.passos.length < 2) erro("passos", "são necessários pelo menos 2 passos para ordenar.");
        else b.passos.forEach((t, k) => vazio(t) && erro(`passos[${k}]`, `o passo ${k + 1} está vazio.`));
        if (vazio(b.porque)) erro("porque", "falta o texto de “Por que esta ordem”.");
        break;
      case "linha":
        if (!b.itens || b.itens.length === 0) erro("itens", "adicione pelo menos um marco.");
        else
          b.itens.forEach((it, k) => {
            if (vazioSimples(it.titulo)) erro(`itens[${k}].titulo`, `falta o título do marco ${k + 1}.`);
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
          if (vazioSimples(p.explica)) erro(`${base}.explica`, `falta a explicação da resposta da pergunta ${n}.`);
        });
        break;
      case "contraste":
        if (!b.itens || b.itens.length === 0) erro("itens", "adicione pelo menos um lado.");
        else
          b.itens.forEach((it, k) => {
            if (!CORES.includes(it.cor)) erro(`itens[${k}].cor`, `escolha a cor do lado ${k + 1}.`);
            if (vazioSimples(it.titulo)) erro(`itens[${k}].titulo`, `falta o título do lado ${k + 1}.`);
            if (vazio(it.texto)) erro(`itens[${k}].texto`, `falta o texto do lado ${k + 1}.`);
          });
        break;
      case "destaque":
        if (vazio(b.html)) erro("html", "escreva o texto do destaque.");
        break;
      case "fonte":
        if (vazio(b.html)) erro("html", "escreva a fonte.");
        break;
      case "confira":
        if (vazioSimples(b.botao)) erro("botao", "falta o texto do botão.");
        if (vazioSimples(b.titulo)) erro("titulo", "falta o título da janela.");
        listaObrigatoria("paras", b.paras, "escreva o texto que aparece ao abrir.", "o parágrafo {n} está vazio.");
        break;
      case "multipla": {
        if (vazio(b.enunciado)) erro("enunciado", "falta o enunciado.");
        const opcoes = b.opcoes ?? [];
        if (opcoes.length < 2) erro("opcoes", "são necessárias pelo menos 2 alternativas.");
        opcoes.forEach((o, k) => vazio(o.texto) && erro(`opcoes[${k}].texto`, `a alternativa ${k + 1} está vazia.`));
        if (opcoes.length > 0 && !opcoes.some((o) => o.correta === true)) {
          erro(`opcoes[0].correta`, "marque pelo menos uma alternativa como correta.");
        }
        // Comentário vazio é aviso: o pacote funciona (o aluno ainda vê “Errado.”
        // ou “Faltou marcar esta.”), mas perde a explicação daquela alternativa.
        const semFb = opcoes.map((o, k) => (vazioSimples(o.fb) ? k : -1)).filter((k) => k >= 0);
        if (semFb.length) {
          const quais = juntar(semFb.map((k) => String(k + 1)));
          probs.push({
            nivel: "aviso",
            slideId,
            blocoId: b.id,
            campo: `opcoes[${semFb[0]}].fb`,
            mensagem:
              semFb.length === 1
                ? `${tela(i)}: no bloco “${nome}”, a alternativa ${quais} está sem comentário. Escreva o que o aluno deve ler ao verificar a resposta.`
                : `${tela(i)}: no bloco “${nome}”, as alternativas ${quais} estão sem comentário. Escreva o que o aluno deve ler ao verificar a resposta.`,
          });
        }
        break;
      }
      case "reflexao": {
        if (vazio(b.pergunta)) erro("pergunta", "falta a pergunta para reflexão.");
        const min = b.minChars ?? PADRAO_REFLEXAO.minChars;
        const max = b.maxChars ?? PADRAO_REFLEXAO.maxChars;
        const minOk = Number.isInteger(min) && min >= 1;
        const maxOk = Number.isInteger(max) && max >= 1 && max <= MAX_CHARS_REFLEXAO;
        if (!minOk) erro("minChars", "o “Mínimo de caracteres” precisa ser um número inteiro de 1 para cima.");
        if (!Number.isInteger(max) || max < 1) erro("maxChars", "o “Máximo de caracteres” precisa ser um número inteiro de 1 para cima.");
        else if (max > MAX_CHARS_REFLEXAO)
          erro("maxChars", `o “Máximo de caracteres” passa de ${MAX_CHARS_REFLEXAO}, o limite que o Moodle registra com segurança. Use até ${MAX_CHARS_REFLEXAO}.`);
        if (minOk && maxOk && min > max) erro("minChars", "o “Mínimo de caracteres” é maior que o “Máximo”. Diminua o mínimo ou aumente o máximo.");
        break;
      }
      case "escolha": {
        if (vazio(b.pergunta)) erro("pergunta", "falta a pergunta.");
        const opcoes = b.opcoes ?? [];
        if (opcoes.length < 2) erro("opcoes", "são necessárias pelo menos 2 alternativas.");
        opcoes.forEach((o, k) => {
          if (vazio(o.texto)) erro(`opcoes[${k}].texto`, `a alternativa ${k + 1} está vazia.`);
          if (vazioSimples(o.retorno)) erro(`opcoes[${k}].retorno`, `falta o retorno da alternativa ${k + 1}.`);
        });
        break;
      }
      case "ramificado": {
        const perguntas = b.perguntas ?? [];
        if (perguntas.length === 0) {
          erro("perguntas", "adicione pelo menos uma pergunta.");
          break;
        }
        const pos = new Map<string, number>();
        perguntas.forEach((p, k) => {
          if (!p.id || pos.has(p.id)) erro(`perguntas[${k}].enunciado`, `a pergunta ${k + 1} ficou duplicada por engano. Exclua-a e adicione de novo.`);
          else pos.set(p.id, k);
        });
        let destinosOk = true;
        perguntas.forEach((p, k) => {
          const n = k + 1;
          if (vazio(p.enunciado)) erro(`perguntas[${k}].enunciado`, `falta o enunciado da pergunta ${n}.`);
          const alts = p.alternativas ?? [];
          if (alts.length < 2) erro(`perguntas[${k}].alternativas`, `a pergunta ${n} precisa de pelo menos 2 alternativas.`);
          alts.forEach((a, j) => {
            const campo = `perguntas[${k}].alternativas[${j}]`;
            if (vazio(a.texto)) erro(`${campo}.texto`, `a alternativa ${j + 1} da pergunta ${n} está vazia.`);
            if (a.proxima === p.id) {
              destinosOk = false;
              erro(`${campo}.proxima`, `a alternativa ${j + 1} da pergunta ${n} leva para a própria pergunta. Escolha outra pergunta ou “Fim do questionário”.`);
            } else if (a.proxima !== "fim" && !pos.has(a.proxima)) {
              destinosOk = false;
              erro(`${campo}.proxima`, `a alternativa ${j + 1} da pergunta ${n} leva para uma pergunta que não existe mais. Escolha outra.`);
            }
          });
        });
        if (!destinosOk) break;
        // Ciclos: um caminho que volta a uma pergunta já respondida nunca termina
        const estado = new Array<0 | 1 | 2>(perguntas.length).fill(0); // 0 = não visitada, 1 = no caminho, 2 = pronta
        let ciclo = null as [number, number] | null;
        const visitar = (k: number) => {
          estado[k] = 1;
          for (const a of perguntas[k].alternativas ?? []) {
            if (ciclo || a.proxima === "fim") continue;
            const d = pos.get(a.proxima)!;
            if (estado[d] === 1) ciclo = [k, d];
            else if (estado[d] === 0) visitar(d);
          }
          estado[k] = 2;
        };
        perguntas.forEach((_, k) => estado[k] === 0 && !ciclo && visitar(k));
        if (ciclo) {
          const [de, para] = ciclo;
          erro(
            `perguntas[${de}].alternativas`,
            `a pergunta ${de + 1} leva de volta à pergunta ${para + 1}, e o questionário nunca chegaria ao fim. Ajuste o “Depois desta, ir para”.`,
          );
          break;
        }
        // Perguntas que nenhum caminho a partir da 1 alcança
        const alcancadas = new Set<number>([0]);
        const fila = [0];
        while (fila.length) {
          const k = fila.shift()!;
          for (const a of perguntas[k].alternativas ?? []) {
            const d = a.proxima === "fim" ? undefined : pos.get(a.proxima);
            if (d !== undefined && !alcancadas.has(d)) {
              alcancadas.add(d);
              fila.push(d);
            }
          }
        }
        const soltas = perguntas.map((_, k) => k).filter((k) => !alcancadas.has(k));
        if (soltas.length) {
          const quais = juntar(soltas.map((k) => String(k + 1)));
          probs.push({
            nivel: "aviso",
            slideId,
            blocoId: b.id,
            campo: `perguntas[${soltas[0]}].enunciado`,
            mensagem:
              soltas.length === 1
                ? `${tela(i)}: no bloco “${nome}”, nenhum caminho chega à pergunta ${quais}. Confira o “Depois desta, ir para” das perguntas anteriores.`
                : `${tela(i)}: no bloco “${nome}”, nenhum caminho chega às perguntas ${quais}. Confira o “Depois desta, ir para” das perguntas anteriores.`,
          });
        }
        break;
      }
      case "categorizar": {
        const { minCategorias, maxCategorias, minItens, itensAviso } = LIMITES_CATEGORIZAR;
        if (vazio(b.enunciado)) erro("enunciado", "falta o enunciado.");
        const cats = b.categorias ?? [];
        if (cats.length < minCategorias) erro("categorias", `são necessárias pelo menos ${minCategorias} categorias.`);
        if (cats.length > maxCategorias) erro("categorias", `use no máximo ${maxCategorias} categorias.`);
        cats.forEach((c, k) => vazioSimples(c) && erro(`categorias[${k}]`, `falta o nome da categoria ${k + 1}.`));
        const itens = b.itens ?? [];
        if (itens.length < minItens) erro("itens", `são necessários pelo menos ${minItens} itens.`);
        itens.forEach((it, k) => {
          if (vazio(it.texto)) erro(`itens[${k}].texto`, `o item ${k + 1} está vazio.`);
          if (!Number.isInteger(it.categoria) || it.categoria < 0 || it.categoria >= cats.length)
            erro(`itens[${k}].categoria`, `escolha a categoria certa do item ${k + 1}.`);
        });
        // Categoria sem nenhum item funciona, mas costuma ser descuido
        const vazias = cats.map((_, c) => (itens.some((it) => it.categoria === c) ? -1 : c)).filter((c) => c >= 0);
        if (cats.length >= minCategorias && itens.length >= minItens && vazias.length) {
          const quais = juntar(vazias.map((c) => (cats[c].trim() ? `“${cats[c].trim()}”` : String(c + 1))));
          probs.push({
            nivel: "aviso",
            slideId,
            blocoId: b.id,
            campo: `categorias[${vazias[0]}]`,
            mensagem:
              vazias.length === 1
                ? `${tela(i)}: no bloco “${nome}”, nenhum item pertence à categoria ${quais}. Confira se é isso mesmo.`
                : `${tela(i)}: no bloco “${nome}”, nenhum item pertence às categorias ${quais}. Confira se é isso mesmo.`,
          });
        }
        if (itens.length > itensAviso) {
          probs.push({
            nivel: "aviso",
            slideId,
            blocoId: b.id,
            campo: "itens",
            mensagem: `${tela(i)}: o bloco “${nome}” tem ${itens.length} itens. Com mais de ${itensAviso}, a atividade fica longa no celular; considere até 3 categorias e 8 itens, ou dividir em duas telas.`,
          });
        }
        break;
      }
      case "imagem": {
        if (vazioSimples(b.arquivo)) erro("arquivo", "falta escolher a imagem. Use “Escolher imagem…”.");
        else if (!RE_NOME_IMAGEM.test(b.arquivo)) erro("arquivo", "a imagem não foi encontrada. Use “Trocar imagem” e escolha o arquivo de novo.");
        if (b.decorativa === true) break;
        if (vazioSimples(b.alt)) erro("alt", "descreva a imagem para quem usa leitor de tela, ou marque como decorativa.");
        else if (b.alt.trim().length > ALT_LONGO) {
          probs.push({
            nivel: "aviso",
            slideId,
            blocoId: b.id,
            campo: "alt",
            mensagem: `${tela(i)}: no bloco “${nome}”, a descrição da imagem tem ${b.alt.trim().length} caracteres. Prefira até ${ALT_LONGO}: o leitor de tela lê tudo de uma vez. Detalhes longos ficam melhor na legenda ou no texto da tela.`,
          });
        }
        break;
      }
      default:
        erro(undefined, `o tipo de bloco “${(b as { tipo: string }).tipo}” não é conhecido. Exclua este bloco.`);
    }
  }

  // ---------- Tamanho do progresso salvo ----------
  const estimativa = estimarSuspendData(projeto);
  if (estimativa > LIMITE_SUSPEND_DATA) {
    probs.push({
      nivel: "aviso",
      mensagem:
        "Esta atividade tem telas, perguntas e “Confira” demais para o Moodle guardar o progresso do aluno com segurança. Divida-a em duas atividades ou reduza o conteúdo.",
    });
  }

  // ---------- Dados do pacote ----------
  // Nomes iguais aos rótulos de "Dados do pacote".
  const m = projeto.meta;
  if (!(m?.ud > 0)) {
    probs.push({
      nivel: "erro",
      campo: "meta",
      mensagem: "Dados do pacote: falta o “Número da UD”. Ele faz parte do nome do pacote no Moodle.",
    });
  }
  const faltas: string[] = [];
  if (!m?.curso?.trim()) faltas.push("“Curso”");
  if (!m?.atividade?.trim()) faltas.push("“Tipo de atividade”");
  if (!(m?.numero > 0)) faltas.push("“Número da atividade”");
  if (!m?.titulo?.trim()) faltas.push("“Título da atividade”");
  if (!m?.contexto?.trim()) faltas.push("“Linha de contexto”");
  if (faltas.length) {
    probs.push({
      nivel: "aviso",
      campo: "meta",
      mensagem: `Dados do pacote incompletos: ${faltas.length === 1 ? "falta" : "faltam"} ${juntar(faltas)}.`,
    });
  }

  return probs;
}

export function temErros(problemas: Problema[]): boolean {
  return problemas.some((p) => p.nivel === "erro");
}
