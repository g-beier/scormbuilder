//! Imagens do rascunho (M9).
//!
//! Cada rascunho guarda as suas imagens em `<app_data>/rascunhos/<id>/img/`,
//! com nome `<16 primeiros hex do sha256>.<ext>` (endereçado pelo conteúdo:
//! a mesma imagem importada duas vezes vira um arquivo só). O bloco do
//! projeto aponta para a imagem pelo campo `arquivo` (`{ tipo: "imagem",
//! arquivo: "0123456789abcdef.png", … }`); o compilador do front gera
//! `src: "img/<arquivo>"` no `data.js`.
//!
//! O tipo é detectado pelo conteúdo (assinatura), nunca pela extensão.
//! Aceita PNG, JPEG, WebP e GIF; SVG é recusado (pode conter script).

use crate::projetos::{gravar_atomico, validar_id};
use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// Limite por imagem: 2 MB.
pub const LIMITE_IMAGEM: u64 = 2 * 1024 * 1024;
const PASTA_RASCUNHOS: &str = "rascunhos";
const PASTA_IMG: &str = "img";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagemImportada {
    /// Nome do arquivo em `img/` (ex.: `0123456789abcdef.png`).
    pub nome: String,
    pub largura: u32,
    pub altura: u32,
    /// Tamanho do arquivo em bytes.
    pub bytes: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoImagem {
    Png,
    Jpeg,
    Webp,
    Gif,
}

impl TipoImagem {
    pub fn extensao(self) -> &'static str {
        match self {
            TipoImagem::Png => "png",
            TipoImagem::Jpeg => "jpg",
            TipoImagem::Webp => "webp",
            TipoImagem::Gif => "gif",
        }
    }

    pub fn mime(self) -> &'static str {
        match self {
            TipoImagem::Png => "image/png",
            TipoImagem::Jpeg => "image/jpeg",
            TipoImagem::Webp => "image/webp",
            TipoImagem::Gif => "image/gif",
        }
    }

    fn da_extensao(ext: &str) -> Option<Self> {
        match ext {
            "png" => Some(TipoImagem::Png),
            "jpg" => Some(TipoImagem::Jpeg),
            "webp" => Some(TipoImagem::Webp),
            "gif" => Some(TipoImagem::Gif),
            _ => None,
        }
    }
}

// ---------- Validação ----------

/// `^[0-9a-f]{16}\.(png|jpg|webp|gif)$`. Impede path traversal e nomes
/// fora do padrão gerado por `importar_imagem`.
pub fn validar_nome_imagem(nome: &str) -> Result<TipoImagem, String> {
    let invalido = || format!("Nome de imagem inválido: “{nome}”.");
    let (hash, ext) = nome.split_once('.').ok_or_else(invalido)?;
    let hash_ok = hash.len() == 16 && hash.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'));
    match TipoImagem::da_extensao(ext) {
        Some(t) if hash_ok => Ok(t),
        _ => Err(invalido()),
    }
}

/// Detecta o tipo pela assinatura do arquivo.
pub fn detectar_tipo(bytes: &[u8]) -> Result<TipoImagem, String> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok(TipoImagem::Png);
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Ok(TipoImagem::Jpeg);
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Ok(TipoImagem::Gif);
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Ok(TipoImagem::Webp);
    }
    if parece_svg(bytes) {
        return Err(
            "Imagens SVG não são aceitas, porque podem conter código. Exporte a imagem como PNG e tente de novo."
                .to_string(),
        );
    }
    Err("Este arquivo não é uma imagem aceita. Use PNG, JPEG, WebP ou GIF.".to_string())
}

fn parece_svg(bytes: &[u8]) -> bool {
    let inicio = &bytes[..bytes.len().min(4096)];
    let texto = String::from_utf8_lossy(inicio).to_ascii_lowercase();
    let t = texto.trim_start_matches('\u{feff}').trim_start();
    (t.starts_with('<')) && texto.contains("<svg")
}

