/**
 * Imagens do projeto (M9): quais arquivos de `img/` o projeto usa e a troca
 * de `img/<arquivo>` por `data:` na prévia. Funções puras.
 */
import type { BlocoV2, ConteudoV2, Projeto } from "./tipos";
import { RE_NOME_IMAGEM } from "./tipos";

/** Nomes (válidos) das imagens usadas pelos blocos "imagem" do projeto, sem repetição e em ordem. */
export function imagensDoProjeto(projeto: Pick<Projeto, "slides"> | null | undefined): string[] {
  const nomes = new Set<string>();
  for (const s of projeto?.slides ?? []) {
    if (s.tipo !== "conteudo") continue;
    for (const b of s.blocos ?? []) {
      if (b.tipo === "imagem" && typeof b.arquivo === "string" && RE_NOME_IMAGEM.test(b.arquivo)) nomes.add(b.arquivo);
    }
  }
  return [...nomes].sort();
}

/** Imagens de vários estados do projeto (ex.: o atual e todo o histórico de desfazer). */
export function imagensDeProjetos(projetos: Iterable<Pick<Projeto, "slides"> | null | undefined>): string[] {
  const nomes = new Set<string>();
  for (const p of projetos) for (const n of imagensDoProjeto(p)) nomes.add(n);
  return [...nomes].sort();
}

const PREFIXO_SRC = "img/";

/** Nome do arquivo de um `src` gerado pelo compilador (`img/<nome>`), ou null. */
export function nomeDoSrc(src: string): string | null {
  if (!src.startsWith(PREFIXO_SRC)) return null;
  const nome = src.slice(PREFIXO_SRC.length);
  return RE_NOME_IMAGEM.test(nome) ? nome : null;
}

/** Imagens citadas no CONTEUDO compilado (`src: "img/<nome>"`), em ordem e sem repetição. */
export function imagensDoConteudo(conteudo: ConteudoV2): string[] {
  const nomes = new Set<string>();
  for (const s of conteudo.slides) {
    if (s.tipo !== "conteudo") continue;
    for (const b of s.blocos) {
      const nome = b.tipo === "imagem" ? nomeDoSrc(b.src) : null;
      if (nome) nomes.add(nome);
    }
  }
  return [...nomes].sort();
}

/**
 * Cópia do CONTEUDO com `img/<nome>` trocado pelo `data:` de `urls` (para o
 * srcdoc da prévia, que não alcança a pasta do rascunho). Imagem sem `data:`
 * fica como está: o motor mostra "Imagem não carregada" com a descrição.
 */
export function trocarImagens(conteudo: ConteudoV2, urls: Readonly<Record<string, string>>): ConteudoV2 {
  const trocar = (b: BlocoV2): BlocoV2 => {
    if (b.tipo !== "imagem") return b;
    const nome = nomeDoSrc(b.src);
    const url = nome ? urls[nome] : undefined;
    return url ? { ...b, src: url } : b;
  };
  return {
    ...conteudo,
    slides: conteudo.slides.map((s) => (s.tipo === "conteudo" ? { ...s, blocos: s.blocos.map(trocar) } : s)),
  };
}
