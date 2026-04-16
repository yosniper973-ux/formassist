use crate::mail::smtp::{EmailPayload, SmtpConfig};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct SendEmailArgs {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    pub smtp_password: String,
    pub from_email: String,
    pub from_name: String,
    pub to: String,
    pub subject: String,
    pub body_html: String,
    pub body_text: String,
    pub attachments: Vec<String>,
}

#[tauri::command]
pub async fn send_email(args: SendEmailArgs) -> Result<(), String> {
    let config = SmtpConfig {
        host: args.smtp_host,
        port: args.smtp_port,
        user: args.smtp_user,
        password: args.smtp_password,
        from_email: args.from_email,
        from_name: args.from_name,
    };

    let payload = EmailPayload {
        to: args.to,
        subject: args.subject,
        body_html: args.body_html,
        body_text: args.body_text,
        attachments: args.attachments,
    };

    crate::mail::smtp::send_email(&config, &payload).await
}
