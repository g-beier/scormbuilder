mod exportar;
mod pdf;
mod projetos;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            projetos::salvar_rascunho,
            projetos::listar_rascunhos,
            projetos::abrir_rascunho,
            projetos::excluir_rascunho,
            projetos::salvar_arquivo,
            projetos::abrir_arquivo,
            projetos::ler_data_js,
            exportar::exportar_pacote,
            exportar::ler_preferencias,
            exportar::salvar_preferencias,
            pdf::exportar_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
