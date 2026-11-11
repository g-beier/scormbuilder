import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { novoProjeto } from "../modelo/fabrica";
import type { BlocoQuiz, SlideConteudo } from "../modelo/tipos";
import {
  _definirRelogio,
  agendarSalvamento,
  desfazer,
  desligarAutosave,
  imagensEmUso,
  JANELA_GRUPO_MS,
  LIMITE_DESFAZER,
  ligarAutosave,
  limparImagensSemUso,
  refazer,
  salvarAgora,
  useProjeto,
  useSalvamento,
} from "./projeto";

let t = 1_000_000;
const st = () => useProjeto.getState();
const hist = () => useProjeto.temporal.getState();
const slides = () => st().projeto!.slides;
const conteudo = (i: number) => slides()[i] as SlideConteudo;

beforeEach(() => {
  t = 1_000_000;
  _definirRelogio(() => t);
  st().abrir(novoProjeto({ titulo: "Teste" }));
});

afterEach(() => {
  desligarAutosave();
  vi.useRealTimers();
});

describe("telas", () => {
  it("abre com capa + fim, seleciona a primeira e zera o histórico", () => {
    expect(slides().map((s) => s.tipo)).toEqual(["capa", "fim"]);
    expect(st().slideSelecionadoId).toBe(slides()[0].id);
    expect(hist().pastStates).toHaveLength(0);
  });

  it("nova tela de conteúdo entra antes do fim e fica selecionada", () => {
    const id = st().adicionarSlide();
    expect(slides().map((s) => s.tipo)).toEqual(["capa", "conteudo", "fim"]);
    expect(st().slideSelecionadoId).toBe(id);
  });

  it("capa entra no início e fim no final", () => {
    st().excluirSlide(slides()[0].id);
    st().excluirSlide(slides()[0].id);
    st().adicionarSlide("conteudo");
    st().adicionarSlide("fim");
    st().adicionarSlide("capa");
    expect(slides().map((s) => s.tipo)).toEqual(["capa", "conteudo", "fim"]);
  });

  it("duplicar cria cópia com ids novos logo depois da original", () => {
    const id = st().adicionarSlide();
    st().adicionarBloco(id, "texto");
    const copia = st().duplicarSlide(id)!;
    expect(slides()[2].id).toBe(copia);
    expect(copia).not.toBe(id);
    expect(conteudo(2).blocos[0].id).not.toBe(conteudo(1).blocos[0].id);
    expect(st().slideSelecionadoId).toBe(copia);
  });

  it("excluir a tela selecionada seleciona a vizinha", () => {
    const id = st().adicionarSlide();
    st().excluirSlide(id);
    expect(slides()).toHaveLength(2);
    expect(st().slideSelecionadoId).toBe(slides()[1].id);
  });

  it("mover reordena e ignora índices inválidos", () => {
    const a = st().adicionarSlide();
    const b = st().adicionarSlide();
    st().moverSlide(2, 1);
    expect(slides().map((s) => s.id).slice(1, 3)).toEqual([b, a]);
    const antes = st().projeto;
    st().moverSlide(0, 99);
    expect(st().projeto!.slides).toEqual(antes!.slides);
  });

  it("atualiza campos e atualizadoEm", () => {
    t = Date.parse("2026-05-01T12:00:00Z");
    st().atualizarSlide(slides()[0].id, { titulo: "Nova capa" });
    expect(slides()[0].titulo).toBe("Nova capa");
    expect(st().projeto!.atualizadoEm).toBe("2026-05-01T12:00:00.000Z");
  });

  it("atualizarMeta mescla os dados do pacote", () => {
    st().atualizarMeta({ curso: "MAPIJ", ud: 4 });
    expect(st().projeto!.meta).toMatchObject({ curso: "MAPIJ", ud: 4, titulo: "Teste" });
  });
});

