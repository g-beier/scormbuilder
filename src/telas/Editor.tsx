/**
 * Editor em duas colunas: à esquerda, a faixa de telas (em cima) e a prévia (embaixo);
 * à direita, o formulário da tela, com largura ajustável pelo separador.
 * A faixa e a prévia podem ser recolhidas; a escolha e a largura ficam guardadas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Problema, Projeto } from "../modelo/tipos";
import { validar } from "../modelo/validar";
import { nomePacote } from "../modelo/compilar";
import { useProjeto } from "../estado/projeto";
import { avisar } from "../estado/avisos";
import { salvarArquivo } from "../servicos/rascunhos";
import { escolherDestinoCevscorm } from "../servicos/dialogos";
import { mensagemDeErro } from "../servicos/ambiente";
import { BarraSuperior } from "../editor/BarraSuperior";
import { ListaSlides } from "../editor/ListaSlides";
import { FormSlide } from "../editor/FormSlide";
import { FormMeta } from "../editor/FormMeta";
import { Dialogo } from "../editor/Dialogo";
import { pedirFoco } from "../editor/foco";
import { tratarAtalhoDesfazer, tratarEsc } from "../editor/atalhos";
import { PainelPrevia } from "../previa/PainelPrevia";
import { DialogoExportar } from "../editor/DialogoExportar";
import { LARGURA_PADRAO, Separador, limitarLargura } from "../editor/Separador";

const CHAVE_PREVIA = "scorm-builder:previa-recolhida";
const CHAVE_FAIXA = "scorm-builder:faixa-recolhida";
const CHAVE_LARGURA = "scorm-builder:largura-edicao";
/** Abaixo desta largura de janela, a prévia começa recolhida. */
const JANELA_ESTREITA = 960;

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

function previaInicial(): boolean {
  const v = ler(CHAVE_PREVIA);
  if (v !== null) return v === "1";
  return window.innerWidth < JANELA_ESTREITA;
}

function larguraInicial(): number {
  const n = Number(ler(CHAVE_LARGURA));
  return Number.isFinite(n) && n > 0 ? n : LARGURA_PADRAO;
}

