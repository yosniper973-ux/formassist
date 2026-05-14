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

#[derive(Deserialize, Default)]
pub struct SavoirsInput {
    #[serde(default)]
    pub sf_techniques: Vec<String>,
    #[serde(default)]
    pub sf_organisationnels: Vec<String>,
    #[serde(default)]
    pub sf_relationnels: Vec<String>,
    #[serde(default)]
    pub savoirs: Vec<String>,
}

#[derive(Deserialize)]
pub struct CompetenceInput {
    pub code: String,
    pub title: String,
    pub description: Option<String>,
    pub criteria: Vec<String>,
    #[serde(default)]
    pub savoirs: Option<SavoirsInput>,
}

#[derive(Deserialize)]
pub struct CompetenceSavoirsInput {
    pub code: String, // code de la compétence, ex: "CP1"
    pub savoirs: SavoirsInput,
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn db_url_from_app(app: &tauri::AppHandle) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Impossible de trouver le dossier de données : {e}"))?;
    let db_path = data_dir.join("formassist.db");
    Ok(format!("sqlite:{}", db_path.display()))
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
    let db_url = db_url_from_app(&app)?;

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
        // CASCADE supprime automatiquement competences, evaluation_criteria et competence_savoirs
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

                if let Some(ref sav) = comp.savoirs {
                    let categories: &[(&str, &Vec<String>)] = &[
                        ("sf_technique", &sav.sf_techniques),
                        ("sf_organisationnel", &sav.sf_organisationnels),
                        ("sf_relationnel", &sav.sf_relationnels),
                        ("savoir", &sav.savoirs),
                    ];
                    for (cat, items) in categories {
                        for (k, item) in items.iter().enumerate() {
                            sqlx::query(
                                "INSERT INTO competence_savoirs \
                                 (id, competence_id, category, content, sort_order, created_at) \
                                 VALUES (?, ?, ?, ?, ?, datetime('now'))",
                            )
                            .bind(new_id())
                            .bind(&comp_id)
                            .bind(*cat)
                            .bind(item)
                            .bind(k as i64)
                            .execute(&mut conn)
                            .await?;
                        }
                    }
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

/// Enrichit les compétences déjà importées avec leurs savoirs.
/// Utile pour les REAC existants sans toucher aux autres données.
#[tauri::command]
pub async fn save_savoirs_for_formation(
    app: tauri::AppHandle,
    formation_id: String,
    competences_savoirs: Vec<CompetenceSavoirsInput>,
) -> Result<(), String> {
    let db_url = db_url_from_app(&app)?;

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
        // Récupérer tous les (code, competence_id) pour cette formation via JOIN ccps
        let rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT c.code, c.id \
             FROM competences c \
             JOIN ccps cp ON c.ccp_id = cp.id \
             WHERE cp.formation_id = ?",
        )
        .bind(&formation_id)
        .fetch_all(&mut conn)
        .await?;

        // Construire une map code -> competence_id
        let code_to_id: std::collections::HashMap<String, String> = rows.into_iter().collect();

        for cs in &competences_savoirs {
            let comp_id = match code_to_id.get(&cs.code) {
                Some(id) => id.clone(),
                None => continue, // code inconnu, on ignore
            };

            // Supprimer les savoirs existants pour cette compétence
            sqlx::query("DELETE FROM competence_savoirs WHERE competence_id = ?")
                .bind(&comp_id)
                .execute(&mut conn)
                .await?;

            // Insérer les nouveaux savoirs
            let categories: &[(&str, &Vec<String>)] = &[
                ("sf_technique", &cs.savoirs.sf_techniques),
                ("sf_organisationnel", &cs.savoirs.sf_organisationnels),
                ("sf_relationnel", &cs.savoirs.sf_relationnels),
                ("savoir", &cs.savoirs.savoirs),
            ];
            for (cat, items) in categories {
                for (k, item) in items.iter().enumerate() {
                    sqlx::query(
                        "INSERT INTO competence_savoirs \
                         (id, competence_id, category, content, sort_order, created_at) \
                         VALUES (?, ?, ?, ?, ?, datetime('now'))",
                    )
                    .bind(new_id())
                    .bind(&comp_id)
                    .bind(*cat)
                    .bind(item)
                    .bind(k as i64)
                    .execute(&mut conn)
                    .await?;
                }
            }
        }

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
            Err(format!("Erreur lors de la sauvegarde des savoirs : {e}"))
        }
    }
}
