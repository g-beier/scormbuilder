/** Coluna da esquerda: telas numeradas, reordenáveis por arrasto ou teclado. */
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NOMES_SLIDE, type Problema, type Slide } from "../modelo/tipos";
import { textoVisivel } from "../modelo/validar";
import { useProjeto } from "../estado/projeto";
import { confirmar } from "../servicos/dialogos";
import { Icone } from "./Icones";
import { anuncios, instrucoesLeitor, soVertical, useSensoresOrdenaveis } from "./ordenavel";

export function ListaSlides({ slides, problemas }: { slides: Slide[]; problemas: Problema[] }) {
  const selecionado = useProjeto((s) => s.slideSelecionadoId);
  const { moverSlide, adicionarSlide } = useProjeto.getState();
  const sensores = useSensoresOrdenaveis();
  const pos = (id: string) => slides.findIndex((s) => s.id === id);
  const nome = (id: string) => {
    const s = slides[pos(id)];
    return s ? `Tela ${pos(id) + 1}, ${tituloCurto(s)}` : "Tela";
  };
  const temCapa = slides.some((s) => s.tipo === "capa");
  const temFim = slides.some((s) => s.tipo === "fim");

  function aoSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    moverSlide(pos(String(active.id)), pos(String(over.id)));
  }

  function nova(tipo: Slide["tipo"]) {
    const id = adicionarSlide(tipo);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-slide="${id}"] .slide-botao`)?.focus());
  }

  return (
    <nav className="lista-slides" aria-label="Telas do SCORM">
      <h2 className="coluna-titulo">Telas</h2>
      <DndContext
        sensors={sensores}
        collisionDetection={closestCenter}
        modifiers={[soVertical]}
        onDragEnd={aoSoltar}
        accessibility={{
          announcements: anuncios(nome, (id) => pos(id) + 1, () => slides.length),
          screenReaderInstructions: instrucoesLeitor,
        }}
      >
        <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ol className="slides">
            {slides.map((s, i) => (
              <ItemSlide
                key={s.id}
                slide={s}
                indice={i}
                total={slides.length}
                selecionado={s.id === selecionado}
                erros={problemas.filter((p) => p.slideId === s.id && p.nivel === "erro").length}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="slides-acoes">
        <button type="button" className="btn btn-primario btn-largo" onClick={() => nova("conteudo")}>
          <Icone nome="mais" /> Nova tela
        </button>
        {!temCapa && (
          <button type="button" className="btn btn-largo" onClick={() => nova("capa")}>
            <Icone nome="mais" /> Capa
          </button>
        )}
        {!temFim && (
          <button type="button" className="btn btn-largo" onClick={() => nova("fim")}>
            <Icone nome="mais" /> Tela de fim
          </button>
        )}
      </div>
    </nav>
  );
}

function tituloCurto(s: Slide): string {
  return textoVisivel(s.titulo) || "(sem título)";
}

function ItemSlide({
  slide,
  indice,
  total,
  selecionado,
  erros,
}: {
  slide: Slide;
  indice: number;
  total: number;
  selecionado: boolean;
  erros: number;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const { selecionarSlide, duplicarSlide, excluirSlide } = useProjeto.getState();
  const titulo = tituloCurto(slide);
  const rotulo = `Tela ${indice + 1}`;

  async function excluir() {
    const extra =
      slide.tipo === "fim"
        ? " Sem a tela de fim, o SCORM não pode ser exportado."
        : slide.tipo === "capa"
          ? " O SCORM ficará sem capa."
          : "";
    const ok = await confirmar(`Excluir a ${rotulo.toLowerCase()} (“${titulo}”)?${extra} Você pode desfazer com ⌘Z.`, {
      titulo: "Excluir tela",
    });
    if (ok) excluirSlide(slide.id);
  }

  return (
    <li
      ref={setNodeRef}
      data-slide={slide.id}
      className={`slide-item${selecionado ? " selecionado" : ""}${isDragging ? " arrastando" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="btn-icone alca"
        title="Arrastar para mudar a ordem"
        {...attributes}
        {...listeners}
        aria-label={`Mudar a posição da ${rotulo.toLowerCase()} de ${total}`}
      >
        <Icone nome="arrastar" />
      </button>
      <button
        type="button"
        className="slide-botao"
        aria-current={selecionado ? "true" : undefined}
        onClick={() => selecionarSlide(slide.id)}
      >
        <span className="slide-num" aria-hidden="true">
          {indice + 1}
        </span>
        <span className="slide-textos">
          <span className="slide-tipo">
            <span className="so-leitor">{rotulo}, </span>
            {NOMES_SLIDE[slide.tipo]}
            {slide.tipo === "conteudo" && ` · ${slide.blocos.length} ${slide.blocos.length === 1 ? "bloco" : "blocos"}`}
          </span>
          <span className="slide-titulo">{titulo}</span>
        </span>
        {erros > 0 && (
          <span className="selo selo-erro">
            {erros}
            <span className="so-leitor"> {erros === 1 ? "pendência" : "pendências"}</span>
          </span>
        )}
      </button>
      <div className="slide-acoes">
        <button
          type="button"
          className="btn-icone"
          aria-label={`Duplicar ${rotulo.toLowerCase()}`}
          title="Duplicar"
          onClick={() => duplicarSlide(slide.id)}
        >
          <Icone nome="copiar" />
        </button>
        <button
          type="button"
          className="btn-icone perigo"
          aria-label={`Excluir ${rotulo.toLowerCase()}`}
          title="Excluir"
          onClick={excluir}
        >
          <Icone nome="lixeira" />
        </button>
      </div>
    </li>
  );
}
