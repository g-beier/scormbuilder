// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import type { DownloadEvent } from "@tauri-apps/plugin-updater";

const check = vi.fn();
const relaunch = vi.fn();
const getVersion = vi.fn();
const salvarAgora = vi.fn();
let projetoAberto: object | null = null;
vi.mock("@tauri-apps/plugin-updater", () => ({ check: (...a: unknown[]) => check(...a) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: () => relaunch() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: () => getVersion() }));
vi.mock("../estado/projeto", () => ({
  salvarAgora: () => salvarAgora(),
  useProjeto: { getState: () => ({ projeto: projetoAberto }) },
}));

import { Atualizacao, _esquecerDispensa } from "./Atualizacao";

/** Atualização falsa: `downloadAndInstall` emite os eventos dados. */
function pacote(versao: string, eventos: DownloadEvent[] = [], falha?: Error) {
  return {
    version: versao,
    currentVersion: "0.1.0",
    downloadAndInstall: vi.fn(async (cb: (e: DownloadEvent) => void) => {
      for (const e of eventos) cb(e);
      if (falha) throw falha;
    }),
  };
}

const flush = () => act(async () => {});

beforeAll(() => {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
});
beforeEach(() => {
  check.mockReset();
  relaunch.mockReset().mockResolvedValue(undefined);
  getVersion.mockReset().mockResolvedValue("0.1.0");
  salvarAgora.mockReset().mockResolvedValue(undefined);
  projetoAberto = null;
  _esquecerDispensa();
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Atualizacao", () => {
  it("sem versão nova, não mostra aviso; só a versão atual", async () => {
    check.mockResolvedValue(null);
    render(<Atualizacao />);
    await flush();
    expect(check).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByText("Versão 0.1.0")).toBeTruthy();
  });

  it("offline: checagem automática falha em silêncio (só log)", async () => {
    check.mockRejectedValue(new Error("error sending request"));
    render(<Atualizacao />);
    await flush();
    expect(screen.getByRole("status").textContent).toBe("");
    expect(console.info).toHaveBeenCalled();
  });

  it("“Procurar atualizações” informa erro de rede e versão em dia", async () => {
    check.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(null);
    render(<Atualizacao />);
    await flush();
    fireEvent.click(screen.getByText("Procurar atualizações"));
    await flush();
    expect(screen.getByRole("status").textContent).toMatch(/Não foi possível procurar atualizações/);
    const botao = screen.getByText("Procurar atualizações");
    botao.focus();
    fireEvent.click(botao);
    // Durante a busca o botão continua focável (aria-disabled, não disabled).
    expect(botao.getAttribute("aria-disabled")).toBe("true");
    expect(botao.hasAttribute("disabled")).toBe(false);
    expect(document.activeElement).toBe(botao);
    await flush();
    expect(screen.getByRole("status").textContent).toMatch(/já tem a versão mais recente/);
  });

  it("com versão nova: avisa; “Agora não” esconde e não volta na mesma sessão", async () => {
    check.mockResolvedValue(pacote("0.2.0"));
    const { unmount } = render(<Atualizacao />);
    await flush();
    expect(screen.getByRole("status").textContent).toBe("Nova versão 0.2.0 disponível.");
    expect(screen.getByText(/Você tem a versão 0\.1\.0\. Seus rascunhos continuam salvos\./)).toBeTruthy();
    fireEvent.click(screen.getByText("Agora não"));
    expect(screen.getByRole("status").textContent).toBe("");
    unmount();
    render(<Atualizacao />);
    await flush();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("atualizar: salva antes, mostra progresso e reinicia só depois de salvar de novo", async () => {
    let soltar!: () => void;
    const p = pacote("0.2.0");
    p.downloadAndInstall.mockImplementation(async (cb: (e: DownloadEvent) => void) => {
      cb({ event: "Started", data: { contentLength: 200 } });
      cb({ event: "Progress", data: { chunkLength: 50 } });
      await new Promise<void>((ok) => (soltar = ok));
      cb({ event: "Progress", data: { chunkLength: 150 } });
      cb({ event: "Finished" });
    });
    check.mockResolvedValue(p);
    const bloqueio = vi.fn();
    render(<Atualizacao aoMudarBloqueio={bloqueio} />);
    await flush();
    fireEvent.click(screen.getByText("Atualizar agora"));
    await flush();
    expect(salvarAgora).toHaveBeenCalledTimes(1);
    // Região viva: só a frase curta; a barra e o percentual ficam fora dela.
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Baixando a versão 0.2.0.");
    const barra = screen.getByRole("progressbar", { name: "Baixando a versão 0.2.0… 20%" }) as HTMLProgressElement;
    expect(status.contains(barra)).toBe(false);
    expect(barra.value).toBeCloseTo(0.25);
    expect(screen.getByText("Não feche o aplicativo até terminar.")).toBeTruthy();
    expect(bloqueio).toHaveBeenLastCalledWith("baixando");
    // O botão clicado sumiu: o foco vai para o aviso, não para o body.
    expect(document.activeElement?.classList.contains("atualizacao-aviso")).toBe(true);
    await act(async () => soltar());
    expect(screen.getByRole("status").textContent).toBe(
      "Atualização instalada. Reinicie o aplicativo para usar a versão nova.",
    );
    expect(bloqueio).toHaveBeenLastCalledWith("reiniciar");
    expect(relaunch).not.toHaveBeenCalled();
    // Ao entrar em "pronto", o foco vai para "Reiniciar agora".
    expect(document.activeElement).toBe(screen.getByText("Reiniciar agora"));
    fireEvent.click(screen.getByText("Reiniciar agora"));
    await flush();
    expect(salvarAgora).toHaveBeenCalledTimes(2);
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it("tamanho desconhecido: barra indeterminada", async () => {
    let soltar!: () => void;
    const p = pacote("0.2.0");
    p.downloadAndInstall.mockImplementation(async (cb: (e: DownloadEvent) => void) => {
      cb({ event: "Started", data: {} });
      cb({ event: "Progress", data: { chunkLength: 50 } });
      await new Promise<void>((ok) => (soltar = ok));
    });
    check.mockResolvedValue(p);
    render(<Atualizacao />);
    await flush();
    fireEvent.click(screen.getByText("Atualizar agora"));
    await flush();
    expect(screen.getByRole("progressbar").hasAttribute("value")).toBe(false);
    await act(async () => soltar());
  });

  it("erro no download: mensagem amigável e “Tentar de novo”", async () => {
    const p = pacote("0.2.0", [{ event: "Started", data: { contentLength: 10 } }], new Error("connection reset"));
    check.mockResolvedValue(p);
    const bloqueio = vi.fn();
    render(<Atualizacao aoMudarBloqueio={bloqueio} />);
    await flush();
    fireEvent.click(screen.getByText("Atualizar agora"));
    await flush();
    const alerta = screen.getByRole("alert").textContent ?? "";
    expect(alerta).toBe(
      "Não foi possível baixar a atualização. Confira a internet e tente de novo. Seus rascunhos continuam salvos.",
    );
    expect(screen.getByRole("status").textContent).toBe("");
    expect(bloqueio).toHaveBeenLastCalledWith(null);
    expect(document.activeElement).toBe(screen.getByText("Tentar de novo"));
    p.downloadAndInstall.mockImplementation(async () => {});
    fireEvent.click(screen.getByText("Tentar de novo"));
    await flush();
    expect(screen.getByText("Reiniciar agora")).toBeTruthy();
  });

  it("com projeto aberto, não instala nem reinicia", async () => {
    const p = pacote("0.2.0");
    check.mockResolvedValue(p);
    render(<Atualizacao />);
    await flush();
    projetoAberto = { id: "x" };
    fireEvent.click(screen.getByText("Atualizar agora"));
    await flush();
    expect(p.downloadAndInstall).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/Feche o projeto/);
  });

  it("“Agora não” devolve o foco ao destino indicado", async () => {
    check.mockResolvedValue(pacote("0.2.0"));
    const titulo = createRef<HTMLHeadingElement>();
    render(
      <>
        <h1 ref={titulo} tabIndex={-1}>
          SCORM Builder
        </h1>
        <Atualizacao focoAoDispensar={titulo} />
      </>,
    );
    await flush();
    const botao = screen.getByText("Agora não");
    botao.focus();
    fireEvent.click(botao);
    expect(document.activeElement).toBe(titulo.current);
  });

  it("falha ao reiniciar: alerta e “Tentar reiniciar de novo” não baixa de novo", async () => {
    const p = pacote("0.2.0");
    check.mockResolvedValue(p);
    relaunch.mockRejectedValueOnce(new Error("sem permissão"));
    const bloqueio = vi.fn();
    render(<Atualizacao aoMudarBloqueio={bloqueio} />);
    await flush();
    fireEvent.click(screen.getByText("Atualizar agora"));
    await flush();
    fireEvent.click(screen.getByText("Reiniciar agora"));
    await flush();
    expect(screen.getByRole("alert").textContent).toMatch(/Não foi possível reiniciar/);
    expect(bloqueio).toHaveBeenLastCalledWith("reiniciar");
    const tentar = screen.getByText("Tentar reiniciar de novo");
    expect(document.activeElement).toBe(tentar);
    fireEvent.click(tentar);
    await flush();
    expect(p.downloadAndInstall).toHaveBeenCalledTimes(1);
    expect(relaunch).toHaveBeenCalledTimes(2);
  });

  it("fora do app (npm run dev) não aparece nem procura", async () => {
    const w = window as unknown as Record<string, unknown>;
    delete w.__TAURI_INTERNALS__;
    try {
      const { container } = render(<Atualizacao />);
      await flush();
      expect(container.innerHTML).toBe("");
      expect(check).not.toHaveBeenCalled();
    } finally {
      w.__TAURI_INTERNALS__ = {};
    }
  });
});
