import type { BlocoLinha } from "../../modelo/tipos";
import { CampoRico, CampoTexto, ListaEditavel, moverItem } from "../campos";
import type { PropsFormBloco } from "./comum";

export function FormLinha({ bloco, editar, f }: PropsFormBloco<BlocoLinha>) {
  return (
    <ListaEditavel
      titulo="Marcos da linha do tempo"
      ajuda="Aparecem numerados, de cima para baixo, na ordem abaixo."
      emCaixa
      itens={bloco.itens}
      rotuloItem={(i) => `Marco ${i + 1}`}
      textoAdicionar="Adicionar marco"
      minimo={1}
      foco={f("itens")}
      aoAdicionar={() => editar((b) => void b.itens.push({ titulo: "", texto: "" }))}
      aoRemover={(i) => editar((b) => void b.itens.splice(i, 1))}
      aoMover={(de, para) => editar((b) => moverItem(b.itens, de, para))}
      render={(it, i) => (
        <>
          <CampoTexto
            rotulo="Título do marco"
            valor={it.titulo}
            foco={f(`itens[${i}].titulo`)}
            aoMudar={(v) => editar((b) => void (b.itens[i].titulo = v), f(`itens[${i}].titulo`))}
          />
          <CampoRico
            rotulo="Texto do marco"
            valor={it.texto}
            foco={f(`itens[${i}].texto`)}
            aoMudar={(v) => editar((b) => void (b.itens[i].texto = v), f(`itens[${i}].texto`))}
          />
        </>
      )}
    />
  );
}
