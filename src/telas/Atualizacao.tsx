/**
 * Aviso de versão nova do app, só na tela Início.
 *
 * Ao montar, procura uma atualização em silêncio (offline = nada aparece, só um
 * log). Se houver: "Nova versão X disponível" com "Atualizar agora" e "Agora não".
 * Ao atualizar: barra de progresso e, no fim, "Reiniciar para concluir".
 * Fora do app (npm run dev) não aparece nada.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { emTauri } from "../servicos/ambiente";
import {
  baixarEInstalar,
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
  | { tipo: "falha-instalar"; a: AtualizacaoDisponivel; mensagem: string };

/** Versão dispensada com "Agora não" nesta sessão (não volta a aparecer ao voltar ao Início). */
let dispensada: string | undefined;
/** Só para testes. */
export function _esquecerDispensa() {
  dispensada = undefined;
}

const MSG_FALHA_INSTALAR = "Não foi possível baixar a atualização. Confira a internet e tente de novo.";

export function Atualizacao({ aoMudarOcupado }: { aoMudarOcupado?(ocupado: boolean): void }) {
  const [fase, setFase] = useState<Fase>({ tipo: "nada" });
  const [versaoAtual, setVersaoAtual] = useState("");
  const montado = useRef(true);
  const noApp = emTauri();

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

  const ocupado = fase.tipo === "baixando" || fase.tipo === "pronto";
  useEffect(() => {
    aoMudarOcupado?.(ocupado);
  }, [ocupado, aoMudarOcupado]);

  if (!noApp) return null;

  async function atualizar(a: AtualizacaoDisponivel) {
    mudar({ tipo: "baixando", a, fracao: null });
    try {
      await baixarEInstalar(a, (fracao) => mudar({ tipo: "baixando", a, fracao }));
      mudar({ tipo: "pronto", a });
    } catch (e) {
      console.info("Falha ao instalar a atualização:", e);
      const texto = e instanceof Error && e.message.startsWith("Feche o projeto") ? e.message : MSG_FALHA_INSTALAR;
      mudar({ tipo: "falha-instalar", a, mensagem: texto });
    }
  }

  async function concluir(a: AtualizacaoDisponivel) {
    try {
      await reiniciar();
    } catch (e) {
      console.info("Falha ao reiniciar:", e);
      mudar({ tipo: "falha-instalar", a, mensagem: "Não foi possível reiniciar. Feche e abra o aplicativo para usar a versão nova." });
    }
  }

  function dispensar(a: AtualizacaoDisponivel) {
    dispensada = a.versao;
    mudar({ tipo: "nada" });
  }

  return (
    <div className="atualizacao">
      {/* A região viva existe desde o início, para os leitores de tela anunciarem as mudanças. */}
      <div role="status" className="atualizacao-status">
        {fase.tipo === "disponivel" && (
          <div className="atualizacao-aviso">
            <Icone nome="info" />
            <p className="atualizacao-texto">
              <strong>Nova versão {fase.a.versao} disponível.</strong> Seus rascunhos continuam salvos.
            </p>
            <div className="atualizacao-botoes">
              <button type="button" className="btn btn-primario" onClick={() => atualizar(fase.a)}>
                Atualizar agora
              </button>
              <button type="button" className="btn" onClick={() => dispensar(fase.a)}>
                Agora não
              </button>
            </div>
          </div>
        )}
        {fase.tipo === "baixando" && (
          <div className="atualizacao-aviso">
            <p className="atualizacao-texto">Baixando a versão {fase.a.versao}…</p>
            <progress
              className="atualizacao-progresso"
              aria-label={`Download da versão ${fase.a.versao}`}
              max={1}
              {...(fase.fracao === null ? {} : { value: fase.fracao })}
            />
          </div>
        )}
        {fase.tipo === "pronto" && (
          <div className="atualizacao-aviso">
            <Icone nome="ok" />
            <p className="atualizacao-texto">
              <strong>Versão {fase.a.versao} instalada.</strong> Reinicie o aplicativo para concluir.
            </p>
            <div className="atualizacao-botoes">
              <button type="button" className="btn btn-primario" onClick={() => concluir(fase.a)}>
                Reiniciar para concluir
              </button>
            </div>
          </div>
        )}
        {fase.tipo === "falha-instalar" && (
          <div className="atualizacao-aviso erro">
            <Icone nome="alerta" />
            <p className="atualizacao-texto">{fase.mensagem}</p>
            <div className="atualizacao-botoes">
              <button type="button" className="btn" onClick={() => atualizar(fase.a)}>
                Tentar de novo
              </button>
              <button type="button" className="btn" onClick={() => dispensar(fase.a)}>
                Agora não
              </button>
            </div>
          </div>
        )}
        {fase.tipo === "procurando" && <p className="atualizacao-linha">Procurando atualizações…</p>}
        {fase.tipo === "em-dia" && <p className="atualizacao-linha">Você já tem a versão mais recente.</p>}
        {fase.tipo === "falha-busca" && (
          <p className="atualizacao-linha">Não foi possível procurar atualizações agora. Confira a internet e tente de novo.</p>
        )}
      </div>
      {!ocupado && fase.tipo !== "disponivel" && fase.tipo !== "falha-instalar" && (
        <p className="atualizacao-versao">
          {versaoAtual && <span>Versão {versaoAtual}</span>}
          <button
            type="button"
            className="btn btn-fantasma btn-pequeno"
            onClick={() => procurar(true)}
            disabled={fase.tipo === "procurando"}
          >
            Procurar atualizações
          </button>
        </p>
      )}
    </div>
  );
}
