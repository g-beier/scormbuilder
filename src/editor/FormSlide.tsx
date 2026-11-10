/** Formulário da tela selecionada: campos da tela e blocos reordenáveis. */
import { useEffect, useId, useState, type ComponentType } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NOMES_BLOCO, NOMES_SLIDE, type Bloco, type Problema, type Slide } from "../modelo/tipos";
import { useProjeto } from "../estado/projeto";
import { confirmar } from "../servicos/dialogos";
import { CampoRico, CampoTexto } from "./campos";
import { FORMS_BLOCO } from "./blocos";
import type { PropsFormBloco } from "./blocos/comum";
import { MenuNovoBloco } from "./MenuNovoBloco";
import { Icone } from "./Icones";
import { chaveFoco, focarCampo, usePedidoFoco } from "./foco";
import { anuncios, instrucoesLeitor, soVertical, useSensoresOrdenaveis } from "./ordenavel";

export function FormSlide({ slide, indice, problemas }: { slide: Slide; indice: number; problemas: Problema[] }) {
  const atualizarSlide = useProjeto((s) => s.atualizarSlide);
  const pedido = usePedidoFoco((s) => s.pedido);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  const f = (campo: string) => chaveFoco(slide.id, undefined, campo);
  const mudar = (campo: "kicker" | "titulo" | "sub" | "texto") => (v: string) =>
    atualizarSlide(slide.id, { [campo]: v }, f(campo));

  // Pedido do painel de problemas: abre o bloco (se recolhido) e foca o campo.
  useEffect(() => {
    if (!pedido || pedido.slideId !== slide.id) return;
    if (pedido.blocoId && recolhidos.has(pedido.blocoId)) {
      setRecolhidos((r) => {
        const n = new Set(r);
        n.delete(pedido.blocoId!);
        return n;
      });
    }
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => focarCampo(document, slide.id, pedido.blocoId, pedido.campo ?? "")),
    );
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.n, slide.id]);

  const alternar = (id: string) =>
    setRecolhidos((r) => {
      const n = new Set(r);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="form-slide">
      <h2 className="form-slide-titulo" tabIndex={-1} data-foco={f("")}>
        <Icone nome={slide.tipo} tamanho={24} /> Tela {indice + 1} · {NOMES_SLIDE[slide.tipo]}
      </h2>

      <section className="painel-campos" aria-label="Campos da tela">
        {slide.tipo !== "fim" && (
          <CampoTexto
            rotulo="Rótulo acima do título (opcional)"
            ajuda={
              slide.tipo === "capa"
                ? "Texto curto em letras pequenas acima do título da capa. Ex.: “Leitura · Unidade 11”."
                : "Texto curto em letras pequenas acima do título da tela. Ex.: “Para começar”."
            }
            valor={slide.kicker}
            foco={f("kicker")}
            aoMudar={mudar("kicker")}
          />
        )}
        <CampoTexto
          rotulo={slide.tipo === "capa" ? "Título da capa" : slide.tipo === "fim" ? "Título da tela de fim" : "Título da tela"}
          ajuda="Aparece em letras grandes no alto da tela."
          valor={slide.titulo}
          foco={f("titulo")}
          aoMudar={mudar("titulo")}
        />
        {slide.tipo === "capa" && (
          <CampoRico
            rotulo="Subtítulo"
            ajuda="Frase abaixo do título da capa, apresentando a atividade."
            valor={slide.sub}
            foco={f("sub")}
            aoMudar={mudar("sub")}
          />
        )}
        {slide.tipo === "fim" && (
          <CampoRico
            rotulo="Mensagem final"
            ajuda="Aparece abaixo do título, quando o aluno chega ao fim da atividade."
            valor={slide.texto}
            foco={f("texto")}
            aoMudar={mudar("texto")}
          />
        )}
      </section>

      {slide.tipo === "conteudo" && (
        <ListaBlocos
          slideId={slide.id}
          blocos={slide.blocos}
          problemas={problemas}
          recolhidos={recolhidos}
          aoAlternar={alternar}
        />
      )}
    </div>
  );
}

