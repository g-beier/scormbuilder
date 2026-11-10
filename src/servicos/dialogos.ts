/**
 * Diálogos nativos (plugin dialog) com reserva para o navegador.
 * Os caminhos escolhidos voltam como string; `null` = usuário cancelou.
 */
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { emTauri, MSG_SO_NO_APP } from "./ambiente";
import { FILTRO_CEVSCORM } from "./rascunhos";

export async function confirmar(
  mensagem: string,
  { titulo = "Confirmar", botaoOk = "Excluir" }: { titulo?: string; botaoOk?: string } = {},
): Promise<boolean> {
  if (!emTauri()) return window.confirm(mensagem);
  return confirm(mensagem, { title: titulo, kind: "warning", okLabel: botaoOk, cancelLabel: "Cancelar" });
}

function exigirApp() {
  if (!emTauri()) throw new Error(MSG_SO_NO_APP);
}

export async function escolherArquivoCevscorm(): Promise<string | null> {
  exigirApp();
  const r = await open({ multiple: false, directory: false, filters: FILTRO_CEVSCORM, title: "Abrir projeto" });
  return typeof r === "string" ? r : null;
}

export async function escolherPastaPacote(): Promise<string | null> {
  exigirApp();
  const r = await open({ multiple: false, directory: true, title: "Escolha a pasta do pacote SCORM (a que tem js/data.js)" });
  return typeof r === "string" ? r : null;
}

export async function escolherDestinoCevscorm(nomeSugerido: string): Promise<string | null> {
  exigirApp();
  return save({ filters: FILTRO_CEVSCORM, defaultPath: `${nomeSugerido}.cevscorm`, title: "Salvar projeto como" });
}
