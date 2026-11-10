/**
 * Prévia ao vivo: o motor real (`runtime/`, servido em /runtime/) num iframe `srcdoc`,
 * com o CONTEUDO compilado inline e o mock da API SCORM 1.2 no `window` do app.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import modeloIndex from "../../runtime/index.html?raw";
import { compilarConteudo } from "../modelo/compilar";
import type { Projeto } from "../modelo/tipos";
import { Icone } from "../editor/Icones";
import { LIMITE_SUSPEND_DATA, mockScorm, publicarApi } from "./apiScorm";
import { HANDLE_GLOBAL, montarSrcdoc } from "./montarSrcdoc";

export interface PropsPainelPrevia {
  projeto: Projeto;
  slideSelecionadoId: string | null;
  /** Muda a cada clique numa tela da lista, mesmo na já selecionada. */
  selecaoN?: number;
  recolhido: boolean;
  aoAlternar(): void;
}

/** O que `Motor.iniciar` devolve (ver CLAUDE.md, "Runtime v2"). */
interface HandleMotor {
  ir(i: number): void;
  tela(): number;
  total: number;
  concluido(): boolean;
}

const DISPOSITIVOS = {
  computador: { rotulo: "Computador", largura: 1200 },
  celular: { rotulo: "Celular", largura: 375 },
} as const;
type Dispositivo = keyof typeof DISPOSITIVOS;
const ALTURA = 666;
const DEBOUNCE_MS = 400;
/** Altura do resumo fechado da "Situação SCORM" + o espaço entre eles. */
const RESERVA_SITUACAO = 56;

const STATUS_PT: Record<string, string> = {
  "not attempted": "não iniciada",
  incomplete: "em andamento",
  completed: "concluída",
  passed: "aprovada",
  failed: "reprovada",
  browsed: "navegada",
};

function urlRuntime(): string {
  return new URL("/runtime/", window.location.href).href;
}

