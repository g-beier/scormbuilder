import type {
  Bloco,
  BlocoCards,
  BlocoCategorizar,
  BlocoMultipla,
  BlocoOrdenar,
  BlocoReflexao,
  BlocoV2,
  Card,
  ConteudoV2,
  Meta,
  Projeto,
  Slide,
  SlideV2,
} from "./tipos";
import { PADRAO_REFLEXAO } from "./tipos";
import { escaparHtml as esc } from "./texto";
import { limparBloco, limparSlide } from "./sanitizar";

/** Maiúsculas, sem acentos, só A-Z e 0-9. */
export function normalizarSigla(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** `CURSO_UD<ud>_<ATIVIDADE><numero>`, ex. `CTGESTAO_UD11_LEITURA2`. */
export function nomePacote(meta: Pick<Meta, "curso" | "ud" | "atividade" | "numero">): string {
  const curso = normalizarSigla(meta.curso) || "CURSO";
  const ud = Number.isFinite(meta.ud) && meta.ud > 0 ? Math.trunc(meta.ud) : 0;
  const atividade = normalizarSigla(meta.atividade) || "ATIVIDADE";
  const numero = Number.isFinite(meta.numero) && meta.numero > 0 ? String(Math.trunc(meta.numero)) : "";
  return `${curso}_UD${ud}_${atividade}${numero}`;
}

/** Nome do pacote para mostrar na tela: sem UD, mostra "UD?" (e não "UD0"). */
export function nomePacoteExibicao(meta: Pick<Meta, "curso" | "ud" | "atividade" | "numero">): string {
  const nome = nomePacote(meta);
  return Number.isFinite(meta.ud) && meta.ud > 0 ? nome : nome.replace(/_UD0_/, "_UD?_");
}

// Opcionais: só entram se tiverem conteúdo.
function temTexto(v: string | undefined): v is string {
  return typeof v === "string" && v.trim() !== "";
}
function temLista(v: string[] | undefined): v is string[] {
  return Array.isArray(v) && v.length > 0;
}

function compilarCard(c: Card): Card {
  const out: Card = { cor: c.cor };
  if (temTexto(c.titulo)) out.titulo = esc(c.titulo);
  if (temTexto(c.breve)) out.breve = c.breve;
  if (temLista(c.paras)) out.paras = [...c.paras];
  if (temLista(c.lista)) out.lista = [...c.lista];
  return out;
}

/*
 * Escape de texto simples: kicker, títulos de tela/cartão/linha/contraste, nome do
 * ordenar, botão e título do confira vão por innerHTML no motor e são escapados.
 * `explica` (textContent) e `contexto` (textContent) ficam como estão; campos ricos
 * já são HTML. Ver ./texto.ts e o inverso em importar.ts.
 * Nos tipos do M6 (multipla, reflexao, escolha), os campos simples (`fb`,
 * `retorno`, `aviso`, `msgAcerto`, `msgRevisar`) vão por textContent no motor
 * e não são escapados. No categorizar, os títulos das categorias são texto
 * simples inserido via innerHTML (escapados); `itens[].fb`, `msgAcerto` e
 * `msgRevisar` vão por textContent.
 */
export function compilarBloco(bloco: Bloco): BlocoV2 {
  // Defesa em profundidade: campos ricos passam pelo mesmo filtro da importação.
  const b = limparBloco(bloco);
  switch (b.tipo) {
    case "texto":
      return { id: b.id, tipo: b.tipo, paras: [...b.paras] };
    case "lista":
      return { id: b.id, tipo: b.tipo, itens: [...b.itens] };
    case "cards": {
      const out: Omit<BlocoCards, "extras"> = {
        id: b.id,
        tipo: b.tipo,
        ...(b.colunas === 2 ? { colunas: 2 as const } : {}),
        cards: b.cards.map(compilarCard),
      };
      return out;
    }
    case "ordenar": {
      const out: Omit<BlocoOrdenar, "extras"> = { id: b.id, tipo: b.tipo, nome: esc(b.nome), passos: [...b.passos], porque: b.porque };
      if (temTexto(b.nota)) out.nota = b.nota;
      return out;
    }
    case "linha":
      return { id: b.id, tipo: b.tipo, itens: b.itens.map((i) => ({ titulo: esc(i.titulo), texto: i.texto })) };
    case "quiz":
      return {
        id: b.id,
        tipo: b.tipo,
        perguntas: b.perguntas.map((p) => ({
          pergunta: p.pergunta,
          opcoes: [...p.opcoes],
          correta: p.correta,
          explica: p.explica,
        })),
      };
    case "contraste":
      return {
        id: b.id,
        tipo: b.tipo,
        itens: b.itens.map((i) => ({ cor: i.cor, titulo: esc(i.titulo), texto: i.texto })),
      };
    case "destaque":
      return { id: b.id, tipo: b.tipo, html: b.html };
    case "confira":
      return { id: b.id, tipo: b.tipo, botao: esc(b.botao), titulo: esc(b.titulo), paras: [...b.paras] };
    case "fonte":
      return { id: b.id, tipo: b.tipo, html: b.html };
    case "multipla": {
      const out: Omit<BlocoMultipla, "extras"> = {
        id: b.id,
        tipo: b.tipo,
        enunciado: b.enunciado,
        opcoes: b.opcoes.map((o) => ({ texto: o.texto, correta: o.correta === true, fb: o.fb })),
      };
      if (temTexto(b.msgAcerto)) out.msgAcerto = b.msgAcerto;
      if (temTexto(b.msgRevisar)) out.msgRevisar = b.msgRevisar;
      return out;
    }
    case "reflexao": {
      const out: Omit<BlocoReflexao, "extras"> = { id: b.id, tipo: b.tipo, pergunta: b.pergunta };
      if (temTexto(b.aviso)) out.aviso = b.aviso;
      if (typeof b.minChars === "number" && b.minChars !== PADRAO_REFLEXAO.minChars) out.minChars = b.minChars;
      if (typeof b.maxChars === "number" && b.maxChars !== PADRAO_REFLEXAO.maxChars) out.maxChars = b.maxChars;
      if (b.opcional === false) out.opcional = false;
      return out;
    }
    case "escolha":
      return {
        id: b.id,
        tipo: b.tipo,
        pergunta: b.pergunta,
        opcoes: b.opcoes.map((o) => ({ texto: o.texto, retorno: o.retorno })),
      };
    case "ramificado":
      return {
        id: b.id,
        tipo: b.tipo,
        perguntas: b.perguntas.map((p) => ({
          id: p.id,
          enunciado: p.enunciado,
          alternativas: p.alternativas.map((a) => ({ texto: a.texto, retorno: a.retorno, proxima: a.proxima })),
        })),
      };
    case "categorizar": {
      const out: Omit<BlocoCategorizar, "extras"> = {
        id: b.id,
        tipo: b.tipo,
        enunciado: b.enunciado,
        categorias: b.categorias.map((c) => esc(c)),
        itens: b.itens.map((it) => ({ texto: it.texto, categoria: it.categoria, fb: it.fb })),
      };
      if (temTexto(b.msgAcerto)) out.msgAcerto = b.msgAcerto;
      if (temTexto(b.msgRevisar)) out.msgRevisar = b.msgRevisar;
      return out;
    }
  }
}

export function compilarSlide(slide: Slide): SlideV2 {
  // Os blocos são limpos em compilarBloco; aqui, só os campos ricos da própria tela.
  const s = slide.tipo === "conteudo" ? slide : limparSlide(slide);
  switch (s.tipo) {
    case "capa":
      return { id: s.id, tipo: s.tipo, kicker: esc(s.kicker), titulo: esc(s.titulo), sub: s.sub };
    case "conteudo":
      return { id: s.id, tipo: s.tipo, kicker: esc(s.kicker), titulo: esc(s.titulo), blocos: s.blocos.map(compilarBloco) };
    case "fim":
      return { id: s.id, tipo: s.tipo, titulo: esc(s.titulo), texto: s.texto };
  }
}

/** Projeto → objeto CONTEUDO v2 (sem `extras`, ordem de chaves estável). */
export function compilarConteudo(projeto: Projeto): ConteudoV2 {
  return {
    formato: 2,
    id: nomePacote(projeto.meta),
    contexto: projeto.meta.contexto,
    titulo: projeto.meta.titulo,
    slides: projeto.slides.map(compilarSlide),
  };
}

export const CABECALHO_DATA_JS = "/* gerado pelo SCORM Builder */";

/** Projeto → texto do `js/data.js` v2 (determinístico). */
export function compilarDataJs(projeto: Projeto): string {
  const json = JSON.stringify(compilarConteudo(projeto), null, 2);
  return `${CABECALHO_DATA_JS}\nwindow.CONTEUDO = ${json};\n`;
}