/// `1,5 MB` / `340 KB`.
pub fn tamanho_legivel(bytes: u64) -> String {
    if bytes >= 1024 * 1024 {
        let mb = bytes as f64 / (1024.0 * 1024.0);
        format!("{mb:.1} MB").replace('.', ",")
    } else {
        format!("{} KB", bytes.div_ceil(1024))
    }
}

fn erro_grande(bytes: u64) -> String {
    format!(
        "A imagem tem {}, acima do limite de 2 MB. Reduza o tamanho (ou a resolução) e tente de novo.",
        tamanho_legivel(bytes)
    )
}

/// Nome endereçado pelo conteúdo: 16 primeiros hex do sha256 + extensão.
pub fn nome_por_conteudo(bytes: &[u8], tipo: TipoImagem) -> String {
    let hash = Sha256::digest(bytes);
    let hex: String = hash.iter().take(8).map(|b| format!("{b:02x}")).collect();
    format!("{hex}.{}", tipo.extensao())
}

/// Confere tipo, tamanho e dimensões. Devolve `(tipo, largura, altura)`.
pub fn analisar(bytes: &[u8]) -> Result<(TipoImagem, u32, u32), String> {
    if bytes.len() as u64 > LIMITE_IMAGEM {
        return Err(erro_grande(bytes.len() as u64));
    }
    let tipo = detectar_tipo(bytes)?;
    let corrompida = || "A imagem parece corrompida: não foi possível ler as dimensões.".to_string();
    let dim = imagesize::blob_size(bytes).map_err(|_| corrompida())?;
    let (l, a) = (u32::try_from(dim.width), u32::try_from(dim.height));
    match (l, a) {
        (Ok(l), Ok(a)) if l > 0 && a > 0 => Ok((tipo, l, a)),
        _ => Err(corrompida()),
    }
}

// ---------- Pastas ----------

pub fn pasta_do_rascunho(base: &Path, id: &str) -> Result<PathBuf, String> {
    validar_id(id)?;
    Ok(base.join(PASTA_RASCUNHOS).join(id))
}

pub fn pasta_imagens(base: &Path, id: &str) -> Result<PathBuf, String> {
    Ok(pasta_do_rascunho(base, id)?.join(PASTA_IMG))
}

fn erro_io(acao: &str, e: &io::Error) -> String {
    match e.kind() {
        io::ErrorKind::NotFound => format!("Não foi possível {acao}: o arquivo não foi encontrado."),
        io::ErrorKind::PermissionDenied => {
            format!("Não foi possível {acao}: sem permissão para acessar o local.")
        }
        _ => format!("Não foi possível {acao}: {e}."),
    }
}

/// Grava os bytes (já analisados) em `pasta/<nome>`, se ainda não existir.
pub fn gravar_imagem(pasta: &Path, nome: &str, bytes: &[u8]) -> Result<(), String> {
    let destino = pasta.join(nome);
    if destino.is_file() {
        return Ok(()); // mesmo hash = mesmo conteúdo
    }
    fs::create_dir_all(pasta).map_err(|e| erro_io("criar a pasta de imagens", &e))?;
    gravar_atomico(&destino, bytes).map_err(|e| erro_io("guardar a imagem", &e))
}

// ---------- Operações ----------

/// Copia a imagem de `caminho` para `<base>/rascunhos/<id>/img/`.
pub fn importar_imagem_em(base: &Path, id: &str, caminho: &Path) -> Result<ImagemImportada, String> {
    let pasta = pasta_imagens(base, id)?;
    let meta = fs::metadata(caminho).map_err(|e| erro_io("ler a imagem", &e))?;
    if !meta.is_file() {
        return Err("O item escolhido não é um arquivo de imagem.".to_string());
    }
    if meta.len() > LIMITE_IMAGEM {
        return Err(erro_grande(meta.len()));
    }
    let bytes = fs::read(caminho).map_err(|e| erro_io("ler a imagem", &e))?;
    let (tipo, largura, altura) = analisar(&bytes)?;
    let nome = nome_por_conteudo(&bytes, tipo);
    gravar_imagem(&pasta, &nome, &bytes)?;
    Ok(ImagemImportada { nome, largura, altura, bytes: bytes.len() as u64 })
}

