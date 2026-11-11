//! Rascunhos (salvamento automático) e arquivos `.cevscorm`.
//!
//! O projeto é tratado como JSON opaco: o modelo vive no front
//! (`src/modelo/tipos.ts`). Aqui só lemos `formato`, `versao`, `id`,
//! `meta.titulo`, `meta.curso`, `meta.ud`, `atualizadoEm` e `slides.len()`.
//!
//! A lógica fica em funções que recebem o diretório base, para poder ser
//! testada com uma pasta temporária; os comandos só resolvem `app_data_dir`.

use crate::imagens;
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub const FORMATO: &str = "cev-scorm-builder";
pub const VERSAO_SUPORTADA: u64 = 1;
const PASTA_RASCUNHOS: &str = "rascunhos";
const EXTENSAO_ARQUIVO: &str = "cevscorm";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumoRascunho {
    pub id: String,
    pub titulo: String,
    pub curso: String,
    /// Número da UD (0 = não informado).
    pub ud: i64,
    pub atualizado_em: String,
    pub telas: usize,
}

// ---------- Validação ----------

/// Aceita só `[A-Za-z0-9-]`, 1 a 64 caracteres (cobre UUID), o que impede
/// path traversal (`..`, `/`, `\`) e nomes estranhos de arquivo.
pub fn validar_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    if ok {
        Ok(())
    } else {
        Err("Identificador de projeto inválido.".to_string())
    }
}

/// Confere que o JSON é um projeto do SCORM Builder e devolve o `id`.
pub fn validar_projeto(projeto: &Value) -> Result<&str, String> {
    if projeto.get("formato").and_then(Value::as_str) != Some(FORMATO) {
        return Err("Este arquivo não é um projeto do SCORM Builder.".to_string());
    }
    if let Some(v) = projeto.get("versao").and_then(Value::as_u64)
        && v > VERSAO_SUPORTADA
    {
        return Err(
            "Este projeto foi criado por uma versão mais nova do SCORM Builder. Atualize o aplicativo para abri-lo."
                .to_string(),
        );
    }
    let id = projeto
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "O projeto está sem identificador.".to_string())?;
    validar_id(id)?;
    Ok(id)
}

pub fn resumo(projeto: &Value) -> Result<ResumoRascunho, String> {
    let id = validar_projeto(projeto)?.to_string();
    let meta = projeto.get("meta");
    let texto = |campo: &str| {
        meta.and_then(|m| m.get(campo))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    };
    Ok(ResumoRascunho {
        id,
        titulo: texto("titulo"),
        curso: texto("curso"),
        ud: meta
            .and_then(|m| m.get("ud"))
            .and_then(Value::as_i64)
            .unwrap_or(0),
        atualizado_em: projeto
            .get("atualizadoEm")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        telas: projeto
            .get("slides")
            .and_then(Value::as_array)
            .map_or(0, Vec::len),
    })
}

// ---------- Disco ----------

fn erro_io(acao: &str, e: &io::Error) -> String {
    match e.kind() {
        io::ErrorKind::NotFound => {
            format!("Não foi possível {acao}: o arquivo não foi encontrado.")
        }
        io::ErrorKind::PermissionDenied => {
            format!("Não foi possível {acao}: sem permissão para acessar o local.")
        }
        _ => format!("Não foi possível {acao}: {e}."),
    }
}

/// Grava `conteudo` em `destino` de forma atômica: escreve `<destino>.tmp`
/// na mesma pasta, força para o disco e renomeia por cima do destino.
pub fn gravar_atomico(destino: &Path, conteudo: &[u8]) -> io::Result<()> {
    let mut nome_tmp = destino
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "caminho sem nome de arquivo"))?
        .to_os_string();
    nome_tmp.push(".tmp");
    let tmp = destino.with_file_name(nome_tmp);
    let resultado = (|| {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(conteudo)?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, destino)
    })();
    if resultado.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    resultado
}

fn pasta_rascunhos(base: &Path) -> PathBuf {
    base.join(PASTA_RASCUNHOS)
}

fn caminho_rascunho(base: &Path, id: &str) -> Result<PathBuf, String> {
    validar_id(id)?;
    Ok(pasta_rascunhos(base).join(format!("{id}.json")))
}

