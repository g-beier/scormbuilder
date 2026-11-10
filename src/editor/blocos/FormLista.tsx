import type { BlocoLista } from "../../modelo/tipos";
import { ListaDeTextos } from "../campos";
import { opsTextos, type PropsFormBloco } from "./comum";

export function FormLista(p: PropsFormBloco<BlocoLista>) {
  return (
    <ListaDeTextos
      titulo="Itens da lista"
      ajuda="Aparecem como uma lista com marcadores."
      valores={p.bloco.itens}
      rotuloItem={(i) => `Item ${i + 1}`}
      textoAdicionar="Adicionar item"
      minimo={1}
      {...opsTextos(p, (b) => b.itens, "itens")}
    />
  );
}