/// Lê a imagem do rascunho como `data:` URL (para a miniatura e a prévia).
pub fn ler_imagem_em(base: &Path, id: &str, nome: &str) -> Result<String, String> {
    let tipo = validar_nome_imagem(nome)?;
    let caminho = pasta_imagens(base, id)?.join(nome);
    let bytes = fs::read(&caminho).map_err(|e| match e.kind() {
        io::ErrorKind::NotFound => {
            "A imagem não foi encontrada no rascunho. Escolha a imagem de novo.".to_string()
        }
        _ => erro_io("ler a imagem", &e),
    })?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{b64}", tipo.mime()))
}

/// Apaga de `img/` as imagens (nomes válidos) que não estão em `usadas`.
/// Devolve os nomes apagados, em ordem.
pub fn limpar_imagens_orfas_em(base: &Path, id: &str, usadas: &[String]) -> Result<Vec<String>, String> {
    let pasta = pasta_imagens(base, id)?;
    let usadas: BTreeSet<&str> = usadas.iter().map(String::as_str).collect();
    let entradas = match fs::read_dir(&pasta) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(erro_io("ler a pasta de imagens", &e)),
    };
    let mut apagadas = Vec::new();
    for e in entradas.filter_map(Result::ok) {
        let nome = e.file_name().to_string_lossy().into_owned();
        // Só mexe no que segue o padrão (não apaga um `.tmp` de importação em curso).
        if validar_nome_imagem(&nome).is_err() || usadas.contains(nome.as_str()) {
            continue;
        }
        match fs::remove_file(e.path()) {
            Ok(()) => apagadas.push(nome),
            Err(err) if err.kind() == io::ErrorKind::NotFound => {}
            Err(err) => return Err(erro_io("apagar uma imagem sem uso", &err)),
        }
    }
    apagadas.sort();
    Ok(apagadas)
}

/// Imagens usadas pelo projeto: o campo `arquivo` de todo objeto com
/// `tipo: "imagem"` dentro de `slides` (em qualquer profundidade). Bloco sem
/// arquivo escolhido (`arquivo` ausente ou vazio) é ignorado.
pub fn imagens_do_projeto(projeto: &Value) -> Result<BTreeSet<String>, String> {
    fn visitar(v: &Value, saida: &mut BTreeSet<String>) -> Result<(), String> {
        match v {
            Value::Array(a) => a.iter().try_for_each(|x| visitar(x, saida)),
            Value::Object(o) => {
                if o.get("tipo").and_then(Value::as_str) == Some("imagem")
                    && let Some(nome) = o.get("arquivo").and_then(Value::as_str)
                    && !nome.is_empty()
                {
                    validar_nome_imagem(nome)?;
                    saida.insert(nome.to_string());
                }
                o.values().try_for_each(|x| visitar(x, saida))
            }
            _ => Ok(()),
        }
    }
    let mut saida = BTreeSet::new();
    if let Some(slides) = projeto.get("slides") {
        visitar(slides, &mut saida)?;
    }
    Ok(saida)
}

// ---------- Comandos ----------

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "Não foi possível localizar a pasta de dados do aplicativo.".to_string())
}

pub(crate) async fn em_segundo_plano<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|_| "A operação foi interrompida inesperadamente.".to_string())?
}

#[tauri::command]
pub async fn importar_imagem(app: AppHandle, id: String, caminho: String) -> Result<ImagemImportada, String> {
    let base = app_data(&app)?;
    em_segundo_plano(move || importar_imagem_em(&base, &id, Path::new(&caminho))).await
}

#[tauri::command]
pub async fn ler_imagem(app: AppHandle, id: String, nome: String) -> Result<String, String> {
    let base = app_data(&app)?;
    em_segundo_plano(move || ler_imagem_em(&base, &id, &nome)).await
}

#[tauri::command]
pub async fn limpar_imagens_orfas(app: AppHandle, id: String, usadas: Vec<String>) -> Result<Vec<String>, String> {
    let base = app_data(&app)?;
    em_segundo_plano(move || limpar_imagens_orfas_em(&base, &id, &usadas)).await
}