describe("blocos", () => {
  it("adiciona, duplica, move e exclui", () => {
    const s = st().adicionarSlide();
    const texto = st().adicionarBloco(s, "texto")!;
    const quiz = st().adicionarBloco(s, "quiz")!;
    expect(st().blocoSelecionadoId).toBe(quiz);
    const copia = st().duplicarBloco(s, texto)!;
    expect(conteudo(1).blocos.map((b) => b.id)).toEqual([texto, copia, quiz]);
    st().moverBloco(s, 2, 0);
    expect(conteudo(1).blocos.map((b) => b.id)).toEqual([quiz, texto, copia]);
    st().excluirBloco(s, texto);
    expect(conteudo(1).blocos.map((b) => b.id)).toEqual([quiz, copia]);
  });

  it("não adiciona bloco em capa ou fim", () => {
    expect(st().adicionarBloco(slides()[0].id, "texto")).toBeNull();
  });

  it("editarBloco aplica a receita no bloco certo", () => {
    const s = st().adicionarSlide();
    const q = st().adicionarBloco(s, "quiz")!;
    st().editarBloco<BlocoQuiz>(s, q, (b) => {
      b.perguntas[0].opcoes.push("C");
      b.perguntas[0].correta = 2;
    });
    const bloco = conteudo(1).blocos[0] as BlocoQuiz;
    expect(bloco.perguntas[0].opcoes).toHaveLength(3);
    expect(bloco.perguntas[0].correta).toBe(2);
  });
});

describe("desfazer / refazer", () => {
  it("desfaz e refaz mudanças estruturais", () => {
    const s = st().adicionarSlide();
    st().adicionarBloco(s, "lista");
    desfazer();
    expect(conteudo(1).blocos).toHaveLength(0);
    desfazer();
    expect(slides()).toHaveLength(2);
    refazer();
    refazer();
    expect(conteudo(1).blocos).toHaveLength(1);
  });

  it("seleção não entra no histórico e não é desfeita", () => {
    st().selecionarSlide(slides()[1].id);
    st().selecionarBloco(slides()[0].id, null);
    expect(hist().pastStates).toHaveLength(0);
    st().atualizarSlide(slides()[0].id, { titulo: "x" });
    desfazer();
    expect(st().slideSelecionadoId).toBe(slides()[0].id);
  });

  it("digitação no mesmo campo vira um passo só; outro campo ou pausa abre outro", () => {
    const capa = slides()[0].id;
    for (const txt of ["O", "Ol", "Olá"]) {
      t += 200;
      st().atualizarSlide(capa, { titulo: txt }, `${capa}/titulo`);
    }
    expect(hist().pastStates).toHaveLength(1);
    t += 200;
    st().atualizarSlide(capa, { kicker: "K" }, `${capa}/kicker`);
    expect(hist().pastStates).toHaveLength(2);
    t += JANELA_GRUPO_MS + 1;
    st().atualizarSlide(capa, { kicker: "KK" }, `${capa}/kicker`);
    expect(hist().pastStates).toHaveLength(3);
    desfazer();
    desfazer();
    expect(slides()[0]).toMatchObject({ titulo: "Olá", kicker: "" });
    desfazer();
    expect(slides()[0].titulo).toBe("Teste"); // a capa nasce com o título do projeto
  });

  it("edição nova depois de desfazer descarta o refazer, mesmo no mesmo grupo", () => {
    const capa = slides()[0].id;
    st().atualizarSlide(capa, { titulo: "A" }, "g");
    desfazer();
    st().atualizarSlide(capa, { titulo: "B" }, "g");
    t += 10;
    st().atualizarSlide(capa, { titulo: "BC" }, "g");
    expect(hist().futureStates).toHaveLength(0);
  });

  it(`guarda no máximo ${LIMITE_DESFAZER} passos`, () => {
    const capa = slides()[0].id;
    for (let i = 0; i < LIMITE_DESFAZER + 20; i++) st().atualizarSlide(capa, { titulo: String(i) });
    expect(hist().pastStates).toHaveLength(LIMITE_DESFAZER);
  });
});

