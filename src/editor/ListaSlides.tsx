/**
 * Faixa de telas (acima da prévia): cards numerados numa linha que rola na horizontal,
 * reordenáveis por arrasto ou teclado. Pode ser recolhida para uma barra fina.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NOMES_SLIDE, type Problema, type Slide } from "../modelo/tipos";
import { useProjeto } from "../estado/projeto";
import { confirmar } from "../servicos/dialogos";
import { Icone } from "./Icones";
import { anuncios, soHorizontal, useSensoresOrdenaveis } from "./ordenavel";

/** Dica de reordenar, no título do card e para leitores de tela. */
const DICA_MOVER = "Para mudar a posição, arraste o card ou use Alt + seta para a esquerda ou para a direita.";

export interface PropsListaSlides {
  slides: Slide[];
  problemas: Problema[];
  recolhida: boolean;
  aoAlternar(): void;
  previaRecolhida: boolean;
  aoAlternarPrevia(): void;
}

export function ListaSlides({ slides, problemas, recolhida, aoAlternar, previaRecolhida, aoAlternarPrevia }: PropsListaSlides) {
  const corpoId = useId();
  const faixaRef = useRef<HTMLOListElement>(null);
  const selecionado = useProjeto((s) => s.slideSelecionadoId);
  const { moverSlide, adicionarSlide } = useProjeto.getState();
  const sensores = useSensoresOrdenaveis(true);
  const pos = (id: string) => slides.findIndex((s) => s.id === id);
  const nome = (id: string) => {
    const s = slides[pos(id)];
    return s ? `Tela ${pos(id) + 1}, ${tituloCurto(s)}` : "Tela";
  };
  const temCapa = slides.some((s) => s.tipo === "capa");
  const temFim = slides.some((s) => s.tipo === "fim");
  const iSel = pos(selecionado ?? "");
  const [anuncio, setAnuncio] = useState("");

  // Alt + ←/→ no card: troca com o vizinho; o foco acompanha o card
  function moverComTeclado(i: number, dir: -1 | 1) {
    const para = i + dir;
    if (para < 0 || para >= slides.length) return;
    const id = slides[i].id;
    moverSlide(i, para);
    setAnuncio("");
    requestAnimationFrame(() => {
      setAnuncio(`Tela movida para a posição ${para + 1} de ${slides.length}.`);
      document.querySelector<HTMLElement>(`[data-slide="${id}"] .slide-botao`)?.focus();
    });
  }

  // O card selecionado fica sempre visível na faixa
  useEffect(() => {
    if (recolhida || !selecionado) return;
    faixaRef.current
      ?.querySelector<HTMLElement>(`[data-slide="${selecionado}"]`)
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [selecionado, recolhida, slides.length]);

  // Roda do mouse na vertical rola a faixa na horizontal
  useEffect(() => {
    const ol = faixaRef.current;
    if (!ol) return;
    const roda = (e: WheelEvent) => {
      if (e.deltaX !== 0 || e.deltaY === 0 || ol.scrollWidth <= ol.clientWidth) return;
      e.preventDefault();
      ol.scrollLeft += e.deltaY;
    };
    ol.addEventListener("wheel", roda, { passive: false });
    return () => ol.removeEventListener("wheel", roda);
  }, [recolhida]);

  function aoSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    moverSlide(pos(String(active.id)), pos(String(over.id)));
  }

  function nova(tipo: Slide["tipo"]) {
    const id = adicionarSlide(tipo);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-slide="${id}"] .slide-botao`)?.focus());
  }

  return (
    <nav className={`lista-slides${recolhida ? " recolhida" : ""}`} aria-label="Telas do SCORM">
      <div className="faixa-cabecalho">
        <button
          type="button"
          className="btn-icone"
          aria-expanded={!recolhida}
          aria-controls={corpoId}
          aria-label={recolhida ? "Mostrar telas" : "Esconder telas"}
          title={recolhida ? "Mostrar telas" : "Esconder telas"}
          onClick={aoAlternar}
        >
          <Icone nome={recolhida ? "seta" : "seta-cima"} />
        </button>
        <h2 className="coluna-titulo" tabIndex={-1}>
          Telas <span className="faixa-total">({slides.length})</span>
        </h2>
        {recolhida && iSel >= 0 && (
          <span className="faixa-atual">
            Tela {iSel + 1}: {tituloCurto(slides[iSel])}
          </span>
        )}
        {previaRecolhida && (
          <button type="button" className="btn btn-pequeno faixa-previa" onClick={aoAlternarPrevia}>
            <Icone nome="previa" tamanho={16} /> Mostrar prévia
          </button>
        )}
      </div>
      <div id={corpoId} className="faixa-corpo" hidden={recolhida}>
        <DndContext
          sensors={sensores}
          collisionDetection={closestCenter}
          modifiers={[soHorizontal]}
          onDragEnd={aoSoltar}
          accessibility={{
            announcements: anuncios(nome, (id) => pos(id) + 1, () => slides.length),
            screenReaderInstructions: { draggable: DICA_MOVER },
          }}
        >
          <SortableContext items={slides.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
            <ol className="slides" ref={faixaRef}>
              {slides.map((s, i) => (
                <ItemSlide
                  key={s.id}
                  slide={s}
                  indice={i}
                  total={slides.length}
                  selecionado={s.id === selecionado}
                  erros={problemas.filter((p) => p.slideId === s.id && p.nivel === "erro").length}
                  aoMover={(dir) => moverComTeclado(i, dir)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <p className="so-leitor faixa-anuncio" aria-live="polite">
          {anuncio}
        </p>
        <div className="slides-acoes">
          {!temCapa && (
            <button type="button" className="btn btn-pequeno" data-nova="capa" onClick={() => nova("capa")}>
              <Icone nome="mais" tamanho={16} /> Capa
            </button>
          )}
          {!temFim && (
            <button type="button" className="btn btn-pequeno" data-nova="fim" onClick={() => nova("fim")}>
              <Icone nome="mais" tamanho={16} /> Tela de fim
            </button>
          )}
          <button type="button" className="btn btn-primario btn-pequeno" data-nova="conteudo" onClick={() => nova("conteudo")}>
            <Icone nome="mais" tamanho={16} /> Nova tela
          </button>
        </div>
      </div>
    </nav>
  );
}

function tituloCurto(s: Slide): string {
  // Título é texto simples (não HTML): mostra como está, inclusive "<" e "&".
  return s.titulo.trim() || "(sem título)";
}

function ItemSlide({
  slide,
  indice,
  total,
  selecionado,
  erros,
  aoMover,
}: {
  slide: Slide;
  indice: number;
  total: number;
  selecionado: boolean;
  erros: number;
  aoMover(dir: -1 | 1): void;
}) {
  // O próprio card é a alça de arrasto (só ponteiro; o teclado usa Alt + setas)
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const { selecionarSlide, duplicarSlide, excluirSlide } = useProjeto.getState();
  const titulo = tituloCurto(slide);
  const rotulo = `Tela ${indice + 1}`;
  const dicaId = useId();

  async function excluir() {
    const desfazer = "Para voltar atrás: Desfazer (⌘Z).";
    const mensagem =
      slide.tipo === "capa"
        ? `Excluir a capa (“${titulo}”)? O SCORM ficará sem capa. Para criar outra, use “+ Capa” na faixa de telas. ${desfazer}`
        : slide.tipo === "fim"
          ? `Excluir a tela de fim (“${titulo}”)? Sem ela o SCORM não pode ser exportado. Para criar outra, use “+ Tela de fim” na faixa de telas. ${desfazer}`
          : `Excluir a ${rotulo.toLowerCase()} (“${titulo}”)? ${desfazer}`;
    const ok = await confirmar(mensagem, { titulo: "Excluir tela" });
    if (!ok) return;
    excluirSlide(slide.id);
    // O botão de excluir sumiu: foca a tela vizinha (anterior, senão a próxima) ou o título da faixa.
    requestAnimationFrame(() => {
      const botoes = document.querySelectorAll<HTMLElement>(".lista-slides .slide-botao");
      const alvo = botoes[Math.max(0, indice - 1)] ?? document.querySelector<HTMLElement>(".lista-slides .coluna-titulo");
      alvo?.focus();
    });
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
        className="slide-botao"
        aria-current={selecionado ? "true" : undefined}
        aria-describedby={dicaId}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        title={`${rotulo} de ${total}. ${DICA_MOVER}`}
        {...listeners}
        onClick={() => selecionarSlide(slide.id)}
        onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
          if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
          e.preventDefault();
          aoMover(e.key === "ArrowLeft" ? -1 : 1);
        }}
      >
        <span className="slide-topo">
          <span className="slide-num" aria-hidden="true">
            {indice + 1}
          </span>
          <span className="slide-tipo">
            <span className="so-leitor">{rotulo}, </span>
            {NOMES_SLIDE[slide.tipo]}
            {slide.tipo === "conteudo" && ` · ${slide.blocos.length} ${slide.blocos.length === 1 ? "bloco" : "blocos"}`}
          </span>
          {erros > 0 && (
            <span className="selo selo-erro" title={`${erros} a corrigir`}>
              <Icone nome="erro" tamanho={14} />
              {erros}
              <span className="so-leitor"> a corrigir</span>
            </span>
          )}
        </span>
        <span className="slide-titulo">{titulo}</span>
      </button>
      <span id={dicaId} hidden>
        {DICA_MOVER}
      </span>
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