export function Editor({ projeto, aoInicio }: { projeto: Projeto; aoInicio(): void }) {
  const slideSelecionadoId = useProjeto((s) => s.slideSelecionadoId);
  const selecaoN = useProjeto((s) => s.selecaoN);
  const { selecionarSlide, selecionarBloco, atualizarMeta } = useProjeto.getState();
  const [dadosAbertos, setDadosAbertos] = useState(false);
  const [exportarAberto, setExportarAberto] = useState(false);
  const [previaRecolhida, setPreviaRecolhida] = useState(previaInicial);
  const [faixaRecolhida, setFaixaRecolhida] = useState(() => ler(CHAVE_FAIXA) === "1");
  const [largura, setLargura] = useState(larguraInicial);
  const colunasRef = useRef<HTMLDivElement>(null);
  const conteiner = useCallback(() => colunasRef.current, []);
  const problemas = useMemo(() => validar(projeto), [projeto]);

  // Seleção some (ex. desfazer apagou a tela): volta para uma tela que existe.
  const indice = projeto.slides.findIndex((s) => s.id === slideSelecionadoId);
  const slide = indice >= 0 ? projeto.slides[indice] : undefined;
  useEffect(() => {
    if (!slide && projeto.slides.length) selecionarSlide(projeto.slides[0].id);
  }, [slide, projeto.slides, selecionarSlide]);

  // Ao abrir o editor (ex.: depois de "Criar SCORM"), o foco não fica perdido no <body>.
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>(".form-slide-titulo")?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (!tratarAtalhoDesfazer(e)) tratarEsc(e);
    };
    window.addEventListener("keydown", teclas);
    return () => window.removeEventListener("keydown", teclas);
  }, []);

  // A largura guardada é a preferência; a efetiva respeita os mínimos da janela atual
  // (janela menor não muda a preferência, então ela volta ao aumentar a janela).
  const [larguraTotal, setLarguraTotal] = useState(0);
  useEffect(() => {
    const el = colunasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLarguraTotal(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const larguraEfetiva = limitarLargura(largura, larguraTotal);

  function mudarLargura(pct: number) {
    setLargura(pct);
    gravar(CHAVE_LARGURA, String(pct));
  }

  function alternarPrevia() {
    const nova = !previaRecolhida;
    setPreviaRecolhida(nova);
    gravar(CHAVE_PREVIA, nova ? "1" : "0");
    // O botão clicado some: o foco vai para o botão equivalente do outro lugar
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(nova ? ".faixa-previa" : ".previa-esconder")
        ?.focus(),
    );
  }

  function alternarFaixa() {
    setFaixaRecolhida((v) => {
      gravar(CHAVE_FAIXA, v ? "0" : "1");
      return !v;
    });
  }

  function irProblema(p: Problema) {
    if (p.campo === "meta" || (!p.slideId && p.campo?.startsWith("meta"))) {
      setDadosAbertos(true);
      return;
    }
    if (!p.slideId) {
      // Ex.: "Falta a tela de fim": leva aos botões de nova tela (abre a faixa se preciso).
      if (faixaRecolhida) alternarFaixa();
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('.slides-acoes [data-nova="fim"], .slides-acoes [data-nova="capa"], .slides-acoes button')?.focus(),
      );
      return;
    }
    if (p.blocoId) selecionarBloco(p.slideId, p.blocoId);
    else selecionarSlide(p.slideId);
    pedirFoco(p.slideId, p.blocoId, p.campo === "id" ? "" : p.campo);
  }

  async function salvarComo() {
    try {
      const caminho = await escolherDestinoCevscorm(nomePacote(projeto.meta));
      if (!caminho) return;
      const final = await salvarArquivo(caminho, projeto);
      avisar(`Projeto salvo em ${final}.`, "ok");
    } catch (e) {
      avisar(`Não foi possível salvar: ${mensagemDeErro(e)}`, "erro");
    }
  }

  return (
    <div className="editor">
      <BarraSuperior
        projeto={projeto}
        problemas={problemas}
        aoAbrirDados={() => setDadosAbertos(true)}
        aoIrProblema={irProblema}
        aoSalvarComo={salvarComo}
        aoExportar={() => setExportarAberto(true)}
        aoInicio={aoInicio}
      />
      <div
        ref={colunasRef}
        className={`editor-colunas${previaRecolhida ? " previa-recolhida" : ""}`}
        style={{ ["--larg-edicao" as string]: `${larguraEfetiva}%` }}
      >
        <ListaSlides
          slides={projeto.slides}
          problemas={problemas}
          recolhida={faixaRecolhida}
          aoAlternar={alternarFaixa}
          previaRecolhida={previaRecolhida}
          aoAlternarPrevia={alternarPrevia}
        />
        {!previaRecolhida && (
          <PainelPrevia
            projeto={projeto}
            slideSelecionadoId={slideSelecionadoId}
            selecaoN={selecaoN}
            recolhido={false}
            aoAlternar={alternarPrevia}
          />
        )}
        {!previaRecolhida && <Separador valor={larguraEfetiva} aoMudar={mudarLargura} conteiner={conteiner} />}
        <main className="coluna-form" aria-label="Edição da tela">
          {slide ? (
            <FormSlide
              key={slide.id}
              slide={slide}
              indice={indice}
              problemas={problemas.filter((p) => p.slideId === slide.id)}
            />
          ) : (
            <p className="vazio">Nenhuma tela. Use “Nova tela” na faixa de telas.</p>
          )}
        </main>
      </div>
      <Dialogo
        aberto={dadosAbertos}
        titulo="Dados do pacote"
        aoFechar={() => setDadosAbertos(false)}
        rodape={
          <button type="button" className="btn btn-primario" onClick={() => setDadosAbertos(false)}>
            Concluir
          </button>
        }
      >
        <FormMeta
          meta={projeto.meta}
          autoFocar
          aoMudar={(parcial, campo) => atualizarMeta(parcial, `meta/${campo}`)}
        />
      </Dialogo>
      <DialogoExportar
        projeto={projeto}
        aberto={exportarAberto}
        aoFechar={() => setExportarAberto(false)}
        aoIrParaProblema={() => {
          const primeiro = problemas.find((p) => p.nivel === "erro");
          if (primeiro) irProblema(primeiro);
        }}
      />
    </div>
  );
}
