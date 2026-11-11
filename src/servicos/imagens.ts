/**
 * Wrappers tipados dos comandos de imagem do rascunho (`src-tauri/src/imagens.rs`)
 * e um cache em memória das `data:` URLs (miniatura no editor e prévia).
 * Erros chegam do Rust como string em pt-BR, prontos para mostrar.
 */
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { emTauri, MSG_SO_NO_APP } from "./ambiente";

/** Espelha `ImagemImportada` do Rust (camelCase). */
export interface ImagemImportada {
  /** Nome em `img/` do rascunho (`<16 hex>.<ext>`). */
  nome: string;
  largura: number;
  altura: number;
  /** Tamanho do arquivo em bytes. */
  bytes: number;
}

/** Filtro do diálogo "Escolher imagem…" (o backend confere o tipo pelo conteúdo). */
export const FILTRO_IMAGEM = [{ name: "Imagem (PNG, JPEG, WebP ou GIF)", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }];

/** Copia a imagem de `caminho` para a pasta do rascunho `id` (limite de 2 MB; sem SVG). */
export function importarImagem(id: string, caminho: string): Promise<ImagemImportada> {
  return invoke<ImagemImportada>("importar_imagem", { id, caminho });
}

/** A imagem do rascunho como `data:` URL. */
export function lerImagem(id: string, nome: string): Promise<string> {
  return invoke<string>("ler_imagem", { id, nome });
}

/** Apaga de `img/` do rascunho as imagens fora de `usadas`; devolve os nomes apagados. */
export function limparImagensOrfas(id: string, usadas: string[]): Promise<string[]> {
  return invoke<string[]>("limpar_imagens_orfas", { id, usadas });
}

/** Diálogo nativo para escolher a imagem; `null` = cancelou. */
export async function escolherArquivoImagem(): Promise<string | null> {
  if (!emTauri()) throw new Error(MSG_SO_NO_APP);
  const r = await open({ multiple: false, directory: false, filters: FILTRO_IMAGEM, title: "Escolher imagem" });
  return typeof r === "string" ? r : null;
}

// ---------- Cache das data: URLs ----------

/**
 * Chave = `<id do projeto>/<nome>`. Os nomes são endereçados pelo conteúdo
 * (hash), então uma entrada nunca fica velha; só sai ao fechar o projeto.
 * Falhas não ficam no cache (a próxima leitura tenta de novo).
 */
const cache = new Map<string, string>();
const emCurso = new Map<string, Promise<string | null>>();

const chave = (id: string, nome: string) => `${id}/${nome}`;

/** Leitor injetável nos testes (padrão: comando `ler_imagem`, só dentro do app). */
let leitor: (id: string, nome: string) => Promise<string> = lerImagem;
export function _definirLeitorImagem(f: typeof leitor | null) {
  leitor = f ?? lerImagem;
}
/** Sem Tauri (npm run dev), não há disco: nenhuma imagem é lida. */
let disponivel: () => boolean = emTauri;
export function _definirDisponivel(f: (() => boolean) | null) {
  disponivel = f ?? emTauri;
}

/** URL já carregada, se houver (síncrono). */
export function imagemEmCache(id: string, nome: string): string | undefined {
  return cache.get(chave(id, nome));
}

/** Guarda uma URL já conhecida (ex.: logo depois de importar a imagem). */
export function guardarImagemEmCache(id: string, nome: string, url: string) {
  cache.set(chave(id, nome), url);
}

/** `data:` URL da imagem, do cache ou do disco; `null` se não deu para ler. */
export function urlDaImagem(id: string, nome: string): Promise<string | null> {
  const k = chave(id, nome);
  const pronta = cache.get(k);
  if (pronta !== undefined) return Promise.resolve(pronta);
  if (!disponivel()) return Promise.resolve(null);
  let p = emCurso.get(k);
  if (!p) {
    p = leitor(id, nome)
      .then((url) => {
        cache.set(k, url);
        return url;
      })
      .catch(() => null)
      .finally(() => emCurso.delete(k));
    emCurso.set(k, p);
  }
  return p;
}

/**
 * URLs de várias imagens. Devolve só as que puderam ser lidas (as outras
 * ficam de fora e a prévia mostra "Imagem não carregada").
 */
export async function urlsDasImagens(id: string, nomes: readonly string[]): Promise<Record<string, string>> {
  const pares = await Promise.all(nomes.map(async (n) => [n, await urlDaImagem(id, n)] as const));
  return Object.fromEntries(pares.filter((p): p is readonly [string, string] => p[1] !== null));
}

/** Todas já no cache? Devolve o mapa (síncrono), senão `null`. */
export function urlsEmCache(id: string, nomes: readonly string[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const n of nomes) {
    const u = cache.get(chave(id, n));
    if (u === undefined) return null;
    out[n] = u;
  }
  return out;
}

/** Esvazia o cache (ao fechar o projeto). */
export function esquecerImagens() {
  cache.clear();
}
