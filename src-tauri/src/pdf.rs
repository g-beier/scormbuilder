//! PDF da leitura (M7): compila um documento Typst (gerado no front por
//! `src/modelo/pdf.ts`) e grava um PDF marcado (PDF/UA-1) direto no destino,
//! sem o diálogo de impressão. As fontes do tema (Poppins e Krona One, OFL)
//! vão embutidas no binário, em `src-tauri/fonts/`.

use std::fs;
use std::path::Path;

use serde::Deserialize;
use typst::diag::{FileError, FileResult, SourceDiagnostic};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt, World};
use typst_layout::PagedDocument;
use typst_pdf::{PdfOptions, PdfStandard, PdfStandards};

use crate::exportar::{validar_nome_pacote, ResultadoExportacao, PREFIXO_JA_EXISTE};

const FONTES: [&[u8]; 7] = [
    include_bytes!("../fonts/Poppins-Regular.ttf"),
    include_bytes!("../fonts/Poppins-Italic.ttf"),
    include_bytes!("../fonts/Poppins-SemiBold.ttf"),
    include_bytes!("../fonts/Poppins-SemiBoldItalic.ttf"),
    include_bytes!("../fonts/Poppins-Bold.ttf"),
    include_bytes!("../fonts/Poppins-BoldItalic.ttf"),
    include_bytes!("../fonts/KronaOne-Regular.ttf"),
];

/// Mundo Typst mínimo: um só arquivo-fonte, só as fontes embutidas, sem pacotes
/// nem acesso a disco.
struct Mundo {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fontes: Vec<Font>,
    principal: Source,
}

impl Mundo {
    fn novo(texto: &str) -> Self {
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
            Err(FileError::AccessDenied)
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
pub fn gerar_pdf_com_padrao(fonte: &str) -> Result<(Vec<u8>, bool), String> {
    let mundo = Mundo::novo(fonte);
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

pub fn gerar_pdf(fonte: &str) -> Result<Vec<u8>, String> {
    gerar_pdf_com_padrao(fonte).map(|(pdf, _)| pdf)
}

/// Gera `<destino>/<nome>.pdf`. Se existir e `sobrescrever` for falso, devolve
/// erro com o prefixo `JA_EXISTE:`. Grava num temporário ao lado e renomeia.
pub fn exportar_pdf_em(nome: &str, fonte: &str, destino: &Path, sobrescrever: bool) -> Result<ResultadoExportacao, String> {
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
    let bytes = gerar_pdf(fonte)?;
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
}

#[tauri::command]
pub async fn exportar_pdf(entrada: EntradaPdf, destino: String, sobrescrever: bool) -> Result<ResultadoExportacao, String> {
    tauri::async_runtime::spawn_blocking(move || {
        exportar_pdf_em(&entrada.nome_pacote, &entrada.fonte, Path::new(&destino), sobrescrever)
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
        let pdf = gerar_pdf(AMOSTRA).expect("compila");
        assert!(pdf.starts_with(b"%PDF"));
        let texto = String::from_utf8_lossy(&pdf);
        assert!(texto.contains("StructTreeRoot"), "PDF sem marcação");
        assert!(texto.contains("pdfuaid") || texto.contains("PDF/UA"), "sem identificação PDF/UA");
    }

    #[test]
    fn erro_de_sintaxe_vira_mensagem() {
        let erro = gerar_pdf("#let x = (").unwrap_err();
        assert!(erro.starts_with("Não foi possível gerar o PDF"), "{erro}");
    }

    #[test]
    fn grava_e_respeita_arquivo_existente() {
        let dir = std::env::temp_dir().join(format!("scorm-pdf-teste-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let r = exportar_pdf_em("TESTE_UD1_LEITURA1", AMOSTRA, &dir, false).unwrap();
        assert!(r.caminho.ends_with("TESTE_UD1_LEITURA1.pdf") && r.bytes > 1000);
        let erro = exportar_pdf_em("TESTE_UD1_LEITURA1", AMOSTRA, &dir, false).unwrap_err();
        assert!(erro.starts_with(PREFIXO_JA_EXISTE));
        exportar_pdf_em("TESTE_UD1_LEITURA1", AMOSTRA, &dir, true).unwrap();
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
        let mut falhas = Vec::new();
        let mut n = 0;
        for e in fs::read_dir(&pasta).unwrap().filter_map(|e| e.ok()) {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("typ") {
                continue;
            }
            n += 1;
            match gerar_pdf(&fs::read_to_string(&p).unwrap()) {
                Ok(pdf) => fs::write(p.with_extension("pdf"), pdf).unwrap(),
                Err(e) => falhas.push(format!("{}: {e}", p.display())),
            }
        }
        assert!(n > 0, "nenhum .typ em {pasta}");
        assert!(falhas.is_empty(), "{}", falhas.join("\n\n"));
    }
}
