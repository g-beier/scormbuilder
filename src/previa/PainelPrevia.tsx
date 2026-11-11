/**
 * Prévia ao vivo: o motor real (`runtime/`, servido em /runtime/) num iframe `srcdoc`
 * isolado (`sandbox` sem `allow-same-origin`), com o CONTEUDO compilado inline.
 * O LMS simulado fica no app e conversa com o iframe só por `postMessage`
 * (ver montarSrcdoc.ts, ponteScorm.ts e public/previa/ponte.js).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import modeloIndex from "../../runtime/index.html?raw";
import { compilarConteudo } from "../modelo/compilar";
import { imagensDoConteudo } from "../modelo/imagens";
import { urlsDasImagens, urlsEmCache } from "../servicos/imagens";
import type { Projeto } from "../modelo/tipos";
import { Icone } from "../editor/Icones";
import { LIMITE_SUSPEND_DATA, mockScorm } from "./apiScorm";
import { montarSrcdoc } from "./montarSrcdoc";
import { criarPonteScorm, lerMensagem, pedidoIr } from "./ponteScorm";
import { CSS_PREVIA } from "./recursos";

export interface PropsPainelPrevia {
  projeto: Projeto;
  slideSelecionadoId: string | null;
  /** Muda a cada clique numa tela da lista, mesmo na já selecionada. */
  selecaoN?: number;
  recolhido: boolean;
  aoAlternar(): void;
}

/** Ponte única do app com o iframe da prévia (sessões do LMS simulado). */
const ponte = criarPonteScorm(mockScorm);

/** Sem resposta do motor depois de carregar o iframe: a prévia não abriu. */
const ESPERA_MOTOR_MS = 3000;

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

