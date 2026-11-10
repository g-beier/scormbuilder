/**
 * Diálogo "Exportar pacote": confere se há itens a corrigir, escolhe Zip
 * (para o Moodle) ou Pasta, o destino (lembrado entre sessões) e chama o
 * comando Rust `exportar_pacote`. Também oferece o atalho para a pasta do
 * repositório ead-scorm, quando ela estiver definida. Por fim, abre o "PDF da
 * leitura" (M7), a versão para o aluno baixar e guardar como registro.
 */
import { useEffect, useId, useMemo, useState } from "react";
import { Dialogo } from "./Dialogo";
import { Icone } from "./Icones";
import "./exportar.css";
import type { Projeto } from "../modelo/tipos";
import { validar } from "../modelo/validar";
import { compilarDataJs, nomePacote } from "../modelo/compilar";
import { confirmar } from "../servicos/dialogos";
import { abrirImpressao } from "../servicos/impressao";
import { emTauri, mensagemDeErro, MSG_SO_NO_APP } from "../servicos/ambiente";
import {
  escolherPasta,
  exportarPacote,
  jaExiste,
  juntarCaminho,
  lerPreferencias,
  mensagemJaExiste,
  mostrarNoFinder,
  salvarPreferencias,
  tamanhoLegivel,
  type FormatoExportacao,
  type Preferencias,
  type ResultadoExportacao,
} from "../servicos/exportacao";

export interface DialogoExportarProps {
  projeto: Projeto;
  aberto: boolean;
  aoFechar(): void;
  /** Chamado (depois de `aoFechar`) pelo botão "Ver itens a corrigir". */
  aoIrParaProblema?(): void;
}

