use serde::{Deserialize, Serialize};
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::{ConnectOptions, Row};
use std::collections::HashMap;
use std::str::FromStr;
use std::time::Duration;
use tauri::Manager;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct PhaseInput {
    pub phase: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub duration_hours: Option<f64>,
    pub label: String,
    pub task: Option<String>,
}

#[derive(Deserialize)]
pub struct SavoirRef {
    pub code: String,
    pub libelle: String,
}

#[derive(Deserialize)]
pub struct SlotInput {
    pub date: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub duration_hours: f64,
    pub title: String,
    pub module: Option<String>,
    pub jour_n: Option<i64>,
    pub phases: Vec<PhaseInput>,
    pub competences: Vec<String>,
    pub savoirs: Vec<SavoirRef>,
}

#[derive(Serialize, Default)]
pub struct ImportReport {
    pub slots: usize,
    pub phases: usize,
    pub savoirs_lies: usize,
    /// Savoirs du déroulé sans correspondance en base : le REAC importé dans
    /// FormAssist ne les contient pas, ou leur libellé diffère.
    pub savoirs_non_resolus: Vec<String>,
    pub competences_inconnues: Vec<String>,
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

/// Normalise pour comparer des libellés venus de deux extractions du même REAC :
/// apostrophes typographiques, espaces multiples, casse.
fn norm(s: &str) -> String {
    let s = s.replace('\u{2019}', "'").replace('\u{02BC}', "'");
    s.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn db_url_from_app(app: &tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Dossier de données introuvable : {e}"))?;
    Ok(format!("sqlite:{}", dir.join("formassist.db").display()))
}

/// Importe un déroulé pédagogique : crée les créneaux, leurs phases et les
/// liens vers les savoirs REAC. Remplace un éventuel déroulé déjà importé
/// pour cette formation, sans toucher aux créneaux venus d'un planning centre.
#[tauri::command]
pub async fn import_deroule(
    app: tauri::AppHandle,
    formation_id: String,
    slots: Vec<SlotInput>,
) -> Result<ImportReport, String> {
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
        // Index des compétences de la formation, par code normalisé
        let rows = sqlx::query(
            "SELECT c.id, c.code FROM competences c \
             JOIN ccps ON ccps.id = c.ccp_id WHERE ccps.formation_id = ?",
        )
        .bind(&formation_id)
        .fetch_all(&mut conn)
        .await?;
        let mut comp_by_code: HashMap<String, String> = HashMap::new();
        for r in &rows {
            let id: String = r.get("id");
            let code: String = r.get("code");
            comp_by_code.insert(norm(&code), id);
        }

        // Index des savoirs, par (competence_id, contenu normalisé)
        let rows = sqlx::query(
            "SELECT cs.id, cs.competence_id, cs.content FROM competence_savoirs cs \
             JOIN competences c ON c.id = cs.competence_id \
             JOIN ccps ON ccps.id = c.ccp_id WHERE ccps.formation_id = ?",
        )
        .bind(&formation_id)
        .fetch_all(&mut conn)
        .await?;
        let mut sav_by_key: HashMap<(String, String), String> = HashMap::new();
        for r in &rows {
            let id: String = r.get("id");
            let cid: String = r.get("competence_id");
            let content: String = r.get("content");
            sav_by_key.insert((cid, norm(&content)), id);
        }

        // Un import de déroulé remplace le précédent, jamais les créneaux
        // importés depuis un planning de centre (deroule_module IS NULL).
        sqlx::query(
            "DELETE FROM slots WHERE formation_id = ? AND deroule_module IS NOT NULL",
        )
        .bind(&formation_id)
        .execute(&mut conn)
        .await?;

        let mut rep = ImportReport::default();

        for s in &slots {
            let slot_id = new_id();
            sqlx::query(
                "INSERT INTO slots (id, formation_id, date, start_time, end_time, \
                 duration_hours, planning_type, title, modality, deroule_module, \
                 deroule_day, created_at, updated_at) \
                 VALUES (?, ?, ?, ?, ?, ?, 'imposed', ?, 'presential', ?, ?, \
                 datetime('now'), datetime('now'))",
            )
            .bind(&slot_id)
            .bind(&formation_id)
            .bind(&s.date)
            .bind(s.start_time.as_deref())
            .bind(s.end_time.as_deref())
            .bind(s.duration_hours)
            .bind(&s.title)
            .bind(s.module.as_deref())
            .bind(s.jour_n)
            .execute(&mut conn)
            .await?;
            rep.slots += 1;

            for (i, p) in s.phases.iter().enumerate() {
                sqlx::query(
                    "INSERT INTO slot_phases (id, slot_id, phase, start_time, end_time, \
                     duration_hours, label, task, sort_order, created_at) \
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                )
                .bind(new_id())
                .bind(&slot_id)
                .bind(&p.phase)
                .bind(p.start_time.as_deref())
                .bind(p.end_time.as_deref())
                .bind(p.duration_hours)
                .bind(&p.label)
                .bind(p.task.as_deref())
                .bind(i as i64)
                .execute(&mut conn)
                .await?;
                rep.phases += 1;
            }

            for code in &s.competences {
                match comp_by_code.get(&norm(code)) {
                    Some(cid) => {
                        sqlx::query(
                            "INSERT OR IGNORE INTO slot_competences (slot_id, competence_id) \
                             VALUES (?, ?)",
                        )
                        .bind(&slot_id)
                        .bind(cid)
                        .execute(&mut conn)
                        .await?;
                    }
                    None => {
                        if !rep.competences_inconnues.contains(code) {
                            rep.competences_inconnues.push(code.clone());
                        }
                    }
                }
            }

            for sv in &s.savoirs {
                // « CP1-T02 » → compétence « CP1 »
                let cp = sv.code.split('-').next().unwrap_or("");
                let cid = match comp_by_code.get(&norm(cp)) {
                    Some(c) => c.clone(),
                    None => {
                        rep.savoirs_non_resolus.push(sv.code.clone());
                        continue;
                    }
                };
                match sav_by_key.get(&(cid, norm(&sv.libelle))) {
                    Some(sid) => {
                        sqlx::query(
                            "INSERT OR IGNORE INTO slot_savoirs (slot_id, savoir_id) \
                             VALUES (?, ?)",
                        )
                        .bind(&slot_id)
                        .bind(sid)
                        .execute(&mut conn)
                        .await?;
                        rep.savoirs_lies += 1;
                    }
                    None => rep.savoirs_non_resolus.push(sv.code.clone()),
                }
            }
        }

        Ok::<ImportReport, sqlx::Error>(rep)
    }
    .await;

    match result {
        Ok(rep) => {
            sqlx::query("COMMIT")
                .execute(&mut conn)
                .await
                .map_err(|e| format!("COMMIT échoué : {e}"))?;
            Ok(rep)
        }
        Err(e) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut conn).await;
            Err(format!("Import du déroulé échoué : {e}"))
        }
    }
}
