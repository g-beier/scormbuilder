/**
 * Aviso de versão nova do app, só na tela Início.
 *
 * Ao montar, procura uma atualização em silêncio (offline = nada aparece, só um
 * log). Se houver: "Nova versão X disponível" com "Atualizar agora" e "Agora não".
 * Ao atualizar: barra de progresso e, no fim, "Reiniciar agora".
 * Fora do app (npm run dev) não aparece nada.
 *
 * Acessibilidade: a região viva (`role="status"`) existe desde o início e só
 * recebe uma frase curta por estado; botões e barra ficam fora dela. Erros de
 * instalação e de reinício vão em `role="alert"`. Nenhuma troca de estado deixa
 * o foco cair no `body`.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { emTauri } from "../servicos/ambiente";
import {
  baixarEInstalar,
  ErroProjetoAberto,
  procurarAtualizacao,
  reiniciar,
  type AtualizacaoDisponivel,
} from "../servicos/atualizacao";
import { Icone } from "../editor/Icones";

type Fase =
  | { tipo: "nada" }
  | { tipo: "procurando" }
  | { tipo: "em-dia" }
  | { tipo: "falha-busca" }
  | { tipo: "disponivel"; a: AtualizacaoDisponivel }
  | { tipo: "baixando"; a: AtualizacaoDisponivel; fracao: number | null }
  | { tipo: "pronto"; a: AtualizacaoDisponivel }
  | { tipo: "falha-instalar"; a: AtualizacaoDisponivel; mensagem: string }
  | { tipo: "falha-reiniciar"; a: AtualizacaoDisponivel; mensagem: string };

/**
 * O que a atualização impede na tela Início: `baixando` = não abrir projetos até
 * terminar; `reiniciar` = já instalada, falta reiniciar. `null` = nada.
 */
export type BloqueioAtualizacao = "baixando" | "reiniciar" | null;

/** Versão dispensada com "Agora não" nesta sessão (não volta a aparecer ao voltar ao Início). */
let dispensada: string | undefined;
/** Só para testes. */
export function _esquecerDispensa() {
  dispensada = undefined;
}

const MSG_FALHA_BAIXAR =
  "Não foi possível baixar a atualização. Confira a internet e tente de novo. Seus rascunhos continuam salvos.";
const MSG_FALHA_REINICIAR = "Não foi possível reiniciar. Feche e abra o aplicativo para usar a versão nova.";

function mensagemDe(e: unknown, padrao: string) {
  return e instanceof ErroProjetoAberto ? e.message : padrao;
}

