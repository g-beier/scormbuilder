/** Editor em três colunas: telas · formulário da tela · prévia. */
import { useEffect, useMemo, useState } from "react";
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

const CHAVE_PREVIA = "scorm-builder:previa-recolhida";

function lerPreferencia(): boolean {
  try {
    return localStorage.getItem(CHAVE_PREVIA) === "1";
  } catch {
    return false;
  }
}

export function Editor({ projeto, aoInicio }: { projeto: Projeto; aoInicio(): void }) {
  const slideSelecionadoId = useProjeto((s) => s.slideSelecionadoId);
  const selecaoN = useProjeto((s) => s.selecaoN);
  const { selecionarSlide, selecionarBloco, atualizarMeta } = useProjeto.getState();
  const [dadosAbertos, setDadosAbertos] = useState(false);
  const [previaRecolhida, setPreviaRecolhida] = useState(lerPreferencia);
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

  function alternarPrevia() {
    setPreviaRecolhida((v) => {
      try {
        localStorage.setItem(CHAVE_PREVIA, v ? "0" : "1");
      } catch {
        /* sem armazenamento: só não lembra */
      }
      return !v;
    });
  }

  function irProblema(p: Problema) {
    if (p.campo === "meta" || (!p.slideId && p.campo?.startsWith("meta"))) {
      setDadosAbertos(true);
      return;
    }
    if (!p.slideId) {
      // Ex.: "Falta a tela de fim": leva aos botões de nova tela.
      document.querySelector<HTMLElement>(".slides-acoes button:last-child")?.focus();
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
        aoInicio={aoInicio}
      />
      <div className={`editor-colunas${previaRecolhida ? " previa-recolhida" : ""}`}>
        <ListaSlides slides={projeto.slides} problemas={problemas} />
        <main className="coluna-form" aria-label="Edição da tela">
          {slide ? (
            <FormSlide
              key={slide.id}
              slide={slide}
              indice={indice}
              problemas={problemas.filter((p) => p.slideId === slide.id)}
            />
          ) : (
            <p className="vazio">Nenhuma tela. Use “Nova tela” à esquerda.</p>
          )}
        </main>
        <PainelPrevia
          projeto={projeto}
          slideSelecionadoId={slideSelecionadoId}
          selecaoN={selecaoN}
          recolhido={previaRecolhida}
          aoAlternar={alternarPrevia}
        />
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
    </div>
  );
}
