import type { BlocoOrdenar } from "../../modelo/tipos";
import { CampoRico, CampoTexto, ListaDeTextos } from "../campos";
import { opsTextos, type PropsFormBloco } from "./comum";

export function FormOrdenar(p: PropsFormBloco<BlocoOrdenar>) {
  const { bloco, editar, f } = p;
  return (
    <>
      <CampoTexto
        rotulo="Nome da sequência"
        ajuda="Aparece acima dos cartões que o aluno arrasta. Ex.: “Admissão de um novo voluntário”."
        valor={bloco.nome}
        foco={f("nome")}
        aoMudar={(v) => editar((b) => void (b.nome = v), f("nome"))}
      />
      <ListaDeTextos
        titulo="Passos, na ordem correta"
        ajuda="Escreva na ordem certa: o aluno recebe os passos embaralhados e precisa reordená-los."
        valores={bloco.passos}
        rotuloItem={(i) => `Passo ${i + 1}`}
        textoAdicionar="Adicionar passo"
        minimo={2}
        {...opsTextos(p, (b) => b.passos, "passos")}
      />
      <CampoRico
        rotulo="Por que esta ordem"
        ajuda="Aparece quando o aluno abre “Ver sugestão e o porquê”."
        valor={bloco.porque}
        foco={f("porque")}
        aoMudar={(v) => editar((b) => void (b.porque = v), f("porque"))}
      />
      <CampoRico
        rotulo="Observação extra (opcional)"
        ajuda="Aparece numa caixa abaixo da explicação, na mesma sugestão."
        valor={bloco.nota ?? ""}
        foco={f("nota")}
        aoMudar={(v) =>
          editar((b) => {
            if (v) b.nota = v;
            else delete b.nota;
          }, f("nota"))
        }
      />
      <p className="ajuda">
        Dica: com dois ou mais blocos “Ordenar passos” na mesma tela, cada um vira uma tela separada para o aluno.
      </p>
    </>
  );
}
