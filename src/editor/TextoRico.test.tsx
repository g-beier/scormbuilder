// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { TextoRico } from "./TextoRico";

afterEach(cleanup);

function montar(valor: string, inline = true) {
  const aoMudar = vi.fn();
  const r = render(<TextoRico valor={valor} aoMudar={aoMudar} rotuloId="r" foco="s|b|paras[0]" inline={inline} />);
  const area = r.container.querySelector<HTMLElement>(".rico-area")!;
  return { ...r, area, aoMudar };
}

describe("TextoRico", () => {
  it("carrega só negrito, itálico e link; descarta o resto e não emite ao carregar", async () => {
    const { area, aoMudar } = montar('<b>a</b> <i>b</i> <u>c</u> <a href="https://x.y">d</a><script>x</script><h1>e</h1>');
    await act(async () => {});
    expect(area.innerHTML).toContain("<strong>a</strong>");
    expect(area.innerHTML).toContain("<em>b</em>");
    expect(area.innerHTML).not.toMatch(/<u>|<script|<h1|<p>/);
    expect(area.innerHTML).toMatch(/<a [^>]*href="https:\/\/x.y"/);
    expect(area.getAttribute("data-foco")).toBe("s|b|paras[0]");
    expect(area.getAttribute("aria-labelledby")).toBe("r");
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("recusa links javascript:", async () => {
    const { area } = montar('<a href="javascript:alert(1)">x</a>');
    await act(async () => {});
    expect(area.innerHTML).not.toContain("javascript:");
  });

  it("modo de parágrafos usa <p>", async () => {
    const { area } = montar("<p>um</p><p>dois</p>", false);
    await act(async () => {});
    expect(area.querySelectorAll("p")).toHaveLength(2);
  });
});
