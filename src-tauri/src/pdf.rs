//! PDF da leitura (M7): compila um documento Typst (gerado no front por
//! `src/modelo/pdf.ts`) e grava um PDF marcado (PDF/UA-1) direto no destino,
//! sem o diálogo de impressão. As fontes do tema (Poppins e Krona One, OFL)
//! vão embutidas no binário, em `src-tauri/fonts/`.
//!
//! Imagens (M9): o documento cita `img/<arquivo>` e o mundo serve os bytes de
//! `<app_data>/rascunhos/<id>/img/<arquivo>`, só para nomes no padrão do
//! rascunho (`imagens::validar_nome_imagem`). Nada mais do disco é acessível.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use typst::diag::{FileError, FileResult, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_layout::PagedDocument;
use typst_pdf::{PdfOptions, PdfStandard, PdfStandards};
use tauri::{AppHandle, Manager};

use crate::exportar::{validar_nome_pacote, ResultadoExportacao, PREFIXO_JA_EXISTE};
use crate::imagens;

const FONTES: [&[u8]; 7] = [
    include_bytes!("../fonts/Poppins-Regular.ttf"),
    include_bytes!("../fonts/Poppins-Italic.ttf"),
    include_bytes!("../fonts/Poppins-SemiBold.ttf"),
    include_bytes!("../fonts/Poppins-SemiBoldItalic.ttf"),
    include_bytes!("../fonts/Poppins-Bold.ttf"),
    include_bytes!("../fonts/Poppins-BoldItalic.ttf"),
    include_bytes!("../fonts/KronaOne-Regular.ttf"),
];

/// Mundo Typst mínimo: um só arquivo-fonte, só as fontes embutidas, sem pacotes.
/// Do disco, só as imagens `img/<nome>` da pasta `imagens` (se houver).
struct Mundo {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fontes: Vec<Font>,
    principal: Source,
    imagens: Option<PathBuf>,
}

impl Mundo {
    fn novo(texto: &str, imagens: Option<PathBuf>) -> Self {
        // Fontes do tema primeiro; as do typst-assets (Libertinus, New Computer Modern,
        // DejaVu Sans Mono; licenças livres) só entram como reserva para símbolos que a
        // Poppins não tem (setas, sinais matemáticos), via fallback do Typst.
        let fontes: Vec<Font> = FONTES
            .iter()
            .copied()
            .chain(typst_assets::fonts())
            .flat_map(|d| Font::iter(Bytes::new(d)))
            .collect();
        let id = RootedPath::new(VirtualRoot::Project, VirtualPath::new("leitura.typ").expect("caminho fixo válido")).intern();
        Self {
            library: LazyHash::new(Library::default()),
            book: LazyHash::new(FontBook::from_fonts(&fontes)),
            fontes,
            principal: Source::new(id, texto.to_string()),
            imagens,
        }
    }

    /// Bytes de `img/<nome>`: nome validado, lido da pasta de imagens do rascunho.
    fn imagem(&self, id: FileId) -> FileResult<Bytes> {
        let caminho = id.get();
        if !matches!(caminho.root(), VirtualRoot::Project) {
            return Err(FileError::AccessDenied);
        }
        let rel = caminho.vpath().get_without_slash();
        let nome = rel.strip_prefix("img/").ok_or(FileError::AccessDenied)?;
        imagens::validar_nome_imagem(nome).map_err(|_| FileError::AccessDenied)?;
        let pasta = self.imagens.as_ref().ok_or(FileError::AccessDenied)?;
        match fs::read(pasta.join(nome)) {
            Ok(bytes) => Ok(Bytes::new(bytes)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Err(FileError::Other(Some(
                format!("a imagem {nome} não foi encontrada no rascunho. Escolha a imagem de novo no bloco Imagem").into(),
            ))),
            Err(e) => Err(FileError::from_io(e, &pasta.join(nome))),
        }
    }
}

impl World for Mundo {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }
    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }
    fn main(&self) -> FileId {
        self.principal.id()
    }
    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.principal.id() {
            Ok(self.principal.clone())
        } else {
            Err(FileError::AccessDenied)
        }
    }
    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id == self.principal.id() {
            Ok(Bytes::from_string(self.principal.text().to_string()))
        } else {
            self.imagem(id)
        }
    }
    fn font(&self, index: usize) -> Option<Font> {
        self.fontes.get(index).cloned()
    }
    fn today(&self, _offset: Option<Duration>) -> Option<Datetime> {
        None
    }
}

