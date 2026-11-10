import type { BlocoTexto } from "../../modelo/tipos";
import { ListaDeTextos } from "../campos";
import { opsTextos, type PropsFormBloco } from "./comum";

export function FormTexto(p: PropsFormBloco<BlocoTexto>) {
  return (
    <ListaDeTextos
      titulo="Parágrafos"
      ajuda="Cada parágrafo aparece separado na tela, na ordem abaixo."
      valores={p.bloco.paras}
      rotuloItem={(i) => `Parágrafo ${i + 1}`}
      textoAdicionar="Adicionar parágrafo"
      minimo={1}
      {...opsTextos(p, (b) => b.paras, "paras")}
    />
  );
}
