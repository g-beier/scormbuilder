/**
 * Modelo do projeto do SCORM Builder.
 *
 * O projeto (arquivo de rascunho / .cevscorm) é separado do data.js:
 * o data.js v2 é gerado a partir dele por `compilar.ts`.
 * Os blocos espelham exatamente o contrato do data.js v2 (ver CLAUDE.md),
 * acrescidos de `extras` opcionais para campos desconhecidos vindos de
 * importação (nunca descartados, mas também nunca exportados).
 */

/** Campos desconhecidos preservados de uma importação. */
export type Extras = Record<string, unknown>;

export type Cor = "navy" | "green" | "red" | "yellow";
export const CORES: readonly Cor[] = ["navy", "green", "red", "yellow"];

export interface Meta {
  /** Sigla do curso: "CTGESTAO", "MAPIJ" ou outro. */
  curso: string;
  /** Número da Unidade Didática (0 = não informado). */
  ud: number;
  /** Tipo de atividade, ex. "LEITURA", "QUIZ". */
  atividade: string;
  /** Número da atividade (0 = não informado). */
  numero: number;
  titulo: string;
  /** Linha acima do cabeçalho do pacote ("Curso … · UD n – …"). */
  contexto: string;
}

// ---------- Itens internos dos blocos ----------

export interface Card {
  cor: Cor;
  titulo?: string;
  breve?: string;
  paras?: string[];
  lista?: string[];
  extras?: Extras;
}

export interface ItemLinha {
  titulo: string;
  texto: string;
  extras?: Extras;
}

export interface Pergunta {
  pergunta: string;
  opcoes: string[];
  /** Índice (base 0) da opção correta. */
  correta: number;
  explica: string;
  extras?: Extras;
}

export interface ItemContraste {
  cor: Cor;
  titulo: string;
  texto: string;
  extras?: Extras;
}

// ---------- Blocos ----------

interface BlocoBase {
  id: string;
  extras?: Extras;
}

export interface BlocoTexto extends BlocoBase {
  tipo: "texto";
  paras: string[];
}
export interface BlocoLista extends BlocoBase {
  tipo: "lista";
  itens: string[];
}
export interface BlocoCards extends BlocoBase {
  tipo: "cards";
  colunas?: 2;
  cards: Card[];
}
export interface BlocoOrdenar extends BlocoBase {
  tipo: "ordenar";
  nome: string;
  /** Passos na ordem correta. */
  passos: string[];
  porque: string;
  nota?: string;
}
export interface BlocoLinha extends BlocoBase {
  tipo: "linha";
  itens: ItemLinha[];
}
export interface BlocoQuiz extends BlocoBase {
  tipo: "quiz";
  perguntas: Pergunta[];
}
export interface BlocoContraste extends BlocoBase {
  tipo: "contraste";
  itens: ItemContraste[];
}
export interface BlocoDestaque extends BlocoBase {
  tipo: "destaque";
  html: string;
}
export interface BlocoConfira extends BlocoBase {
  tipo: "confira";
  botao: string;
  titulo: string;
  paras: string[];
}
export interface BlocoFonte extends BlocoBase {
  tipo: "fonte";
  html: string;
}

export type Bloco =
  | BlocoTexto
  | BlocoLista
  | BlocoCards
  | BlocoOrdenar
  | BlocoLinha
  | BlocoQuiz
  | BlocoContraste
  | BlocoDestaque
  | BlocoConfira
  | BlocoFonte;

export type TipoBloco = Bloco["tipo"];
export const TIPOS_BLOCO: readonly TipoBloco[] = [
  "texto",
  "lista",
  "cards",
  "ordenar",
  "linha",
  "quiz",
  "contraste",
  "destaque",
  "confira",
  "fonte",
];

// ---------- Slides ----------

export interface SlideCapa {
  id: string;
  tipo: "capa";
  kicker: string;
  titulo: string;
  sub: string;
  extras?: Extras;
}
export interface SlideConteudo {
  id: string;
  tipo: "conteudo";
  kicker: string;
  titulo: string;
  blocos: Bloco[];
  extras?: Extras;
}
export interface SlideFim {
  id: string;
  tipo: "fim";
  titulo: string;
  texto: string;
  extras?: Extras;
}

export type Slide = SlideCapa | SlideConteudo | SlideFim;
export type TipoSlide = Slide["tipo"];

// ---------- Projeto ----------

export interface Projeto {
  formato: "cev-scorm-builder";
  versao: 1;
  id: string;
  meta: Meta;
  slides: Slide[];
  /** ISO 8601. */
  criadoEm: string;
  /** ISO 8601. */
  atualizadoEm: string;
  extras?: Extras;
}

// ---------- data.js v2 (saída do compilador) ----------

/** Slide/bloco do data.js v2: o mesmo que o projeto, sem `extras`. */
type SemExtras<T> = T extends unknown ? Omit<T, "extras"> : never;
export type BlocoV2 = SemExtras<Bloco>;
export type SlideV2 =
  | Omit<SlideCapa, "extras">
  | (Omit<SlideConteudo, "extras" | "blocos"> & { blocos: BlocoV2[] })
  | Omit<SlideFim, "extras">;

export interface ConteudoV2 {
  formato: 2;
  id: string;
  contexto: string;
  titulo: string;
  slides: SlideV2[];
}

// ---------- Validação ----------

export interface Problema {
  nivel: "erro" | "aviso";
  slideId?: string;
  blocoId?: string;
  campo?: string;
  mensagem: string;
}

/** Nomes amigáveis (pt-BR) dos tipos, para mensagens e interface. */
export const NOMES_BLOCO: Record<TipoBloco, string> = {
  texto: "Texto",
  lista: "Lista",
  cards: "Cartões",
  ordenar: "Ordenar passos",
  linha: "Linha do tempo",
  quiz: "Perguntas",
  contraste: "Comparação",
  destaque: "Destaque",
  confira: "Confira",
  fonte: "Fonte / referência",
};

export const NOMES_SLIDE: Record<TipoSlide, string> = {
  capa: "Capa",
  conteudo: "Conteúdo",
  fim: "Fim",
};
