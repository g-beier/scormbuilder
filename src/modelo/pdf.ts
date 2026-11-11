/**
 * PDF da leitura (M7): Projeto compilado (data.js v2) → documento Typst, que o
 * backend (`src-tauri/src/pdf.rs`) compila num PDF marcado (PDF/UA-1).
 *
 * Regras (decididas com o usuário): o aluno baixa o PDF fora do pacote como
 * registro; a capa vira o cabeçalho (com Nome e Data); a tela de fim não entra;
 * blocos interativos saem em versão para preencher à mão, SEM gabarito nem
 * retornos; o "Confira" (que costuma trazer as respostas) vai para um anexo.
 *
 * Todo texto entra como string literal do Typst (`#"…"`), então nada do
 * conteúdo é interpretado como marcação. Títulos, listas e tabelas usam os
 * elementos semânticos do Typst (viram tags no PDF); linhas e caixas de marcar
 * são decorativas (`pdf.artifact`).
 *
 * Imagens: `image("img/<arquivo>", alt: …)` (o backend serve os arquivos do
 * rascunho), com largura até a da página e altura até 9 cm; a decorativa vira
 * artefato (sem descrição). Endereço fora do padrão do rascunho não é pedido:
 * sai só a descrição, entre colchetes.
 */
import type { BlocoV2, ConteudoV2, SlideV2 } from "./tipos";
import { nomeDoSrc } from "./imagens";

/** Altura máxima de uma imagem no PDF (a largura vai até a da área de texto). */
export const ALTURA_MAX_IMAGEM = "9cm";

export interface OpcoesPdf {
  /** Data da geração, mostrada no cabeçalho (ex.: "10/11/2026"). */
  gerado?: string;
}

// ---------- Texto ----------

/** String literal do Typst. */
function str(t: string): string {
  return `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ")}"`;
}

/** Texto puro → conteúdo Typst. */
function txt(t: string | undefined | null): string {
  const s = (t ?? "").replace(/\s+/g, " ");
  return s ? `#${str(s)}` : "";
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodificar(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10));
    return ENTIDADES[k] ?? m;
  });
}