function urlPonte(): string {
  return new URL("/previa/ponte.js", window.location.href).href;
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
  /** Sessão da carga atual do iframe; mensagens de outras cargas não mudam o estado da tela. */
  const sessaoAtual = useRef<string | null>(null);
  /** Tela mostrada agora pelo motor (null = ainda não abriu). */
  const telaAtual = useRef<number | null>(null);
  /** Pedido "ir" em andamento: número e id da tela pedida. */
  const pedidoAtual = useRef<{ n: number; id: string } | null>(null);
  const pedidos = useRef(0);
  const esperaMotor = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ---------- Imagens (data: URLs lidas do rascunho) ----------
  // A prévia só recarrega quando as imagens do conteúdo já estão prontas: enquanto
  // a leitura não termina, o iframe continua mostrando a versão anterior (sem piscar).
  // Fora do app (npm run dev) nada é lido e o motor mostra "Imagem não carregada".
  const [carga, setCarga] = useState<{ entrada: string; imagens: Record<string, string> } | null>(null);
  useEffect(() => {
    const { conteudo } = JSON.parse(entradaEstavel) as { conteudo: ReturnType<typeof compilarConteudo> };
    const nomes = imagensDoConteudo(conteudo);
    const prontas = urlsEmCache(projeto.id, nomes);
    if (prontas) {
      setCarga({ entrada: entradaEstavel, imagens: prontas });
      return;
    }
    let vivo = true;
    urlsDasImagens(projeto.id, nomes).then((imagens) => {
      if (vivo) setCarga({ entrada: entradaEstavel, imagens });
    });
    return () => {
      vivo = false;
    };
  }, [entradaEstavel, projeto.id]);

  const pararEspera = useCallback(() => {
    if (esperaMotor.current) clearTimeout(esperaMotor.current);
    esperaMotor.current = null;
  }, []);

  // ---------- Mensagens do iframe ----------
  useEffect(() => {
    const receber = (e: MessageEvent) => {
      // Só o iframe da prévia; a origem é opaca ("null"), então vale a identidade da janela.
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const m = lerMensagem(e.data);
      if (!m) return;
      if (m.tipo === "scorm") {
        ponte.repassar(m);
        return;
      }
      if (m.sessao !== sessaoAtual.current) return;
      switch (m.tipo) {
        case "pronto":
          pararEspera();
          telaAtual.current = m.tela;
          setFalha(null);
          break;
        case "falha":
          pararEspera();
          telaAtual.current = null;
          setFalha(m.mensagem || "O motor não conseguiu abrir a atividade.");
          break;
        case "tela": {
          telaAtual.current = m.tela;
          const pedido = pedidoAtual.current;
          if (m.pedido === undefined || !pedido || m.pedido !== pedido.n) break;
          pedidoAtual.current = null;
          if (idsCarregados.current[m.tela] !== pedido.id) {
            // Modo aluno bloqueou o salto: recarrega já na tela pedida.
            pendenteId.current = pedido.id;
            setRecargas((n) => n + 1);
          }
          break;
        }
      }
    };
    window.addEventListener("message", receber);
    return () => window.removeEventListener("message", receber);
  }, [pararEspera]);

  // ---------- Monta e (re)carrega o iframe ----------
  useEffect(() => {
    if (!carga) return;
    const { titulo, conteudo } = JSON.parse(carga.entrada) as { titulo: string; conteudo: ReturnType<typeof compilarConteudo> };
    const ids = conteudo.slides.map((s) => s.id);

    // Tela a manter: a pedida pelo editor, senão a que está na prévia agora (pelo id da tela).
    let tela = 0;
    const atual = telaAtual.current;
    const atualId = atual !== null ? idsCarregados.current[atual] : undefined;
    const alvoId = pendenteId.current ?? atualId;
    pendenteId.current = null;
    if (alvoId && ids.includes(alvoId)) tela = ids.indexOf(alvoId);
    else if (atual !== null) tela = Math.min(atual, Math.max(0, ids.length - 1));

    const { sessao, estado } = ponte.abrirSessao(chave);
    let html: string;
    try {
      html = montarSrcdoc(modeloIndex, {
        base: urlRuntime(),
        ponte: urlPonte(),
        css: CSS_PREVIA,
        titulo,
        conteudo,
        chave,
        telaInicial: tela,
        livre,
        sessao,
        scorm: estado,
        imagens: carga.imagens,
      });
    } catch (e) {
      setFalha(String((e as Error).message ?? e));
      return;
    }
    mockScorm.observar(chave);
    sessaoAtual.current = sessao;
    telaAtual.current = null;
    pedidoAtual.current = null;
    idsCarregados.current = ids;
    contador.current += 1;
    // O comentário com o contador garante que o iframe recarrega mesmo com o mesmo conteúdo.
    setSrcdoc(`${html}<!-- carga ${contador.current} -->`);
  }, [carga, livre, chave, recargas]);

  useEffect(
    () => () => {
      pararEspera();
      sessaoAtual.current = null;
      mockScorm.observar(null);
    },
    [pararEspera],
  );

  function aoCarregar() {
    // O "pronto" (ou "falha") da ponte chega por mensagem; sem nada, a prévia não abriu.
    if (telaAtual.current !== null || !srcdoc) return;
    pararEspera();
    const sessao = sessaoAtual.current;
    esperaMotor.current = setTimeout(() => {
      if (sessaoAtual.current === sessao && telaAtual.current === null) setFalha("O motor não conseguiu abrir a atividade.");
    }, ESPERA_MOTOR_MS);
  }

  // ---------- Ao selecionar uma tela no editor, salta para ela ----------
  useEffect(() => {
    if (!slideSelecionadoId) return;
    const i = idsCarregados.current.indexOf(slideSelecionadoId);
    const janela = iframeRef.current?.contentWindow;
    if (telaAtual.current === null || i < 0 || !janela) {
      // Ainda não carregou (ou a tela é nova): vale para a próxima carga.
      pendenteId.current = slideSelecionadoId;
      return;
    }
    if (telaAtual.current === i) return;
    pedidos.current += 1;
    pedidoAtual.current = { n: pedidos.current, id: slideSelecionadoId };
    // Origem opaca: o destino só pode ser "*"; o pedido não leva nada sigiloso.
    janela.postMessage(pedidoIr(i, pedidos.current), "*");
  }, [slideSelecionadoId, selecaoN]);

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
    // O iframe isolado não tem localStorage: todo o progresso está no LMS simulado.
    mockScorm.reiniciar(chave);
    setRecargas((n) => n + 1);
  }

  const n = projeto.slides.findIndex((s) => s.id === slideSelecionadoId);

  return (
    <aside className="painel-previa" aria-label="Prévia" hidden={recolhido}>
      <div className="previa-cabecalho">
        <h2 className="coluna-titulo">Prévia</h2>
        <button
          type="button"
          className="btn btn-pequeno previa-esconder"
          aria-controls={id}
          title="A edição passa a ocupar a largura toda. Para voltar, use “Mostrar prévia” na faixa de telas."
          onClick={aoAlternar}
        >
          <Icone nome="previa" tamanho={16} /> Esconder prévia
        </button>
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
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
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
