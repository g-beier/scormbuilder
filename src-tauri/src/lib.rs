mod exportar;
mod imagens;
mod pdf;
mod projetos;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Atualização automática (só desktop): a checagem e o download rodam no Rust,
            // com a assinatura conferida pela `plugins.updater.pubkey` do tauri.conf.json.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            #[cfg(not(desktop))]
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            projetos::salvar_rascunho,
            projetos::listar_rascunhos,
            projetos::abrir_rascunho,
            projetos::excluir_rascunho,
            projetos::salvar_arquivo,
            projetos::abrir_arquivo,
            projetos::ler_data_js,
            imagens::importar_imagem,
            imagens::ler_imagem,
            imagens::limpar_imagens_orfas,
            exportar::exportar_pacote,
            exportar::ler_preferencias,
            exportar::salvar_preferencias,
            pdf::exportar_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
