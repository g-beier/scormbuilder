import type { BlocoEscolha } from "../../modelo/tipos";
import { novaOpcaoEscolha } from "../../modelo/fabrica";
import { CampoRico, CampoTexto, ListaEditavel, moverItem } from "../campos";
import type { PropsFormBloco } from "./comum";

export function FormEscolha({ bloco, editar, f }: PropsFormBloco<BlocoEscolha>) {
  return (
    <>
      <CampoRico
        rotulo="Pergunta"
        ajuda="Não há resposta certa ou errada: o aluno escolhe uma alternativa e lê o retorno dela."
        valor={bloco.pergunta}
        foco={f("pergunta")}
        aoMudar={(v) => editar((b) => void (b.pergunta = v), f("pergunta"))}
      />
      <ListaEditavel
        titulo="Alternativas"
        ajuda="O aluno precisa escolher uma para avançar. Ao escolher, vê o retorno daquela alternativa e pode trocar de escolha."
        emCaixa
        itens={bloco.opcoes}
        rotuloItem={(i) => `Alternativa ${i + 1}`}
        textoAdicionar="Adicionar alternativa"
        minimo={2}
        foco={f("opcoes")}
        aoAdicionar={() => editar((b) => void b.opcoes.push(novaOpcaoEscolha()))}
        aoRemover={(i) => editar((b) => void b.opcoes.splice(i, 1))}
        aoMover={(de, para) => editar((b) => moverItem(b.opcoes, de, para))}
        render={(o, i) => (
          <>
            <CampoRico
              rotulo="Texto da alternativa"
              valor={o.texto}
              foco={f(`opcoes[${i}].texto`)}
              aoMudar={(v) => editar((b) => void (b.opcoes[i].texto = v), f(`opcoes[${i}].texto`))}
            />
            <CampoTexto
              rotulo="Retorno desta alternativa"
              ajuda="Aparece quando o aluno escolhe esta alternativa. Texto simples, sem formatação."
              multilinha
              valor={o.retorno}
              foco={f(`opcoes[${i}].retorno`)}
              aoMudar={(v) => editar((b) => void (b.opcoes[i].retorno = v), f(`opcoes[${i}].retorno`))}
            />
          </>
        )}
      />
    </>
  );
}