fn ler_projeto(caminho: &Path, acao: &str) -> Result<Value, String> {
    let bytes = fs::read(caminho).map_err(|e| erro_io(acao, &e))?;
    let projeto: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "O arquivo está corrompido ou não é um projeto válido.".to_string())?;
    validar_projeto(&projeto)?;
    Ok(projeto)
}

pub fn salvar_rascunho_em(base: &Path, projeto: &Value) -> Result<ResumoRascunho, String> {
    let r = resumo(projeto)?;
    let pasta = pasta_rascunhos(base);
    fs::create_dir_all(&pasta).map_err(|e| erro_io("criar a pasta de rascunhos", &e))?;
    let destino = caminho_rascunho(base, &r.id)?;
    let json = serde_json::to_vec(projeto)
        .map_err(|e| format!("Não foi possível preparar o rascunho: {e}."))?;
    gravar_atomico(&destino, &json).map_err(|e| erro_io("salvar o rascunho", &e))?;
    Ok(r)
}

/// Lista os rascunhos, do mais recente para o mais antigo. Arquivos ilegíveis
/// ou corrompidos são ignorados (com log), sem derrubar a lista.
pub fn listar_rascunhos_em(base: &Path) -> Vec<ResumoRascunho> {
    let entradas = match fs::read_dir(pasta_rascunhos(base)) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Vec::new(),
        Err(e) => {
            eprintln!("[rascunhos] não foi possível ler a pasta: {e}");
            return Vec::new();
        }
    };
    let mut lista: Vec<ResumoRascunho> = entradas
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("json"))
        .filter_map(|p| {
            let r = ler_projeto(&p, "ler o rascunho").and_then(|v| resumo(&v));
            match r {
                Ok(r) if p.file_stem().and_then(|s| s.to_str()) == Some(r.id.as_str()) => Some(r),
                Ok(_) => {
                    eprintln!(
                        "[rascunhos] ignorado (id não confere com o nome): {}",
                        p.display()
                    );
                    None
                }
                Err(e) => {
                    eprintln!("[rascunhos] ignorado {}: {e}", p.display());
                    None
                }
            }
        })
        .collect();
    lista.sort_by(|a, b| {
        b.atualizado_em
            .cmp(&a.atualizado_em)
            .then_with(|| a.id.cmp(&b.id))
    });
    lista
}

pub fn abrir_rascunho_em(base: &Path, id: &str) -> Result<Value, String> {
    let caminho = caminho_rascunho(base, id)?;
    ler_projeto(&caminho, "abrir o rascunho")
}

/// Exclui o rascunho (`<id>.json`) e a pasta de mídia (`<id>/`). Se já não
/// existirem, não é erro.
pub fn excluir_rascunho_em(base: &Path, id: &str) -> Result<(), String> {
    let caminho = caminho_rascunho(base, id)?;
    match fs::remove_file(&caminho) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(e) => return Err(erro_io("excluir o rascunho", &e)),
    }
    match fs::remove_dir_all(imagens::pasta_do_rascunho(base, id)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(erro_io("excluir as imagens do rascunho", &e)),
    }
}

/// Grava o projeto (JSON indentado) em `caminho`, acrescentando a extensão
/// `.cevscorm` se faltar. Devolve o caminho final.
pub fn salvar_arquivo_em(caminho: &Path, projeto: &Value) -> Result<PathBuf, String> {
    validar_projeto(projeto)?;
    let mut destino = caminho.to_path_buf();
    if destino.extension().and_then(|x| x.to_str()) != Some(EXTENSAO_ARQUIVO) {
        let mut nome = destino.as_os_str().to_os_string();
        nome.push(".");
        nome.push(EXTENSAO_ARQUIVO);
        destino = PathBuf::from(nome);
    }
    let json = serde_json::to_vec_pretty(projeto)
        .map_err(|e| format!("Não foi possível preparar o arquivo: {e}."))?;
    gravar_atomico(&destino, &json).map_err(|e| erro_io("salvar o arquivo", &e))?;
    Ok(destino)
}

pub fn abrir_arquivo_em(caminho: &Path) -> Result<Value, String> {
    ler_projeto(caminho, "abrir o arquivo")
}


