/**
 * Filtro dos campos ricos (HTML que o motor insere via `innerHTML`).
 *
 * Fica só o que o editor produz e o motor aceita: `<strong>`, `<em>`, `<br>` e
 * `<a href>` com endereço http(s) ou mailto, sempre com `target="_blank"` e
 * `rel="noopener"`. O resto sai:
 * - `script`, `style`, `iframe`, `object`, `svg`… saem com o conteúdo;
 * - outras marcas (`<img onerror>`, `<p>`, `<span>`) saem, o texto fica;
 * - links com `javascript:` ou outro esquema perdem a marca, o texto fica;
 * - comentários saem; um `<` solto vira `&lt;`.
 *
 * Marcação já aceita é mantida **byte a byte** (inclusive `<a href='…'
 * target='_blank' rel='noopener'>` com aspas simples e `<br/>`), para que a
 * importação dos pacotes existentes e a compilação continuem estáveis.
 * Função pura e determinística: roda na importação e no compilador.
 */
import type { Bloco, Slide } from "./tipos";

/** Endereço de link aceito (mesma regra do editor, `editor/htmlRico.ts`). */
export function urlPermitida(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

const DESCARTAR_COM_CONTEUDO = new Set([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "noscript",
  "noembed",
  "noframes",
  "template",
  "textarea",
  "title",
  "select",
  "svg",
  "math",
  "xmp",
  "plaintext",
  "head",
]);

const ATRIBUTOS = String.raw`(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>\x60]+))?)*`;
const RE_TAG = new RegExp(String.raw`<(/?)([a-zA-Z][a-zA-Z0-9-]*)(${ATRIBUTOS})\s*(/?)>`, "y");
const RE_ATRIBUTO = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
/** Formas canônicas do link (aspas simples ou duplas, nesta ordem). */
const RE_LINK_CANONICO = /^<a href=(["'])([^"']*)\1 target=\1_blank\1 rel=\1noopener\1>$/;

function atributos(texto: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of texto.matchAll(RE_ATRIBUTO)) {
    const nome = m[1].toLowerCase();
    if (!out.has(nome)) out.set(nome, m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

export interface ResultadoLimpeza {
  html: string;
  /** Algo foi removido (marca, atributo ou link inseguro). Escapar `<` solto não conta. */
  removeu: boolean;
}

export function limparHtmlDetalhado(html: string): ResultadoLimpeza {
  if (typeof html !== "string" || !html.includes("<")) return { html, removeu: false };
  let out = "";
  let removeu = false;
  /** Para cada `<a>` aberto: true = mantido; false = descartado (o `</a>` também sai). */
  const links: boolean[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    i = lt;

    if (html.startsWith("<!--", i)) {
      const fim = html.indexOf("-->", i + 4);
      i = fim < 0 ? html.length : fim + 3;
      removeu = true;
      continue;
    }

    RE_TAG.lastIndex = i;
    const m = RE_TAG.exec(html);
    if (!m) {
      out += "&lt;";
      i += 1;
      continue;
    }
    const [orig, barra, nomeBruto, attrs] = m;
    const nome = nomeBruto.toLowerCase();
    const fecha = barra === "/";
    i += orig.length;

    if (DESCARTAR_COM_CONTEUDO.has(nome)) {
      removeu = true;
      if (!fecha) {
        const re = new RegExp(`</${nome}\\s*>`, "ig");
        re.lastIndex = i;
        const f = re.exec(html);
        i = f ? f.index + f[0].length : html.length;
      }
      continue;
    }

    switch (nome) {
      case "strong":
      case "em": {
        const canon = fecha ? `</${nome}>` : `<${nome}>`;
        if (orig !== canon) removeu = true;
        out += canon;
        break;
      }
      case "br":
        if (fecha) {
          removeu = true;
          break;
        }
        if (/^<br\s*\/?>$/.test(orig)) out += orig;
        else {
          out += "<br>";
          removeu = true;
        }
        break;
      case "a": {
        if (fecha) {
          const mantido = links.pop();
          if (mantido) out += "</a>";
          else removeu = true;
          break;
        }
        const href = atributos(attrs).get("href") ?? "";
        if (!urlPermitida(href) || /\s/.test(href.trim())) {
          links.push(false);
          removeu = true;
          break;
        }
        links.push(true);
        if (RE_LINK_CANONICO.test(orig)) out += orig;
        else {
          out += `<a href="${href.trim().replace(/"/g, "&quot;")}" target="_blank" rel="noopener">`;
          removeu = true;
        }
        break;
      }
      default:
        removeu = true;
    }
  }
  // Link aberto sem fechamento não pode se estender ao HTML vizinho.
  for (const mantido of links) if (mantido) out += "</a>";
  return { html: out, removeu };
}

/** Campo rico → HTML aceito pelo motor (ver o cabeçalho deste arquivo). */
export function limparHtml(html: string): string {
  return limparHtmlDetalhado(html).html;
}

// ---------- Projeto inteiro ----------

type Limpar = (html: string) => string;

function opc(l: Limpar, v: string | undefined): string | undefined {
  return v === undefined ? v : l(v);
}
function lista(l: Limpar, v: string[] | undefined): string[] | undefined {
  return v === undefined ? v : v.map(l);
}

/** Aplica `l` em todos os campos ricos do bloco (os demais ficam como estão). */
export function limparBloco(b: Bloco, l: Limpar = limparHtml): Bloco {
  switch (b.tipo) {
    case "texto":
      return { ...b, paras: b.paras.map(l) };
    case "lista":
      return { ...b, itens: b.itens.map(l) };
    case "cards":
      return {
        ...b,
        cards: b.cards.map((c) => {
          const out = { ...c };
          if (c.breve !== undefined) out.breve = opc(l, c.breve);
          if (c.paras !== undefined) out.paras = lista(l, c.paras);
          if (c.lista !== undefined) out.lista = lista(l, c.lista);
          return out;
        }),
      };
    case "ordenar": {
      const out = { ...b, passos: b.passos.map(l), porque: l(b.porque) };
      if (b.nota !== undefined) out.nota = l(b.nota);
      return out;
    }
    case "linha":
      return { ...b, itens: b.itens.map((i) => ({ ...i, texto: l(i.texto) })) };
    case "quiz":
      return { ...b, perguntas: b.perguntas.map((p) => ({ ...p, pergunta: l(p.pergunta), opcoes: p.opcoes.map(l) })) };
    case "contraste":
      return { ...b, itens: b.itens.map((i) => ({ ...i, texto: l(i.texto) })) };
    case "destaque":
    case "fonte":
      return { ...b, html: l(b.html) };
    case "confira":
      return { ...b, paras: b.paras.map(l) };
    case "multipla":
      return { ...b, enunciado: l(b.enunciado), opcoes: b.opcoes.map((o) => ({ ...o, texto: l(o.texto) })) };
    case "reflexao":
      return { ...b, pergunta: l(b.pergunta) };
    case "escolha":
      return { ...b, pergunta: l(b.pergunta), opcoes: b.opcoes.map((o) => ({ ...o, texto: l(o.texto) })) };
    case "ramificado":
      return {
        ...b,
        perguntas: b.perguntas.map((p) => ({
          ...p,
          enunciado: l(p.enunciado),
          alternativas: p.alternativas.map((a) => ({ ...a, texto: l(a.texto) })),
        })),
      };
    case "categorizar":
      return { ...b, enunciado: l(b.enunciado), itens: b.itens.map((it) => ({ ...it, texto: l(it.texto) })) };
  }
}

/** Aplica `l` em todos os campos ricos da tela. */
export function limparSlide(s: Slide, l: Limpar = limparHtml): Slide {
  switch (s.tipo) {
    case "capa":
      return { ...s, sub: l(s.sub) };
    case "fim":
      return { ...s, texto: l(s.texto) };
    case "conteudo":
      return { ...s, blocos: s.blocos.map((b) => limparBloco(b, l)) };
  }
}
