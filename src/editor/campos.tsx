/**
 * Peças de formulário reaproveitadas pelos forms de tela e de bloco:
 * campo de texto simples, campo de texto rico, lista editável e seletor de cor.
 * Todo campo tem rótulo associado e uma ajuda curta dizendo onde aparece.
 */
import { useId, useRef, type ReactNode } from "react";
import type { Cor } from "../modelo/tipos";
import { CORES } from "../modelo/tipos";
import { TextoRico } from "./TextoRico";
import { Icone } from "./Icones";

// ---------- Campos ----------

interface PropsCampoBase {
  rotulo: string;
  ajuda?: string;
  /** Chave `data-foco` (ver foco.ts). */
  foco?: string;
}

export function CampoTexto({
  rotulo,
  ajuda,
  foco,
  valor,
  aoMudar,
  multilinha,
  placeholder,
}: PropsCampoBase & { valor: string; aoMudar(v: string): void; multilinha?: boolean; placeholder?: string }) {
  const id = useId();
  const comum = {
    id,
    value: valor ?? "",
    placeholder,
    "data-foco": foco,
    "aria-describedby": ajuda ? `${id}-ajuda` : undefined,
    spellCheck: true,
    lang: "pt-BR",
  };
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      {multilinha ? (
        <textarea {...comum} rows={3} onChange={(e) => aoMudar(e.target.value)} />
      ) : (
        <input {...comum} type="text" onChange={(e) => aoMudar(e.target.value)} />
      )}
      {ajuda && (
        <p id={`${id}-ajuda`} className="ajuda">
          {ajuda}
        </p>
      )}
    </div>
  );
}

export function CampoRico({
  rotulo,
  ajuda,
  foco,
  valor,
  aoMudar,
  inline = true,
}: PropsCampoBase & { valor: string; aoMudar(v: string): void; inline?: boolean }) {
  const id = useId();
  const editorId = `${id}-editor`;
  return (
    <div className="campo">
      {/* Rótulo de um contenteditable: aria-labelledby + clique foca o editor. */}
      <span
        id={`${id}-rotulo`}
        className="rotulo"
        onClick={() => document.getElementById(editorId)?.focus()}
      >
        {rotulo}
      </span>
      <TextoRico
        id={editorId}
        valor={valor ?? ""}
        aoMudar={aoMudar}
        rotuloId={`${id}-rotulo`}
        ajudaId={ajuda ? `${id}-ajuda` : undefined}
        foco={foco}
        inline={inline}
      />
      {ajuda && (
        <p id={`${id}-ajuda`} className="ajuda">
          {ajuda}
        </p>
      )}
    </div>
  );
}

/**
 * Número inteiro opcional. Vazio = valor padrão (mostrado no placeholder e na ajuda).
 * `aoMudar(undefined)` quando o campo é apagado.
 */
export function CampoNumero({
  rotulo,
  ajuda,
  foco,
  valor,
  padrao,
  min,
  max,
  aoMudar,
}: PropsCampoBase & {
  valor: number | undefined;
  padrao: number;
  min?: number;
  max?: number;
  aoMudar(v: number | undefined): void;
}) {
  const id = useId();
  return (
    <div className="campo campo-numero">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        step={1}
        min={min}
        max={max}
        value={valor ?? ""}
        placeholder={String(padrao)}
        data-foco={foco}
        aria-describedby={ajuda ? `${id}-ajuda` : undefined}
        onChange={(e) => {
          const t = e.target.value.trim();
          aoMudar(t === "" ? undefined : Number(t));
        }}
      />
      {ajuda && (
        <p id={`${id}-ajuda`} className="ajuda">
          {ajuda}
        </p>
      )}
    </div>
  );
}

// ---------- Lista editável ----------

export interface PropsListaEditavel<T> {
  titulo: string;
  ajuda?: string;
  itens: T[];
  /** "Parágrafo 1", "Pergunta 2"… */
  rotuloItem(i: number): string;
  render(item: T, i: number): ReactNode;
  aoAdicionar(): void;
  aoRemover(i: number): void;
  aoMover(de: number, para: number): void;
  textoAdicionar: string;
  /** Não deixa remover abaixo deste número. */
  minimo?: number;
  /** Chave data-foco da lista (o painel de problemas foca aqui se a lista estiver vazia). */
  foco?: string;
  /** Itens com cartão próprio (cards, perguntas) em vez de linha compacta. */
  emCaixa?: boolean;
}

