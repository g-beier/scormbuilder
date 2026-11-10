/** Barra do editor: título, salvamento, problemas, desfazer, salvar como, exportar, início. */
import { useEffect, useId, useRef, useState } from "react";
import { useStore } from "zustand";
import type { Problema, Projeto } from "../modelo/tipos";
import { nomePacoteExibicao } from "../modelo/compilar";
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
      <h1 className="so-leitor">{projeto.meta.titulo.trim() || "Atividade sem título"}: editor</h1>
      <button type="button" className="btn btn-fantasma btn-inicio" onClick={aoInicio} title="Início">
        <Icone nome="inicio" /> <span className="rotulo-largo">Início</span>
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
        <button
          type="button"
          className="btn btn-pequeno btn-fantasma btn-pacote"
          onClick={aoAbrirDados}
          title={`Dados do pacote: ${nomePacoteExibicao(projeto.meta)} (curso, UD, tipo e número)`}
        >
          <Icone nome="pasta" tamanho={16} />
          Pacote<span className="pacote-codigo">: <code>{nomePacoteExibicao(projeto.meta)}</code></span>
          <span className="so-leitor">, editar dados do pacote</span>
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

      <BotaoProblemas problemas={problemas} telas={projeto.slides.map((s) => s.id)} aoIr={aoIrProblema} />

      <div className="barra-grupo">
        <button type="button" className="btn btn-salvar-como" onClick={aoSalvarComo} title="Salvar como…">
          <Icone nome="salvar" /> <span className="rotulo-largo">Salvar como…</span>
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
    <p className={`indicador-salvamento ${classe}`} role="status" aria-live="polite" title={erro ? `${texto}: ${erro}` : texto}>
      <Icone nome={classe === "erro" ? "erro" : estado === "salvo" ? "ok" : "salvar"} tamanho={16} />
      <span className="indicador-texto">{texto}</span>
      {estado === "erro" && erro && emTauri() && <span className="so-leitor">: {erro}</span>}
    </p>
  );
}

interface GrupoProblemas {
  chave: string;
  titulo: string;
  itens: Array<{ p: Problema; texto: string }>;
}

/** Agrupa por tela, na ordem das telas; o que não é de uma tela vai para "Atividade", no início. */
function agruparPorTela(problemas: Problema[], telas: string[]): GrupoProblemas[] {
  const grupos = new Map<string, GrupoProblemas>();
  for (const p of problemas) {
    const i = p.slideId ? telas.indexOf(p.slideId) : -1;
    const chave = i >= 0 ? `t${i}` : "geral";
    if (!grupos.has(chave)) grupos.set(chave, { chave, titulo: i >= 0 ? `Tela ${i + 1}` : "Atividade", itens: [] });
    // O subtítulo já diz a tela: tira o "Tela n: " do começo.
    const sem = p.mensagem.replace(/^Tela \d+: /, "");
    grupos.get(chave)!.itens.push({ p, texto: sem.charAt(0).toUpperCase() + sem.slice(1) });
  }
  const ordem = (c: string) => (c === "geral" ? -1 : Number(c.slice(1)));
  return [...grupos.values()].sort((a, b) => ordem(a.chave) - ordem(b.chave));
}

function BotaoProblemas({ problemas, telas, aoIr }: { problemas: Problema[]; telas: string[]; aoIr(p: Problema): void }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const erros = problemas.filter((p) => p.nivel === "erro").length;
  const avisos = problemas.length - erros;

  useEffect(() => {
    if (!aberto) return;
    raiz.current?.querySelector<HTMLElement>(".problemas-lista button, .problemas-vazio")?.focus();
    // Clique fora fecha (o foco que sai do painel é tratado no onBlur).
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const resumo =
    problemas.length === 0
      ? "Nenhum problema"
      : [erros && `${erros} a corrigir`, avisos && `${avisos} ${avisos === 1 ? "aviso" : "avisos"}`].filter(Boolean).join(" · ");
  const grupos = agruparPorTela(problemas, telas);

  return (
    <div
      className="problemas"
      ref={raiz}
      onBlur={(e) => {
        // Tab para fora do painel (ou do botão) fecha, como o clique fora.
        if (aberto && !raiz.current?.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
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
        <div id={id} className="problemas-painel" tabIndex={-1}>
          <h2 className="problemas-titulo">Antes de exportar</h2>
          <p className="ajuda">Itens a corrigir impedem a exportação; avisos não. Escolha um item para ir até o campo.</p>
          {problemas.length === 0 ? (
            <p className="problemas-vazio" tabIndex={-1}>
              Tudo certo por aqui.
            </p>
          ) : (
            grupos.map((g) => (
              <section key={g.chave} className="problemas-grupo" aria-labelledby={`${id}-${g.chave}`}>
                <h3 id={`${id}-${g.chave}`} className="problemas-subtitulo">
                  {g.titulo}
                </h3>
                <ul className="problemas-lista">
                  {g.itens.map(({ p, texto }, i) => (
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
                          <span className="so-leitor">{p.nivel === "erro" ? "A corrigir: " : "Aviso: "}</span>
                          {texto}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
