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
use std::io::{self, Read, Seek, SeekFrom, Write};
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

// ---------- Arquivo .cevscorm (zip) ----------
//
// Desde o M9 o `.cevscorm` é um zip: `projeto.json` (JSON indentado) e
// `img/<nome>` para cada imagem usada pelo projeto. O `.cevscorm` da 0.1.0
// (JSON puro) continua abrindo: a detecção é pela assinatura `PK\x03\x04`.

const PROJETO_JSON: &str = "projeto.json";
const ASSINATURA_ZIP: &[u8; 4] = b"PK\x03\x04";
/// Limite do `projeto.json` descompactado.
const LIMITE_PROJETO_JSON: u64 = 20 * 1024 * 1024;
/// Limite da soma do que é descompactado ao abrir (proteção contra zip bomb).
pub const LIMITE_TOTAL_ARQUIVO: u64 = 200 * 1024 * 1024;
const LIMITE_ENTRADAS: usize = 10_000;

fn com_extensao(caminho: &Path) -> PathBuf {
    let mut destino = caminho.to_path_buf();
    if destino.extension().and_then(|x| x.to_str()) != Some(EXTENSAO_ARQUIVO) {
        let mut nome = destino.as_os_str().to_os_string();
        nome.push(".");
        nome.push(EXTENSAO_ARQUIVO);
        destino = PathBuf::from(nome);
    }
    destino
}

