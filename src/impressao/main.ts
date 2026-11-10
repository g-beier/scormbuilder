/**
 * Janela "PDF da leitura" (M7): mostra a leitura em modo impressão, com o mesmo
 * runtime do pacote (`/runtime/`), e abre o diálogo de impressão do sistema.
 * O conteúdo vem do editor pelo localStorage (mesma origem), em CHAVE_IMPRESSAO.
 */
import { CHAVE_IMPRESSAO, type DadosImpressao } from "../servicos/impressao";
import { emTauri } from "../servicos/ambiente";

type MotorGlobal = { imprimir(conteudo: unknown, raiz: HTMLElement): boolean };

function carregarScript(src: string): Promise<void> {
  return new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => ok();
    s.onerror = () => falha(new Error(`Não foi possível carregar ${src}.`));
    document.head.appendChild(s);
  });
}

function mostrarErro(raiz: HTMLElement, msg: string) {
  raiz.innerHTML = "";
  const p = document.createElement("p");
  p.className = "imp-erro";
  p.textContent = msg;
  raiz.appendChild(p);
}

async function desenhar() {
  const raiz = document.getElementById("doc")!;
  let dados: DadosImpressao | null = null;
  try {
    const bruto = localStorage.getItem(CHAVE_IMPRESSAO);
    dados = bruto ? (JSON.parse(bruto) as DadosImpressao) : null;
  } catch {
    dados = null;
  }
  if (!dados) {
    mostrarErro(raiz, "Nada para imprimir. Abra esta janela pelo editor: Exportar → PDF da leitura.");
    return;
  }
  // O título do documento vira o nome sugerido do arquivo PDF
  document.title = `${dados.conteudo.id} - leitura`;
  const w = window as Window & { Motor?: MotorGlobal };
  if (!w.Motor) await carregarScript("/runtime/js/motor.js");
  await document.fonts.ready;
  w.Motor!.imprimir(dados.conteudo, raiz);
}

async function fechar() {
  if (emTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } else {
    window.close();
  }
}

document.getElementById("imp-salvar")!.addEventListener("click", () => window.print());
document.getElementById("imp-fechar")!.addEventListener("click", () => void fechar());
// Novo pedido do editor com esta janela aberta: redesenha
window.addEventListener("storage", (e) => {
  if (e.key === CHAVE_IMPRESSAO) void desenhar();
});
void desenhar().catch((e) => mostrarErro(document.getElementById("doc")!, String((e as Error).message ?? e)));
document.getElementById("imp-salvar")!.focus();
