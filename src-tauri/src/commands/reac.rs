use serde::Deserialize;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::ConnectOptions;
use std::str::FromStr;
use std::time::Duration;
use tauri::Manager;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct CcpInput {
    pub code: String,
    pub title: String,
    pub competences: Vec<CompetenceInput>,
}

#[derive(Deserialize)]
pub struct CompetenceInput {
    pub code: String,
    pub title: String,
    pub description: Option<String>,
    pub criteria: Vec<String>,
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Sauvegarde les données REAC via une connexion directe (hors pool) avec
/// busy_timeout = 30s. Contourne le problème de pool multi-connexions de
/// tauri-plugin-sql où seule la première connexion a le PRAGMA busy_timeout.
#[tauri::command]
pub async fn save_reac(
    app: tauri::AppHandle,
    formation_id: String,
    ccps: Vec<CcpInput>,
) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Impossible de trouver le dossier de données : {e}"))?;
    let db_path = data_dir.join("formassist.db");
    let db_url = format!("sqlite:{}", db_path.display());

    let opts = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| e.to_string())?
        .busy_timeout(Duration::from_secs(30))
        .journal_mode(SqliteJournalMode::Wal)
        .create_if_missing(false);

    let mut conn = opts
        .connect()
        .await
        .map_err(|e| format!("Connexion DB échouée : {e}"))?;

    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut conn)
        .await
        .map_err(|e| format!("BEGIN IMMEDIATE échoué : {e}"))?;

    let result = async {
        // CASCADE supprime automatiquement competences et evaluation_criteria
        sqlx::query("DELETE FROM ccps WHERE formation_id = ?")
            .bind(&formation_id)
            .execute(&mut conn)
            .await?;

        for (i, ccp) in ccps.iter().enumerate() {
            let ccp_id = new_id();
            sqlx::query(
                "INSERT INTO ccps (id, formation_id, code, title, sort_order, created_at) \
                 VALUES (?, ?, ?, ?, ?, datetime('now'))",
            )
            .bind(&ccp_id)
            .bind(&formation_id)
            .bind(&ccp.code)
            .bind(&ccp.title)
            .bind(i as i64)
            .execute(&mut conn)
            .await?;

            for (j, comp) in ccp.competences.iter().enumerate() {
                let comp_id = new_id();
                sqlx::query(
                    "INSERT INTO competences \
                     (id, ccp_id, code, title, description, sort_order, in_scope, created_at) \
                     VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))",
                )
                .bind(&comp_id)
                .bind(&ccp_id)
                .bind(&comp.code)
                .bind(&comp.title)
                .bind(comp.description.as_deref())
                .bind(j as i64)
                .execute(&mut conn)
                .await?;

                for (k, crit) in comp.criteria.iter().enumerate() {
                    sqlx::query(
                        "INSERT INTO evaluation_criteria \
                         (id, competence_id, description, sort_order) \
                         VALUES (?, ?, ?, ?)",
                    )
                    .bind(new_id())
                    .bind(&comp_id)
                    .bind(crit)
                    .bind(k as i64)
                    .execute(&mut conn)
                    .await?;
                }
            }
        }

        sqlx::query(
            "UPDATE formations SET reac_parsed = 1, updated_at = datetime('now') WHERE id = ?",
        )
        .bind(&formation_id)
        .execute(&mut conn)
        .await?;

        Ok::<(), sqlx::Error>(())
    }
    .await;

    match result {
        Ok(()) => {
            sqlx::query("COMMIT")
                .execute(&mut conn)
                .await
                .map_err(|e| format!("COMMIT échoué : {e}"))?;
            Ok(())
        }
        Err(e) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut conn).await;
            Err(format!("Erreur lors de la sauvegarde du REAC : {e}"))
        }
    }
}
