import { desescaparHtml } from "./texto";
import { novoId, metaVazia } from "./fabrica";
import { normalizarSigla } from "./compilar";
import type {
  Bloco,
  BlocoOrdenar,
  Card,
  Cor,
  Extras,
  ItemContraste,
  ItemLinha,
  Meta,
  OpcaoEscolha,
  OpcaoMultipla,
  Pergunta,
  Projeto,
  Slide,
  SlideConteudo,
  TipoBloco,
} from "./tipos";

type Obj = Record<string, unknown>;

export interface ResultadoImportacao {
  projeto: Projeto;
  avisos: string[];
}

export class ErroImportacao extends Error {}

// ---------- Avaliação isolada ----------

/** Nomes globais sombreados durante a avaliação do data.js. */
const SOMBRAS = ["window", "self", "globalThis", "top", "parent", "frames", "document", "CONTEUDO"];

/**
 * Executa o data.js com um `window` falso e devolve o CONTEUDO.
 * Aceita `window.CONTEUDO = …`, `var CONTEUDO = …` e `CONTEUDO = …`.
 * Os globais do app ficam sombreados (o código nunca vê o window real).
 * Não é um sandbox de segurança: serve para arquivos de conteúdo confiáveis.
 */
export function avaliarDataJs(fonte: string): unknown {
  const falso: Obj = {};
  const corpoTexto = `"use strict";\n${fonte}\n;return (typeof CONTEUDO !== "undefined" && CONTEUDO) || window.CONTEUDO;`;
  let corpo: (...args: unknown[]) => unknown;
  try {
    corpo = new Function(...SOMBRAS, corpoTexto) as (...args: unknown[]) => unknown;
  } catch {
    // `const/let CONTEUDO` colide com o parâmetro sombra: tenta sem ele.
    try {
      corpo = new Function(...SOMBRAS.slice(0, -1), corpoTexto) as (...args: unknown[]) => unknown;
    } catch (e) {
      throw new ErroImportacao(`O arquivo data.js tem um erro de sintaxe: ${(e as Error).message}`);
    }
  }
  try {
    // window, self, globalThis, top, parent, frames → o mesmo objeto falso
    return corpo.call(undefined, falso, falso, falso, falso, falso, falso, undefined, undefined);
  } catch (e) {
    throw new ErroImportacao(`Não foi possível ler o data.js: ${(e as Error).message}`);
  }
}

// ---------- Utilitários ----------

function eObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function eStr(v: unknown): v is string {
  return typeof v === "string";
}
function eStrArr(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(eStr);
}
function str(v: unknown): string {
  return eStr(v) ? v : v == null ? "" : String(v);
}

/** Campos de `o` fora de `conhecidas`, ou undefined se não houver. */
function sobras(o: Obj, conhecidas: readonly string[]): Extras | undefined {
  const ex: Extras = {};
  let tem = false;
  for (const k of Object.keys(o)) {
    if (!conhecidas.includes(k)) {
      ex[k] = o[k];
      tem = true;
    }
  }
  return tem ? ex : undefined;
}

function comExtras<T extends object>(alvo: T, extras: Extras | undefined): T {
  if (extras && Object.keys(extras).length) (alvo as T & { extras?: Extras }).extras = extras;
  return alvo;
}

/**
 * Lê um campo esperado como string; se tiver outro tipo, vai para extras.
 */
