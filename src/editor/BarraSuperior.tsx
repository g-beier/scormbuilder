/** Barra do editor: título, salvamento, problemas, desfazer, salvar como, exportar, início. */
import { useEffect, useId, useRef, useState } from "react";
import { useStore } from "zustand";
import type { Problema, Projeto } from "../modelo/tipos";
import { nomePacote } from "../modelo/compilar";
import { desfazer, refazer, useProjeto, useSalvamento } from "../estado/projeto";
import { emTauri } from "../servicos/ambiente";
import { Icone } from "./Icones";

export function BarraSuperior({
  projeto,
  problemas,
  aoAbrirDados,
  aoIrProblema,
  aoSalvarComo,
  aoInicio,
}: {
  projeto: Projeto;
  problemas: Problema[];
  aoAbrirDados(): void;
  aoIrProblema(p: Problema): void;
  aoSalvarComo(): void;
  aoInicio(): void;
}) {
  const atualizarMeta = useProjeto((s) => s.atualizarMeta);
  const podeDesfazer = useStore(useProjeto.temporal, (s) => s.pastStates.length > 0);
  const podeRefazer = useStore(useProjeto.temporal, (s) => s.futureStates.length > 0);
  const idTitulo = useId();

  return (
    <header className="barra-superior">
      <button type="button" className="btn btn-fantasma" onClick={aoInicio}>
        <Icone nome="inicio" /> Início
      </button>

      <div className="barra-titulo">
        <label htmlFor={idTitulo} className="so-leitor">
          Título da atividade
        </label>
        <input
          id={idTitulo}
          className="input-titulo"
          type="text"
          value={projeto.meta.titulo}
          placeholder="Atividade sem título"
          data-foco="meta|titulo"
          onChange={(e) => atualizarMeta({ titulo: e.target.value }, "meta/titulo")}
        />
        <button type="button" className="btn btn-pequeno btn-fantasma" onClick={aoAbrirDados} title="Curso, UD, tipo e número">
          <code>{nomePacote(projeto.meta)}</code>
          <span className="so-leitor">: editar dados do pacote</span>
        </button>
      </div>

      <IndicadorSalvamento />

      <div className="barra-grupo" role="group" aria-label="Histórico">
        <button
          type="button"
          className="btn-icone"
          aria-label="Desfazer (⌘Z)"
          title="Desfazer (⌘Z)"
          disabled={!podeDesfazer}
          onClick={desfazer}
        >
          <Icone nome="desfazer" />
        </button>
        <button
          type="button"
          className="btn-icone"
          aria-label="Refazer (⌘⇧Z)"
          title="Refazer (⌘⇧Z)"
          disabled={!podeRefazer}
          onClick={refazer}
        >
          <Icone nome="refazer" />
        </button>
      </div>

      <BotaoProblemas problemas={problemas} aoIr={aoIrProblema} />

      <div className="barra-grupo">
        <button type="button" className="btn" onClick={aoSalvarComo}>
          <Icone nome="salvar" /> Salvar como…
        </button>
        <button
          type="button"
          className="btn btn-primario"
          aria-disabled="true"
          aria-describedby={`${idTitulo}-exportar`}
          onClick={(e) => e.preventDefault()}
        >
          <Icone nome="exportar" /> Exportar
        </button>
        <span id={`${idTitulo}-exportar`} className="dica-em-breve">
          em breve
        </span>
      </div>
    </header>
  );
}

function IndicadorSalvamento() {
  const { estado, erro, salvoEm } = useSalvamento();
  let texto: string;
  let classe = estado as string;
  if (!emTauri()) {
    texto = "Sem salvamento (navegador)";
    classe = "erro";
  } else if (estado === "salvando") texto = "Salvando…";
  else if (estado === "pendente") texto = "Salvando…";
  else if (estado === "erro") texto = "Erro ao salvar";
  else texto = salvoEm ? `Salvo às ${new Date(salvoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "Salvo";
  return (
    <p className={`indicador-salvamento ${classe}`} role="status" aria-live="polite" title={erro}>
      <Icone nome={classe === "erro" ? "erro" : estado === "salvo" ? "ok" : "salvar"} tamanho={16} />
      {texto}
      {estado === "erro" && erro && emTauri() && <span className="so-leitor">: {erro}</span>}
    </p>
  );
}

function BotaoProblemas({ problemas, aoIr }: { problemas: Problema[]; aoIr(p: Problema): void }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const erros = problemas.filter((p) => p.nivel === "erro").length;
  const avisos = problemas.length - erros;

  useEffect(() => {
    if (!aberto) return;
    raiz.current?.querySelector<HTMLElement>(".problemas-lista button, .problemas-vazio")?.focus();
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const resumo =
    problemas.length === 0
      ? "Nenhum problema"
      : [erros && `${erros} ${erros === 1 ? "erro" : "erros"}`, avisos && `${avisos} ${avisos === 1 ? "aviso" : "avisos"}`]
          .filter(Boolean)
          .join(" · ");

  return (
    <div
      className="problemas"
      ref={raiz}
      onKeyDown={(e) => {
        if (e.key === "Escape" && aberto) {
          e.preventDefault();
          e.stopPropagation();
          setAberto(false);
          botao.current?.focus();
        }
      }}
    >
      <button
        ref={botao}
        type="button"
        className={`btn btn-problemas${erros ? " com-erros" : avisos ? " com-avisos" : " sem-problemas"}`}
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
      >
        <Icone nome={erros ? "erro" : avisos ? "alerta" : "ok"} />
        {resumo}
      </button>
      {aberto && (
        <div id={id} className="problemas-painel">
          <h2 className="problemas-titulo">Antes de exportar</h2>
          <p className="ajuda">Erros impedem a exportação; avisos não. Clique num item para ir até o campo.</p>
          {problemas.length === 0 ? (
            <p className="problemas-vazio" tabIndex={-1}>
              Tudo certo por aqui.
            </p>
          ) : (
            <ul className="problemas-lista">
              {problemas.map((p, i) => (
                <li key={i} className={`problema problema-${p.nivel}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setAberto(false);
                      aoIr(p);
                    }}
                  >
                    <Icone nome={p.nivel === "erro" ? "erro" : "alerta"} tamanho={18} />
                    <span>
                      <span className="so-leitor">{p.nivel === "erro" ? "Erro: " : "Aviso: "}</span>
                      {p.mensagem}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
