/**
 * Faixa de telas (acima da prévia): cards numerados numa linha que rola na horizontal.
 * - Teclado: a faixa é uma parada só no Tab (roving tabindex); ←/→, Home/End movem o
 *   foco entre os cards; Enter/Espaço selecionam; Alt + ←/→ mudam a tela de posição.
 * - Mudar a ordem: arrastar o card (ponteiro) ou os botões ← → do card selecionado.
 * - Pode ser recolhida para uma barra fina.
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

const DICA_MOVER = "Para mudar a ordem, arraste o card ou use as setas ← → da tela selecionada.";
const ATALHO_DESFAZER = /Mac|iPhone|iPad/.test(typeof navigator === "undefined" ? "" : navigator.platform) ? "⌘Z" : "Ctrl+Z";

export interface PropsListaSlides {
  slides: Slide[];
  problemas: Problema[];
  recolhida: boolean;
  aoAlternar(): void;
  previaRecolhida: boolean;
  aoAlternarPrevia(): void;
}

const focarCard = (id: string) =>
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-slide="${id}"] .slide-botao`)?.focus());

export function ListaSlides({ slides, problemas, recolhida, aoAlternar, previaRecolhida, aoAlternarPrevia }: PropsListaSlides) {
  const corpoId = useId();
  const dicaId = useId();
  const faixaRef = useRef<HTMLOListElement>(null);
  const selecionado = useProjeto((s) => s.slideSelecionadoId);
  const { moverSlide, adicionarSlide, selecionarSlide, duplicarSlide } = useProjeto.getState();
  const sensores = useSensoresOrdenaveis(true);
  const pos = (id: string) => slides.findIndex((s) => s.id === id);
  const nome = (id: string) => {
    const s = slides[pos(id)];
    return s ? `Tela ${pos(id) + 1}, ${tituloCurto(s)}` : "Tela";
  };
  const temCapa = slides.some((s) => s.tipo === "capa");
  const temFim = slides.some((s) => s.tipo === "fim");
  const iSel = pos(selecionado ?? "");
  // Card que recebe o Tab: o selecionado (ou o primeiro)
  const iTab = iSel >= 0 ? iSel : 0;
  const [anuncio, setAnuncio] = useState("");

  function anunciar(t: string) {
    setAnuncio("");
    requestAnimationFrame(() => setAnuncio(t));
  }

  // O card selecionado fica sempre visível na faixa
  useEffect(() => {
    if (recolhida || !selecionado) return;
    faixaRef.current
      ?.querySelector<HTMLElement>(`[data-slide="${selecionado}"]`)
      ?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [selecionado, recolhida, slides.length]);

  // Roda do mouse na vertical rola a faixa na horizontal (só com o ponteiro sobre ela)
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
    const para = pos(String(over.id));
    moverSlide(pos(String(active.id)), para);
    anunciar(`Tela movida para a posição ${para + 1} de ${slides.length}.`);
  }

  /** Troca a tela i com a vizinha; o foco fica no card ou no botão usado. */
  function mover(i: number, dir: -1 | 1, focoEm?: string) {
    const para = i + dir;
    if (para < 0 || para >= slides.length) return;
    const id = slides[i].id;
    moverSlide(i, para);
    anunciar(`Tela movida para a posição ${para + 1} de ${slides.length}.`);
    requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>(`[data-slide="${id}"]`);
      const alvo = (focoEm && card?.querySelector<HTMLElement>(focoEm)) || card?.querySelector<HTMLElement>(".slide-botao");
      alvo?.focus();
    });
  }

  function duplicar(i: number) {
    const id = duplicarSlide(slides[i].id);
    if (!id) return;
    selecionarSlide(id);
    anunciar(`Tela duplicada: a cópia é a tela ${i + 2}.`);
    focarCard(id);
  }

  // Setas movem o foco entre os cards (sem Alt) ou mudam a tela de posição (com Alt)
  function teclaCard(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const alvos: Record<string, number> = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: slides.length - 1 };
    if (!(e.key in alvos)) return;
    e.preventDefault();
    if (e.altKey) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") mover(i, e.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    const j = Math.max(0, Math.min(slides.length - 1, alvos[e.key]));
    // Foco na hora (não no próximo frame): setas rápidas seguem de card em card
    const alvo = document.querySelector<HTMLElement>(`[data-slide="${slides[j].id}"] .slide-botao`);
    alvo?.focus();
    alvo?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }

  function nova(tipo: Slide["tipo"]) {
    const id = adicionarSlide(tipo);
    anunciar(`${tipo === "capa" ? "Capa criada" : tipo === "fim" ? "Tela de fim criada" : "Nova tela criada"}.`);
    focarCard(id);
  }

  return (
    <nav className={`lista-slides${recolhida ? " recolhida" : ""}`} aria-label="Telas do SCORM">
      <div className="faixa-cabecalho">
        <button
          type="button"
          className="btn-icone"
          aria-controls={corpoId}
          aria-label={recolhida ? "Mostrar telas" : "Esconder telas"}
          title={recolhida ? "Mostrar telas" : "Esconder telas (a prévia ganha a altura)"}
          onClick={aoAlternar}
        >
          <Icone nome={recolhida ? "seta" : "seta-cima"} />
        </button>
        <h2 className="coluna-titulo" tabIndex={-1}>
          Telas <span className="faixa-total">({slides.length})</span>
        </h2>
        {recolhida ? (
          iSel >= 0 && (
            <span className="faixa-atual">
              Tela {iSel + 1}: {tituloCurto(slides[iSel])}
            </span>
          )
        ) : (
          <span id={dicaId} className="ajuda faixa-dica">
            {DICA_MOVER}
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
            <ol className="slides" ref={faixaRef} aria-describedby={dicaId}>
              {slides.map((s, i) => (
                <ItemSlide
                  key={s.id}
                  slide={s}
                  indice={i}
                  total={slides.length}
                  selecionado={s.id === selecionado}
                  noTab={i === iTab}
                  erros={problemas.filter((p) => p.slideId === s.id && p.nivel === "erro").length}
                  aoTecla={(e) => teclaCard(e, i)}
                  aoMover={(dir, focoEm) => mover(i, dir, focoEm)}
                  aoDuplicar={() => duplicar(i)}
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
  noTab,
  erros,
  aoTecla,
  aoMover,
  aoDuplicar,
}: {
  slide: Slide;
  indice: number;
  total: number;
  selecionado: boolean;
  noTab: boolean;
  erros: number;
  aoTecla(e: KeyboardEvent<HTMLButtonElement>): void;
  aoMover(dir: -1 | 1, focoEm?: string): void;
  aoDuplicar(): void;
}) {
  // O próprio card é a alça de arrasto (só ponteiro)
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: slide.id,
  });
  const { selecionarSlide, excluirSlide } = useProjeto.getState();
  const titulo = tituloCurto(slide);
  const rotulo = `Tela ${indice + 1}`;
  const r = rotulo.toLowerCase();

  async function excluir() {
    const desfazer = `Para voltar atrás: Desfazer (${ATALHO_DESFAZER}).`;
    const mensagem =
      slide.tipo === "capa"
        ? `Excluir a capa (“${titulo}”)? O SCORM ficará sem capa. Para criar outra, use o botão “Capa” na faixa de telas. ${desfazer}`
        : slide.tipo === "fim"
          ? `Excluir a tela de fim (“${titulo}”)? Sem ela o SCORM não pode ser exportado. Para criar outra, use o botão “Tela de fim” na faixa de telas. ${desfazer}`
          : `Excluir a ${r} (“${titulo}”)? ${desfazer}`;
    const ok = await confirmar(mensagem, { titulo: "Excluir tela" });
    if (!ok) return;
    excluirSlide(slide.id);
    // O card sumiu: foca a tela vizinha (anterior, senão a próxima) ou o título da faixa.
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
        tabIndex={noTab ? 0 : -1}
        aria-current={selecionado ? "step" : undefined}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        title={`${rotulo} de ${total}`}
        {...listeners}
        onClick={() => selecionarSlide(slide.id)}
        onKeyDown={aoTecla}
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
      {/* Ações só no card selecionado: mantém o Tab curto e dá alternativa ao arrasto */}
      {selecionado && (
        <div className="slide-acoes">
          <button
            type="button"
            className="btn-icone"
            data-acao="esq"
            aria-label={`Mover ${r} para a esquerda`}
            title="Mover para a esquerda (Alt + ←)"
            aria-disabled={indice === 0 || undefined}
            onClick={() => indice > 0 && aoMover(-1, '[data-acao="esq"]')}
          >
            <Icone nome="recolher" />
          </button>
          <button
            type="button"
            className="btn-icone"
            data-acao="dir"
            aria-label={`Mover ${r} para a direita`}
            title="Mover para a direita (Alt + →)"
            aria-disabled={indice === total - 1 || undefined}
            onClick={() => indice < total - 1 && aoMover(1, '[data-acao="dir"]')}
          >
            <Icone nome="expandir" />
          </button>
          <button type="button" className="btn-icone" aria-label={`Duplicar ${r}`} title="Duplicar" onClick={aoDuplicar}>
            <Icone nome="copiar" />
          </button>
          <button type="button" className="btn-icone perigo" aria-label={`Excluir ${r}`} title="Excluir" onClick={excluir}>
            <Icone nome="lixeira" />
          </button>
        </div>
      )}
    </li>
  );
}