/** Valor do atributo `nome` numa tag. */
function atributo(attrs: string, nome: string): string | null {
  const m = new RegExp(`${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(attrs);
  return m ? decodificar(m[2] ?? m[3] ?? "") : null;
}

/**
 * HTML inline do conteúdo (strong/b, em/i, u, a, br; outras tags só passam o
 * texto) → conteúdo Typst. Tags mal fechadas são toleradas.
 */
export function html(h: string | undefined | null): string {
  const fonte = h ?? "";
  type No = { tag: string; attrs: string; partes: string[] };
  const pilha: No[] = [{ tag: "", attrs: "", partes: [] }];
  const topo = () => pilha[pilha.length - 1];
  const fechar = () => {
    const n = pilha.pop()!;
    const corpo = n.partes.join("");
    let out = corpo;
    if (corpo) {
      if (n.tag === "strong" || n.tag === "b") out = `#strong[${corpo}]`;
      else if (n.tag === "em" || n.tag === "i") out = `#emph[${corpo}]`;
      else if (n.tag === "u") out = `#underline[${corpo}]`;
      else if (n.tag === "a") {
        const href = atributo(n.attrs, "href");
        out = href && /^(https?:|mailto:)/i.test(href) ? `#link(${str(href)})[${corpo}]` : corpo;
      } else if (n.tag === "p" || n.tag === "div" || n.tag === "li") out = `${corpo}#linebreak()`;
    }
    topo().partes.push(out);
  };
  const re = /<(\/?)([a-z][a-z0-9]*)([^>]*)>|([^<]+)|(<)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) {
    if (m[4] !== undefined || m[5] !== undefined) {
      const t = decodificar(m[4] ?? m[5]).replace(/\s+/g, " ");
      if (t) topo().partes.push(`#${str(t)}`);
      continue;
    }
    const tag = m[2].toLowerCase();
    if (tag === "br") {
      topo().partes.push("#linebreak()");
      continue;
    }
    if (m[1]) {
      // Fecha até a tag correspondente (se ela estiver aberta)
      if (pilha.some((n, i) => i > 0 && n.tag === tag)) {
        while (pilha.length > 1 && topo().tag !== tag) fechar();
        if (pilha.length > 1) fechar();
      }
    } else if (!m[3].trim().endsWith("/")) {
      pilha.push({ tag, attrs: m[3], partes: [] });
    }
  }
  while (pilha.length > 1) fechar();
  return pilha[0].partes.join("").replace(/(#linebreak\(\))+$/, "");
}

/** Campo simples escapado no data.js (títulos, kicker) → conteúdo Typst. */
function esc(t: string | undefined | null): string {
  return txt(decodificar(t ?? ""));
}

/** Texto visível de um HTML (para o título do documento). */
function textoDe(h: string): string {
  return decodificar(h.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

// ---------- Ordem estável (igual à do pacote para o mesmo id) ----------

/** Embaralhamento com semente no id do bloco (Park–Miller): o mesmo conteúdo gera sempre o mesmo PDF. */
export function embaralharFixo(n: number, semente: string): number[] {
  let h = 1;
  for (const ch of semente) h = (h * 31 + ch.charCodeAt(0)) % 2147483647;
  if (h <= 0) h += 2147483646;
  const aleatorio = () => {
    h = (h * 16807) % 2147483647;
    return (h - 1) / 2147483646;
  };
  const ordem = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return ordem;
  for (let tent = 0; tent < 20; tent++) {
    for (let k = n - 1; k > 0; k--) {
      const j = Math.floor(aleatorio() * (k + 1));
      [ordem[k], ordem[j]] = [ordem[j], ordem[k]];
    }
    if (!ordem.every((v, i) => v === i)) break;
  }
  return ordem;
}

// ---------- Modelo do documento (preâmbulo) ----------

const PREAMBULO = String.raw`
#let ALTURA_MAX = ${ALTURA_MAX_IMAGEM}
#let navy = rgb("#1b1f4b")
#let navy3 = rgb("#2c3280")
#let navytinta = rgb("#eceefa")
#let verde = rgb("#19653e")
#let vermelho = rgb("#a91d22")
#let amarelo = rgb("#fcb913")
#let amarelotinta = rgb("#fff6dc")
#let amarelotexto = rgb("#6b4a00")
#let tinta = rgb("#231f20")
#let suave = rgb("#5b5d73")
#let borda = rgb("#8a8da8")
#let cores = (navy: navy, green: verde, red: vermelho, yellow: amarelo)

#set text(font: "Poppins", size: 10.5pt, fill: tinta, lang: "pt", region: "br", hyphenate: true)
#set par(leading: 0.62em, spacing: 0.95em, justify: false)
#set list(indent: 0.4em, body-indent: 0.6em, spacing: 0.7em)
#set enum(indent: 0.2em, body-indent: 0.6em, spacing: 0.8em)
#show link: it => text(fill: navy3, underline(it))
#show heading: set text(font: "Krona One", weight: "regular", fill: navy)
#show heading.where(level: 1): set text(size: 19pt)
#show heading.where(level: 2): set text(size: 13.5pt)
#show heading.where(level: 3): set text(font: "Poppins", weight: "semibold", size: 11pt)
#show heading: set block(above: 1.1em, below: 0.7em)
#show heading.where(level: 2): it => { v(0.4em); it }
#show table.cell.where(y: 0): set text(weight: "semibold", fill: navy)

#let rotulo(t) = box(fill: amarelo, inset: (x: 6pt, y: 3pt), radius: 7pt, text(size: 7.5pt, weight: "bold", fill: navy, upper(t)))
#let nota(t) = par(text(size: 9pt, fill: suave, t))
#let cartao(corpo, lateral: none) = block(
  width: 100%, inset: 10pt, radius: 5pt, breakable: false,
  stroke: if lateral == none { 0.75pt + borda } else { (rest: 0.75pt + borda, left: 4pt + lateral) },
  corpo,
)
#let caixa = box(width: 0.82em, height: 0.82em, baseline: 0.12em, stroke: 0.9pt + navy, radius: 1.5pt)
#let marcar(..itens) = list(marker: pdf.artifact(caixa), ..itens)
#let numerar(..itens) = list(marker: pdf.artifact(box(width: 2.2em, height: 1.15em, baseline: 0.25em, stroke: 0.9pt + navy, radius: 2pt)), body-indent: 0.8em, ..itens)
#let linhas(n) = pdf.artifact(block(width: 100%, above: 0.6em, for _ in range(n) { block(width: 100%, height: 22pt, below: 0pt, stroke: (bottom: 0.75pt + borda)) }))
#let campo(rot) = grid(columns: (auto, 1fr), column-gutter: 6pt, align: bottom,
  text(weight: "semibold", fill: navy, rot), pdf.artifact(block(width: 100%, height: 1.1em, stroke: (bottom: 0.75pt + tinta))))
#let destaque(corpo) = block(width: 100%, inset: (x: 12pt, y: 10pt), radius: 5pt, fill: navy, stroke: (left: 5pt + amarelo), text(fill: white, corpo))
#let imagem(caminho, alt: none, decorativa: false) = layout(area => {
  let natural = measure(image(caminho))
  let w = calc.min(natural.width, area.width)
  let h = if natural.width > 0pt { natural.height * (w / natural.width) } else { natural.height }
  if h > ALTURA_MAX { w = w * (ALTURA_MAX / h) }
  let img = image(caminho, width: w, alt: alt)
  align(center, if decorativa { pdf.artifact(img) } else { img })
})
#set figure(numbering: none)
#show figure.caption: set text(size: 9pt, fill: suave)
#let anotar(titulo, n) = block(width: 100%, inset: 10pt, radius: 5pt, stroke: 1pt + borda, breakable: false, {
  text(weight: "semibold", fill: navy, titulo)
  linhas(n)
})
`;

// ---------- Blocos ----------

interface Ctx {
  anexo: Array<{ titulo: string; paras: string[] }>;
}

function blocoPars(lista: string[] | undefined): string {
  const ps = (lista ?? []).map((p) => html(p)).filter(Boolean);
  return ps.map((p) => `#par[${p}]`).join("\n");
}

function lista(itens: string[] | undefined): string {
  const xs = (itens ?? []).map((i) => html(i));
  return xs.length ? `#list(${xs.map((x) => `[${x}]`).join(", ")})` : "";
}

function marcar(itens: string[]): string {
  return itens.length ? `#marcar(${itens.map((x) => `[${x}]`).join(", ")})` : "";
}

function cardBloco(b: Extract<BlocoV2, { tipo: "cards" }>): string {
  const cartoes = (b.cards ?? []).map((c) => {
    const partes = [
      c.titulo ? `#heading(level: 3)[${esc(c.titulo)}]` : "",
      c.breve ? `#text(size: 9.5pt, fill: suave)[${html(c.breve)}]` : "",
      blocoPars(c.paras),
      lista(c.lista),
    ].filter(Boolean);
    return `cartao[\n${partes.join("\n")}\n]`;
  });
  if (!cartoes.length) return "";
  // O pacote usa grade automática (cartões de ~240px): no A4 cabem duas colunas
  const colunas = cartoes.length >= 2 ? 2 : 1;
  return `#grid(columns: ${colunas}, gutter: 8pt, ${cartoes.join(", ")})`;
}

function bloco(b: BlocoV2, ctx: Ctx): string {
  switch (b.tipo) {
    case "texto":
      return blocoPars(b.paras);
    case "lista":
      return lista(b.itens);
    case "cards":
      return cardBloco(b);
    case "linha": {
      const itens = (b.itens ?? []).map((it) => `[#strong[${esc(it.titulo)}] #linebreak() ${html(it.texto)}]`);
      return itens.length ? `#enum(${itens.join(", ")})` : "";
    }
    case "contraste": {
      const itens = (b.itens ?? []).map(
        (it) => `cartao(lateral: cores.at(${str(it.cor)}, default: navy))[#heading(level: 3)[${esc(it.titulo)}]\n#par[${html(it.texto)}]]`,
      );
      return itens.length ? `#grid(columns: ${Math.min(itens.length, 2)}, gutter: 8pt, ${itens.join(", ")})` : "";
    }
    case "destaque":
      return b.html ? `#destaque[${html(b.html)}]` : "";
    case "fonte":
      return b.html ? `#text(size: 8.5pt, fill: suave)[${html(b.html)}]` : "";
    case "quiz":
      return (b.perguntas ?? [])
        .map(
          (q) =>
            `#cartao[#text(weight: "semibold", fill: navy)[${html(q.pergunta)}]\n#nota[${txt("Marque uma alternativa.")}]\n${marcar((q.opcoes ?? []).map(html))}]`,
        )
        .join("\n");
    case "multipla":
      return `#cartao[#text(weight: "semibold", fill: navy)[${html(b.enunciado)}]\n#nota[${txt("Marque todas as alternativas que considerar corretas.")}]\n${marcar((b.opcoes ?? []).map((o) => html(o.texto)))}]`;
    case "escolha":
      return `#cartao[#text(weight: "semibold", fill: navy)[${html(b.pergunta)}]\n#nota[${txt("Marque uma alternativa.")}]\n${marcar((b.opcoes ?? []).map((o) => html(o.texto)))}]`;
    case "ordenar": {
      const passos = b.passos ?? [];
      const itens = embaralharFixo(passos.length, b.id).map((i) => `[${html(passos[i])}]`);
      return [
        `#cartao[#heading(level: 3)[${html(b.nome)}]`,
        `#nota[${txt("Numere os passos na ordem em que acontecem.")}]`,
        itens.length ? `#numerar(${itens.join(", ")})` : "",
        b.nota ? `#nota[${html(b.nota)}]` : "",
        "]",
      ].join("\n");
    }
    case "confira":
      ctx.anexo.push({ titulo: b.titulo, paras: b.paras ?? [] });
      return `#block(width: 100%, inset: (x: 10pt, y: 7pt), fill: amarelotinta, stroke: (left: 3pt + amarelo))[${txt("Para conferir depois: ")}#strong[${html(b.titulo)}]${txt(` (no fim do documento, item ${ctx.anexo.length}).`)}]`;
    case "reflexao": {
      const aviso = b.aviso == null ? "Não escreva nomes nem dados que identifiquem crianças, famílias ou casos reais." : String(b.aviso);
      const max = typeof b.maxChars === "number" && b.maxChars > 0 ? b.maxChars : 500;
      const n = Math.max(4, Math.min(14, Math.round(max / 70)));
      return [
        `#cartao[#text(weight: "semibold", fill: navy)[${html(b.pergunta)}]`,
        b.opcional !== false ? `#nota[${txt("Resposta opcional.")}]` : "",
        aviso ? `#nota[${txt(aviso)}]` : "",
        `#linhas(${n})]`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "categorizar": {
      const cats = b.categorias ?? [];
      const itens = b.itens ?? [];
      const ordem = embaralharFixo(itens.length, b.id);
      const cab = [`[${txt("Item")}]`, ...cats.map((c) => `[${esc(c)}]`)].join(", ");
      const linhas = ordem
        .map((i) => [`[${html(itens[i].texto)}]`, ...cats.map(() => "table.cell(align: center + horizon, pdf.artifact(caixa))")].join(", "))
        .join(",\n  ");
      return [
        `#cartao[#text(weight: "semibold", fill: navy)[${html(b.enunciado)}]`,
        `#nota[${txt("Marque, em cada linha, a categoria do item.")}]`,
        `#table(columns: (1fr, ${cats.map(() => "auto").join(", ")}), inset: 7pt, stroke: 0.6pt + borda, fill: (x, y) => if y == 0 { navytinta },`,
        `  table.header(${cab}),`,
        `  ${linhas}`,
        `)]`,
      ].join("\n");
    }
    case "ramificado": {
      const P = b.perguntas ?? [];
      const pos = new Map(P.map((p, k) => [p.id, k]));
      const perguntas = P.map((p, k) => {
        const alts = (p.alternativas ?? []).map((a) => {
          const d = a.proxima === "fim" || !pos.has(a.proxima) ? "→ fim do questionário" : `→ vá para a pergunta ${pos.get(a.proxima)! + 1}`;
          return `[${html(a.texto)} #linebreak() #text(size: 8.5pt, weight: "semibold", fill: navy3)[${txt(d)}]]`;
        });
        return `#heading(level: 3)[${txt(`Pergunta ${k + 1}`)}]\n#text(weight: "semibold", fill: navy)[${html(p.enunciado)}]\n${alts.length ? `#marcar(${alts.join(", ")})` : ""}`;
      });
      return [
        `#nota[${txt("Comece pela pergunta 1 e siga a indicação abaixo da alternativa que escolher.")}]`,
        ...perguntas,
        `#anotar([${txt("Anote o caminho que você fez (números das perguntas) e a sua última resposta:")}], 3)`,
      ].join("\n");
    }
    case "imagem": {
      const decorativa = b.decorativa === true;
      const legenda = b.legenda ? html(b.legenda) : "";
      const nome = nomeDoSrc(b.src);
      if (!nome) {
        const desc = decorativa ? "" : `#nota[${txt(`[Imagem: ${b.alt?.trim() || "sem descrição"}]`)}]`;
        return [desc, legenda ? `#nota[${legenda}]` : ""].filter(Boolean).join("\n");
      }
      const img = `imagem(${str(`img/${nome}`)}, ${decorativa ? "decorativa: true" : `alt: ${str((b.alt ?? "").replace(/\s+/g, " ").trim())}`})`;
      // Decorativa: artefato, fora da árvore de leitura; a legenda (se houver) fica como texto
      if (decorativa) return [`#block(width: 100%, above: 1em, below: 1em, ${img})`, legenda ? `#align(center)[#nota[${legenda}]]` : ""].filter(Boolean).join("\n");
      return legenda ? `#figure(${img}, caption: [${legenda}])` : `#figure(${img})`;
    }
    default:
      return "";
  }
}

// ---------- Documento ----------

function tela(s: Extract<SlideV2, { tipo: "conteudo" }>, ctx: Ctx): string {
  const partes: string[] = [];
  // Rótulo e título da tela ficam juntos (não se separam numa quebra de página)
  partes.push(
    s.kicker
      ? `#block(breakable: false, above: 1.6em, below: 0.7em)[#rotulo[${esc(s.kicker)}]
#v(-0.2em)
#heading(level: 2)[${esc(s.titulo)}]]`
      : `#heading(level: 2)[${esc(s.titulo)}]`,
  );
  const blocos = s.blocos ?? [];
  const corpo = blocos.map((b) => bloco(b, ctx));
  // Telas com "Confira" (o padrão das Pesquisas) pedem que o aluno responda antes de conferir
  const iConfira = blocos.findIndex((b) => b.tipo === "confira");
  if (iConfira >= 0) corpo.splice(iConfira, 0, `#anotar([${txt("Suas anotações")}], 5)`);
  partes.push(...corpo.filter(Boolean));
  return partes.join("\n\n");
}

/** Gera o documento Typst da leitura. Determinístico para o mesmo conteúdo e opções. */
export function gerarTypst(C: ConteudoV2, opcoes: OpcoesPdf = {}): string {
  const ctx: Ctx = { anexo: [] };
  const capa = C.slides.find((s): s is Extract<SlideV2, { tipo: "capa" }> => s.tipo === "capa");
  const tituloDoc = (capa ? textoDe(capa.titulo) : "") || C.titulo || C.id;
  const versao = [C.id, opcoes.gerado ? `gerado em ${opcoes.gerado}` : ""].filter(Boolean).join(" · ");

  const cab: string[] = [];
  if (C.contexto) cab.push(`#text(size: 8.5pt, weight: "semibold", fill: amarelotexto)[${txt(C.contexto)}]`);
  if (capa?.kicker) cab.push(`#rotulo[${esc(capa.kicker)}]`);
  cab.push(`#heading(level: 1)[${txt(tituloDoc)}]`);
  if (capa?.sub) cab.push(`#text(size: 11pt, weight: "semibold", fill: suave)[${html(capa.sub)}]`);
  cab.push(`#grid(columns: (1fr, 1fr), column-gutter: 18pt, campo[${txt("Nome:")}], campo[${txt("Data:")}])`);
  if (versao) cab.push(`#text(size: 8pt, fill: suave)[${txt(versao)}]`);
  cab.push(`#pdf.artifact(line(length: 100%, stroke: 3pt + navy))`);

  const telas = C.slides.filter((s): s is Extract<SlideV2, { tipo: "conteudo" }> => s.tipo === "conteudo").map((s) => tela(s, ctx));

  const anexo = ctx.anexo.length
    ? [
        "#pagebreak(weak: true)",
        `#heading(level: 2)[${txt("Para conferir")}]`,
        `#nota[${txt("Leia depois de responder às perguntas de cada tela.")}]`,
        ...ctx.anexo.map((a, i) => `#heading(level: 3)[${txt(`${i + 1}. `)}${html(a.titulo)}]\n${blocoPars(a.paras)}`),
      ].join("\n\n")
    : "";

  return [
    "// Gerado pelo SCORM Builder (PDF da leitura). Não edite: é recriado a cada exportação.",
    PREAMBULO,
    `#set document(title: ${str(tituloDoc)}${C.contexto ? `, description: ${str(C.contexto)}` : ""})`,
    `#set page(paper: "a4", margin: (x: 16mm, top: 16mm, bottom: 20mm), footer: context pdf.artifact(text(size: 8pt, fill: suave)[${txt(C.id)} #h(1fr) ${txt("Página ")}#counter(page).display()${txt(" de ")}#counter(page).final().first()]))`,
    cab.join("\n\n"),
    ...telas,
    anexo,
  ]
    .filter(Boolean)
    .join("\n\n");
}