// ---------- Importação de pacote existente ----------

/// Limite de tamanho do `js/data.js` importado (os do ead-scorm têm ~50 KB).
pub const LIMITE_DATA_JS: u64 = 5 * 1024 * 1024;

/// Lê `<pasta>/js/data.js` como texto UTF-8 (sem BOM). Recusa pasta
/// inexistente, arquivo ausente, arquivo grande demais e texto não UTF-8.
pub fn ler_data_js_em(pasta: &Path) -> Result<String, String> {
    if !pasta.is_dir() {
        return Err("A pasta escolhida não foi encontrada.".to_string());
    }
    let arquivo = pasta.join("js").join("data.js");
    let meta = fs::metadata(&arquivo).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => {
            "Esta pasta não parece um pacote SCORM: não há o arquivo js/data.js dentro dela."
                .to_string()
        }
        _ => erro_io("ler o js/data.js", &e),
    })?;
    if !meta.is_file() {
        return Err("O js/data.js desta pasta não é um arquivo.".to_string());
    }
    if meta.len() > LIMITE_DATA_JS {
        return Err("O js/data.js é grande demais para importar (limite de 5 MB).".to_string());
    }
    let bytes = fs::read(&arquivo).map_err(|e| erro_io("ler o js/data.js", &e))?;
    let texto = String::from_utf8(bytes)
        .map_err(|_| "O js/data.js não está em UTF-8; não foi possível lê-lo.".to_string())?;
    Ok(texto.strip_prefix('\u{feff}').map(str::to_string).unwrap_or(texto))
}

// ---------- Comandos ----------

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "Não foi possível localizar a pasta de dados do aplicativo.".to_string())
}

#[tauri::command]
pub async fn salvar_rascunho(app: AppHandle, projeto: Value) -> Result<ResumoRascunho, String> {
    salvar_rascunho_em(&app_data(&app)?, &projeto)
}

#[tauri::command]
pub async fn listar_rascunhos(app: AppHandle) -> Result<Vec<ResumoRascunho>, String> {
    Ok(listar_rascunhos_em(&app_data(&app)?))
}

#[tauri::command]
pub async fn abrir_rascunho(app: AppHandle, id: String) -> Result<Value, String> {
    abrir_rascunho_em(&app_data(&app)?, &id)
}

#[tauri::command]
pub async fn excluir_rascunho(app: AppHandle, id: String) -> Result<(), String> {
    excluir_rascunho_em(&app_data(&app)?, &id)
}

