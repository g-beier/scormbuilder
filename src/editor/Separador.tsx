/**
 * Separador vertical arrastável entre a área da esquerda (telas + prévia) e a coluna
 * de edição. A largura da edição é uma porcentagem da largura do contêiner.
 * Teclado: ←/→ (2%, com Shift 10%), Home/End (mínimo/máximo), Enter (volta ao padrão).
 */
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

export const LARGURA_PADRAO = 33;
export const LARGURA_MIN = 25;
export const LARGURA_MAX = 60;
/** Mínimos em pixels: a edição e a área da esquerda (telas + prévia). */
export const MIN_EDICAO_PX = 380;
export const MIN_ESQUERDA_PX = 420;

/** Limita `pct` aos mínimos em % e em pixels para um contêiner de `total` px. */
export function limitarLargura(pct: number, total: number): number {
  let min = LARGURA_MIN;
  let max = LARGURA_MAX;
  if (total > 0) {
    min = Math.max(min, (MIN_EDICAO_PX / total) * 100);
    max = Math.min(max, 100 - (MIN_ESQUERDA_PX / total) * 100);
  }
  if (max < min) return min; // janela estreita: a edição mantém o seu mínimo
  return Math.round(Math.min(max, Math.max(min, pct)) * 10) / 10;
}

export function Separador({
  valor,
  aoMudar,
  conteiner,
}: {
  /** Largura atual da edição, em %. */
  valor: number;
  aoMudar(pct: number): void;
  /** Elemento cuja largura é 100%. */
  conteiner: () => HTMLElement | null;
}) {
  const arrastando = useRef(false);
  const total = () => conteiner()?.getBoundingClientRect().width ?? 0;

  function porPonteiro(x: number) {
    const caixa = conteiner()?.getBoundingClientRect();
    if (!caixa || caixa.width <= 0) return;
    aoMudar(limitarLargura(((caixa.right - x) / caixa.width) * 100, caixa.width));
  }

  function aoBaixar(e: PointerEvent<HTMLDivElement>) {
    if (e.button > 0) return;
    e.preventDefault();
    arrastando.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
  }

  function aoTecla(e: KeyboardEvent<HTMLDivElement>) {
    const passo = e.shiftKey ? 10 : 2;
    let novo: number | null = null;
    // A edição fica à direita: ← aumenta a edição, → diminui.
    if (e.key === "ArrowLeft") novo = valor + passo;
    else if (e.key === "ArrowRight") novo = valor - passo;
    else if (e.key === "Home") novo = LARGURA_MIN;
    else if (e.key === "End") novo = LARGURA_MAX;
    else if (e.key === "Enter") novo = LARGURA_PADRAO;
    if (novo === null) return;
    e.preventDefault();
    aoMudar(limitarLargura(novo, total()));
  }

  const t = total();
  return (
    <div
      className="separador"
      role="separator"
      aria-orientation="vertical"
      aria-label="Largura da coluna de edição"
      aria-valuemin={Math.round(limitarLargura(0, t))}
      aria-valuemax={Math.round(limitarLargura(100, t))}
      aria-valuenow={Math.round(valor)}
      aria-valuetext={`Edição com ${Math.round(valor)}% da largura`}
      title="Arraste para mudar a largura da edição (duplo clique volta ao padrão)"
      tabIndex={0}
      onPointerDown={aoBaixar}
      onPointerMove={(e) => arrastando.current && porPonteiro(e.clientX)}
      onPointerUp={() => (arrastando.current = false)}
      onPointerCancel={() => (arrastando.current = false)}
      onDoubleClick={() => aoMudar(limitarLargura(LARGURA_PADRAO, total()))}
      onKeyDown={aoTecla}
    />
  );
}