export function PainelPrevia({ projeto, slideSelecionadoId, selecaoN, recolhido, aoAlternar }: PropsPainelPrevia) {
  const id = useId();
  const chave = "previa-" + projeto.id;
  const [dispositivo, setDispositivo] = useState<Dispositivo>("computador");
  const [livre, setLivre] = useState(true);
  const [grande, setGrande] = useState(false);
  const [recargas, setRecargas] = useState(0);
  const [srcdoc, setSrcdoc] = useState("");
  const [falha, setFalha] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const palcoRef = useRef<HTMLDivElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);
  const quadroRef = useRef<HTMLDivElement>(null);
  const fecharGrandeRef = useRef<HTMLButtonElement>(null);
  const abrirGrandeRef = useRef<HTMLButtonElement>(null);
  /** Ids das telas do documento carregado no iframe (índice = tela do motor). */
  const idsCarregados = useRef<string[]>([]);
  /** Tela pedida pelo editor que ainda não pôde ser mostrada. */
  const pendenteId = useRef<string | null>(slideSelecionadoId);
  const contador = useRef(0);

  // ---------- Conteúdo, com debounce ----------
  const entrada = useMemo(
    () => JSON.stringify({ titulo: projeto.meta.titulo, conteudo: compilarConteudo(projeto) }),
    [projeto],
  );
  const [entradaEstavel, setEntradaEstavel] = useState(entrada);
  useEffect(() => {
    if (entrada === entradaEstavel) return;
    const t = setTimeout(() => setEntradaEstavel(entrada), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [entrada, entradaEstavel]);

  const handle = useCallback((): HandleMotor | null => {
    const w = iframeRef.current?.contentWindow as (Window & { [HANDLE_GLOBAL]?: HandleMotor | null }) | null;
    try {
      return w?.[HANDLE_GLOBAL] ?? null;
    } catch {
      return null;
    }
  }, []);

  // ---------- Monta e (re)carrega o iframe ----------
  useEffect(() => {
    const { titulo, conteudo } = JSON.parse(entradaEstavel) as { titulo: string; conteudo: ReturnType<typeof compilarConteudo> };
    const ids = conteudo.slides.map((s) => s.id);

    // Tela a manter: a pedida pelo editor, senão a que está na prévia agora (pelo id da tela).
    let tela = 0;
    const h = handle();
    const atualId = h ? idsCarregados.current[h.tela()] : undefined;
    const alvoId = pendenteId.current ?? atualId;
    pendenteId.current = null;
    if (alvoId && ids.includes(alvoId)) tela = ids.indexOf(alvoId);
    else if (h) tela = Math.min(h.tela(), Math.max(0, ids.length - 1));

    let html: string;
    try {
      html = montarSrcdoc(modeloIndex, { base: urlRuntime(), titulo, conteudo, chave, telaInicial: tela, livre });
    } catch (e) {
      setFalha(String((e as Error).message ?? e));
      return;
    }
    publicarApi(chave);
    mockScorm.observar(chave);
    idsCarregados.current = ids;
    contador.current += 1;
    // O comentário com o contador garante que o iframe recarrega mesmo com o mesmo conteúdo.
    setSrcdoc(`${html}<!-- carga ${contador.current} -->`);
  }, [entradaEstavel, livre, chave, recargas, handle]);

  useEffect(
    () => () => {
      delete (window as Window & { API?: unknown }).API;
      mockScorm.observar(null);
    },
    [],
  );

  function aoCarregar() {
    const doc = iframeRef.current?.contentDocument;
    const h = handle();
    if (doc && !h) {
      const msg = doc.querySelector("#stage p")?.textContent?.trim();
      setFalha(msg || "O motor não conseguiu abrir a atividade.");
      return;
    }
    setFalha(null);
  }

  // ---------- Ao selecionar uma tela no editor, salta para ela ----------
  useEffect(() => {
    if (!slideSelecionadoId) return;
    const h = handle();
    const i = idsCarregados.current.indexOf(slideSelecionadoId);
    if (!h || i < 0) {
      // Ainda não carregou (ou a tela é nova): vale para a próxima carga.
      pendenteId.current = slideSelecionadoId;
      return;
    }
    if (h.tela() === i) return;
    h.ir(i);
    if (h.tela() !== i) {
      // Modo aluno bloqueou o salto: recarrega já na tela pedida.
      pendenteId.current = slideSelecionadoId;
      setRecargas((n) => n + 1);
    }
  }, [slideSelecionadoId, selecaoN, handle]);

  // ---------- Escala para caber no palco ----------
  const { largura } = DISPOSITIVOS[dispositivo];
  const [espaco, setEspaco] = useState({ w: 0, h: 0 });
  // O palco só ocupa a altura da moldura + legenda (sem sobra antes da "Situação SCORM").
  // A altura disponível vem do contêiner: o corpo do painel (descontando o que fica
  // acima do palco e o resumo da "Situação SCORM") ou, na janela grande, o quadro.
  useLayoutEffect(() => {
    const palco = palcoRef.current;
    const caixa = grande ? quadroRef.current : corpoRef.current;
    if (!palco || !caixa) return;
    const medir = () => {
      const cx = caixa.getBoundingClientRect();
      const acima = palco.getBoundingClientRect().top - cx.top + (grande ? 0 : caixa.scrollTop);
      const estilo = getComputedStyle(caixa);
      const reserva = parseFloat(estilo.paddingBottom) + (grande ? 0 : RESERVA_SITUACAO);
      setEspaco({ w: palco.clientWidth, h: Math.max(0, caixa.clientHeight - acima - reserva) });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(caixa);
    return () => ro.disconnect();
  }, [recolhido, grande, falha]);
  // Reserva ~2 linhas para a legenda abaixo da moldura.
  const LEGENDA = 44;
  const escala =
    espaco.w > 0 && espaco.h > LEGENDA ? Math.min(1, (espaco.w - 2) / largura, (espaco.h - LEGENDA) / ALTURA) : 0.3;

  // ---------- Janela grande ----------
  useEffect(() => {
    if (!grande) return;
    fecharGrandeRef.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharGrande();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [grande]);

  function fecharGrande() {
    setGrande(false);
    requestAnimationFrame(() => abrirGrandeRef.current?.focus());
  }

  function reiniciarProgresso() {
    mockScorm.reiniciar(chave);
    try {
      localStorage.removeItem(chave);
    } catch {
      /* sem storage: nada a limpar */
    }
    setRecargas((n) => n + 1);
  }

  const n = projeto.slides.findIndex((s) => s.id === slideSelecionadoId);

  return (
    <aside className={`painel-previa${recolhido ? " recolhido" : ""}`} aria-label="Prévia">
      <div className="previa-cabecalho">
        <button
          type="button"
          className="btn-icone"
          aria-expanded={!recolhido}
          aria-controls={id}
          aria-label={recolhido ? "Mostrar prévia" : "Esconder prévia"}
          title={recolhido ? "Mostrar prévia" : "Esconder prévia"}
          onClick={aoAlternar}
        >
          <Icone nome={recolhido ? "recolher" : "expandir"} />
        </button>
        {!recolhido && <h2 className="coluna-titulo">Prévia</h2>}
      </div>
      <div id={id} className="previa-corpo" hidden={recolhido} ref={corpoRef}>
        <div
          ref={quadroRef}
          className={`previa-quadro${grande ? " grande" : ""}`}
          role={grande ? "dialog" : undefined}
          aria-modal={grande ? true : undefined}
          aria-label={grande ? "Prévia em janela grande" : undefined}
        >
          <div className="previa-controles">
            <div role="group" aria-label="Tamanho da tela" className="previa-grupo">
              {(Object.keys(DISPOSITIVOS) as Dispositivo[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  className="btn btn-pequeno"
                  aria-pressed={dispositivo === d}
                  title={`${DISPOSITIVOS[d].rotulo} (${DISPOSITIVOS[d].largura} × ${ALTURA})`}
                  onClick={() => setDispositivo(d)}
                >
                  {DISPOSITIVOS[d].rotulo}
                </button>
              ))}
            </div>
            <div role="group" aria-label="Modo de navegação" className="previa-grupo">
              <button
                type="button"
                className="btn btn-pequeno"
                aria-pressed={livre}
                title="Navega livremente, sem precisar responder"
                onClick={() => setLivre(true)}
              >
                Modo autor
              </button>
              <button
                type="button"
                className="btn btn-pequeno"
                aria-pressed={!livre}
                title="Como o aluno: “Próximo” só libera depois de responder"
                onClick={() => setLivre(false)}
              >
                Modo aluno
              </button>
            </div>
            <div className="previa-grupo">
              <button type="button" className="btn btn-pequeno" onClick={reiniciarProgresso}>
                Reiniciar progresso
              </button>
              {grande ? (
                <button ref={fecharGrandeRef} type="button" className="btn btn-pequeno" onClick={fecharGrande}>
                  <Icone nome="fechar" tamanho={16} />
                  Fechar janela grande
                </button>
              ) : (
                <button ref={abrirGrandeRef} type="button" className="btn btn-pequeno" onClick={() => setGrande(true)}>
                  Abrir em janela grande
                </button>
              )}
            </div>
          </div>

          {falha && (
            <p className="previa-aviso" role="alert">
              <Icone nome="alerta" tamanho={18} />
              <span>
                A prévia não abriu: {falha} Veja os itens a corrigir na barra superior.
              </span>
            </p>
          )}

          <div className="previa-palco" ref={palcoRef}>
            <div
              className="previa-moldura"
              style={{ width: Math.round(largura * escala), height: Math.round(ALTURA * escala) }}
            >
              <iframe
                ref={iframeRef}
                title={`Prévia da atividade${n >= 0 ? `, tela ${n + 1} selecionada` : ""} (${DISPOSITIVOS[dispositivo].rotulo.toLowerCase()})`}
                srcDoc={srcdoc}
                onLoad={aoCarregar}
                width={largura}
                height={ALTURA}
                style={{ transform: `scale(${escala})` }}
              />
            </div>
            <p className="ajuda previa-legenda">
              {DISPOSITIVOS[dispositivo].rotulo}: {largura} × {ALTURA} px, em {Math.round(escala * 100)}%.
              {livre ? " Modo autor: navegação livre." : " Modo aluno: “Próximo” só libera depois de responder."}
            </p>
          </div>
        </div>
        <SituacaoScorm />
      </div>
    </aside>
  );
}

function SituacaoScorm() {
  const s = useSyncExternalStore(mockScorm.subscribe, mockScorm.situacao);
  const tam = s.suspendData.length;
  const pct = Math.min(100, (tam / LIMITE_SUSPEND_DATA) * 100);
  const loc = s.lessonLocation === "" ? null : Number(s.lessonLocation);
  return (
    <details className="situacao-scorm">
      <summary>Situação SCORM</summary>
      <p className="ajuda">
        Simulação do Moodle: o que o pacote gravaria para um aluno. {s.conectado ? "LMS simulado conectado." : "LMS simulado desconectado."}
      </p>
      <dl>
        <dt>Situação (lesson_status)</dt>
        <dd>
          <code>{s.lessonStatus}</code> {STATUS_PT[s.lessonStatus] ? `(${STATUS_PT[s.lessonStatus]})` : ""}
        </dd>
        <dt>Onde parou (lesson_location)</dt>
        <dd>{loc === null || Number.isNaN(loc) ? "—" : `tela ${loc + 1}`}</dd>
        <dt>Progresso salvo (suspend_data)</dt>
        <dd>
          <span className="barra-suspend" aria-hidden="true">
            <span className={pct > 90 ? "cheia" : undefined} style={{ width: `${pct}%` }} />
          </span>
          {tam} de {LIMITE_SUSPEND_DATA} caracteres
        </dd>
        <dt>Interações gravadas</dt>
        <dd>{s.interacoes}</dd>
        <dt>Última gravação</dt>
        <dd>{s.ultimaGravacao ? new Date(s.ultimaGravacao).toLocaleTimeString("pt-BR") : "nenhuma"}</dd>
      </dl>
    </details>
  );
}