// ---------- Testes ----------

#[cfg(test)]
pub(crate) mod testes {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    pub(crate) struct PastaTemp(pub PathBuf);
    impl PastaTemp {
        pub fn nova() -> Self {
            static N: AtomicUsize = AtomicUsize::new(0);
            let p = std::env::temp_dir().join(format!(
                "scorm-builder-img-teste-{}-{}",
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

    /// PNG mínimo válido (cabeçalho + IHDR) com as dimensões pedidas.
    /// `semente` muda os bytes finais para gerar hashes diferentes.
    pub(crate) fn png(largura: u32, altura: u32, semente: u8) -> Vec<u8> {
        let mut v = b"\x89PNG\r\n\x1a\n".to_vec();
        v.extend_from_slice(&13u32.to_be_bytes());
        v.extend_from_slice(b"IHDR");
        v.extend_from_slice(&largura.to_be_bytes());
        v.extend_from_slice(&altura.to_be_bytes());
        v.extend_from_slice(&[8, 6, 0, 0, 0]);
        v.extend_from_slice(&[0, 0, 0, 0]); // CRC (não conferido)
        v.extend_from_slice(&[0, 0, 0, 0, b'I', b'E', b'N', b'D', semente, 0, 0, 0]);
        v
    }

    fn gif(l: u16, a: u16) -> Vec<u8> {
        let mut v = b"GIF89a".to_vec();
        v.extend_from_slice(&l.to_le_bytes());
        v.extend_from_slice(&a.to_le_bytes());
        v.extend_from_slice(&[0, 0, 0, 0x3b]);
        v
    }

    fn jpeg(l: u16, a: u16) -> Vec<u8> {
        let mut v = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
        v.extend_from_slice(b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
        // SOF0
        v.extend_from_slice(&[0xFF, 0xC0, 0x00, 0x11, 0x08]);
        v.extend_from_slice(&a.to_be_bytes());
        v.extend_from_slice(&l.to_be_bytes());
        v.extend_from_slice(&[0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
        v.extend_from_slice(&[0xFF, 0xD9]);
        v
    }

    fn webp(l: u32, a: u32) -> Vec<u8> {
        // VP8X: largura-1 e altura-1 em 24 bits.
        let mut chunk = b"VP8X".to_vec();
        chunk.extend_from_slice(&10u32.to_le_bytes());
        chunk.extend_from_slice(&[0, 0, 0, 0]);
        chunk.extend_from_slice(&(l - 1).to_le_bytes()[..3]);
        chunk.extend_from_slice(&(a - 1).to_le_bytes()[..3]);
        let mut v = b"RIFF".to_vec();
        v.extend_from_slice(&((4 + chunk.len()) as u32).to_le_bytes());
        v.extend_from_slice(b"WEBP");
        v.extend_from_slice(&chunk);
        v
    }

    fn escrever(t: &PastaTemp, nome: &str, bytes: &[u8]) -> PathBuf {
        let p = t.0.join(nome);
        fs::write(&p, bytes).unwrap();
        p
    }

    #[test]
    fn aceita_png_jpeg_webp_gif_pelo_conteudo() {
        let t = PastaTemp::nova();
        let base = t.0.join("dados");
        for (arq, bytes, ext, l, a) in [
            ("a.png", png(640, 480, 1), "png", 640, 480),
            // extensão errada não importa: vale o conteúdo
            ("foto.png", jpeg(300, 200), "jpg", 300, 200),
            ("b.webp", webp(1024, 768), "webp", 1024, 768),
            ("c.gif", gif(32, 16), "gif", 32, 16),
        ] {
            let caminho = escrever(&t, arq, &bytes);
            let r = importar_imagem_em(&base, "p1", &caminho).unwrap();
            assert_eq!((r.largura, r.altura), (l, a), "{arq}");
            assert_eq!(r.bytes, bytes.len() as u64);
            assert!(r.nome.ends_with(&format!(".{ext}")), "{arq}: {}", r.nome);
            assert_eq!(validar_nome_imagem(&r.nome).unwrap().extensao(), ext);
            assert_eq!(fs::read(base.join("rascunhos/p1/img").join(&r.nome)).unwrap(), bytes);
        }
    }

    #[test]
    fn recusa_svg_texto_e_corrompida() {
        let t = PastaTemp::nova();
        let base = t.0.join("dados");
        let svg = escrever(&t, "x.svg", b"<?xml version=\"1.0\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");
        assert!(importar_imagem_em(&base, "p1", &svg).unwrap_err().contains("SVG"));
        let svg_png = escrever(&t, "y.png", b"  <svg></svg>");
        assert!(importar_imagem_em(&base, "p1", &svg_png).unwrap_err().contains("SVG"));
        let texto = escrever(&t, "falsa.png", b"isto e um texto, nao uma imagem");
        assert!(importar_imagem_em(&base, "p1", &texto).unwrap_err().contains("não é uma imagem aceita"));
        // Assinatura PNG sem IHDR: dimensões ilegíveis.
        let quebrada = escrever(&t, "q.png", b"\x89PNG\r\n\x1a\n");
        assert!(importar_imagem_em(&base, "p1", &quebrada).unwrap_err().contains("corrompida"));
        assert!(importar_imagem_em(&base, "p1", &t.0.join("nada.png")).unwrap_err().contains("não foi encontrado"));
        assert!(importar_imagem_em(&base, "p1", &t.0).unwrap_err().contains("não é um arquivo"));
        assert!(!base.join("rascunhos/p1/img").exists() || fs::read_dir(base.join("rascunhos/p1/img")).unwrap().next().is_none());
    }

    #[test]
    fn limite_de_2_mb_com_tamanho_na_mensagem() {
        let t = PastaTemp::nova();
        let mut grande = png(10, 10, 0);
        grande.resize((LIMITE_IMAGEM + 400 * 1024) as usize, 0);
        let c = escrever(&t, "g.png", &grande);
        let erro = importar_imagem_em(&t.0, "p1", &c).unwrap_err();
        assert!(erro.contains("2,4 MB") && erro.contains("limite de 2 MB"), "{erro}");
        // No limite exato, aceita.
        grande.truncate(LIMITE_IMAGEM as usize);
        let c = escrever(&t, "g2.png", &grande);
        assert!(importar_imagem_em(&t.0, "p1", &c).is_ok());
    }

    #[test]
    fn mesmo_conteudo_reaproveita_o_arquivo() {
        let t = PastaTemp::nova();
        let a = escrever(&t, "a.png", &png(5, 5, 7));
        let b = escrever(&t, "copia com outro nome.png", &png(5, 5, 7));
        let c = escrever(&t, "c.png", &png(5, 5, 8));
        let ra = importar_imagem_em(&t.0, "p1", &a).unwrap();
        let rb = importar_imagem_em(&t.0, "p1", &b).unwrap();
        let rc = importar_imagem_em(&t.0, "p1", &c).unwrap();
        assert_eq!(ra, rb);
        assert_ne!(ra.nome, rc.nome);
        assert_eq!(ra.nome, nome_por_conteudo(&png(5, 5, 7), TipoImagem::Png));
        let n = fs::read_dir(t.0.join("rascunhos/p1/img")).unwrap().count();
        assert_eq!(n, 2);
    }

    #[test]
    fn nomes_e_ids_invalidos_sao_recusados() {
        for nome in [
            "",
            "../0123456789abcdef.png",
            "0123456789abcdef.svg",
            "0123456789ABCDEF.png",
            "0123456789abcde.png",
            "0123456789abcdef0.png",
            "0123456789abcdef.png/..",
            "0123456789abcdef.jpeg",
            "0123456789abcdef",
            "0123456789abcdef.png.tmp",
        ] {
            assert!(validar_nome_imagem(nome).is_err(), "{nome:?}");
        }
        assert!(validar_nome_imagem("0123456789abcdef.webp").is_ok());

        let t = PastaTemp::nova();
        let a = escrever(&t, "a.png", &png(5, 5, 1));
        for id in ["../fora", "..", "a/b", ""] {
            assert!(importar_imagem_em(&t.0, id, &a).unwrap_err().contains("Identificador"));
            assert!(ler_imagem_em(&t.0, id, "0123456789abcdef.png").is_err());
            assert!(limpar_imagens_orfas_em(&t.0, id, &[]).is_err());
        }
        assert!(!t.0.join("fora").exists() && !t.0.join("img").exists());
        assert!(ler_imagem_em(&t.0, "p1", "../a.png").unwrap_err().contains("inválido"));
    }

    #[test]
    fn ler_imagem_devolve_data_url() {
        let t = PastaTemp::nova();
        let bytes = png(2, 3, 0);
        let r = importar_imagem_em(&t.0, "p1", &escrever(&t, "a.png", &bytes)).unwrap();
        let url = ler_imagem_em(&t.0, "p1", &r.nome).unwrap();
        let esperado = base64::engine::general_purpose::STANDARD.encode(&bytes);
        assert_eq!(url, format!("data:image/png;base64,{esperado}"));
        assert!(ler_imagem_em(&t.0, "p1", "0123456789abcdef.png").unwrap_err().contains("não foi encontrada"));
    }

    #[test]
    fn limpa_orfas_e_mantem_usadas() {
        let t = PastaTemp::nova();
        assert!(limpar_imagens_orfas_em(&t.0, "p1", &[]).unwrap().is_empty()); // sem pasta
        let r1 = importar_imagem_em(&t.0, "p1", &escrever(&t, "1.png", &png(1, 1, 1))).unwrap();
        let r2 = importar_imagem_em(&t.0, "p1", &escrever(&t, "2.png", &png(1, 1, 2))).unwrap();
        let r3 = importar_imagem_em(&t.0, "p1", &escrever(&t, "3.png", &png(1, 1, 3))).unwrap();
        let pasta = t.0.join("rascunhos/p1/img");
        fs::write(pasta.join("x.png.tmp"), b"em curso").unwrap();
        let apagadas = limpar_imagens_orfas_em(&t.0, "p1", std::slice::from_ref(&r2.nome)).unwrap();
        let mut esperado = vec![r1.nome.clone(), r3.nome.clone()];
        esperado.sort();
        assert_eq!(apagadas, esperado);
        assert!(pasta.join(&r2.nome).is_file());
        assert!(pasta.join("x.png.tmp").is_file());
        assert!(!pasta.join(&r1.nome).exists());
    }

    #[test]
    fn imagens_do_projeto_percorre_os_blocos() {
        let p = json!({ "slides": [
            { "tipo": "conteudo", "blocos": [
                { "tipo": "imagem", "arquivo": "0123456789abcdef.png", "alt": "x" },
                { "tipo": "imagem", "arquivo": "" },
                { "tipo": "imagem" },
                { "tipo": "texto", "arquivo": "ignorado" },
                { "tipo": "cards", "cards": [{ "tipo": "imagem", "arquivo": "fedcba9876543210.webp" }] }
            ]},
            { "tipo": "conteudo", "blocos": [{ "tipo": "imagem", "arquivo": "0123456789abcdef.png" }] }
        ]});
        let v: Vec<_> = imagens_do_projeto(&p).unwrap().into_iter().collect();
        assert_eq!(v, vec!["0123456789abcdef.png", "fedcba9876543210.webp"]);
        let ruim = json!({ "slides": [{ "blocos": [{ "tipo": "imagem", "arquivo": "../x.png" }] }] });
        assert!(imagens_do_projeto(&ruim).unwrap_err().contains("inválido"));
    }

    #[test]
    fn tamanho_legivel_em_pt_br() {
        assert_eq!(tamanho_legivel(500), "1 KB");
        assert_eq!(tamanho_legivel(340 * 1024), "340 KB");
        assert_eq!(tamanho_legivel(3 * 1024 * 1024 + 400 * 1024), "3,4 MB");
    }
}