class Leitor {
  extras: Extras = {};
  constructor(private o: Obj, private avisos: string[], private onde: string) {}
  s(k: string): string {
    const v = this.o[k];
    if (v === undefined || eStr(v)) return v ?? "";
    this.desvio(k, v);
    return "";
  }
  /** Campo de texto simples (ver texto.ts): desfaz o escape do data.js. */
  t(k: string): string {
    return desescaparHtml(this.s(k));
  }
  tOpc(k: string): string | undefined {
    const v = this.sOpc(k);
    return v === undefined ? v : desescaparHtml(v);
  }
  sOpc(k: string): string | undefined {
    const v = this.o[k];
    if (v === undefined || eStr(v)) return v;
    this.desvio(k, v);
    return undefined;
  }
  arr(k: string): string[] {
    const v = this.o[k];
    if (v === undefined) return [];
    if (eStrArr(v)) return [...v];
    this.desvio(k, v);
    return [];
  }
  arrOpc(k: string): string[] | undefined {
    const v = this.o[k];
    if (v === undefined || eStrArr(v)) return v ? [...v] : undefined;
    this.desvio(k, v);
    return undefined;
  }
  /** Número opcional; outro tipo vai para extras. */
  nOpc(k: string): number | undefined {
    const v = this.o[k];
    if (v === undefined || (typeof v === "number" && Number.isFinite(v))) return v;
    this.desvio(k, v);
    return undefined;
  }
  /** Booleano opcional; outro tipo vai para extras. */
  bOpc(k: string): boolean | undefined {
    const v = this.o[k];
    if (v === undefined || typeof v === "boolean") return v;
    this.desvio(k, v);
    return undefined;
  }
  objs(k: string): Obj[] {
    const v = this.o[k];
    if (v === undefined) return [];
    if (Array.isArray(v) && v.every(eObj)) return v;
    this.desvio(k, v);
    return [];
  }
  private desvio(k: string, v: unknown) {
    this.extras[k] = v;
    this.avisos.push(`${this.onde}: o campo "${k}" tem um formato inesperado e foi guardado sem uso.`);
  }
  /** extras = campos desconhecidos + campos com formato inesperado. */
  fim(conhecidas: readonly string[]): Extras | undefined {
    const ex = { ...(sobras(this.o, conhecidas) ?? {}), ...this.extras };
    return Object.keys(ex).length ? ex : undefined;
  }
}

// ---------- Itens ----------

function lerCard(o: Obj, av: string[], onde: string): Card {
  const l = new Leitor(o, av, onde);
  const c: Card = { cor: l.s("cor") as Cor };
  const titulo = l.tOpc("titulo");
  const breve = l.sOpc("breve");
  const paras = l.arrOpc("paras");
  const lista = l.arrOpc("lista");
  if (titulo !== undefined) c.titulo = titulo;
  if (breve !== undefined) c.breve = breve;
  if (paras !== undefined) c.paras = paras;
  if (lista !== undefined) c.lista = lista;
  return comExtras(c, l.fim(["cor", "titulo", "breve", "paras", "lista"]));
}

function lerLinha(o: Obj, av: string[], onde: string): ItemLinha {
  const l = new Leitor(o, av, onde);
  return comExtras({ titulo: l.t("titulo"), texto: l.s("texto") }, l.fim(["titulo", "texto"]));
}

function lerContraste(o: Obj, av: string[], onde: string): ItemContraste {
  const l = new Leitor(o, av, onde);
  return comExtras(
    { cor: l.s("cor") as Cor, titulo: l.t("titulo"), texto: l.s("texto") },
    l.fim(["cor", "titulo", "texto"]),
  );
}

function lerPergunta(o: Obj, av: string[], onde: string): Pergunta {
  const l = new Leitor(o, av, onde);
  const p: Pergunta = { pergunta: l.s("pergunta"), opcoes: l.arr("opcoes"), correta: -1, explica: "" };
  const c = o.correta;
  if (typeof c === "number") p.correta = c;
  else if (c !== undefined) l.extras.correta = c;
  p.explica = l.s("explica");
  return comExtras(p, l.fim(["pergunta", "opcoes", "correta", "explica"]));
}

function lerOpcaoMultipla(o: Obj, av: string[], onde: string): OpcaoMultipla {
  const l = new Leitor(o, av, onde);
  const op: OpcaoMultipla = { texto: l.s("texto"), correta: l.bOpc("correta") ?? false, fb: l.s("fb") };
  return comExtras(op, l.fim(["texto", "correta", "fb"]));
}

function lerOpcaoEscolha(o: Obj, av: string[], onde: string): OpcaoEscolha {
  const l = new Leitor(o, av, onde);
  return comExtras({ texto: l.s("texto"), retorno: l.s("retorno") }, l.fim(["texto", "retorno"]));
}

