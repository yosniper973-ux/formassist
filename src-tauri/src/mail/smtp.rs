use lettre::{
    message::{header::ContentType, Attachment, Mailbox, MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
    pub from_email: String,
    pub from_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EmailPayload {
    pub to: String,
    pub subject: String,
    pub body_html: String,
    pub body_text: String,
    pub attachments: Vec<String>, // file paths
}

pub async fn send_email(config: &SmtpConfig, payload: &EmailPayload) -> Result<(), String> {
    let from: Mailbox = format!("{} <{}>", config.from_name, config.from_email)
        .parse()
        .map_err(|e| format!("Adresse expéditeur invalide : {e}"))?;

    let to: Mailbox = payload
        .to
        .parse()
        .map_err(|e| format!("Adresse destinataire invalide : {e}"))?;

    // Build multipart body
    let text_part = SinglePart::builder()
        .header(ContentType::TEXT_PLAIN)
        .body(payload.body_text.clone());

    let html_part = SinglePart::builder()
        .header(ContentType::TEXT_HTML)
        .body(payload.body_html.clone());

    let mut multipart = MultiPart::alternative()
        .singlepart(text_part)
        .singlepart(html_part);

    // Build message with attachments
    let mut mixed = MultiPart::mixed().multipart(multipart);

    for attachment_path in &payload.attachments {
        let path = PathBuf::from(attachment_path);
        let filename = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let file_bytes =
            std::fs::read(&path).map_err(|e| format!("Impossible de lire {filename} : {e}"))?;

        let content_type = if filename.ends_with(".pdf") {
            ContentType::parse("application/pdf").expect("hardcoded MIME type")
        } else if filename.ends_with(".docx") {
            ContentType::parse(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
            .expect("hardcoded MIME type")
        } else {
            ContentType::parse("application/octet-stream").expect("hardcoded MIME type")
        };

        let attachment = Attachment::new(filename).body(file_bytes, content_type);
        mixed = mixed.singlepart(attachment);
    }

    let email = Message::builder()
        .from(from)
        .to(to)
        .subject(&payload.subject)
        .multipart(mixed)
        .map_err(|e| format!("Erreur construction email : {e}"))?;

    let creds = Credentials::new(config.user.clone(), config.password.clone());

    let mailer = AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)
        .map_err(|e| format!("Erreur connexion SMTP : {e}"))?
        .port(config.port)
        .credentials(creds)
        .build();

    mailer
        .send(email)
        .await
        .map_err(|e| format!("Erreur envoi email : {e}"))?;

    Ok(())
}