fn mensagens(diags: &[SourceDiagnostic]) -> String {
    let linhas: Vec<String> = diags
        .iter()
        .map(|d| {
            let dicas: Vec<&str> = d.hints.iter().map(|h| h.v.as_str()).collect();
            if dicas.is_empty() {
                d.message.to_string()
            } else {
                format!("{} ({})", d.message, dicas.join("; "))
            }
        })
        .collect();
    format!("Não foi possível gerar o PDF:\n- {}", linhas.join("\n- "))
}

/// Compila o documento Typst e devolve o PDF marcado. Tenta o PDF/UA-1 (com as
/// verificações extras de acessibilidade); se o conteúdo tiver um símbolo que
/// nenhuma fonte embutida desenha (ex.: emoji), gera o PDF marcado sem o selo
/// PDF/UA-1 em vez de falhar. Devolve também se saiu como PDF/UA-1.
/// `imagens`: pasta de onde vêm as `img/<nome>` citadas (None = sem imagens).
pub fn gerar_pdf_com_padrao(fonte: &str, imagens: Option<&Path>) -> Result<(Vec<u8>, bool), String> {
    let mundo = Mundo::novo(fonte, imagens.map(Path::to_path_buf));
    let documento: PagedDocument = typst::compile(&mundo).output.map_err(|d| mensagens(&d))?;
    let ua = PdfOptions {
        standards: PdfStandards::new(&[PdfStandard::Ua_1]).map_err(|e| format!("Padrão de PDF inválido: {e:?}"))?,
        ..PdfOptions::default()
    };
    match typst_pdf::pdf(&documento, &ua) {
        Ok(pdf) => Ok((pdf, true)),
        Err(d) if d.iter().all(|x| x.message.contains("could not be displayed")) => {
            let pdf = typst_pdf::pdf(&documento, &PdfOptions::default()).map_err(|d| mensagens(&d))?;
            Ok((pdf, false))
        }
        Err(d) => Err(mensagens(&d)),
    }
}

pub fn gerar_pdf(fonte: &str, imagens: Option<&Path>) -> Result<Vec<u8>, String> {
    gerar_pdf_com_padrao(fonte, imagens).map(|(pdf, _)| pdf)
}

