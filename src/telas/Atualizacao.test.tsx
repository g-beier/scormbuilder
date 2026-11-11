// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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
    fireEvent.click(screen.getByText("Procurar atualizações"));
    await flush();
    expect(screen.getByRole("status").textContent).toMatch(/já tem a versão mais recente/);
  });

  it("com versão nova: avisa; “Agora não” esconde e não volta na mesma sessão", async () => {
    check.mockResolvedValue(pacote("0.2.0"));
    const { unmount } = render(<Atualizacao />);
    await flush();
    expect(screen.getByRole("status").textContent).toMatch(/Nova versão 0\.2\.0 disponível/);
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
    const ocupado = vi.fn();
    render(<Atualizacao aoMudarOcupado={ocupado} />);
    await flush();
    fireEvent.click(screen.getByText("Atualizar agora"));
    await flush();
    expect(salvarAgora).toHaveBeenCalledTimes(1);
    const barra = screen.getByRole("progressbar", { name: "Download da versão 0.2.0" }) as HTMLProgressElement;
    expect(barra.value).toBeCloseTo(0.25);
    expect(ocupado).toHaveBeenLastCalledWith(true);
    await act(async () => soltar());
    expect(screen.getByRole("status").textContent).toMatch(/Versão 0\.2\.0 instalada/);
    expect(relaunch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Reiniciar para concluir"));
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
    const ocupado = vi.fn();
    render(<Atualizacao aoMudarOcupado={ocupado} />);
    await flush();
    fireEvent.click(screen.getByText("Atualizar agora"));
    await flush();
    const status = screen.getByRole("status").textContent ?? "";
    expect(status).toMatch(/Não foi possível baixar a atualização/);
    expect(status).not.toMatch(/connection reset/);
    expect(ocupado).toHaveBeenLastCalledWith(false);
    p.downloadAndInstall.mockImplementation(async () => {});
    fireEvent.click(screen.getByText("Tentar de novo"));
    await flush();
    expect(screen.getByText("Reiniciar para concluir")).toBeTruthy();
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
    expect(screen.getByRole("status").textContent).toMatch(/Feche o projeto/);
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