function lerFluxo(o: Obj, av: string[], onde: string, id?: string): BlocoOrdenar {
  const l = new Leitor(o, av, onde);
  const b: BlocoOrdenar = { id: id ?? novoId("b"), tipo: "ordenar", nome: l.t("nome"), passos: l.arr("passos"), porque: l.s("porque") };
  const nota = l.sOpc("nota");
  if (nota !== undefined) b.nota = nota;
  return comExtras(b, l.fim(["id", "tipo", "nome", "passos", "porque", "nota"]));
}

// ---------- Legado (LEITURA2) ----------

const CHAVES_CONTEUDO_LEGADO = [
  "tipo", "kicker", "titulo", "paras", "lista", "cards", "colunas", "fluxos",
  "linha", "quiz", "contraste", "destaque", "modais", "fonte",
] as const;

function slideLegado(o: Obj, numTela: number, av: string[]): Slide[] {
  const onde = `Tela ${numTela}`;
  const l = new Leitor(o, av, onde);
  const tipo = o.tipo;

  if (tipo === "capa") {
    const s: Slide = { id: novoId("s"), tipo: "capa", kicker: l.t("kicker"), titulo: l.t("titulo"), sub: l.s("sub") };
    return [comExtras(s, l.fim(["tipo", "kicker", "titulo", "sub"]))];
  }
  if (tipo === "fim") {
    const s: Slide = { id: novoId("s"), tipo: "fim", titulo: l.t("titulo"), texto: l.s("texto") };
    return [comExtras(s, l.fim(["tipo", "titulo", "texto"]))];
  }
  if (tipo !== undefined) {
    av.push(`${onde}: tipo de tela "${String(tipo)}" desconhecido; importada como tela de conteúdo.`);
  }

  const kicker = l.t("kicker");
  const titulo = l.t("titulo");

  // Blocos na ordem fixa do motor antigo.
  const paras = o.paras !== undefined ? l.arr("paras") : undefined;
  const lista = o.lista !== undefined ? l.arr("lista") : undefined;
  const cards = o.cards !== undefined ? l.objs("cards") : undefined;
  let colunas: 2 | undefined;
  if (o.colunas === 2) colunas = 2;
  else if (o.colunas !== undefined) l.extras.colunas = o.colunas;
  const fluxos = o.fluxos !== undefined ? l.objs("fluxos") : undefined;
  const linha = o.linha !== undefined ? l.objs("linha") : undefined;
  const quiz = o.quiz !== undefined ? l.objs("quiz") : undefined;
  const contraste = o.contraste !== undefined ? l.objs("contraste") : undefined;
  const destaque = l.sOpc("destaque");
  const modais = o.modais !== undefined ? l.objs("modais") : undefined;
  const fonte = l.sOpc("fonte");
  if (colunas && !cards) l.extras.colunas = colunas;

  const bTexto = (): Bloco[] => (paras ? [{ id: novoId("b"), tipo: "texto", paras }] : []);
  const bLista = (): Bloco[] => (lista ? [{ id: novoId("b"), tipo: "lista", itens: lista }] : []);
  const bCards = (): Bloco[] =>
    cards
      ? [{
          id: novoId("b"),
          tipo: "cards",
          ...(colunas ? { colunas } : {}),
          cards: cards.map((c, k) => lerCard(c, av, `${onde}, cartão ${k + 1}`)),
        }]
      : [];
  const bLinha = (): Bloco[] =>
    linha ? [{ id: novoId("b"), tipo: "linha", itens: linha.map((x, k) => lerLinha(x, av, `${onde}, linha ${k + 1}`)) }] : [];
  const bQuiz = (): Bloco[] =>
    quiz
      ? [{ id: novoId("b"), tipo: "quiz", perguntas: quiz.map((x, k) => lerPergunta(x, av, `${onde}, pergunta ${k + 1}`)) }]
      : [];
  const bContraste = (): Bloco[] =>
    contraste
      ? [{ id: novoId("b"), tipo: "contraste", itens: contraste.map((x, k) => lerContraste(x, av, `${onde}, contraste ${k + 1}`)) }]
      : [];
  const bDestaque = (): Bloco[] => (destaque !== undefined ? [{ id: novoId("b"), tipo: "destaque", html: destaque }] : []);
  const bModais = (): Bloco[] =>
    (modais ?? []).map((m, k) => {
      const lm = new Leitor(m, av, `${onde}, Confira ${k + 1}`);
      const id = eStr(m.id) && m.id ? m.id : novoId("b");
      const b: Bloco = { id, tipo: "confira", botao: lm.t("botao"), titulo: lm.t("titulo"), paras: lm.arr("paras") };
      return comExtras(b, lm.fim(["id", "botao", "titulo", "paras"]));
    });
  const bFonte = (): Bloco[] => (fonte !== undefined ? [{ id: novoId("b"), tipo: "fonte", html: fonte }] : []);
  const bFluxos = (fs: Obj[]): Bloco[] => fs.map((f, k) => lerFluxo(f, av, `${onde}, sequência ${k + 1}`));

  const extras = l.fim(CHAVES_CONTEUDO_LEGADO);

  if (!fluxos || fluxos.length < 2) {
    const blocos: Bloco[] = [
      ...bTexto(), ...bLista(), ...bCards(), ...bFluxos(fluxos ?? []), ...bLinha(),
      ...bQuiz(), ...bContraste(), ...bDestaque(), ...bModais(), ...bFonte(),
    ];
    return [comExtras<SlideConteudo>({ id: novoId("s"), tipo: "conteudo", kicker, titulo, blocos }, extras)];
  }

  // 2+ fluxos: uma tela por fluxo, como o expandirFluxos do motor antigo.
  const n = fluxos.length;
  const ignorados = [bLista(), bCards(), bLinha(), bQuiz(), bModais()].flat();
  if (ignorados.length) {
    av.push(
      `${onde}: tinha várias sequências para ordenar junto com outros blocos que o motor antigo não exibia; esses blocos foram mantidos na primeira das ${n} telas geradas.`,
    );
  }
  return fluxos.map((f, k) => {
    const ultimo = k === n - 1;
    const blocos: Bloco[] = [
      ...(k === 0 ? [...bTexto(), ...ignorados] : []),
      lerFluxo(f, av, `${onde}, sequência ${k + 1}`),
      ...(ultimo ? [...bContraste(), ...bDestaque(), ...bFonte()] : []),
    ];
    const s: SlideConteudo = {
      id: novoId("s"),
      tipo: "conteudo",
      kicker: `${kicker} · ${k + 1} de ${n}`,
      titulo,
      blocos,
    };
    return k === 0 ? comExtras(s, extras) : s;
  });
}

