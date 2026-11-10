/** Tela inicial: novo SCORM, rascunhos recentes, abrir arquivo e importar pacote. */
import { useCallback, useEffect, useState } from "react";
import type { Meta, Projeto } from "../modelo/tipos";
import { metaVazia, novoProjeto } from "../modelo/fabrica";
import { importarDataJs } from "../modelo/importar";
import { abrirArquivo, abrirRascunho, excluirRascunho, listarRascunhos, type ResumoRascunho } from "../servicos/rascunhos";
import { lerDataJs, nomeDaPasta } from "../servicos/importacao";
import { confirmar, escolherArquivoCevscorm, escolherPastaPacote } from "../servicos/dialogos";
import { emTauri, mensagemDeErro, MSG_SO_NO_APP } from "../servicos/ambiente";
import { avisar } from "../estado/avisos";
import { editadoHa } from "../util/tempo";
import { Dialogo } from "../editor/Dialogo";
import { FormMeta, sugerirContexto } from "../editor/FormMeta";
import { Icone } from "../editor/Icones";

export interface OpcoesAbrir {
  /** Projeto ainda sem rascunho em disco (novo ou importado): salvar já. */
  novo?: boolean;
}

export function Inicio({ aoAbrir }: { aoAbrir(projeto: Projeto, opcoes?: OpcoesAbrir): void }) {
  const [rascunhos, setRascunhos] = useState<ResumoRascunho[] | null>(null);
  const [erroLista, setErroLista] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!emTauri()) {
      setRascunhos([]);
      setErroLista(MSG_SO_NO_APP);
      return;
    }
    try {
      setRascunhos(await listarRascunhos());
      setErroLista("");
    } catch (e) {
      setRascunhos([]);
      setErroLista(mensagemDeErro(e));
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function tentar(acao: () => Promise<void>, falha: string) {
    setOcupado(true);
    try {
      await acao();
    } catch (e) {
      avisar(`${falha} ${mensagemDeErro(e)}`, "erro");
    } finally {
      setOcupado(false);
    }
  }

  const abrirDoRascunho = (r: ResumoRascunho) =>
    tentar(async () => aoAbrir(await abrirRascunho(r.id)), "Não foi possível abrir o rascunho.");

  const excluir = (r: ResumoRascunho) =>
    tentar(async () => {
      const ok = await confirmar(
        `Excluir o rascunho “${r.titulo || "Sem título"}”? Esta ação não pode ser desfeita.`,
        { titulo: "Excluir rascunho" },
      );
      if (!ok) return;
      await excluirRascunho(r.id);
      avisar("Rascunho excluído.", "ok");
      await carregar();
    }, "Não foi possível excluir o rascunho.");

  const abrirDeArquivo = () =>
    tentar(async () => {
      const caminho = await escolherArquivoCevscorm();
      if (caminho) aoAbrir(await abrirArquivo(caminho));
    }, "Não foi possível abrir o arquivo.");

  const importar = () =>
    tentar(async () => {
      const pasta = await escolherPastaPacote();
      if (!pasta) return;
      const fonte = await lerDataJs(pasta);
      const { projeto, avisos } = importarDataJs(fonte, undefined, nomeDaPasta(pasta));
      aoAbrir(projeto, { novo: true });
      if (avisos.length) avisar(`Pacote importado com ${avisos.length} ${avisos.length === 1 ? "observação" : "observações"}:`, "info", avisos);
      else avisar("Pacote importado.", "ok");
    }, "Não foi possível importar o pacote.");

  return (
    <div className="inicio">
      <header className="inicio-topo">
        <h1>SCORM Builder</h1>
        <p>Monte atividades SCORM para o Moodle do Campo Escola Virtual.</p>
      </header>

      <main className="inicio-corpo">
        <section className="inicio-acoes" aria-label="Começar">
          <button type="button" className="cartao-acao principal" onClick={() => setNovoAberto(true)}>
            <Icone nome="mais" tamanho={28} />
            <span className="cartao-acao-nome">Novo SCORM</span>
            <span className="cartao-acao-desc">Comece do zero, com capa e tela de fim prontas.</span>
          </button>
          <button type="button" className="cartao-acao" onClick={abrirDeArquivo} disabled={ocupado}>
            <Icone nome="arquivo" tamanho={28} />
            <span className="cartao-acao-nome">Abrir arquivo…</span>
            <span className="cartao-acao-desc">Um projeto salvo com “Salvar como…” (.cevscorm).</span>
          </button>
          <button type="button" className="cartao-acao" onClick={importar} disabled={ocupado}>
            <Icone nome="pasta" tamanho={28} />
            <span className="cartao-acao-nome">Importar SCORM existente…</span>
            <span className="cartao-acao-desc">Escolha a pasta de um pacote pronto (com js/data.js) para usar como ponto de partida.</span>
          </button>
        </section>

        <section className="inicio-recentes" aria-labelledby="titulo-recentes" aria-busy={rascunhos === null}>
          <h2 id="titulo-recentes">Rascunhos recentes</h2>
          {erroLista && <p className="nota">{erroLista}</p>}
          {rascunhos !== null && rascunhos.length === 0 && !erroLista && (
            <p className="vazio">Nenhum rascunho ainda. Os projetos são salvos aqui automaticamente enquanto você edita.</p>
          )}
          {rascunhos && rascunhos.length > 0 && (
            <ul className="lista-rascunhos">
              {rascunhos.map((r) => (
                <li key={r.id} className="cartao-rascunho">
                  <button type="button" className="rascunho-abrir" onClick={() => abrirDoRascunho(r)} disabled={ocupado}>
                    <span className="rascunho-titulo">{r.titulo || "Sem título"}</span>
                    <span className="rascunho-meta">
                      {[r.curso, r.ud > 0 ? `UD ${r.ud}` : ""].filter(Boolean).join(" · ") || "Curso não informado"}
                    </span>
                    <span className="rascunho-meta">
                      {r.telas} {r.telas === 1 ? "tela" : "telas"} · {editadoHa(r.atualizadoEm)}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn-icone perigo"
                    aria-label={`Excluir rascunho ${r.titulo || "sem título"}`}
                    title="Excluir"
                    onClick={() => excluir(r)}
                    disabled={ocupado}
                  >
                    <Icone nome="lixeira" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <AssistenteNovo
        aberto={novoAberto}
        aoFechar={() => setNovoAberto(false)}
        aoCriar={(meta) => {
          setNovoAberto(false);
          aoAbrir(novoProjeto(meta), { novo: true });
        }}
      />
    </div>
  );
}

function AssistenteNovo({
  aberto,
  aoFechar,
  aoCriar,
}: {
  aberto: boolean;
  aoFechar(): void;
  aoCriar(meta: Meta): void;
}) {
  const inicial = (): Meta => ({ ...metaVazia(), curso: "CTGESTAO", atividade: "LEITURA", numero: 1 });
  const [meta, setMeta] = useState<Meta>(inicial);
  const [contextoEditado, setContextoEditado] = useState(false);
  const [tentou, setTentou] = useState(false);

  useEffect(() => {
    if (aberto) {
      setMeta(inicial());
      setContextoEditado(false);
      setTentou(false);
    }
  }, [aberto]);

  function mudar(parcial: Partial<Meta>, campo: keyof Meta) {
    if (campo === "contexto") setContextoEditado(true);
    setMeta((m) => {
      const n = { ...m, ...parcial };
      if (!contextoEditado && campo !== "contexto") n.contexto = sugerirContexto(n);
      return n;
    });
  }

  const podeCriar = meta.titulo.trim() !== "";

  return (
    <Dialogo
      aberto={aberto}
      titulo="Novo SCORM"
      aoFechar={aoFechar}
      largo
      rodape={
        <>
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" form="form-novo" className="btn btn-primario" aria-disabled={!podeCriar}>
            Criar SCORM
          </button>
        </>
      }
    >
      <form
        id="form-novo"
        onSubmit={(e) => {
          e.preventDefault();
          if (!podeCriar) {
            setTentou(true);
            document.querySelector<HTMLInputElement>("#form-novo input")?.focus();
            return;
          }
          aoCriar({ ...meta, titulo: meta.titulo.trim() });
        }}
      >
        <p className="ajuda">Tudo isso pode ser mudado depois, em “Dados do pacote”.</p>
        <FormMeta meta={meta} aoMudar={mudar} autoFocar erroTitulo={tentou && !podeCriar ? "Dê um título à atividade para continuar." : undefined} />
      </form>
    </Dialogo>
  );
}