#[tauri::command]
pub async fn salvar_arquivo(caminho: String, projeto: Value) -> Result<String, String> {
    salvar_arquivo_em(Path::new(&caminho), &projeto).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn abrir_arquivo(caminho: String) -> Result<Value, String> {
    abrir_arquivo_em(Path::new(&caminho))
}

#[tauri::command]
pub async fn ler_data_js(pasta: String) -> Result<String, String> {
    ler_data_js_em(Path::new(&pasta))
}

// ---------- Testes ----------

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct PastaTemp(PathBuf);
    impl PastaTemp {
        fn nova() -> Self {
            static N: AtomicUsize = AtomicUsize::new(0);
            let p = std::env::temp_dir().join(format!(
                "scorm-builder-teste-{}-{}",
                std::process::id(),
                N.fetch_add(1, Ordering::SeqCst)
            ));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            PastaTemp(p)
        }
    }
    impl Drop for PastaTemp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn projeto(id: &str, atualizado: &str) -> Value {
        json!({
            "formato": "cev-scorm-builder",
            "versao": 1,
            "id": id,
            "meta": { "curso": "CTGESTAO", "ud": 11, "atividade": "LEITURA", "numero": 2,
                      "titulo": "Gestão & ação", "contexto": "Curso · UD 11" },
            "slides": [{ "tipo": "capa" }, { "tipo": "fim" }],
            "criadoEm": "2026-01-01T00:00:00.000Z",
            "atualizadoEm": atualizado
        })
    }

    #[test]
    fn ids_invalidos_sao_recusados() {
        for id in [
            "",
            "../x",
            "a/b",
            "a\\b",
            "..",
            "a.json",
            "á",
            &"a".repeat(65),
        ] {
            assert!(validar_id(id).is_err(), "id {id:?} deveria ser inválido");
        }
        assert!(validar_id("3f2b1c9e-0a4d-4e5f-8b6a-1234567890ab").is_ok());

        let t = PastaTemp::nova();
        let mut p = projeto("ok", "x");
        p["id"] = json!("../x");
        assert!(salvar_rascunho_em(&t.0, &p).is_err());
        p["id"] = json!("");
        assert!(salvar_rascunho_em(&t.0, &p).is_err());
        assert!(abrir_rascunho_em(&t.0, "../x").is_err());
        assert!(excluir_rascunho_em(&t.0, "../x").is_err());
        assert!(!t.0.join("x.json").exists());
    }

    #[test]
    fn formato_errado_e_recusado() {
        let t = PastaTemp::nova();
        let mut p = projeto("abc", "x");
        p["formato"] = json!("outro");
        let erro = salvar_rascunho_em(&t.0, &p).unwrap_err();
        assert!(erro.contains("não é um projeto"));
        p["formato"] = json!(FORMATO);
        p["versao"] = json!(2);
        assert!(salvar_rascunho_em(&t.0, &p).is_err());
    }

    #[test]
    fn gravacao_atomica_substitui_e_nao_deixa_tmp() {
        let t = PastaTemp::nova();
        let destino = t.0.join("a.json");
        fs::write(&destino, b"antigo").unwrap();
        gravar_atomico(&destino, b"novo").unwrap();
        assert_eq!(fs::read(&destino).unwrap(), b"novo");
        assert!(!t.0.join("a.json.tmp").exists());

        // Falha na gravação (pasta inexistente) não toca o destino nem deixa .tmp.
        let inexistente = t.0.join("nao-existe").join("b.json");
        assert!(gravar_atomico(&inexistente, b"x").is_err());
        assert!(!inexistente.exists());

        // Salvar rascunho duas vezes: só fica o .json, com o conteúdo novo.
        salvar_rascunho_em(&t.0, &projeto("p1", "2026-01-01T00:00:00.000Z")).unwrap();
        let mut p = projeto("p1", "2026-02-01T00:00:00.000Z");
        p["meta"]["titulo"] = json!("Novo título");
        salvar_rascunho_em(&t.0, &p).unwrap();
        let nomes: Vec<_> = fs::read_dir(t.0.join("rascunhos"))
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        assert_eq!(nomes, vec!["p1.json".to_string()]);
        assert_eq!(abrir_rascunho_em(&t.0, "p1").unwrap(), p);
    }

    #[test]
    fn ida_e_volta_do_rascunho_e_exclusao() {
        let t = PastaTemp::nova();
        let p = projeto("abc-123", "2026-03-01T10:00:00.000Z");
        let r = salvar_rascunho_em(&t.0, &p).unwrap();
        assert_eq!(
            r,
            ResumoRascunho {
                id: "abc-123".into(),
                titulo: "Gestão & ação".into(),
                curso: "CTGESTAO".into(),
                ud: 11,
                atualizado_em: "2026-03-01T10:00:00.000Z".into(),
                telas: 2,
            }
        );
        assert_eq!(abrir_rascunho_em(&t.0, "abc-123").unwrap(), p);
        // Mídia do rascunho em <id>/img/: a listagem a ignora e a exclusão apaga.
        let img = t.0.join("rascunhos/abc-123/img");
        fs::create_dir_all(&img).unwrap();
        fs::write(img.join("0123456789abcdef.png"), b"x").unwrap();
        salvar_rascunho_em(&t.0, &projeto("outro", "2026-01-01T00:00:00.000Z")).unwrap();
        fs::create_dir_all(t.0.join("rascunhos/outro/img")).unwrap();
        assert_eq!(listar_rascunhos_em(&t.0).len(), 2);
        excluir_rascunho_em(&t.0, "abc-123").unwrap();
        assert!(abrir_rascunho_em(&t.0, "abc-123").is_err());
        assert!(!t.0.join("rascunhos/abc-123").exists());
        assert!(t.0.join("rascunhos/outro/img").is_dir());
        excluir_rascunho_em(&t.0, "abc-123").unwrap(); // idempotente
    }

    #[test]
    fn listagem_ordena_e_ignora_corrompidos() {
        let t = PastaTemp::nova();
        assert!(listar_rascunhos_em(&t.0).is_empty()); // pasta ainda não existe
        salvar_rascunho_em(&t.0, &projeto("velho", "2026-01-01T00:00:00.000Z")).unwrap();
        salvar_rascunho_em(&t.0, &projeto("novo", "2026-05-01T00:00:00.000Z")).unwrap();
        salvar_rascunho_em(&t.0, &projeto("meio", "2026-03-01T00:00:00.000Z")).unwrap();
        let pasta = t.0.join("rascunhos");
        fs::write(pasta.join("quebrado.json"), b"{ isto nao e json").unwrap();
        fs::write(
            pasta.join("alheio.json"),
            br#"{"formato":"outro","id":"alheio"}"#,
        )
        .unwrap();
        fs::write(pasta.join("sobra.json.tmp"), b"{}").unwrap();
        // id interno diferente do nome do arquivo
        fs::write(
            pasta.join("trocado.json"),
            projeto("outro-id", "2026-09-01").to_string(),
        )
        .unwrap();

        let ids: Vec<_> = listar_rascunhos_em(&t.0)
            .into_iter()
            .map(|r| r.id)
            .collect();
        assert_eq!(ids, vec!["novo", "meio", "velho"]);
    }

    #[test]
    fn ida_e_volta_do_arquivo_cevscorm() {
        let t = PastaTemp::nova();
        let p = projeto("arq", "2026-03-01T10:00:00.000Z");
        let final_ = salvar_arquivo_em(&t.0.join("meu projeto"), &p).unwrap();
        assert_eq!(final_, t.0.join("meu projeto.cevscorm"));
        let texto = fs::read_to_string(&final_).unwrap();
        assert!(
            texto.contains("\n  \"formato\""),
            "deveria ser JSON indentado"
        );
        assert_eq!(abrir_arquivo_em(&final_).unwrap(), p);

        let com_ext = t.0.join("b.cevscorm");
        assert_eq!(salvar_arquivo_em(&com_ext, &p).unwrap(), com_ext);
        assert!(!t.0.join("b.cevscorm.tmp").exists());

        let ruim = t.0.join("ruim.cevscorm");
        fs::write(&ruim, br#"{"formato":"outro"}"#).unwrap();
        assert!(
            abrir_arquivo_em(&ruim)
                .unwrap_err()
                .contains("não é um projeto")
        );
        fs::write(&ruim, b"lixo").unwrap();
        assert!(abrir_arquivo_em(&ruim).unwrap_err().contains("corrompido"));
        assert!(
            abrir_arquivo_em(&t.0.join("nada.cevscorm"))
                .unwrap_err()
                .contains("não foi encontrado")
        );
    }

    #[test]
    fn ler_data_js_da_pasta_do_pacote() {
        let t = PastaTemp::nova();
        let pacote = t.0.join("CTGESTAO_UD1_LEITURA2");
        assert!(ler_data_js_em(&pacote).unwrap_err().contains("não foi encontrada"));
        fs::create_dir_all(pacote.join("js")).unwrap();
        assert!(ler_data_js_em(&pacote).unwrap_err().contains("js/data.js"));

        let arq = pacote.join("js").join("data.js");
        fs::write(&arq, "\u{feff}window.CONTEUDO = { contexto: \"Gestão\" };").unwrap();
        assert_eq!(
            ler_data_js_em(&pacote).unwrap(),
            "window.CONTEUDO = { contexto: \"Gestão\" };"
        );

        fs::write(&arq, [0xff, 0xfe, 0x00]).unwrap();
        assert!(ler_data_js_em(&pacote).unwrap_err().contains("UTF-8"));

        fs::write(&arq, vec![b' '; (LIMITE_DATA_JS + 1) as usize]).unwrap();
        assert!(ler_data_js_em(&pacote).unwrap_err().contains("grande demais"));

        fs::remove_file(&arq).unwrap();
        fs::create_dir(&arq).unwrap();
        assert!(ler_data_js_em(&pacote).unwrap_err().contains("não é um arquivo"));
    }
}