export function DialogoExportar({ projeto, aberto, aoFechar, aoIrParaProblema }: DialogoExportarProps) {
  const idDestino = useId();
  const problemas = useMemo(() => (aberto ? validar(projeto) : []), [aberto, projeto]);
  const aCorrigir = problemas.filter((p) => p.nivel === "erro").length;
  const nome = nomePacote(projeto.meta);
  const noApp = emTauri();

  const [prefs, setPrefs] = useState<Preferencias>({});
  const [formato, setFormato] = useState<FormatoExportacao>("zip");
  const [destino, setDestino] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoExportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Ao abrir: limpa o resultado anterior e carrega as preferências.
  useEffect(() => {
    if (!aberto) return;
    setResultado(null);
    setErro(null);
    if (!noApp) return;
    let vivo = true;
    lerPreferencias()
      .then((p) => {
        if (!vivo) return;
        setPrefs(p);
        setDestino((d) => d ?? p.ultimoDestino ?? null);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [aberto, noApp]);

  async function guardarPrefs(novas: Preferencias) {
    setPrefs(novas);
    try {
      await salvarPreferencias(novas);
    } catch {
      // Preferência não salva não impede exportar.
    }
  }

  async function exportar(pastaMae: string, fmt: FormatoExportacao, lembrarDestino: boolean) {
    if (exportando) return;
    setExportando(true);
    setErro(null);
    setResultado(null);
    const entrada = { nomePacote: nome, titulo: projeto.meta.titulo, dataJs: compilarDataJs(projeto) };
    try {
      let r: ResultadoExportacao;
      try {
        r = await exportarPacote(entrada, pastaMae, fmt, false);
      } catch (e) {
        if (!jaExiste(e)) throw e;
        const ok = await confirmar(mensagemJaExiste(e), { titulo: "Substituir pacote?", botaoOk: "Substituir" });
        if (!ok) return;
        r = await exportarPacote(entrada, pastaMae, fmt, true);
      }
      setResultado(r);
      if (lembrarDestino && prefs.ultimoDestino !== pastaMae) {
        void guardarPrefs({ ...prefs, ultimoDestino: pastaMae });
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setExportando(false);
    }
  }

  async function escolherDestino() {
    try {
      const p = await escolherPasta("Escolha onde salvar o pacote", destino ?? undefined);
      if (p) {
        setDestino(p);
        setResultado(null);
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  async function definirEadScorm() {
    try {
      const p = await escolherPasta("Escolha a pasta do repositório ead-scorm", prefs.pastaEadScorm);
      if (p) await guardarPrefs({ ...prefs, pastaEadScorm: p });
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  const bloqueado = aCorrigir > 0;
  const podeExportar = noApp && !bloqueado && !!destino && !exportando;
  const alvo = destino ? juntarCaminho(destino, formato === "zip" ? `${nome}.zip` : nome) : null;

  const rodape = bloqueado ? (
    <button type="button" className="btn" onClick={aoFechar}>
      Fechar
    </button>
  ) : (
    <>
      <button type="button" className="btn" onClick={aoFechar}>
        {resultado ? "Concluir" : "Cancelar"}
      </button>
      <button
        type="button"
        className="btn btn-primario"
        aria-disabled={!podeExportar}
        onClick={() => podeExportar && destino && void exportar(destino, formato, true)}
      >
        <Icone nome="exportar" />
        {exportando ? "Exportando…" : "Exportar"}
      </button>
    </>
  );

  return (
    <Dialogo aberto={aberto} titulo="Exportar pacote" aoFechar={aoFechar} rodape={rodape}>
      {bloqueado ? (
        <div className="exportar-bloqueio">
          <p>
            <strong>
              {aCorrigir} {aCorrigir === 1 ? "item" : "itens"} a corrigir
            </strong>{" "}
            antes de exportar. Corrija e volte aqui.
          </p>
          <button
            type="button"
            className="btn btn-primario"
            data-autofoco
            onClick={() => {
              aoFechar();
              aoIrParaProblema?.();
            }}
          >
            Ver itens a corrigir
          </button>
        </div>
      ) : (
        <>
          {!noApp && <p className="nota">{MSG_SO_NO_APP}</p>}

          <p className="exportar-nome">
            Nome do pacote: <code>{nome}</code>
          </p>

          <fieldset className="exportar-formatos">
            <legend>Formato</legend>
            <label className="exportar-opcao">
              <input
                type="radio"
                name="formato-exportacao"
                value="zip"
                checked={formato === "zip"}
                onChange={() => setFormato("zip")}
                data-autofoco
              />
              <span>
                <strong>Zip para o Moodle</strong>
                <span className="ajuda">O arquivo que você envia ao Moodle.</span>
              </span>
            </label>
            <label className="exportar-opcao">
              <input
                type="radio"
                name="formato-exportacao"
                value="pasta"
                checked={formato === "pasta"}
                onChange={() => setFormato("pasta")}
              />
              <span>
                <strong>Pasta</strong>
                <span className="ajuda">Os arquivos soltos, para conferir ou guardar no repositório.</span>
              </span>
            </label>
          </fieldset>

          <div className="campo">
            <span className="rotulo" id={idDestino}>
              Salvar em
            </span>
            <div className="exportar-destino">
              <span className="exportar-caminho" aria-labelledby={idDestino}>
                {destino ?? "Nenhuma pasta escolhida"}
              </span>
              <button type="button" className="btn" onClick={() => void escolherDestino()} disabled={!noApp}>
                <Icone nome="pasta" />
                Escolher pasta…
              </button>
            </div>
            {alvo && <span className="ajuda">Vai gerar: {alvo}</span>}
          </div>

          {noApp && (
            <div className="exportar-ead">
              {prefs.pastaEadScorm ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    aria-disabled={exportando}
                    onClick={() => prefs.pastaEadScorm && void exportar(prefs.pastaEadScorm, "pasta", false)}
                  >
                    Exportar para o repositório ead-scorm
                  </button>
                  <span className="ajuda">
                    Gera a pasta {juntarCaminho(prefs.pastaEadScorm, nome)}.{" "}
                    <button type="button" className="exportar-link" onClick={() => void definirEadScorm()}>
                      Alterar pasta do ead-scorm
                    </button>
                  </span>
                </>
              ) : (
                <button type="button" className="exportar-link" onClick={() => void definirEadScorm()}>
                  Definir a pasta do repositório ead-scorm
                </button>
              )}
            </div>
          )}

          <div className="exportar-pdf">
            <p>
              <strong>PDF da leitura</strong>
              <span className="ajuda">
                Para o aluno baixar e guardar como registro. As atividades aparecem em versão para preencher à mão, sem as
                respostas; o conteúdo dos “Confira” vai para o fim. Publique o PDF no Moodle ao lado do pacote.
              </span>
            </p>
            <button
              type="button"
              className="btn"
              onClick={() =>
                void abrirImpressao(projeto).catch((e) => setErro(e instanceof Error ? e.message : mensagemDeErro(e)))
              }
            >
              <Icone nome="arquivo" />
              Abrir PDF da leitura…
            </button>
          </div>

          <div className="exportar-status" role="status" aria-live="polite">
            {exportando && <p>Exportando o pacote…</p>}
            {resultado && (
              <div className="exportar-resultado">
                <p>
                  <Icone nome="ok" /> <strong>Pacote exportado.</strong>
                </p>
                <p className="exportar-caminho">{resultado.caminho}</p>
                <p>
                  {resultado.arquivos} arquivos · {tamanhoLegivel(resultado.bytes)}
                </p>
                <button
                  type="button"
                  className="btn btn-pequeno"
                  onClick={() => void mostrarNoFinder(resultado.caminho).catch((e) => setErro(mensagemDeErro(e)))}
                >
                  Mostrar no Finder
                </button>
              </div>
            )}
          </div>
          {erro && (
            <p className="exportar-erro" role="alert">
              {erro}
            </p>
          )}
        </>
      )}
    </Dialogo>
  );
}
