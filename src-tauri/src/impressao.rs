//! Janela "PDF da leitura" (M7). Abre `imprimir.html` numa janela própria, que lê o
//! conteúdo do localStorage e usa `window.print()` (no macOS, o Tauri liga isso à
//! impressão nativa do webview; permissão `core:webview:allow-print` em
//! `capabilities/impressao.json`).

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const ROTULO: &str = "impressao";

/// Abre a janela de impressão ou, se já estiver aberta, recarrega e traz para a frente.
#[tauri::command]
pub fn abrir_impressao(app: AppHandle) -> Result<(), String> {
    if let Some(janela) = app.get_webview_window(ROTULO) {
        janela.eval("location.reload()").map_err(|e| e.to_string())?;
        janela.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, ROTULO, WebviewUrl::App("imprimir.html".into()))
        .title("PDF da leitura")
        .inner_size(920.0, 1000.0)
        .min_inner_size(600.0, 500.0)
        .build()
        .map(|_| ())
        .map_err(|e| format!("Não foi possível abrir a janela do PDF: {e}"))
}
