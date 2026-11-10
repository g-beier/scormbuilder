import { useId } from "react";
import type { BlocoRamificado, PerguntaRamificada } from "../../modelo/tipos";
import { novaAlternativaRamificada, novaPerguntaRamificada } from "../../modelo/fabrica";
import { CampoRico, CampoTexto, ListaEditavel, moverItem } from "../campos";
import type { PropsFormBloco } from "./comum";

/** Texto visível de um HTML curto (para os nomes das perguntas no seletor). */
function resumo(html: string, max = 50): string {
  const t = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Destino padrão de uma alternativa nova da pergunta k: a pergunta seguinte, ou o fim. */
function destinoPadrao(perguntas: PerguntaRamificada[], k: number): string {
  return perguntas[k + 1]?.id ?? "fim";
}

export function FormRamificado({ bloco, editar, f }: PropsFormBloco<BlocoRamificado>) {
  return (
    <ListaEditavel
      titulo="Perguntas"
      ajuda="O aluno vê uma pergunta por vez, começando pela 1, e não há certo ou errado. Cada alternativa mostra um retorno e leva a outra pergunta ou ao fim. No fim, o aluno confere o resumo e registra as respostas no Moodle; só então pode avançar. Ao adicionar uma pergunta, escolha em “Depois desta, ir para” qual alternativa leva até ela."
      emCaixa
      itens={bloco.perguntas}
      rotuloItem={(k) => `Pergunta ${k + 1}`}
      textoAdicionar="Adicionar pergunta"
      minimo={1}
      foco={f("perguntas")}
      aoAdicionar={() => editar((b) => void b.perguntas.push(novaPerguntaRamificada("fim")))}
      aoRemover={(k) => editar((b) => void b.perguntas.splice(k, 1))}
      aoMover={(de, para) => editar((b) => moverItem(b.perguntas, de, para))}
      render={(p, k) => (
        <>
          <CampoRico
            rotulo="Enunciado"
            valor={p.enunciado}
            foco={f(`perguntas[${k}].enunciado`)}
            aoMudar={(v) => editar((b) => void (b.perguntas[k].enunciado = v), f(`perguntas[${k}].enunciado`))}
          />
          <ListaEditavel
            titulo={`Alternativas da pergunta ${k + 1}`}
            itens={p.alternativas}
            rotuloItem={(j) => `Alternativa ${j + 1} da pergunta ${k + 1}`}
            textoAdicionar="Adicionar alternativa"
            minimo={2}
            foco={f(`perguntas[${k}].alternativas`)}
            aoAdicionar={() =>
              editar((b) => void b.perguntas[k].alternativas.push(novaAlternativaRamificada(destinoPadrao(b.perguntas, k))))
            }
            aoRemover={(j) => editar((b) => void b.perguntas[k].alternativas.splice(j, 1))}
            aoMover={(de, para) => editar((b) => moverItem(b.perguntas[k].alternativas, de, para))}
            render={(a, j) => {
              const base = `perguntas[${k}].alternativas[${j}]`;
              return (
                <>
                  <CampoRico
                    rotulo="Texto da alternativa"
                    valor={a.texto}
                    foco={f(`${base}.texto`)}
                    aoMudar={(v) => editar((b) => void (b.perguntas[k].alternativas[j].texto = v), f(`${base}.texto`))}
                  />
                  <CampoTexto
                    rotulo="Retorno desta alternativa (opcional)"
                    ajuda="Aparece logo abaixo das alternativas quando o aluno escolhe esta. Escreva só o texto, sem negrito nem links."
                    multilinha
                    valor={a.retorno}
                    foco={f(`${base}.retorno`)}
                    aoMudar={(v) => editar((b) => void (b.perguntas[k].alternativas[j].retorno = v), f(`${base}.retorno`))}
                  />
                  <SeletorDestino
                    perguntas={bloco.perguntas}
                    atual={k}
                    valor={a.proxima}
                    foco={f(`${base}.proxima`)}
                    aoMudar={(v) => editar((b) => void (b.perguntas[k].alternativas[j].proxima = v))}
                  />
                </>
              );
            }}
          />
        </>
      )}
    />
  );
}

function SeletorDestino({
  perguntas,
  atual,
  valor,
  foco,
  aoMudar,
}: {
  perguntas: PerguntaRamificada[];
  atual: number;
  valor: string;
  foco: string;
  aoMudar(v: string): void;
}) {
  const id = useId();
  const valido = valor === "fim" || perguntas.some((p, k) => k !== atual && p.id === valor);
  return (
    <div className="campo">
      <label htmlFor={id}>Depois desta, ir para</label>
      <p id={`${id}-ajuda`} className="ajuda">
        Para onde o aluno vai depois de escolher esta alternativa. Se você reordenar as perguntas, o destino continua o mesmo.
      </p>
      <select id={id} aria-describedby={`${id}-ajuda`} value={valido ? valor : ""} data-foco={foco} onChange={(e) => e.target.value && aoMudar(e.target.value)}>
        {!valido && <option value="">Escolha o destino…</option>}
        {perguntas.map((p, k) =>
          k === atual ? null : (
            <option key={p.id} value={p.id}>
              {`Pergunta ${k + 1}${resumo(p.enunciado) ? `: ${resumo(p.enunciado)}` : ""}`}
            </option>
          ),
        )}
        <option value="fim">Fim do questionário (resumo)</option>
      </select>
    </div>
  );
}
