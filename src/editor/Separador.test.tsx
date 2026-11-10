// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { LARGURA_MAX, LARGURA_MIN, LARGURA_PADRAO, Separador, limitarLargura } from "./Separador";

afterEach(cleanup);

/** Contêiner falso de `largura` px. */
function montar(inicial: number, largura: number) {
  const caixa = { getBoundingClientRect: () => ({ width: largura, right: largura, left: 0 }) } as unknown as HTMLElement;
  const ref = { atual: inicial };
  function Teste() {
    const [v, setV] = useState(inicial);
    ref.atual = v;
    return <Separador valor={v} aoMudar={setV} conteiner={() => caixa} />;
  }
  render(<Teste />);
  return { ref, sep: screen.getByRole("separator", { name: "Largura da coluna de edição" }) };
}

describe("limitarLargura", () => {
  it("respeita % e os mínimos em pixels", () => {
    expect(limitarLargura(10, 2000)).toBe(LARGURA_MIN);
    expect(limitarLargura(90, 2000)).toBe(LARGURA_MAX);
    // 1000px: edição ≥ 380px (38%) e esquerda ≥ 420px (edição ≤ 58%)
    expect(limitarLargura(30, 1000)).toBe(38);
    expect(limitarLargura(59, 1000)).toBe(58);
    // janela estreita demais: fica no mínimo da edição
    expect(limitarLargura(50, 700)).toBeCloseTo(54.3, 1);
  });
});

describe("Separador", () => {
  it("teclado: setas, Shift, Home/End e Enter", () => {
    const { ref, sep } = montar(LARGURA_PADRAO, 2000);
    expect(sep.getAttribute("aria-valuenow")).toBe("33");
    fireEvent.keyDown(sep, { key: "ArrowLeft" });
    expect(ref.atual).toBe(35);
    fireEvent.keyDown(sep, { key: "ArrowRight", shiftKey: true });
    expect(ref.atual).toBe(25);
    fireEvent.keyDown(sep, { key: "ArrowRight" });
    expect(ref.atual).toBe(LARGURA_MIN);
    fireEvent.keyDown(sep, { key: "End" });
    expect(ref.atual).toBe(LARGURA_MAX);
    expect(sep.getAttribute("aria-valuenow")).toBe("60");
    fireEvent.keyDown(sep, { key: "Home" });
    expect(ref.atual).toBe(LARGURA_MIN);
    fireEvent.keyDown(sep, { key: "Enter" });
    expect(ref.atual).toBe(LARGURA_PADRAO);
  });

  it("duplo clique volta ao padrão e limites aparecem no aria", () => {
    const { ref, sep } = montar(50, 1000);
    expect(sep.getAttribute("aria-valuemin")).toBe("38");
    expect(sep.getAttribute("aria-valuemax")).toBe("58");
    fireEvent.doubleClick(sep);
    expect(ref.atual).toBe(38); // 33% seria menos de 380px
  });
});