export function Atualizacao({
  aoMudarBloqueio,
  focoAoDispensar,
}: {
  aoMudarBloqueio?(bloqueio: BloqueioAtualizacao): void;
  /** Para onde o foco volta quando o aviso some com "Agora não" (ex.: o título da tela). */
  focoAoDispensar?: RefObject<HTMLElement | null>;
}) {
  const [fase, setFase] = useState<Fase>({ tipo: "nada" });
  const [versaoAtual, setVersaoAtual] = useState("");
  const montado = useRef(true);
  const noApp = emTauri();

  const blocoRef = useRef<HTMLDivElement>(null);
  const atualizarRef = useRef<HTMLButtonElement>(null);
  const reiniciarRef = useRef<HTMLButtonElement>(null);
  const tentarRef = useRef<HTMLButtonElement>(null);
  /** A troca de fase veio de uma ação do usuário: se o foco cair no body, ele é recolocado. */
  const acaoDoUsuario = useRef(false);

  const mudar = useCallback((f: Fase) => {
    if (montado.current) setFase(f);
  }, []);

  const procurar = useCallback(
    async (manual: boolean) => {
      if (manual) mudar({ tipo: "procurando" });
      try {
        const a = await procurarAtualizacao();
        if (a && (manual || a.versao !== dispensada)) mudar({ tipo: "disponivel", a });
        else mudar(manual ? { tipo: "em-dia" } : { tipo: "nada" });
      } catch (e) {
        // Sem internet ou servidor fora do ar: na checagem automática, só um log.
        console.info("Não foi possível procurar atualizações:", e);
        mudar(manual ? { tipo: "falha-busca" } : { tipo: "nada" });
      }
    },
    [mudar],
  );

  useEffect(() => {
    montado.current = true;
    if (!noApp) return;
    getVersion().then(
      (v) => montado.current && setVersaoAtual(v),
      () => {},
    );
    void procurar(false);
    return () => {
      montado.current = false;
    };
  }, [noApp, procurar]);

  const bloqueio: BloqueioAtualizacao =
    fase.tipo === "baixando" ? "baixando" : fase.tipo === "pronto" || fase.tipo === "falha-reiniciar" ? "reiniciar" : null;
  useEffect(() => {
    aoMudarBloqueio?.(bloqueio);
  }, [bloqueio, aoMudarBloqueio]);

  // Foco: só reage à troca de fase (não a cada avanço do download).
  useEffect(() => {
    const semFoco = !document.activeElement || document.activeElement === document.body;
    switch (fase.tipo) {
      case "pronto":
        reiniciarRef.current?.focus();
        break;
      case "falha-instalar":
      case "falha-reiniciar":
        tentarRef.current?.focus();
        break;
      case "baixando":
        if (semFoco) blocoRef.current?.focus();
        break;
      case "disponivel":
        if (semFoco && acaoDoUsuario.current) atualizarRef.current?.focus();
        break;
    }
    acaoDoUsuario.current = false;
  }, [fase.tipo]);

  if (!noApp) return null;

  async function atualizar(a: AtualizacaoDisponivel) {
    acaoDoUsuario.current = true;
    mudar({ tipo: "baixando", a, fracao: null });
    let ultima: number | null = null;
    try {
      await baixarEInstalar(a, (fracao) => {
        // Arredonda em 1% para não redesenhar a cada pedaço baixado.
        const f = fracao === null ? null : Math.floor(fracao * 100) / 100;
        if (f === ultima) return;
        ultima = f;
        mudar({ tipo: "baixando", a, fracao: f });
      });
      mudar({ tipo: "pronto", a });
    } catch (e) {
      console.info("Falha ao instalar a atualização:", e);
      mudar({ tipo: "falha-instalar", a, mensagem: mensagemDe(e, MSG_FALHA_BAIXAR) });
    }
  }

  async function concluir(a: AtualizacaoDisponivel) {
    try {
      await reiniciar();
    } catch (e) {
      console.info("Falha ao reiniciar:", e);
      mudar({ tipo: "falha-reiniciar", a, mensagem: mensagemDe(e, MSG_FALHA_REINICIAR) });
    }
  }

  function dispensar(a: AtualizacaoDisponivel) {
    dispensada = a.versao;
    mudar({ tipo: "nada" });
    focoAoDispensar?.current?.focus();
  }

  function procurarManual() {
    if (fase.tipo === "procurando") return;
    acaoDoUsuario.current = true;
    void procurar(true);
  }

  // Uma frase curta por estado, a única coisa anunciada pela região viva.
  let frase = "";
  let fraseOculta = false;
  switch (fase.tipo) {
    case "disponivel":
      frase = `Nova versão ${fase.a.versao} disponível.`;
      break;
    case "baixando":
      // O texto visível é o do progresso (fora da região viva); aqui só o anúncio inicial.
      frase = `Baixando a versão ${fase.a.versao}.`;
      fraseOculta = true;
      break;
    case "pronto":
      frase = "Atualização instalada. Reinicie o aplicativo para usar a versão nova.";
      break;
    case "procurando":
      frase = "Procurando atualizações…";
      break;
    case "em-dia":
      frase = "Você já tem a versão mais recente.";
      break;
    case "falha-busca":
      frase = "Não foi possível procurar atualizações agora. Confira a internet e tente de novo.";
      break;
  }

  const temAviso = fase.tipo !== "nada" && fase.tipo !== "procurando" && fase.tipo !== "em-dia" && fase.tipo !== "falha-busca";
  const erro = fase.tipo === "falha-instalar" || fase.tipo === "falha-reiniciar";
  const icone = fase.tipo === "disponivel" ? "info" : fase.tipo === "pronto" ? "ok" : erro ? "alerta" : null;
  const atual = (fase.tipo === "disponivel" && fase.a.atual) || versaoAtual;
  const pct = fase.tipo === "baixando" && fase.fracao !== null ? Math.floor(fase.fracao * 10) * 10 : null;
  const mostrarVersao = !bloqueio && fase.tipo !== "disponivel" && fase.tipo !== "falha-instalar";

  return (
    <div className="atualizacao">
      <div
        ref={blocoRef}
        tabIndex={-1}
        className={temAviso ? `atualizacao-aviso${erro ? " erro" : ""}` : "atualizacao-sem-aviso"}
      >
        {icone && <Icone nome={icone} />}
        <div className="atualizacao-texto">
          {/* A região viva existe desde o início, para os leitores de tela anunciarem as mudanças. */}
          <p role="status" className={temAviso ? "atualizacao-frase" : "atualizacao-linha"}>
            {fraseOculta ? <span className="so-leitor">{frase}</span> : frase}
          </p>
          {fase.tipo === "disponivel" && (
            <p>
              {atual ? `Você tem a versão ${atual}. ` : ""}Seus rascunhos continuam salvos.
            </p>
          )}
          {erro && (
            <p role="alert" className="atualizacao-frase">
              {fase.mensagem}
            </p>
          )}
          {fase.tipo === "baixando" && (
            <>
              <p id="atualizacao-progresso-texto" className="atualizacao-frase">
                Baixando a versão {fase.a.versao}…{pct !== null && ` ${pct}%`}
              </p>
              <progress
                className="atualizacao-progresso"
                aria-labelledby="atualizacao-progresso-texto"
                max={1}
                {...(fase.fracao === null ? {} : { value: fase.fracao })}
              />
              <p>Não feche o aplicativo até terminar.</p>
            </>
          )}
        </div>
        {fase.tipo === "disponivel" && (
          <div className="atualizacao-botoes">
            <button ref={atualizarRef} type="button" className="btn btn-primario" onClick={() => atualizar(fase.a)}>
              Atualizar agora
            </button>
            <button type="button" className="btn" onClick={() => dispensar(fase.a)}>
              Agora não
            </button>
          </div>
        )}
        {fase.tipo === "pronto" && (
          <div className="atualizacao-botoes">
            <button ref={reiniciarRef} type="button" className="btn btn-primario" onClick={() => concluir(fase.a)}>
              Reiniciar agora
            </button>
          </div>
        )}
        {fase.tipo === "falha-instalar" && (
          <div className="atualizacao-botoes">
            <button ref={tentarRef} type="button" className="btn" onClick={() => atualizar(fase.a)}>
              Tentar de novo
            </button>
            <button type="button" className="btn" onClick={() => dispensar(fase.a)}>
              Agora não
            </button>
          </div>
        )}
        {fase.tipo === "falha-reiniciar" && (
          <div className="atualizacao-botoes">
            <button ref={tentarRef} type="button" className="btn btn-primario" onClick={() => concluir(fase.a)}>
              Tentar reiniciar de novo
            </button>
          </div>
        )}
      </div>
      {mostrarVersao && (
        <p className="atualizacao-versao">
          {versaoAtual && <span>Versão {versaoAtual}</span>}
          <button
            type="button"
            className="btn btn-fantasma btn-pequeno"
            onClick={procurarManual}
            aria-disabled={fase.tipo === "procurando" || undefined}
          >
            Procurar atualizações
          </button>
        </p>
      )}
    </div>
  );
}
