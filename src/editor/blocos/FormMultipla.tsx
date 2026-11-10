import { useId } from "react";
import type { BlocoMultipla } from "../../modelo/tipos";
import { novaOpcaoMultipla } from "../../modelo/fabrica";
import { CampoRico, CampoTexto, ListaEditavel, moverItem } from "../campos";
import type { PropsFormBloco } from "./comum";

/** Mensagens que o motor mostra quando os campos ficam vazios (as mesmas do Kit.quiz). */
export const MSG_ACERTO_PADRAO = "Muito bem: sua resposta coincide com o esperado.";
export const MSG_REVISAR_PADRAO = "Alguns pontos merecem revisão. Veja os comentários nas alternativas.";

export function FormMultipla({ bloco, editar, f }: PropsFormBloco<BlocoMultipla>) {
  return (
    <>
      <CampoRico
        rotulo="Enunciado"
        ajuda="A pergunta ou instrução. Diga ao aluno que ele pode marcar mais de uma alternativa."
        valor={bloco.enunciado}
        foco={f("enunciado")}
        aoMudar={(v) => editar((b) => void (b.enunciado = v), f("enunciado"))}
      />
      <ListaEditavel
        titulo="Alternativas"
        ajuda="Marque todas as corretas. O aluno marca as que quiser e clica em “Verificar respostas”; então cada alternativa mostra o seu comentário. Ele precisa verificar ao menos uma vez para avançar e pode tentar de novo."
        emCaixa
        itens={bloco.opcoes}
        rotuloItem={(i) => `Alternativa ${i + 1}`}
        textoAdicionar="Adicionar alternativa"
        minimo={2}
        foco={f("opcoes")}
        aoAdicionar={() => editar((b) => void b.opcoes.push(novaOpcaoMultipla()))}
        aoRemover={(i) => editar((b) => void b.opcoes.splice(i, 1))}
        aoMover={(de, para) => editar((b) => moverItem(b.opcoes, de, para))}
        render={(o, i) => (
          <>
            <MarcaCorreta
              marcada={o.correta}
              foco={f(`opcoes[${i}].correta`)}
              aoMudar={(v) => editar((b) => void (b.opcoes[i].correta = v))}
            />
            <CampoRico
              rotulo="Texto da alternativa"
              valor={o.texto}
              foco={f(`opcoes[${i}].texto`)}
              aoMudar={(v) => editar((b) => void (b.opcoes[i].texto = v), f(`opcoes[${i}].texto`))}
            />
            <CampoTexto
              rotulo="Comentário desta alternativa"
              ajuda={
                o.correta
                  ? "Aparece quando o aluno verifica. Se ele não marcou esta, vem antes “Faltou marcar esta.”. Texto simples, sem formatação."
                  : "Aparece se o aluno marcou esta, depois de “Errado.”. Texto simples, sem formatação."
              }
              multilinha
              valor={o.fb}
              foco={f(`opcoes[${i}].fb`)}
              aoMudar={(v) => editar((b) => void (b.opcoes[i].fb = v), f(`opcoes[${i}].fb`))}
            />
          </>
        )}
      />
      <CampoTexto
        rotulo="Mensagem quando acertar tudo (opcional)"
        ajuda={`Se ficar vazio, aparece: “${MSG_ACERTO_PADRAO}”`}
        placeholder={MSG_ACERTO_PADRAO}
        valor={bloco.msgAcerto ?? ""}
        foco={f("msgAcerto")}
        aoMudar={(v) =>
          editar((b) => {
            if (v) b.msgAcerto = v;
            else delete b.msgAcerto;
          }, f("msgAcerto"))
        }
      />
      <CampoTexto
        rotulo="Mensagem quando houver algo a revisar (opcional)"
        ajuda={`Se ficar vazio, aparece: “${MSG_REVISAR_PADRAO}”`}
        placeholder={MSG_REVISAR_PADRAO}
        valor={bloco.msgRevisar ?? ""}
        foco={f("msgRevisar")}
        aoMudar={(v) =>
          editar((b) => {
            if (v) b.msgRevisar = v;
            else delete b.msgRevisar;
          }, f("msgRevisar"))
        }
      />
    </>
  );
}

function MarcaCorreta({ marcada, foco, aoMudar }: { marcada: boolean; foco: string; aoMudar(v: boolean): void }) {
  const id = useId();
  return (
    <div className={`campo campo-check marca-multipla${marcada ? " correta" : ""}`}>
      <input id={id} type="checkbox" checked={marcada} data-foco={foco} onChange={(e) => aoMudar(e.target.checked)} />
      <label htmlFor={id}>Esta alternativa é correta</label>
    </div>
  );
}
