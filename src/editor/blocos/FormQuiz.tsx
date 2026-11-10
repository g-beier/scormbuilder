import { useId } from "react";
import type { Draft } from "immer";
import type { BlocoQuiz, Pergunta } from "../../modelo/tipos";
import { CampoRico, CampoTexto, ListaEditavel, moverItem } from "../campos";
import { TextoRico } from "../TextoRico";
import { Icone } from "../Icones";
import type { PropsFormBloco } from "./comum";

/** Mantém `correta` apontando para a mesma alternativa depois de remover/mover. */
export function removerOpcao(p: Draft<Pergunta>, i: number) {
  p.opcoes.splice(i, 1);
  if (p.correta === i) p.correta = 0;
  else if (p.correta > i) p.correta--;
}
export function moverOpcao(p: Draft<Pergunta>, de: number, para: number) {
  if (para < 0 || para >= p.opcoes.length) return;
  const correta = p.opcoes.map((_, k) => k === p.correta);
  moverItem(p.opcoes, de, para);
  moverItem(correta, de, para);
  p.correta = correta.indexOf(true);
}

export function FormQuiz({ bloco, editar, f }: PropsFormBloco<BlocoQuiz>) {
  return (
    <ListaEditavel
      titulo="Perguntas"
      ajuda="O aluno precisa responder todas para avançar. Ele vê na hora se acertou e a explicação."
      emCaixa
      itens={bloco.perguntas}
      rotuloItem={(i) => `Pergunta ${i + 1}`}
      textoAdicionar="Adicionar pergunta"
      minimo={1}
      foco={f("perguntas")}
      aoAdicionar={() =>
        editar((b) => void b.perguntas.push({ pergunta: "", opcoes: ["", ""], correta: 0, explica: "" }))
      }
      aoRemover={(i) => editar((b) => void b.perguntas.splice(i, 1))}
      aoMover={(de, para) => editar((b) => moverItem(b.perguntas, de, para))}
      render={(q, i) => {
        const base = `perguntas[${i}]`;
        return (
          <>
            <CampoRico
              rotulo="Enunciado"
              valor={q.pergunta}
              foco={f(`${base}.pergunta`)}
              aoMudar={(v) => editar((b) => void (b.perguntas[i].pergunta = v), f(`${base}.pergunta`))}
            />
            <Alternativas
              pergunta={q}
              n={i + 1}
              base={base}
              f={f}
              editarPergunta={(receita, grupo) => editar((b) => receita(b.perguntas[i]), grupo)}
            />
            <CampoTexto
              rotulo="Explicação da resposta"
              ajuda="Aparece depois que o aluno responde, certo ou errado. Texto simples, sem formatação."
              multilinha
              valor={q.explica}
              foco={f(`${base}.explica`)}
              aoMudar={(v) => editar((b) => void (b.perguntas[i].explica = v), f(`${base}.explica`))}
            />
          </>
        );
      }}
    />
  );
}

function Alternativas({
  pergunta,
  n,
  base,
  f,
  editarPergunta,
}: {
  pergunta: Pergunta;
  n: number;
  base: string;
  f(campo: string): string;
  editarPergunta(receita: (p: Draft<Pergunta>) => void, grupo?: string): void;
}) {
  const nome = useId();
  const opcoes = pergunta.opcoes;
  return (
    <fieldset className="alternativas">
      <legend tabIndex={-1} data-foco={f(`${base}.opcoes`)}>
        Alternativas da pergunta {n}
      </legend>
      <p className="ajuda">Marque a correta. O aluno vê as alternativas nesta ordem.</p>
      <ol>
        {opcoes.map((op, j) => {
          const idRotulo = `${nome}-r${j}`;
          return (
            <li key={j} className={`alternativa${pergunta.correta === j ? " correta" : ""}`}>
              <label className="marca-correta">
                <input
                  type="radio"
                  name={nome}
                  checked={pergunta.correta === j}
                  data-foco={j === 0 ? f(`${base}.correta`) : undefined}
                  onChange={() => editarPergunta((p) => void (p.correta = j))}
                />
                <span>Correta</span>
              </label>
              <span id={idRotulo} className="so-leitor">
                Alternativa {j + 1}
              </span>
              <div className="alternativa-texto">
                <TextoRico
                  valor={op}
                  rotuloId={idRotulo}
                  foco={f(`${base}.opcoes[${j}]`)}
                  aoMudar={(v) => editarPergunta((p) => void (p.opcoes[j] = v), f(`${base}.opcoes[${j}]`))}
                />
              </div>
              <div className="item-acoes">
                <button
                  type="button"
                  className="btn-icone"
                  aria-label={`Mover alternativa ${j + 1} para cima`}
                  title="Mover para cima"
                  disabled={j === 0}
                  onClick={() => editarPergunta((p) => moverOpcao(p, j, j - 1))}
                >
                  <Icone nome="cima" />
                </button>
                <button
                  type="button"
                  className="btn-icone"
                  aria-label={`Mover alternativa ${j + 1} para baixo`}
                  title="Mover para baixo"
                  disabled={j === opcoes.length - 1}
                  onClick={() => editarPergunta((p) => moverOpcao(p, j, j + 1))}
                >
                  <Icone nome="baixo" />
                </button>
                <button
                  type="button"
                  className="btn-icone perigo"
                  aria-label={`Remover alternativa ${j + 1}`}
                  title="Remover"
                  disabled={opcoes.length <= 2}
                  onClick={() => editarPergunta((p) => removerOpcao(p, j))}
                >
                  <Icone nome="lixeira" />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" className="btn btn-pequeno btn-adicionar" onClick={() => editarPergunta((p) => void p.opcoes.push(""))}>
        <Icone nome="mais" /> Adicionar alternativa
      </button>
    </fieldset>
  );
}
