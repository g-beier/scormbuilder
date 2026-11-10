import { useId } from "react";
import { AVISO_REFLEXAO_PADRAO, MAX_CHARS_REFLEXAO, PADRAO_REFLEXAO, type BlocoReflexao } from "../../modelo/tipos";
import { CampoNumero, CampoRico, CampoTexto } from "../campos";
import type { PropsFormBloco } from "./comum";

export function FormReflexao({ bloco, editar, f }: PropsFormBloco<BlocoReflexao>) {
  const idObrig = useId();
  const obrigatoria = bloco.opcional === false;
  return (
    <>
      <CampoRico
        rotulo="Pergunta para reflexão"
        ajuda="O aluno escreve a resposta e clica em “Enviar reflexão”. O texto não recebe nota: vai para o relatório de interações do Moodle, onde a equipe do curso pode ler."
        valor={bloco.pergunta}
        foco={f("pergunta")}
        aoMudar={(v) => editar((b) => void (b.pergunta = v), f("pergunta"))}
      />
      <div className="campo campo-check">
        <input
          id={idObrig}
          type="checkbox"
          checked={obrigatoria}
          data-foco={f("opcional")}
          aria-describedby={`${idObrig}-ajuda`}
          onChange={(e) =>
            editar((b) => {
              if (e.target.checked) b.opcional = false;
              else delete b.opcional;
            })
          }
        />
        <label htmlFor={idObrig}>Resposta obrigatória para avançar</label>
        <p id={`${idObrig}-ajuda`} className="ajuda">
          {obrigatoria
            ? "O aluno só passa para a próxima tela depois de enviar a reflexão."
            : "Desmarcado: a reflexão é opcional e o aluno pode avançar sem enviar."}
        </p>
      </div>
      <div className="linha-campos">
        <CampoNumero
          rotulo="Mínimo de caracteres"
          ajuda={`O aluno só consegue enviar a partir deste tamanho. Se ficar vazio: ${PADRAO_REFLEXAO.minChars}.`}
          padrao={PADRAO_REFLEXAO.minChars}
          min={1}
          max={MAX_CHARS_REFLEXAO}
          valor={bloco.minChars}
          foco={f("minChars")}
          aoMudar={(v) =>
            editar((b) => {
              if (v === undefined) delete b.minChars;
              else b.minChars = v;
            }, f("minChars"))
          }
        />
        <CampoNumero
          rotulo="Máximo de caracteres"
          ajuda={`O campo não aceita textos maiores (use até ${MAX_CHARS_REFLEXAO}). Se ficar vazio: ${PADRAO_REFLEXAO.maxChars}.`}
          padrao={PADRAO_REFLEXAO.maxChars}
          min={1}
          max={MAX_CHARS_REFLEXAO}
          valor={bloco.maxChars}
          foco={f("maxChars")}
          aoMudar={(v) =>
            editar((b) => {
              if (v === undefined) delete b.maxChars;
              else b.maxChars = v;
            }, f("maxChars"))
          }
        />
      </div>
      <CampoTexto
        rotulo="Aviso ao aluno (opcional)"
        ajuda={`Aparece junto do campo de resposta. Se ficar vazio, o aluno vê o aviso padrão: “${AVISO_REFLEXAO_PADRAO}”`}
        multilinha
        placeholder={AVISO_REFLEXAO_PADRAO}
        valor={bloco.aviso ?? ""}
        foco={f("aviso")}
        aoMudar={(v) =>
          editar((b) => {
            if (v) b.aviso = v;
            else delete b.aviso;
          }, f("aviso"))
        }
      />
    </>
  );
}