// ---------- v2 ----------

const CAMPOS_BLOCO: Record<TipoBloco, readonly string[]> = {
  texto: ["paras"],
  lista: ["itens"],
  cards: ["colunas", "cards"],
  ordenar: ["nome", "passos", "porque", "nota"],
  linha: ["itens"],
  quiz: ["perguntas"],
  contraste: ["itens"],
  destaque: ["html"],
  confira: ["botao", "titulo", "paras"],
  fonte: ["html"],
  multipla: ["enunciado", "opcoes", "msgAcerto", "msgRevisar"],
  reflexao: ["pergunta", "aviso", "minChars", "maxChars", "opcional"],
  escolha: ["pergunta", "opcoes"],
};

function blocoV2(o: Obj, av: string[], onde: string): Bloco | null {
  const tipo = o.tipo as TipoBloco;
  if (!(tipo in CAMPOS_BLOCO)) return null;
  const l = new Leitor(o, av, onde);
  const id = eStr(o.id) && o.id ? o.id : novoId("b");
  let b: Bloco;
  switch (tipo) {
    case "texto":
      b = { id, tipo, paras: l.arr("paras") };
      break;
    case "lista":
      b = { id, tipo, itens: l.arr("itens") };
      break;
    case "cards":
      b = {
        id,
        tipo,
        ...(o.colunas === 2 ? { colunas: 2 as const } : {}),
        cards: l.objs("cards").map((c, k) => lerCard(c, av, `${onde}, cartão ${k + 1}`)),
      };
      if (o.colunas !== undefined && o.colunas !== 2) l.extras.colunas = o.colunas;
      break;
    case "ordenar":
      return lerFluxo(o, av, onde, id);
    case "linha":
      b = { id, tipo, itens: l.objs("itens").map((x, k) => lerLinha(x, av, `${onde}, item ${k + 1}`)) };
      break;
    case "quiz":
      b = { id, tipo, perguntas: l.objs("perguntas").map((x, k) => lerPergunta(x, av, `${onde}, pergunta ${k + 1}`)) };
      break;
    case "contraste":
      b = { id, tipo, itens: l.objs("itens").map((x, k) => lerContraste(x, av, `${onde}, item ${k + 1}`)) };
      break;
    case "destaque":
    case "fonte":
      b = { id, tipo, html: l.s("html") };
      break;
    case "confira":
      b = { id, tipo, botao: l.t("botao"), titulo: l.t("titulo"), paras: l.arr("paras") };
      break;
    case "multipla": {
      const m: Bloco = {
        id,
        tipo,
        enunciado: l.s("enunciado"),
        opcoes: l.objs("opcoes").map((x, k) => lerOpcaoMultipla(x, av, `${onde}, alternativa ${k + 1}`)),
      };
      const msgAcerto = l.sOpc("msgAcerto");
      const msgRevisar = l.sOpc("msgRevisar");
      if (msgAcerto !== undefined) m.msgAcerto = msgAcerto;
      if (msgRevisar !== undefined) m.msgRevisar = msgRevisar;
      b = m;
      break;
    }
    case "reflexao": {
      const r: Bloco = { id, tipo, pergunta: l.s("pergunta") };
      const aviso = l.sOpc("aviso");
      const minChars = l.nOpc("minChars");
      const maxChars = l.nOpc("maxChars");
      const opcional = l.bOpc("opcional");
      if (aviso !== undefined) r.aviso = aviso;
      if (minChars !== undefined) r.minChars = minChars;
      if (maxChars !== undefined) r.maxChars = maxChars;
      if (opcional !== undefined) r.opcional = opcional;
      b = r;
      break;
    }
    case "escolha":
      b = {
        id,
        tipo,
        pergunta: l.s("pergunta"),
        opcoes: l.objs("opcoes").map((x, k) => lerOpcaoEscolha(x, av, `${onde}, alternativa ${k + 1}`)),
      };
      break;
  }
  return comExtras(b, l.fim(["id", "tipo", ...CAMPOS_BLOCO[tipo]]));
}

