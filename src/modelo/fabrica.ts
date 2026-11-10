import type {
  Bloco,
  Meta,
  ItemCategorizar,
  OpcaoEscolha,
  OpcaoMultipla,
  Projeto,
  Slide,
  SlideCapa,
  SlideConteudo,
  SlideFim,
  TipoBloco,
  TipoSlide,
} from "./tipos";

/**
 * Id curto e estável. Slides e blocos usam prefixo + 8 hex (os ids podem
 * entrar no suspend_data, limitado a 4096 caracteres, então são curtos).
 * O projeto usa um UUID completo.
 */
export function novoId(prefixo: string): string {
  return `${prefixo}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function agora(): string {
  return new Date().toISOString();
}

export function metaVazia(): Meta {
  return { curso: "", ud: 0, atividade: "", numero: 0, titulo: "", contexto: "" };
}

export function novoProjeto(meta: Partial<Meta> = {}): Projeto {
  const m: Meta = { ...metaVazia(), ...meta };
  const data = agora();
  const capa = novoSlide("capa") as SlideCapa;
  capa.titulo = m.titulo;
  return {
    formato: "cev-scorm-builder",
    versao: 1,
    id: crypto.randomUUID(),
    meta: m,
    slides: [capa, novoSlide("fim")],
    criadoEm: data,
    atualizadoEm: data,
  };
}

export function novoSlide(tipo: "capa"): SlideCapa;
export function novoSlide(tipo: "conteudo"): SlideConteudo;
export function novoSlide(tipo: "fim"): SlideFim;
export function novoSlide(tipo: TipoSlide): Slide;
export function novoSlide(tipo: TipoSlide): Slide {
  const id = novoId("s");
  switch (tipo) {
    case "capa":
      return { id, tipo, kicker: "", titulo: "", sub: "" };
    case "conteudo":
      return { id, tipo, kicker: "", titulo: "", blocos: [] };
    case "fim":
      return {
        id,
        tipo,
        titulo: "Leitura concluída",
        texto: "Você chegou ao fim desta atividade.",
      };
  }
}

export function novoBloco<T extends TipoBloco>(tipo: T): Extract<Bloco, { tipo: T }>;
export function novoBloco(tipo: TipoBloco): Bloco {
  const id = novoId("b");
  switch (tipo) {
    case "texto":
      return { id, tipo, paras: [""] };
    case "lista":
      return { id, tipo, itens: [""] };
    case "cards":
      return { id, tipo, cards: [{ cor: "navy", titulo: "", paras: [""] }] };
    case "ordenar":
      return { id, tipo, nome: "", passos: ["", ""], porque: "" };
    case "linha":
      return { id, tipo, itens: [{ titulo: "", texto: "" }] };
    case "quiz":
      return {
        id,
        tipo,
        perguntas: [{ pergunta: "", opcoes: ["", ""], correta: 0, explica: "" }],
      };
    case "contraste":
      return {
        id,
        tipo,
        itens: [
          { cor: "red", titulo: "", texto: "" },
          { cor: "green", titulo: "", texto: "" },
        ],
      };
    case "destaque":
      return { id, tipo, html: "" };
    case "confira":
      return { id, tipo, botao: "Confira", titulo: "", paras: [""] };
    case "fonte":
      return { id, tipo, html: "" };
    case "multipla":
      // Nenhuma marcada como correta: o autor escolhe (a validação cobra).
      return {
        id,
        tipo,
        enunciado: "",
        opcoes: [novaOpcaoMultipla(), novaOpcaoMultipla()],
      };
    case "reflexao":
      return { id, tipo, pergunta: "" };
    case "escolha":
      return { id, tipo, pergunta: "", opcoes: [novaOpcaoEscolha(), novaOpcaoEscolha()] };
    case "categorizar":
      // Itens sem categoria: o autor escolhe (a validação cobra).
      return { id, tipo, enunciado: "", categorias: ["", ""], itens: [novoItemCategorizar(), novoItemCategorizar()] };
  }
}

export function novaOpcaoMultipla(): OpcaoMultipla {
  return { texto: "", correta: false, fb: "" };
}

export function novoItemCategorizar(): ItemCategorizar {
  return { texto: "", categoria: -1, fb: "" };
}

export function novaOpcaoEscolha(): OpcaoEscolha {
  return { texto: "", retorno: "" };
}

function clonar<T>(v: T): T {
  return structuredClone(v);
}

/** Cópia do bloco com id novo. */
export function duplicarBloco<B extends Bloco>(bloco: B): B {
  return { ...clonar(bloco), id: novoId("b") };
}

/** Cópia do slide com id novo (e ids novos em todos os blocos). */
export function duplicarSlide<S extends Slide>(slide: S): S {
  const copia = { ...clonar(slide), id: novoId("s") };
  if (copia.tipo === "conteudo") copia.blocos = copia.blocos.map((b) => ({ ...b, id: novoId("b") }));
  return copia;
}

/** Cópia do projeto com ids novos em tudo e datas atualizadas. */
export function duplicarProjeto(projeto: Projeto): Projeto {
  const data = agora();
  return {
    ...clonar(projeto),
    id: crypto.randomUUID(),
    slides: projeto.slides.map((s) => duplicarSlide(s)),
    criadoEm: data,
    atualizadoEm: data,
  };
}
