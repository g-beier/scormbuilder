import type { BlocoContraste } from "../../modelo/tipos";
import { CampoRico, CampoTexto, ListaEditavel, moverItem, SeletorCor } from "../campos";
import type { PropsFormBloco } from "./comum";

export function FormContraste({ bloco, editar, f }: PropsFormBloco<BlocoContraste>) {
  return (
    <ListaEditavel
      titulo="Lados da comparação"
      ajuda="Aparecem lado a lado, cada um com sua cor. Ex.: vermelho para “Evite”, verde para “Prefira”."
      emCaixa
      itens={bloco.itens}
      rotuloItem={(i) => `Lado ${i + 1}`}
      textoAdicionar="Adicionar lado"
      minimo={1}
      foco={f("itens")}
      aoAdicionar={() => editar((b) => void b.itens.push({ cor: "navy", titulo: "", texto: "" }))}
      aoRemover={(i) => editar((b) => void b.itens.splice(i, 1))}
      aoMover={(de, para) => editar((b) => moverItem(b.itens, de, para))}
      render={(it, i) => (
        <>
          <SeletorCor
            valor={it.cor}
            foco={f(`itens[${i}].cor`)}
            aoMudar={(c) => editar((b) => void (b.itens[i].cor = c))}
          />
          <CampoTexto
            rotulo="Título"
            valor={it.titulo}
            foco={f(`itens[${i}].titulo`)}
            aoMudar={(v) => editar((b) => void (b.itens[i].titulo = v), f(`itens[${i}].titulo`))}
          />
          <CampoRico
            rotulo="Texto"
            valor={it.texto}
            foco={f(`itens[${i}].texto`)}
            aoMudar={(v) => editar((b) => void (b.itens[i].texto = v), f(`itens[${i}].texto`))}
          />
        </>
      )}
    />
  );
}