function slideV2(o: Obj, n: number, av: string[]): Slide {
  const onde = `Tela ${n}`;
  const l = new Leitor(o, av, onde);
  const id = eStr(o.id) && o.id ? o.id : novoId("s");
  if (o.tipo === "capa") {
    return comExtras<Slide>(
      { id, tipo: "capa", kicker: l.t("kicker"), titulo: l.t("titulo"), sub: l.s("sub") },
      l.fim(["id", "tipo", "kicker", "titulo", "sub"]),
    );
  }
  if (o.tipo === "fim") {
    return comExtras<Slide>({ id, tipo: "fim", titulo: l.t("titulo"), texto: l.s("texto") }, l.fim(["id", "tipo", "titulo", "texto"]));
  }
  if (o.tipo !== "conteudo") av.push(`${onde}: tipo de tela "${String(o.tipo)}" desconhecido; importada como tela de conteúdo.`);
  const blocos: Bloco[] = [];
  const desconhecidos: unknown[] = [];
  l.objs("blocos").forEach((bo, k) => {
    const b = blocoV2(bo, av, `${onde}, bloco ${k + 1}`);
    if (b) blocos.push(b);
    else {
      desconhecidos.push(bo);
      av.push(`${onde}: bloco de tipo "${String(bo.tipo)}" desconhecido; guardado sem uso.`);
    }
  });
  if (desconhecidos.length) l.extras.blocosDesconhecidos = desconhecidos;
  return comExtras<Slide>(
    { id, tipo: "conteudo", kicker: l.t("kicker"), titulo: l.t("titulo"), blocos },
    l.fim(["id", "tipo", "kicker", "titulo", "blocos"]),
  );
}

// ---------- Meta ----------

const RE_PACOTE = /^([A-Za-z]+)_UD(\d+)_([A-Za-z]+?)(\d*)$/;

