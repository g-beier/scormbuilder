import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { NOMES_BLOCO, TIPOS_BLOCO, type TipoBloco } from "../modelo/tipos";
import { DESCRICOES_BLOCO } from "./blocos";
import { Icone } from "./Icones";

/** Botão "+ Adicionar bloco" que abre a lista de tipos (setas ↑↓ navegam, Esc fecha). */
export function MenuNovoBloco({ aoEscolher }: { aoEscolher(tipo: TipoBloco): void }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const lista = useRef<HTMLUListElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (aberto) lista.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [aberto]);

  function fechar(devolverFoco = true) {
    setAberto(false);
    if (devolverFoco) botao.current?.focus();
  }

  function teclas(e: KeyboardEvent) {
    const botoes = [...(lista.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
    const ir = (k: number) => {
      e.preventDefault();
      botoes[(k + botoes.length) % botoes.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      fechar();
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") ir(i + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") ir(i - 1);
    else if (e.key === "Home") ir(0);
    else if (e.key === "End") ir(botoes.length - 1);
  }

  return (
    <div className="menu-bloco">
      <button
        ref={botao}
        type="button"
        className="btn btn-adicionar-bloco"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((v) => !v)}
      >
        <Icone nome="mais" /> Adicionar bloco
      </button>
      {aberto && (
        <div className="menu-bloco-painel" onKeyDown={teclas}>
          <p className="menu-bloco-titulo">Escolha o tipo de bloco</p>
          <ul id={id} ref={lista} className="menu-bloco-lista">
            {TIPOS_BLOCO.map((t) => (
              <li key={t}>
                <button
                  type="button"
                  className="opcao-bloco"
                  onClick={() => {
                    fechar(false);
                    aoEscolher(t);
                  }}
                >
                  <span className="opcao-icone">
                    <Icone nome={t} tamanho={24} />
                  </span>
                  <span className="opcao-textos">
                    <span className="opcao-nome">{NOMES_BLOCO[t]}</span>
                    <span className="opcao-desc">{DESCRICOES_BLOCO[t]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-pequeno" onClick={() => fechar()}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
