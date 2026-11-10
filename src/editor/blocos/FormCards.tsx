import { useId } from "react";
import type { BlocoCards } from "../../modelo/tipos";
import { CampoRico, CampoTexto, ListaDeTextos, ListaEditavel, moverItem } from "../campos";
import { opsTextos, type PropsFormBloco } from "./comum";

export function FormCards(p: PropsFormBloco<BlocoCards>) {
  const { bloco, editar, f } = p;
  const idColunas = useId();
  return (
    <>
      <div className="campo campo-check">
        <input
          id={idColunas}
          type="checkbox"
          checked={bloco.colunas === 2}
          onChange={(e) =>
            editar((b) => {
              if (e.target.checked) b.colunas = 2;
              else delete b.colunas;
            })
          }
        />
        <label htmlFor={idColunas}>Mostrar em 2 colunas</label>
        <p className="ajuda">No computador, os cartões ficam em duas colunas. No celular, sempre em uma.</p>
      </div>
      <ListaEditavel
        titulo="Cartões"
        emCaixa
        itens={bloco.cards}
        rotuloItem={(i) => `Cartão ${i + 1}`}
        textoAdicionar="Adicionar cartão"
        minimo={1}
        foco={f("cards")}
        // Os cartões não têm cor no visual aprovado (só a Comparação usa cores): a cor fica fixa
        aoAdicionar={() => editar((b) => void b.cards.push({ cor: "navy", titulo: "", paras: [""] }))}
        aoRemover={(i) => editar((b) => void b.cards.splice(i, 1))}
        aoMover={(de, para) => editar((b) => moverItem(b.cards, de, para))}
        render={(c, i) => (
          <div data-foco={f(`cards[${i}]`)} tabIndex={-1} className="grupo-campos">
            <CampoTexto
              rotulo="Título do cartão"
              ajuda="Aparece em negrito no alto do cartão."
              valor={c.titulo ?? ""}
              foco={f(`cards[${i}].titulo`)}
              aoMudar={(v) => editar((b) => void (b.cards[i].titulo = v), f(`cards[${i}].titulo`))}
            />
            <CampoRico
              rotulo="Frase de resumo (opcional)"
              ajuda="Aparece logo abaixo do título, em destaque."
              valor={c.breve ?? ""}
              foco={f(`cards[${i}].breve`)}
              aoMudar={(v) =>
                editar((b) => {
                  if (v) b.cards[i].breve = v;
                  else delete b.cards[i].breve;
                }, f(`cards[${i}].breve`))
              }
            />
            <ListaDeTextos
              titulo="Parágrafos do cartão"
              valores={c.paras ?? []}
              rotuloItem={(j) => `Parágrafo ${j + 1}`}
              textoAdicionar="Adicionar parágrafo"
              {...opsTextos(p, (b) => (b.cards[i].paras ??= []), `cards[${i}].paras`)}
            />
            <ListaDeTextos
              titulo="Itens com marcador (opcional)"
              ajuda="Aparecem como lista, depois dos parágrafos do cartão."
              valores={c.lista ?? []}
              rotuloItem={(j) => `Item ${j + 1}`}
              textoAdicionar="Adicionar item"
              {...opsTextos(p, (b) => (b.cards[i].lista ??= []), `cards[${i}].lista`)}
            />
          </div>
        )}
      />
    </>
  );
}