/** Lê curso/UD/atividade/número de um nome de pacote (`CTGESTAO_UD11_LEITURA2`). */
export function metaDoNome(nome: string): Partial<Meta> {
  const base = nome.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
  const m = RE_PACOTE.exec(base);
  if (!m) return {};
  const out: Partial<Meta> = { curso: m[1].toUpperCase(), ud: Number(m[2]), atividade: m[3].toUpperCase() };
  if (m[4]) out.numero = Number(m[4]);
  return out;
}

function metaDoContexto(contexto: string): Partial<Meta> {
  const out: Partial<Meta> = {};
  const ud = /\bUD\s*(\d+)/i.exec(contexto);
  if (ud) out.ud = Number(ud[1]);
  if (/t[ée]cnico de gest[ãa]o/i.test(contexto)) out.curso = "CTGESTAO";
  return out;
}

function definidos(p: Partial<Meta>): Partial<Meta> {
  const out: Partial<Meta> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== "" && !(typeof v === "number" && !(v > 0))) (out as Obj)[k] = v;
  }
  return out;
}

// ---------- Entrada ----------

/**
 * Importa um data.js (legado LEITURA2 ou v2) como Projeto.
 * @param meta  valores explícitos (têm prioridade sobre o que for inferido)
 * @param pasta nome (ou caminho) da pasta do pacote, ex. `CTGESTAO_UD11_LEITURA2`
 */
export function importarDataJs(fonte: string, meta?: Partial<Meta>, pasta?: string): ResultadoImportacao {
  const bruto = avaliarDataJs(fonte);
  if (!eObj(bruto)) throw new ErroImportacao("O data.js não define window.CONTEUDO.");
  if (!Array.isArray(bruto.slides)) throw new ErroImportacao("O data.js não tem a lista de telas (slides).");

  const avisos: string[] = [];
  const v2 = bruto.formato === 2;
  const slidesBrutos = bruto.slides as unknown[];

  const slides: Slide[] = [];
  slidesBrutos.forEach((s, i) => {
    if (!eObj(s)) {
      avisos.push(`Tela ${i + 1}: formato inesperado; ignorada.`);
      return;
    }
    if (v2) slides.push(slideV2(s, i + 1, avisos));
    else slides.push(...slideLegado(s, i + 1, avisos));
  });

  const contexto = str(bruto.contexto);
  const capa = slides.find((s) => s.tipo === "capa");
  const tituloInferido = v2 ? str(bruto.titulo) : (capa?.titulo ?? "");
  const metaFinal: Meta = {
    ...metaVazia(),
    ...definidos(metaDoContexto(contexto)),
    ...definidos(v2 && eStr(bruto.id) ? metaDoNome(bruto.id) : {}),
    ...definidos(pasta ? metaDoNome(pasta) : {}),
    ...definidos({ titulo: tituloInferido, contexto }),
    ...definidos(meta ?? {}),
  };
  metaFinal.curso = normalizarSigla(metaFinal.curso);
  metaFinal.atividade = normalizarSigla(metaFinal.atividade);

  const naoInferidos: string[] = [];
  if (!metaFinal.curso) naoInferidos.push("curso");
  if (!(metaFinal.ud > 0)) naoInferidos.push("UD");
  if (!metaFinal.atividade) naoInferidos.push("tipo de atividade");
  if (!(metaFinal.numero > 0)) naoInferidos.push("número da atividade");
  if (naoInferidos.length) avisos.push(`Não foi possível descobrir: ${naoInferidos.join(", ")}. Preencha nos dados do pacote.`);

  const conhecidasTopo = v2 ? ["formato", "id", "contexto", "titulo", "slides"] : ["contexto", "slides"];
  const extras = sobras(bruto, conhecidasTopo);
  if (extras) avisos.push(`Campos desconhecidos guardados sem uso: ${Object.keys(extras).join(", ")}.`);

  const data = new Date().toISOString();
  const projeto: Projeto = {
    formato: "cev-scorm-builder",
    versao: 1,
    id: crypto.randomUUID(),
    meta: metaFinal,
    slides,
    criadoEm: data,
    atualizadoEm: data,
  };
  return { projeto: comExtras(projeto, extras), avisos };
}