/// Gera `<destino>/<nome>.pdf`. Se existir e `sobrescrever` for falso, devolve
/// erro com o prefixo `JA_EXISTE:`. Grava num temporário ao lado e renomeia.
pub fn exportar_pdf_em(
    nome: &str,
    fonte: &str,
    imagens: Option<&Path>,
    destino: &Path,
    sobrescrever: bool,
) -> Result<ResultadoExportacao, String> {
    validar_nome_pacote(nome)?;
    if !destino.is_dir() {
        return Err("A pasta de destino não foi encontrada. Escolha outra pasta.".to_string());
    }
    let alvo = destino.join(format!("{nome}.pdf"));
    if alvo.is_dir() {
        return Err(format!(
            "Já existe uma pasta chamada {nome}.pdf em {}. Remova-a ou escolha outro destino.",
            destino.display()
        ));
    }
    if alvo.exists() && !sobrescrever {
        return Err(format!(
            "{PREFIXO_JA_EXISTE}Já existe o arquivo {nome}.pdf em {}. Substituir pelo PDF novo?",
            destino.display()
        ));
    }
    let bytes = gerar_pdf(fonte, imagens)?;
    let tmp = destino.join(format!(".{nome}.pdf.gravando"));
    fs::write(&tmp, &bytes).map_err(|e| format!("Não foi possível gravar o PDF: {e}."))?;
    if let Err(e) = fs::rename(&tmp, &alvo) {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Não foi possível colocar o PDF no destino: {e}."));
    }
    Ok(ResultadoExportacao {
        caminho: alvo.to_string_lossy().into_owned(),
        arquivos: 1,
        bytes: bytes.len() as u64,
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EntradaPdf {
    /// Nome do pacote (vira `<nome>.pdf`).
    pub nome_pacote: String,
    /// Documento Typst gerado pelo front.
    pub fonte: String,
    /// Id do projeto (rascunho) de onde vêm as imagens `img/<arquivo>`.
    #[serde(default)]
    pub projeto_id: Option<String>,
}

#[tauri::command]
pub async fn exportar_pdf(
    app: AppHandle,
    entrada: EntradaPdf,
    destino: String,
    sobrescrever: bool,
) -> Result<ResultadoExportacao, String> {
    let imagens = match &entrada.projeto_id {
        Some(id) => {
            let base = app
                .path()
                .app_data_dir()
                .map_err(|_| "Não foi possível localizar a pasta de dados do aplicativo.".to_string())?;
            Some(imagens::pasta_imagens(&base, id)?)
        }
        None => None,
    };
    tauri::async_runtime::spawn_blocking(move || {
        exportar_pdf_em(&entrada.nome_pacote, &entrada.fonte, imagens.as_deref(), Path::new(&destino), sobrescrever)
    })
    .await
    .map_err(|e| format!("A geração do PDF foi interrompida: {e}."))?
}

#[cfg(test)]
mod testes {
    use super::*;

    const AMOSTRA: &str = r#"
#set document(title: "Leitura de teste")
#set text(lang: "pt", region: "br", font: "Poppins")
#set page(paper: "a4")
= Leitura de teste
== Tela 1
Texto com *negrito*, _itálico_ e #link("https://example.org")[um link].
- item um
- item dois
#table(columns: 2, table.header[Item][Categoria], [Acolher], [#box(width: 0.8em, height: 0.8em, stroke: 1pt)])
"#;

    #[test]
    fn gera_pdf_marcado_com_idioma() {
        let pdf = gerar_pdf(AMOSTRA, None).expect("compila");
        assert!(pdf.starts_with(b"%PDF"));
        let texto = String::from_utf8_lossy(&pdf);
        assert!(texto.contains("StructTreeRoot"), "PDF sem marcação");
        assert!(texto.contains("pdfuaid") || texto.contains("PDF/UA"), "sem identificação PDF/UA");
    }

    #[test]
    fn erro_de_sintaxe_vira_mensagem() {
        let erro = gerar_pdf("#let x = (", None).unwrap_err();
        assert!(erro.starts_with("Não foi possível gerar o PDF"), "{erro}");
    }

    // ---------- Imagens ----------

    fn crc32(dados: &[u8]) -> u32 {
        let mut c = 0xFFFF_FFFFu32;
        for &b in dados {
            c ^= u32::from(b);
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xEDB8_8320 ^ (c >> 1) } else { c >> 1 };
            }
        }
        !c
    }

    /// PNG RGB válido e decodificável (zlib com bloco "stored"), `l`×`a`, de uma cor.
    fn png_real(l: u32, a: u32, cor: [u8; 3]) -> Vec<u8> {
        // Cada linha: filtro "none" (0) e os pixels.
        let linha: Vec<u8> = std::iter::once(0).chain(cor.iter().copied().cycle().take(3 * l as usize)).collect();
        let cru = linha.repeat(a as usize);
        assert!(cru.len() < 65_535, "fixture pequena: um só bloco stored");
        let (mut s1, mut s2) = (1u32, 0u32);
        for &b in &cru {
            s1 = (s1 + u32::from(b)) % 65_521;
            s2 = (s2 + s1) % 65_521;
        }
        let n = cru.len() as u16;
        let mut z = vec![0x78, 0x01, 0x01];
        z.extend_from_slice(&n.to_le_bytes());
        z.extend_from_slice(&(!n).to_le_bytes());
        z.extend_from_slice(&cru);
        z.extend_from_slice(&((s2 << 16) | s1).to_be_bytes());

        let mut v = b"\x89PNG\r\n\x1a\n".to_vec();
        let mut pedaco = |tipo: &[u8], dados: &[u8]| {
            v.extend_from_slice(&(dados.len() as u32).to_be_bytes());
            let mut corpo = tipo.to_vec();
            corpo.extend_from_slice(dados);
            v.extend_from_slice(&corpo);
            v.extend_from_slice(&crc32(&corpo).to_be_bytes());
        };
        let mut ihdr = Vec::new();
        ihdr.extend_from_slice(&l.to_be_bytes());
        ihdr.extend_from_slice(&a.to_be_bytes());
        ihdr.extend_from_slice(&[8, 2, 0, 0, 0]);
        pedaco(b"IHDR", &ihdr);
        pedaco(b"IDAT", &z);
        pedaco(b"IEND", &[]);
        v
    }

    /// Pasta temporária com uma imagem `img/<nome>` e o nome gerado como no rascunho.
    fn pasta_com_imagem(sufixo: &str) -> (PathBuf, String) {
        let dir = std::env::temp_dir().join(format!("scorm-pdf-img-{}-{sufixo}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let bytes = png_real(40, 24, [0x1b, 0x1f, 0x4b]);
        let (tipo, l, a) = imagens::analisar(&bytes).expect("fixture é PNG válido");
        assert_eq!((l, a), (40, 24));
        let nome = imagens::nome_por_conteudo(&bytes, tipo);
        fs::write(dir.join(&nome), &bytes).unwrap();
        (dir, nome)
    }

    #[test]
    fn imagem_com_alt_e_decorativa_mantem_pdf_ua() {
        let (dir, nome) = pasta_com_imagem("ua");
        let fonte = format!(
            r#"#set document(title: "Com imagem")
#set text(lang: "pt", region: "br", font: "Poppins")
= Com imagem
#figure(image("img/{nome}", width: 4cm, alt: "Retangulo azul-marinho"), caption: [Legenda *da* imagem])
#pdf.artifact(image("img/{nome}", width: 2cm))
Depois."#
        );
        let (pdf, ua) = gerar_pdf_com_padrao(&fonte, Some(&dir)).expect("compila");
        assert!(ua, "deveria sair como PDF/UA-1");
        let texto = String::from_utf8_lossy(&pdf);
        assert!(texto.contains("pdfuaid:part>1"), "sem identificação PDF/UA");
        assert!(texto.contains("/S/Figure") && texto.contains("Alt(Ret"), "figura sem descrição");
        assert_eq!(texto.matches("/Subtype/Image").count(), 1, "a mesma imagem vira um só XObject");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn imagem_ausente_ou_fora_do_padrao_nao_e_lida() {
        let (dir, nome) = pasta_com_imagem("fora");
        fs::write(dir.join("x.png"), png_real(2, 2, [0, 0, 0])).unwrap();
        let doc = |src: &str| format!("#set document(title: \"T\")\n#set text(lang: \"pt\")\n#image(\"{src}\", alt: \"x\")");
        // Sem pasta de imagens: nada é lido
        assert!(gerar_pdf(&doc(&format!("img/{nome}")), None).is_err());
        let erro = gerar_pdf(&doc("img/0123456789abcdef.png"), Some(&dir)).unwrap_err();
        assert!(erro.contains("não foi encontrada no rascunho"), "{erro}");
        for src in ["img/x.png", "x.png", "../img/x.png", "/etc/hosts", "img/../img/x.png"] {
            assert!(gerar_pdf(&doc(src), Some(&dir)).is_err(), "{src} não deveria ser lido");
        }
        gerar_pdf(&doc(&format!("img/{nome}")), Some(&dir)).expect("imagem válida");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn grava_e_respeita_arquivo_existente() {
        let dir = std::env::temp_dir().join(format!("scorm-pdf-teste-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let r = exportar_pdf_em("TESTE_UD1_LEITURA1", AMOSTRA, None, &dir, false).unwrap();
        assert!(r.caminho.ends_with("TESTE_UD1_LEITURA1.pdf") && r.bytes > 1000);
        let erro = exportar_pdf_em("TESTE_UD1_LEITURA1", AMOSTRA, None, &dir, false).unwrap_err();
        assert!(erro.starts_with(PREFIXO_JA_EXISTE));
        exportar_pdf_em("TESTE_UD1_LEITURA1", AMOSTRA, None, &dir, true).unwrap();
        let sobras: Vec<_> = fs::read_dir(&dir).unwrap().filter_map(|e| e.ok()).map(|e| e.file_name()).collect();
        assert_eq!(sobras.len(), 1, "{sobras:?}");
        let _ = fs::remove_dir_all(&dir);
    }
}

#[cfg(test)]
mod fixtures {
    use super::*;

    /// Compila os `.typ` gerados pelo front (ver `src/modelo/pdf.test.ts`):
    /// `PDF_SAIDA=<pasta> cargo test --lib compila_fixtures -- --ignored`
    #[test]
    #[ignore]
    fn compila_fixtures() {
        let pasta = std::env::var("PDF_SAIDA").expect("defina PDF_SAIDA");
        // Imagens das fixtures (gravadas pelo pdf.test.ts em <PDF_SAIDA>/img/)
        let img = Path::new(&pasta).join("img");
        let mut falhas = Vec::new();
        let mut n = 0;
        for e in fs::read_dir(&pasta).unwrap().filter_map(|e| e.ok()) {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("typ") {
                continue;
            }
            n += 1;
            match gerar_pdf(&fs::read_to_string(&p).unwrap(), Some(&img)) {
                Ok(pdf) => fs::write(p.with_extension("pdf"), pdf).unwrap(),
                Err(e) => falhas.push(format!("{}: {e}", p.display())),
            }
        }
        assert!(n > 0, "nenhum .typ em {pasta}");
        assert!(falhas.is_empty(), "{}", falhas.join("\n\n"));
    }
}
