import type { Draft } from "immer";
import type { Bloco } from "../../modelo/tipos";
import { moverItem } from "../campos";

export interface PropsFormBloco<B extends Bloco> {
  bloco: B;
  /** Aplica uma receita immer no bloco. `grupo` agrupa a digitação num passo de desfazer. */
  editar(receita: (b: Draft<B>) => void, grupo?: string): void;
  /** Chave data-foco de um campo do bloco (mesmo caminho do validar). */
  f(campo: string): string;
}

/**
 * Operações de uma lista de textos dentro do bloco, para `ListaDeTextos`.
 * `pegar` devolve (criando, se preciso) o array no rascunho; `caminho` é o
 * caminho do campo no validar (ex. "paras", "cards[0].lista").
 */
export function opsTextos<B extends Bloco>(
  { editar, f }: Pick<PropsFormBloco<B>, "editar" | "f">,
  pegar: (b: Draft<B>) => string[],
  caminho: string,
) {
  return {
    focoDe: (i?: number) => f(i === undefined ? caminho : `${caminho}[${i}]`),
    aoMudar: (i: number, v: string) =>
      editar((b) => {
        pegar(b)[i] = v;
      }, f(`${caminho}[${i}]`)),
    aoAdicionar: () => editar((b) => void pegar(b).push("")),
    aoRemover: (i: number) => editar((b) => void pegar(b).splice(i, 1)),
    aoMover: (de: number, para: number) => editar((b) => moverItem(pegar(b), de, para)),
  };
}