describe("salvamento automático", () => {
  it("toda mudança agenda o salvamento, com debounce, e expõe o estado", async () => {
    vi.useFakeTimers();
    const salvar = vi.fn().mockResolvedValue(undefined);
    ligarAutosave(salvar, 1000);
    st().atualizarMeta({ titulo: "A" });
    st().atualizarMeta({ titulo: "AB" });
    expect(useSalvamento.getState().estado).toBe("pendente");
    await vi.advanceTimersByTimeAsync(1000);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar.mock.calls[0][0].meta.titulo).toBe("AB");
    expect(useSalvamento.getState().estado).toBe("salvo");
  });

  it("desfazer também é salvo; seleção não", async () => {
    vi.useFakeTimers();
    const salvar = vi.fn().mockResolvedValue(undefined);
    ligarAutosave(salvar, 1000);
    st().selecionarSlide(slides()[1].id);
    await vi.advanceTimersByTimeAsync(2000);
    expect(salvar).not.toHaveBeenCalled();
    st().atualizarMeta({ titulo: "A" });
    desfazer();
    await salvarAgora();
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar.mock.calls[0][0].meta.titulo).toBe("Teste");
  });

  it("abrir outro projeto não regrava; agendarSalvamento grava projeto novo; erro aparece no estado", async () => {
    const salvar = vi.fn().mockRejectedValue(new Error("disco cheio"));
    ligarAutosave(salvar, 1000);
    st().abrir(novoProjeto());
    await salvarAgora();
    expect(salvar).not.toHaveBeenCalled();
    agendarSalvamento();
    await salvarAgora();
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(useSalvamento.getState()).toMatchObject({ estado: "erro", erro: "disco cheio" });
  });
});

describe("imagens sem uso", () => {
  const A = "0123456789abcdef.png";
  const B = "1111111111111111.jpg";
  const C = "2222222222222222.webp";
  beforeEach(() => useSalvamento.setState({ estado: "salvo", erro: undefined }));

  function comImagem(): { slideId: string; blocoId: string } {
    const slideId = st().adicionarSlide("conteudo");
    const blocoId = st().adicionarBloco(slideId, "imagem")!;
    return { slideId, blocoId };
  }
  const trocar = (slideId: string, blocoId: string, nome: string) => {
    t += JANELA_GRUPO_MS * 2;
    st().editarBloco(slideId, blocoId, (b) => {
      if (b.tipo === "imagem") b.arquivo = nome;
    });
  };

  it("considera o projeto atual e todo o histórico de desfazer e refazer", async () => {
    const { slideId, blocoId } = comImagem();
    trocar(slideId, blocoId, A);
    trocar(slideId, blocoId, B);
    trocar(slideId, blocoId, C);
    desfazer(); // volta para B; C fica no "refazer"
    const limpar = vi.fn(async () => []);
    await limparImagensSemUso(limpar);
    expect(limpar).toHaveBeenCalledWith(st().projeto!.id, [A, B, C]);

    // Bloco excluído: a imagem continua protegida enquanto o passo puder ser desfeito
    st().excluirBloco(slideId, blocoId);
    expect(imagensEmUso()).toEqual([A, B]);
    desfazer();
    expect(imagensEmUso()).toEqual([A, B]);
  });

  it("sem histórico (projeto recém-aberto), só as do projeto", async () => {
    const { slideId, blocoId } = comImagem();
    trocar(slideId, blocoId, A);
    const p = st().projeto!;
    st().abrir(structuredClone(p));
    const limpar = vi.fn(async () => []);
    await limparImagensSemUso(limpar);
    expect(limpar).toHaveBeenCalledWith(p.id, [A]);
  });

  it("não limpa se a última gravação falhou, sem projeto, e erro não propaga", async () => {
    const limpar = vi.fn(async () => {
      throw new Error("disco");
    });
    useSalvamento.setState({ estado: "erro" });
    await limparImagensSemUso(limpar);
    expect(limpar).not.toHaveBeenCalled();
    useSalvamento.setState({ estado: "salvo" });
    await expect(limparImagensSemUso(limpar)).resolves.toBeUndefined();
    expect(limpar).toHaveBeenCalledTimes(1);
    st().fechar();
    await limparImagensSemUso(limpar);
    expect(limpar).toHaveBeenCalledTimes(1);
  });
});