function ListaBlocos({
  slideId,
  blocos,
  problemas,
  recolhidos,
  aoAlternar,
}: {
  slideId: string;
  blocos: Bloco[];
  problemas: Problema[];
  recolhidos: Set<string>;
  aoAlternar(id: string): void;
}) {
  const { moverBloco, adicionarBloco } = useProjeto.getState();
  const sensores = useSensoresOrdenaveis();
  const pos = (id: string) => blocos.findIndex((b) => b.id === id);
  const nome = (id: string) => {
    const b = blocos[pos(id)];
    return b ? `Bloco ${NOMES_BLOCO[b.tipo]}` : "Bloco";
  };

  function aoSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    moverBloco(slideId, pos(String(active.id)), pos(String(over.id)));
  }

  function adicionar(tipo: Bloco["tipo"]) {
    const id = adicionarBloco(slideId, tipo);
    if (!id) return;
    requestAnimationFrame(() => {
      // Foca o primeiro campo do bloco novo.
      const el = document.querySelector<HTMLElement>(`[data-bloco="${id}"] .bloco-corpo [data-foco]`);
      el?.scrollIntoView({ block: "center" });
      el?.focus({ preventScroll: true });
    });
  }

  return (
    <section className="secao-blocos" aria-labelledby="titulo-blocos">
      <h3 id="titulo-blocos" className="secao-titulo">
        Blocos da tela
      </h3>
      {blocos.length === 0 ? (
        <p className="vazio">Esta tela ainda não tem conteúdo. Adicione o primeiro bloco abaixo.</p>
      ) : (
        <DndContext
          sensors={sensores}
          collisionDetection={closestCenter}
          modifiers={[soVertical]}
          onDragEnd={aoSoltar}
          accessibility={{
            announcements: anuncios(nome, (id) => pos(id) + 1, () => blocos.length),
            screenReaderInstructions: instrucoesLeitor,
          }}
        >
          <SortableContext items={blocos.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <ol className="lista-blocos">
              {blocos.map((b, i) => (
                <CartaoBloco
                  key={b.id}
                  slideId={slideId}
                  bloco={b}
                  indice={i}
                  erros={problemas.filter((p) => p.blocoId === b.id && p.nivel === "erro").length}
                  recolhido={recolhidos.has(b.id)}
                  aoAlternar={() => aoAlternar(b.id)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <MenuNovoBloco aoEscolher={adicionar} />
    </section>
  );
}

function CartaoBloco({
  slideId,
  bloco,
  indice,
  erros,
  recolhido,
  aoAlternar,
}: {
  slideId: string;
  bloco: Bloco;
  indice: number;
  erros: number;
  recolhido: boolean;
  aoAlternar(): void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: bloco.id,
  });
  const selecionado = useProjeto((s) => s.blocoSelecionadoId === bloco.id);
  const { selecionarBloco, duplicarBloco, excluirBloco, editarBloco } = useProjeto.getState();
  const idTitulo = useId();
  const idCorpo = useId();
  const nome = NOMES_BLOCO[bloco.tipo];
  const Form = FORMS_BLOCO[bloco.tipo] as ComponentType<PropsFormBloco<Bloco>>;

  async function excluir() {
    const ok = await confirmar(`Excluir o bloco “${nome}” desta tela? Você pode desfazer com ⌘Z.`, {
      titulo: "Excluir bloco",
    });
    if (ok) excluirBloco(slideId, bloco.id);
  }

  return (
    <li
      ref={setNodeRef}
      data-bloco={bloco.id}
      className={`bloco${selecionado ? " selecionado" : ""}${isDragging ? " arrastando" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onFocusCapture={() => !selecionado && selecionarBloco(slideId, bloco.id)}
      onMouseDown={() => !selecionado && selecionarBloco(slideId, bloco.id)}
    >
      <section aria-labelledby={idTitulo}>
        <header className="bloco-cabecalho">
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="btn-icone alca"
            title="Arrastar para mudar a ordem"
            {...attributes}
            {...listeners}
            aria-label={`Mudar a posição do bloco ${indice + 1}, ${nome}`}
          >
            <Icone nome="arrastar" />
          </button>
          <span className="bloco-icone">
            <Icone nome={bloco.tipo} />
          </span>
          <h4 id={idTitulo} className="bloco-nome" tabIndex={-1} data-foco={chaveFoco(slideId, bloco.id, "")}>
            {indice + 1}. {nome}
          </h4>
          {erros > 0 && (
            <span className="selo selo-erro" title="Problemas neste bloco">
              {erros} {erros === 1 ? "pendência" : "pendências"}
            </span>
          )}
          <div className="bloco-acoes">
            <button
              type="button"
              className="btn-icone"
              aria-expanded={!recolhido}
              aria-controls={idCorpo}
              aria-label={recolhido ? `Mostrar campos do bloco ${nome}` : `Esconder campos do bloco ${nome}`}
              title={recolhido ? "Mostrar campos" : "Esconder campos"}
              onClick={aoAlternar}
            >
              <Icone nome={recolhido ? "expandir" : "seta"} />
            </button>
            <button
              type="button"
              className="btn-icone"
              aria-label={`Duplicar bloco ${nome}`}
              title="Duplicar"
              onClick={() => duplicarBloco(slideId, bloco.id)}
            >
              <Icone nome="copiar" />
            </button>
            <button
              type="button"
              className="btn-icone perigo"
              aria-label={`Excluir bloco ${nome}`}
              title="Excluir"
              onClick={excluir}
            >
              <Icone nome="lixeira" />
            </button>
          </div>
        </header>
        <div id={idCorpo} className="bloco-corpo" hidden={recolhido}>
          {!recolhido && (
            <Form
              bloco={bloco}
              editar={(receita, grupo) => editarBloco(slideId, bloco.id, receita, grupo)}
              f={(campo) => chaveFoco(slideId, bloco.id, campo)}
            />
          )}
        </div>
      </section>
    </li>
  );
}
