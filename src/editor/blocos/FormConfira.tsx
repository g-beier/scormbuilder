import type { BlocoConfira } from "../../modelo/tipos";
import { CampoTexto, ListaDeTextos } from "../campos";
import { opsTextos, type PropsFormBloco } from "./comum";

export function FormConfira(p: PropsFormBloco<BlocoConfira>) {
  const { bloco, editar, f } = p;
  return (
    <>
      <CampoTexto
        rotulo="Texto do botão"
        ajuda="O botão aparece na tela; o aluno precisa abri-lo para avançar."
        valor={bloco.botao}
        foco={f("botao")}
        aoMudar={(v) => editar((b) => void (b.botao = v), f("botao"))}
      />
      <CampoTexto
        rotulo="Título da janela"
        ajuda="Aparece no alto da janela que abre ao clicar no botão."
        valor={bloco.titulo}
        foco={f("titulo")}
        aoMudar={(v) => editar((b) => void (b.titulo = v), f("titulo"))}
      />
      <ListaDeTextos
        titulo="Texto da janela"
        ajuda="Parágrafos que aparecem dentro da janela."
        valores={bloco.paras}
        rotuloItem={(i) => `Parágrafo ${i + 1}`}
        textoAdicionar="Adicionar parágrafo"
        minimo={1}
        {...opsTextos(p, (b) => b.paras, "paras")}
      />
    </>
  );
}