export function ListaEditavel<T>({
  titulo,
  ajuda,
  itens,
  rotuloItem,
  render,
  aoAdicionar,
  aoRemover,
  aoMover,
  textoAdicionar,
  minimo = 0,
  foco,
  emCaixa,
}: PropsListaEditavel<T>) {
  const id = useId();
  const raiz = useRef<HTMLFieldSetElement>(null);

  /** Depois de mover, o foco acompanha o item (mesmo botão na nova posição). */
  function moverEFocar(de: number, para: number, dir: "cima" | "baixo") {
    aoMover(de, para);
    requestAnimationFrame(() => {
      const alvo =
        raiz.current?.querySelector<HTMLButtonElement>(`[data-acao="${dir}-${para}"]:not(:disabled)`) ??
        raiz.current?.querySelector<HTMLButtonElement>(`[data-acao="${dir === "cima" ? "baixo" : "cima"}-${para}"]`);
      alvo?.focus();
    });
  }

  /** Depois de remover, foca o item vizinho (anterior, senão o próximo) ou o título da lista. */
  function removerEFocar(i: number) {
    aoRemover(i);
    requestAnimationFrame(() => {
      const vizinho = i > 0 ? i - 1 : 0;
      const li = raiz.current?.querySelectorAll<HTMLElement>(":scope > ol > li")[vizinho];
      const alvo = li?.querySelector<HTMLElement>("[data-foco]") ?? raiz.current?.querySelector<HTMLElement>(":scope > legend");
      alvo?.focus();
    });
  }

  function adicionarEFocar() {
    aoAdicionar();
    requestAnimationFrame(() => {
      const ultimos = raiz.current?.querySelectorAll<HTMLElement>(":scope > ol > li:last-child [data-foco]");
      ultimos?.[0]?.focus();
    });
  }

  return (
    <fieldset className={`lista-editavel${emCaixa ? " em-caixa" : ""}`} ref={raiz} aria-describedby={ajuda ? `${id}-ajuda` : undefined}>
      <legend tabIndex={-1} data-foco={foco}>
        {titulo}
      </legend>
      {ajuda && (
        <p id={`${id}-ajuda`} className="ajuda">
          {ajuda}
        </p>
      )}
      <ol>
        {itens.map((item, i) => (
          <li key={i} className="item-lista">
            <div className="item-cabecalho">
              <span className="item-rotulo">{rotuloItem(i)}</span>
              <div className="item-acoes">
                <button
                  type="button"
                  className="btn-icone"
                  data-acao={`cima-${i}`}
                  aria-label={`Mover ${rotuloItem(i).toLowerCase()} para cima`}
                  title="Mover para cima"
                  disabled={i === 0}
                  onClick={() => moverEFocar(i, i - 1, "cima")}
                >
                  <Icone nome="cima" />
                </button>
                <button
                  type="button"
                  className="btn-icone"
                  data-acao={`baixo-${i}`}
                  aria-label={`Mover ${rotuloItem(i).toLowerCase()} para baixo`}
                  title="Mover para baixo"
                  disabled={i === itens.length - 1}
                  onClick={() => moverEFocar(i, i + 1, "baixo")}
                >
                  <Icone nome="baixo" />
                </button>
                <button
                  type="button"
                  className="btn-icone perigo"
                  aria-label={`Remover ${rotuloItem(i).toLowerCase()}`}
                  title="Remover"
                  disabled={itens.length <= minimo}
                  onClick={() => removerEFocar(i)}
                >
                  <Icone nome="lixeira" />
                </button>
              </div>
            </div>
            {render(item, i)}
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-pequeno btn-adicionar" onClick={adicionarEFocar}>
        <Icone nome="mais" /> {textoAdicionar}
      </button>
    </fieldset>
  );
}

/** Lista de textos ricos (parágrafos, itens, passos…). */
export function ListaDeTextos({
  titulo,
  ajuda,
  valores,
  rotuloItem,
  textoAdicionar,
  minimo,
  focoDe,
  aoMudar,
  aoAdicionar,
  aoRemover,
  aoMover,
}: {
  titulo: string;
  ajuda?: string;
  valores: string[];
  rotuloItem(i: number): string;
  textoAdicionar: string;
  minimo?: number;
  /** Chave data-foco do item i (ou da lista, com i = undefined). */
  focoDe(i?: number): string;
  aoMudar(i: number, v: string): void;
  aoAdicionar(): void;
  aoRemover(i: number): void;
  aoMover(de: number, para: number): void;
}) {
  return (
    <ListaEditavel
      titulo={titulo}
      ajuda={ajuda}
      itens={valores}
      rotuloItem={rotuloItem}
      textoAdicionar={textoAdicionar}
      minimo={minimo}
      foco={focoDe()}
      aoAdicionar={aoAdicionar}
      aoRemover={aoRemover}
      aoMover={aoMover}
      render={(v, i) => (
        <CampoRicoSemRotuloVisivel rotulo={rotuloItem(i)} valor={v} foco={focoDe(i)} aoMudar={(x) => aoMudar(i, x)} />
      )}
    />
  );
}

/** Texto rico cujo rótulo já aparece no cabeçalho do item (fica só para leitores de tela). */
function CampoRicoSemRotuloVisivel({
  rotulo,
  valor,
  foco,
  aoMudar,
}: {
  rotulo: string;
  valor: string;
  foco: string;
  aoMudar(v: string): void;
}) {
  const id = useId();
  return (
    <div className="campo campo-compacto">
      <span id={id} className="so-leitor">
        {rotulo}
      </span>
      <TextoRico valor={valor ?? ""} aoMudar={aoMudar} rotuloId={id} foco={foco} />
    </div>
  );
}

// ---------- Cor ----------

export const NOMES_COR: Record<Cor, string> = {
  navy: "Azul-marinho",
  green: "Verde",
  red: "Vermelho",
  yellow: "Amarelo",
};

export function SeletorCor({
  rotulo = "Cor",
  valor,
  aoMudar,
  foco,
}: {
  rotulo?: string;
  valor: Cor;
  aoMudar(c: Cor): void;
  foco?: string;
}) {
  const nome = useId();
  return (
    <fieldset className="seletor-cor">
      <legend>{rotulo}</legend>
      <div className="cores">
        {CORES.map((c, i) => (
          <label key={c} className={`cor-opcao${valor === c ? " marcada" : ""}`}>
            <input
              type="radio"
              name={nome}
              value={c}
              checked={valor === c}
              data-foco={i === 0 || valor === c ? foco : undefined}
              onChange={() => aoMudar(c)}
            />
            <span className={`amostra cor-${c}`} aria-hidden="true" />
            {NOMES_COR[c]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------- Operações de lista (para receitas immer) ----------

export function moverItem<T>(lista: T[], de: number, para: number) {
  if (para < 0 || para >= lista.length) return;
  const [x] = lista.splice(de, 1);
  lista.splice(para, 0, x);
}
