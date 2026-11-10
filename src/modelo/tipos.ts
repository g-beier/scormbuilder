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

export interface OpcaoMultipla {
  /** HTML (texto rico inline). */
  texto: string;
  correta: boolean;
  /** Comentário desta alternativa (texto simples), mostrado ao verificar. */
  fb: string;
  extras?: Extras;
}

export interface OpcaoEscolha {
  /** HTML (texto rico inline). */
  texto: string;
  /** Retorno desta alternativa (texto simples). */
  retorno: string;
  extras?: Extras;
}

export interface ItemCategorizar {
  /** HTML (texto rico inline). */
  texto: string;
  /** Índice da categoria certa em `categorias`; -1 = ainda não escolhida no editor. */
  categoria: number;
  /** Comentário deste item (texto simples), mostrado ao verificar. Pode ficar vazio. */
  fb: string;
  extras?: Extras;
}

export interface AlternativaRamificada {
  /** HTML (texto rico inline). */
  texto: string;
  /** Retorno desta alternativa (texto simples). Pode ficar vazio. */
  retorno: string;
  /** Id da pergunta seguinte (do mesmo bloco) ou "fim". */
  proxima: string;
  extras?: Extras;
}

export interface PerguntaRamificada {
  /** Id curto estável (`q-xxxxxxxx`), único no bloco; é o alvo de `proxima`. */
  id: string;
  /** HTML (texto rico inline). */
  enunciado: string;
  alternativas: AlternativaRamificada[];
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

/** Múltipla escolha: o aluno marca várias e clica "Verificar respostas". */
export interface BlocoMultipla extends BlocoBase {
  tipo: "multipla";
  enunciado: string;
  opcoes: OpcaoMultipla[];
  /** Texto simples; vazio = mensagem padrão do motor. */
  msgAcerto?: string;
  /** Texto simples; vazio = mensagem padrão do motor. */
  msgRevisar?: string;
}

/** Valores padrão da reflexão (iguais aos do runtime e do Kit.reflexao). */
export const PADRAO_REFLEXAO = { minChars: 10, maxChars: 500, opcional: true } as const;
/** Limite prático do texto enviado ao relatório de interações do Moodle. */
export const MAX_CHARS_REFLEXAO = 2000;

/**
 * Aviso mostrado quando o campo "aviso" da reflexão fica vazio (texto do
 * `avisoReflexao` de ead-scorm/MAPIJ_UD4_LEITURA3). O runtime usa o mesmo padrão.
 */
export const AVISO_REFLEXAO_PADRAO =
  "Ao enviar, sua reflexão é registrada na plataforma e pode ser lida pela equipe do curso. Não escreva nomes nem dados que identifiquem crianças, famílias ou casos reais. Depois de enviada, ela não pode ser editada; se você sair desta tela sem enviar, o texto é descartado.";

/** Reflexão: texto livre enviado ao relatório de interações (não é avaliado). */
export interface BlocoReflexao extends BlocoBase {
  tipo: "reflexao";
  pergunta: string;
  /** Texto simples; vazio = aviso padrão do motor. */
  aviso?: string;
  minChars?: number;
  maxChars?: number;
  /** false = resposta obrigatória para avançar. Padrão: true. */
  opcional?: boolean;
}

/** Escolha com retorno: sem certo/errado; cada alternativa tem seu retorno. */
export interface BlocoEscolha extends BlocoBase {
  tipo: "escolha";
  pergunta: string;
  opcoes: OpcaoEscolha[];
}

/** Limites de categorias do bloco "categorizar" (o runtime tem 4 cores). */
export const LIMITES_CATEGORIZAR = { minCategorias: 2, maxCategorias: 4, minItens: 2, itensAviso: 8 } as const;

/** Classificar: o aluno coloca cada item numa categoria e clica "Verificar". */
export interface BlocoCategorizar extends BlocoBase {
  tipo: "categorizar";
  enunciado: string;
  /** Títulos das categorias (texto simples). */
  categorias: string[];
  itens: ItemCategorizar[];
  /** Texto simples; vazio = mensagem padrão do motor. */
  msgAcerto?: string;
  /** Texto simples; vazio = mensagem padrão do motor. */
  msgRevisar?: string;
}

/**
 * Questionário com caminhos (modelo UD11_QUIZ): uma pergunta por vez, sem nota;
 * cada alternativa tem retorno e diz qual é a próxima pergunta. No fim, o aluno
 * vê o resumo e registra as respostas (cmi.interactions).
 */
export interface BlocoRamificado extends BlocoBase {
  tipo: "ramificado";
  perguntas: PerguntaRamificada[];
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
  | BlocoFonte
  | BlocoMultipla
  | BlocoReflexao
  | BlocoEscolha
  | BlocoCategorizar
  | BlocoRamificado;

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
  "multipla",
  "reflexao",
  "escolha",
  "categorizar",
  "ramificado",
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
  multipla: "Múltipla escolha",
  reflexao: "Reflexão",
  escolha: "Escolha com retorno",
  categorizar: "Classificar em categorias",
  ramificado: "Questionário com caminhos",
};

export const NOMES_SLIDE: Record<TipoSlide, string> = {
  capa: "Capa",
  conteudo: "Conteúdo",
  fim: "Fim",
};