/// Grava o projeto como zip em `caminho` (acrescenta `.cevscorm` se faltar),
/// levando as imagens usadas de `<base>/rascunhos/<id>/img/`. Gravação
/// atômica (`.tmp` + rename). Devolve o caminho final.
pub fn salvar_arquivo_em(base: &Path, caminho: &Path, projeto: &Value) -> Result<PathBuf, String> {
    let id = validar_projeto(projeto)?;
    let pasta_img = imagens::pasta_imagens(base, id)?;
    let usadas = imagens::imagens_do_projeto(projeto)?;
    for nome in &usadas {
        if !pasta_img.join(nome).is_file() {
            return Err(format!(
                "A imagem {nome} usada no projeto não foi encontrada. Escolha a imagem de novo no bloco Imagem e salve outra vez."
            ));
        }
    }
    let json = serde_json::to_vec_pretty(projeto)
        .map_err(|e| format!("Não foi possível preparar o arquivo: {e}."))?;

    let destino = com_extensao(caminho);
    let mut nome_tmp = destino
        .file_name()
        .ok_or_else(|| "Destino do arquivo inválido.".to_string())?
        .to_os_string();
    nome_tmp.push(".tmp");
    let tmp = destino.with_file_name(nome_tmp);
    let resultado = (|| -> Result<(), String> {
        let f = fs::File::create(&tmp).map_err(|e| erro_io("salvar o arquivo", &e))?;
        let mut z = zip::ZipWriter::new(f);
        let opcoes = zip::write::SimpleFileOptions::default()
            .last_modified_time(crate::exportar::agora_zip())
            .unix_permissions(0o644);
        let erro_zip = |e: zip::result::ZipError| format!("Não foi possível montar o arquivo: {e}.");
        let erro_gravar = |e: io::Error| erro_io("salvar o arquivo", &e);
        z.start_file(PROJETO_JSON, opcoes.compression_method(zip::CompressionMethod::Deflated))
            .map_err(erro_zip)?;
        z.write_all(&json).map_err(erro_gravar)?;
        for nome in &usadas {
            let bytes = fs::read(pasta_img.join(nome)).map_err(|e| erro_io(&format!("ler a imagem {nome}"), &e))?;
            // Imagens já são comprimidas: guardar sem recompactar.
            z.start_file(format!("img/{nome}"), opcoes.compression_method(zip::CompressionMethod::Stored))
                .map_err(erro_zip)?;
            z.write_all(&bytes).map_err(erro_gravar)?;
        }
        let f = z.finish().map_err(erro_zip)?;
        f.sync_all().map_err(erro_gravar)?;
        drop(f);
        fs::rename(&tmp, &destino).map_err(erro_gravar)
    })();
    if let Err(e) = resultado {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(destino)
}

/// Abre um `.cevscorm`: zip (M9) ou JSON puro (0.1.0). No zip, as imagens
/// são conferidas e extraídas para `<base>/rascunhos/<id>/img/`.
pub fn abrir_arquivo_em(base: &Path, caminho: &Path) -> Result<Value, String> {
    abrir_arquivo_com_limite(base, caminho, LIMITE_TOTAL_ARQUIVO)
}

fn abrir_arquivo_com_limite(base: &Path, caminho: &Path, limite_total: u64) -> Result<Value, String> {
    let mut f = fs::File::open(caminho).map_err(|e| erro_io("abrir o arquivo", &e))?;
    let mut cabecalho = Vec::with_capacity(4);
    (&mut f)
        .take(4)
        .read_to_end(&mut cabecalho)
        .map_err(|e| erro_io("abrir o arquivo", &e))?;
    if cabecalho.as_slice() != ASSINATURA_ZIP {
        drop(f);
        return ler_projeto(caminho, "abrir o arquivo"); // .cevscorm da 0.1.0
    }
    f.seek(SeekFrom::Start(0)).map_err(|e| erro_io("abrir o arquivo", &e))?;
    abrir_zip(base, f, limite_total)
}

fn corrompido() -> String {
    "O arquivo está corrompido ou não é um projeto válido.".to_string()
}

/// Lê no máximo `limite` bytes descompactados; passou disso, é erro.
fn ler_limitado(item: impl Read, limite: u64) -> Result<Option<Vec<u8>>, String> {
    let mut v = Vec::new();
    item.take(limite + 1)
        .read_to_end(&mut v)
        .map_err(|_| corrompido())?;
    Ok(if v.len() as u64 > limite { None } else { Some(v) })
}

fn abrir_zip(base: &Path, f: fs::File, limite_total: u64) -> Result<Value, String> {
    let mut z = zip::ZipArchive::new(f).map_err(|_| corrompido())?;
    if z.len() > LIMITE_ENTRADAS {
        return Err("O arquivo tem itens demais para ser um projeto válido.".to_string());
    }
    let grande_demais = || "O arquivo é grande demais para abrir (mais de 200 MB descompactado).".to_string();

    // 1ª passada: só nomes (sem descompactar). Recusa caminhos indevidos.
    let mut imagens_zip = Vec::new();
    for i in 0..z.len() {
        let item = z.by_index_raw(i).map_err(|_| corrompido())?;
        let nome = item.name().map_err(|_| corrompido())?.into_owned();
        let indevido = nome.starts_with('/')
            || nome.contains('\\')
            || nome.contains(':')
            || nome.split('/').any(|p| p == ".." || p == ".")
            || item.enclosed_name().is_none();
        if indevido {
            return Err(format!("O arquivo tem um caminho indevido: {nome}"));
        }
        if item.is_dir() || nome == PROJETO_JSON {
            continue;
        }
        if let Some(img) = nome.strip_prefix("img/") {
            imagens::validar_nome_imagem(img)
                .map_err(|_| format!("O arquivo tem uma imagem com nome inválido: {nome}"))?;
            imagens_zip.push((i, img.to_string()));
        } else {
            // Itens desconhecidos (ex.: `fontes/` de versões futuras, `__MACOSX/`) são ignorados.
            eprintln!("[cevscorm] item ignorado: {nome}");
        }
    }

    // projeto.json
    let json = match z.by_name(PROJETO_JSON) {
        Ok(item) => ler_limitado(item, LIMITE_PROJETO_JSON)?.ok_or_else(grande_demais)?,
        Err(zip::result::ZipError::FileNotFound) => {
            return Err("O arquivo não tem o projeto (projeto.json) dentro dele.".to_string());
        }
        Err(_) => return Err(corrompido()),
    };
    let mut total = json.len() as u64;
    let projeto: Value = serde_json::from_slice(&json).map_err(|_| corrompido())?;
    let id = validar_projeto(&projeto)?;
    let pasta = imagens::pasta_imagens(base, id)?;

    // 2ª passada: imagens, conferidas (tipo, tamanho e hash = nome).
    for (i, nome) in imagens_zip {
        let item = z.by_index(i).map_err(|_| corrompido())?;
        let bytes = ler_limitado(item, imagens::LIMITE_IMAGEM)?
            .ok_or_else(|| format!("A imagem {nome} do arquivo passa do limite de 2 MB."))?;
        total += bytes.len() as u64;
        if total > limite_total {
            return Err(grande_demais());
        }
        let quebrada = || format!("A imagem {nome} do arquivo está corrompida.");
        let (tipo, _, _) = imagens::analisar(&bytes).map_err(|_| quebrada())?;
        if imagens::nome_por_conteudo(&bytes, tipo) != nome {
            return Err(quebrada());
        }
        imagens::gravar_imagem(&pasta, &nome, &bytes)?;
    }
    Ok(projeto)
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
pub async fn salvar_arquivo(app: AppHandle, caminho: String, projeto: Value) -> Result<String, String> {
    let base = app_data(&app)?;
    imagens::em_segundo_plano(move || {
        salvar_arquivo_em(&base, Path::new(&caminho), &projeto).map(|p| p.to_string_lossy().into_owned())
    })
    .await
}

#[tauri::command]
pub async fn abrir_arquivo(app: AppHandle, caminho: String) -> Result<Value, String> {
    let base = app_data(&app)?;
    imagens::em_segundo_plano(move || abrir_arquivo_em(&base, Path::new(&caminho))).await
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

    fn nomes_no_zip(caminho: &Path) -> Vec<String> {
        let mut z = zip::ZipArchive::new(fs::File::open(caminho).unwrap()).unwrap();
        (0..z.len())
            .map(|i| z.by_index(i).unwrap().name().unwrap().into_owned())
            .collect()
    }

    /// Monta um zip com os itens dados (nome, conteúdo), sem validação.
    fn zip_cru(caminho: &Path, itens: &[(&str, &[u8])]) {
        let mut z = zip::ZipWriter::new(fs::File::create(caminho).unwrap());
        let o = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        for (nome, bytes) in itens {
            z.start_file(*nome, o).unwrap();
            z.write_all(bytes).unwrap();
        }
        z.finish().unwrap();
    }

    fn com_imagem(id: &str, nome: &str) -> Value {
        let mut p = projeto(id, "2026-03-01T10:00:00.000Z");
        p["slides"] = json!([
            { "tipo": "capa" },
            { "tipo": "conteudo", "blocos": [
                { "id": "b-1", "tipo": "imagem", "arquivo": nome, "alt": "Escoteiros acampando" }
            ]},
            { "tipo": "fim" }
        ]);
        p
    }

    #[test]
    fn ida_e_volta_do_arquivo_cevscorm() {
        let t = PastaTemp::nova();
        let p = projeto("arq", "2026-03-01T10:00:00.000Z");
        let final_ = salvar_arquivo_em(&t.0, &t.0.join("meu projeto"), &p).unwrap();
        assert_eq!(final_, t.0.join("meu projeto.cevscorm"));
        assert!(fs::read(&final_).unwrap().starts_with(ASSINATURA_ZIP), "deveria ser zip");
        assert_eq!(nomes_no_zip(&final_), vec![PROJETO_JSON]);
        assert_eq!(abrir_arquivo_em(&t.0, &final_).unwrap(), p);

        let com_ext = t.0.join("b.cevscorm");
        assert_eq!(salvar_arquivo_em(&t.0, &com_ext, &p).unwrap(), com_ext);
        assert!(!t.0.join("b.cevscorm.tmp").exists());

        let ruim = t.0.join("ruim.cevscorm");
        fs::write(&ruim, br#"{"formato":"outro"}"#).unwrap();
        assert!(abrir_arquivo_em(&t.0, &ruim).unwrap_err().contains("não é um projeto"));
        fs::write(&ruim, b"lixo").unwrap();
        assert!(abrir_arquivo_em(&t.0, &ruim).unwrap_err().contains("corrompido"));
        fs::write(&ruim, b"").unwrap();
        assert!(abrir_arquivo_em(&t.0, &ruim).unwrap_err().contains("corrompido"));
        fs::write(&ruim, b"PK\x03\x04 truncado").unwrap();
        assert!(abrir_arquivo_em(&t.0, &ruim).unwrap_err().contains("corrompido"));
        assert!(
            abrir_arquivo_em(&t.0, &t.0.join("nada.cevscorm"))
                .unwrap_err()
                .contains("não foi encontrado")
        );
    }

    #[test]
    fn abre_cevscorm_json_da_versao_0_1_0() {
        let t = PastaTemp::nova();
        let p = projeto("legado", "2026-01-01T00:00:00.000Z");
        let arq = t.0.join("antigo.cevscorm");
        fs::write(&arq, serde_json::to_vec_pretty(&p).unwrap()).unwrap();
        assert_eq!(abrir_arquivo_em(&t.0, &arq).unwrap(), p);
        assert!(!t.0.join("rascunhos").exists());
    }

    #[test]
    fn ida_e_volta_com_imagem_leva_so_as_usadas() {
        let origem = PastaTemp::nova();
        let png = imagens::testes::png(40, 30, 1);
        let entrada = origem.0.join("foto.png");
        fs::write(&entrada, &png).unwrap();
        let usada = imagens::importar_imagem_em(&origem.0, "arq", &entrada).unwrap().nome;
        fs::write(&entrada, imagens::testes::png(40, 30, 2)).unwrap();
        let sobra = imagens::importar_imagem_em(&origem.0, "arq", &entrada).unwrap().nome;

        let p = com_imagem("arq", &usada);
        let arq = salvar_arquivo_em(&origem.0, &origem.0.join("x"), &p).unwrap();
        let mut nomes = nomes_no_zip(&arq);
        nomes.sort();
        assert_eq!(nomes, vec![format!("img/{usada}"), PROJETO_JSON.to_string()]);
        assert!(!nomes.contains(&format!("img/{sobra}")));

        // Abre em outro computador (app_data vazia): a imagem vai para o rascunho.
        let destino = PastaTemp::nova();
        assert_eq!(abrir_arquivo_em(&destino.0, &arq).unwrap(), p);
        let img = destino.0.join("rascunhos/arq/img");
        assert_eq!(fs::read(img.join(&usada)).unwrap(), png);
        assert_eq!(fs::read_dir(&img).unwrap().count(), 1);
        // Abrir de novo (imagem já existe) não falha.
        assert_eq!(abrir_arquivo_em(&destino.0, &arq).unwrap(), p);
    }

    #[test]
    fn salvar_com_imagem_faltando_e_erro() {
        let t = PastaTemp::nova();
        let p = com_imagem("arq", "0123456789abcdef.png");
        let erro = salvar_arquivo_em(&t.0, &t.0.join("x"), &p).unwrap_err();
        assert!(erro.contains("0123456789abcdef.png") && erro.contains("não foi encontrada"), "{erro}");
        assert!(!t.0.join("x.cevscorm").exists() && !t.0.join("x.cevscorm.tmp").exists());
        let p = com_imagem("arq", "../../segredo.png");
        assert!(salvar_arquivo_em(&t.0, &t.0.join("x"), &p).unwrap_err().contains("inválido"));
    }

    #[test]
    fn zip_slip_e_nomes_invalidos_sao_recusados() {
        let t = PastaTemp::nova();
        let base = t.0.join("dados");
        let json = projeto("arq", "x").to_string();
        let png = imagens::testes::png(1, 1, 0);
        for nome in [
            "../fora.png",
            "img/../../fora.png",
            "/abs/fora.png",
            "img\\..\\fora.png",
            "img/0123456789abcdef.svg",
            "img/../0123456789abcdef.png",
            "img/sub/0123456789abcdef.png",
        ] {
            let arq = t.0.join("m.cevscorm");
            zip_cru(&arq, &[(PROJETO_JSON, json.as_bytes()), (nome, &png)]);
            let erro = abrir_arquivo_em(&base, &arq).unwrap_err();
            assert!(erro.contains("indevido") || erro.contains("inválido"), "{nome}: {erro}");
        }
        assert!(!t.0.join("fora.png").exists());
        assert!(!base.exists(), "nada deveria ter sido gravado");
    }

    #[test]
    fn zip_com_imagem_adulterada_ou_sem_projeto_e_recusado() {
        let t = PastaTemp::nova();
        let json = projeto("arq", "x").to_string();
        let arq = t.0.join("m.cevscorm");

        // Nome não confere com o conteúdo.
        zip_cru(&arq, &[(PROJETO_JSON, json.as_bytes()), ("img/0123456789abcdef.png", &imagens::testes::png(1, 1, 0))]);
        assert!(abrir_arquivo_em(&t.0, &arq).unwrap_err().contains("corrompida"));
        // Texto com nome de PNG.
        zip_cru(&arq, &[(PROJETO_JSON, json.as_bytes()), ("img/0123456789abcdef.png", b"texto")]);
        assert!(abrir_arquivo_em(&t.0, &arq).unwrap_err().contains("corrompida"));
        // Sem projeto.json.
        zip_cru(&arq, &[("outro.json", json.as_bytes())]);
        assert!(abrir_arquivo_em(&t.0, &arq).unwrap_err().contains("projeto.json"));
        // projeto.json de outro formato.
        zip_cru(&arq, &[(PROJETO_JSON, br#"{"formato":"outro"}"#)]);
        assert!(abrir_arquivo_em(&t.0, &arq).unwrap_err().contains("não é um projeto"));
        // Itens desconhecidos (versões futuras, __MACOSX) são ignorados.
        zip_cru(&arq, &[(PROJETO_JSON, json.as_bytes()), ("fontes/a.woff2", b"x"), ("__MACOSX/._x", b"x")]);
        assert_eq!(abrir_arquivo_em(&t.0, &arq).unwrap(), projeto("arq", "x"));
    }

    #[test]
    fn zip_bomb_e_recusado() {
        let t = PastaTemp::nova();
        let json = projeto("arq", "x").to_string();
        let arq = t.0.join("bomba.cevscorm");
        // Imagem que descompacta para mais de 2 MB (zeros comprimem muito).
        let mut grande = imagens::testes::png(1, 1, 0);
        grande.resize((imagens::LIMITE_IMAGEM + 1) as usize, 0);
        zip_cru(&arq, &[(PROJETO_JSON, json.as_bytes()), ("img/0123456789abcdef.png", &grande)]);
        assert!(fs::metadata(&arq).unwrap().len() < 100_000);
        assert!(abrir_arquivo_em(&t.0, &arq).unwrap_err().contains("limite de 2 MB"));

        // Limite total: com um teto pequeno, duas imagens válidas já passam dele.
        let (a, b) = (imagens::testes::png(1, 1, 1), imagens::testes::png(1, 1, 2));
        let na = imagens::nome_por_conteudo(&a, imagens::TipoImagem::Png);
        let nb = imagens::nome_por_conteudo(&b, imagens::TipoImagem::Png);
        zip_cru(&arq, &[(PROJETO_JSON, json.as_bytes()), (&format!("img/{na}"), &a), (&format!("img/{nb}"), &b)]);
        let limite = (json.len() + a.len() + 1) as u64;
        assert!(abrir_arquivo_com_limite(&t.0, &arq, limite).unwrap_err().contains("grande demais"));
        assert!(abrir_arquivo_com_limite(&t.0, &arq, limite + b.len() as u64).is_ok());
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
