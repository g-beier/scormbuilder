import { useId } from "react";
import { LIMITES_CATEGORIZAR, type BlocoCategorizar } from "../../modelo/tipos";
import { novoItemCategorizar } from "../../modelo/fabrica";
import { CampoRico, CampoTexto, ListaEditavel, moverItem } from "../campos";
import type { PropsFormBloco } from "./comum";

/** Mensagens que o motor mostra quando os campos ficam vazios. */
export const MSG_ACERTO_CATEGORIZAR = "Muito bem: todos os itens estão na categoria certa.";
export const MSG_REVISAR_CATEGORIZAR = "Alguns itens merecem revisão. Veja o comentário de cada item.";

/** Nome da categoria para listas e seletores: o título, ou "Categoria n" se ainda vazio. */
function nomeCategoria(titulo: string, k: number): string {
  return titulo.trim() || `Categoria ${k + 1}`;
}

/** Depois de mover a categoria `de` para `para`, devolve o novo índice de cada índice antigo. */
function remapearMovida(n: number, de: number, para: number): number[] {
  const ordem = Array.from({ length: n }, (_, k) => k);
  moverItem(ordem, de, para);
  const novo: number[] = [];
  ordem.forEach((antigo, pos) => (novo[antigo] = pos));
  return novo;
}

export function FormCategorizar({ bloco, editar, f }: PropsFormBloco<BlocoCategorizar>) {
  const { minCategorias, maxCategorias, minItens } = LIMITES_CATEGORIZAR;
  return (
    <>
      <CampoRico
        rotulo="Enunciado"
        ajuda="A instrução para o aluno, por exemplo: “Classifique cada ação de acordo com quem é responsável por ela.”"
        valor={bloco.enunciado}
        foco={f("enunciado")}
        aoMudar={(v) => editar((b) => void (b.enunciado = v), f("enunciado"))}
      />
      <ListaEditavel
        titulo="Categorias"
        ajuda={`De ${minCategorias} a ${maxCategorias} colunas para onde o aluno leva os itens. Nomes curtos funcionam melhor no celular.`}
        itens={bloco.categorias}
        rotuloItem={(i) => `Categoria ${i + 1}`}
        textoAdicionar="Adicionar categoria"
        minimo={minCategorias}
        maximo={maxCategorias}
        foco={f("categorias")}
        aoAdicionar={() => editar((b) => void b.categorias.push(""))}
        aoRemover={(k) =>
          editar((b) => {
            b.categorias.splice(k, 1);
            // Itens desta categoria ficam sem categoria; os das seguintes acompanham o novo índice
            b.itens.forEach((it) => {
              if (it.categoria === k) it.categoria = -1;
              else if (it.categoria > k) it.categoria -= 1;
            });
          })
        }
        aoMover={(de, para) =>
          editar((b) => {
            if (para < 0 || para >= b.categorias.length) return;
            const novo = remapearMovida(b.categorias.length, de, para);
            moverItem(b.categorias, de, para);
            b.itens.forEach((it) => {
              if (it.categoria >= 0 && it.categoria < novo.length) it.categoria = novo[it.categoria];
            });
          })
        }
        render={(c, k) => (
          <CampoTexto
            rotulo="Nome da categoria"
            valor={c}
            foco={f(`categorias[${k}]`)}
            aoMudar={(v) => editar((b) => void (b.categorias[k] = v), f(`categorias[${k}]`))}
          />
        )}
      />
      <ListaEditavel
        titulo="Itens"
        ajuda="O aluno vê os itens embaralhados e leva cada um para uma categoria. Depois clica em “Verificar”: cada item mostra se está certo ou errado, com o seu comentário. Para avançar, ele precisa verificar ao menos uma vez, mas pode tentar de novo."
        emCaixa
        itens={bloco.itens}
        rotuloItem={(i) => `Item ${i + 1}`}
        textoAdicionar="Adicionar item"
        minimo={minItens}
        foco={f("itens")}
        aoAdicionar={() => editar((b) => void b.itens.push(novoItemCategorizar()))}
        aoRemover={(i) => editar((b) => void b.itens.splice(i, 1))}
        aoMover={(de, para) => editar((b) => moverItem(b.itens, de, para))}
        render={(it, i) => (
          <>
            <CampoRico
              rotulo="Texto do item"
              valor={it.texto}
              foco={f(`itens[${i}].texto`)}
              aoMudar={(v) => editar((b) => void (b.itens[i].texto = v), f(`itens[${i}].texto`))}
            />
            <SeletorCategoria
              categorias={bloco.categorias}
              valor={it.categoria}
              foco={f(`itens[${i}].categoria`)}
              aoMudar={(c) => editar((b) => void (b.itens[i].categoria = c))}
            />
            <CampoTexto
              rotulo="Comentário deste item (opcional)"
              ajuda="Aparece quando o aluno verifica, depois de “Certo.” ou de “Errado. O lugar dele é …”. Texto simples, sem formatação."
              multilinha
              valor={it.fb}
              foco={f(`itens[${i}].fb`)}
              aoMudar={(v) => editar((b) => void (b.itens[i].fb = v), f(`itens[${i}].fb`))}
            />
          </>
        )}
      />
      <CampoTexto
        rotulo="Mensagem quando acertar tudo (opcional)"
        ajuda={`Se ficar vazio, aparece: “${MSG_ACERTO_CATEGORIZAR}”`}
        placeholder={MSG_ACERTO_CATEGORIZAR}
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
        ajuda={`Se ficar vazio, aparece: “${MSG_REVISAR_CATEGORIZAR}”. Depois dela, o pacote mostra quantos itens estão no lugar certo.`}
        placeholder={MSG_REVISAR_CATEGORIZAR}
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

function SeletorCategoria({
  categorias,
  valor,
  foco,
  aoMudar,
}: {
  categorias: string[];
  valor: number;
  foco: string;
  aoMudar(c: number): void;
}) {
  const id = useId();
  const valida = Number.isInteger(valor) && valor >= 0 && valor < categorias.length;
  return (
    <div className="campo">
      <label htmlFor={id}>Categoria certa</label>
      <p id={`${id}-ajuda`} className="ajuda">
        A categoria onde este item deve ficar.
      </p>
      <select id={id} aria-describedby={`${id}-ajuda`} value={valida ? String(valor) : ""} data-foco={foco} onChange={(e) => aoMudar(e.target.value === "" ? -1 : Number(e.target.value))}>
        {!valida && <option value="">Escolha a categoria…</option>}
        {categorias.map((c, k) => (
          <option key={k} value={String(k)}>
            {nomeCategoria(c, k)}
          </option>
        ))}
      </select>
    </div>
  );
}
