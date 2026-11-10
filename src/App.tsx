import { useEffect } from "react";
import type { Projeto } from "./modelo/tipos";
import { agendarSalvamento, ligarAutosave, salvarAgora, useProjeto, useSalvamento } from "./estado/projeto";
import { salvarRascunho } from "./servicos/rascunhos";
import { emTauri } from "./servicos/ambiente";
import { confirmar } from "./servicos/dialogos";
import { Inicio, type OpcoesAbrir } from "./telas/Inicio";
import { Editor } from "./telas/Editor";
import { Avisos } from "./editor/Avisos";

export default function App() {
  const projeto = useProjeto((s) => s.projeto);

  useEffect(() => {
    // No navegador (npm run dev) não há disco: o editor funciona, sem salvar.
    if (!emTauri()) return;
    const desligar = ligarAutosave(salvarRascunho);
    const antesDeSair = () => void salvarAgora();
    window.addEventListener("beforeunload", antesDeSair);
    // Fechar a janela: grava o pendente antes (o Tauri espera o handler).
    let soltar: (() => void) | undefined;
    let cancelado = false;
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) =>
      getCurrentWindow()
        .onCloseRequested(async () => {
          await salvarAgora();
        })
        .then((f) => (cancelado ? f() : (soltar = f))),
    );
    return () => {
      cancelado = true;
      soltar?.();
      window.removeEventListener("beforeunload", antesDeSair);
      desligar();
    };
  }, []);

  function abrir(p: Projeto, opcoes?: OpcoesAbrir) {
    useProjeto.getState().abrir(p);
    if (opcoes?.novo) agendarSalvamento();
  }

  async function voltarAoInicio() {
    await salvarAgora();
    if (emTauri() && useSalvamento.getState().estado === "erro") {
      const sair = await confirmar(
        "As últimas alterações não foram salvas. Voltar ao início mesmo assim? Use “Salvar como…” para guardar uma cópia.",
        { titulo: "Alterações não salvas", botaoOk: "Voltar mesmo assim" },
      );
      if (!sair) return;
    }
    useProjeto.getState().fechar();
  }

  return (
    <>
      {projeto ? <Editor projeto={projeto} aoInicio={voltarAoInicio} /> : <Inicio aoAbrir={abrir} />}
      <Avisos />
    </>
  );
}
