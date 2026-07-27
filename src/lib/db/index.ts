import {
  query,
  execute,
  generateId,
  runMigrations,
} from "./core";
import {
  getConfig,
  setConfig,
  deleteConfig,
} from "./config";
import {
  logApiUsage,
  getMonthlyApiCost,
  getApiCredit,
  setApiCredit,
} from "./usage";
import {
  addLivreRecette,
  getLivreRecettes,
  getLivreRecettesYears,
  deleteLivreRecette,
} from "./livre-recettes";
import {
  getCentres,
  getCentre,
  createCentre,
  updateCentre,
  archiveCentre,
} from "./centres";
import {
  deleteCentre,
  deleteFormation,
  deleteGroup,
  deleteLearner,
  deleteSlot,
  deleteContent,
  deleteCorrection,
  deleteInvoice,
  deletePedagogicalSheet,
  deleteEmailTemplate,
  resetStyleProfile,
} from "./deletes";
import {
  getFormations,
  createFormation,
  saveParsedReac,
  copyReacToFormation,
  getSavoirsForFormation,
  saveRcre,
  getRcre,
  getCriteriaForCompetences,
} from "./formations";
import {
  getEvaluationTemplates,
  createEvaluationTemplate,
  deleteEvaluationTemplate,
} from "./evaluation-templates";
import {
  getGroups,
  createGroup,
  updateGroup,
  getLearners,
  createLearner,
} from "./learners";
import {
  getSlots,
  getAllSlots,
  createSlot,
  setSlotCompetences,
  backfillSlotCompetences,
} from "./slots";
import {
  createContent,
  getContents,
  getAllContents,
  duplicateContentToSlot,
  getUnassignedContents,
  getContentsForSlot,
  linkContentToSlot,
  unlinkContentFromSlot,
  linkContentToCompetences,
  getCompetenceIdsByContent,
  getUnassignedSheets,
  getSheetsForSlot,
  linkSheetToSlot,
  unlinkSheetFromSlot,
} from "./contents";
import {
  getInvoices,
  createInvoice,
} from "./invoices";
import {
  getStyleProfile,
  updateStyleProfile,
} from "./style";
import {
  saveDossierCorrection,
  getDossierCorrections,
  getDossierCorrection,
  markDossierSent,
  deleteDossierCorrection,
} from "./dossiers";

// ============================================================
// Export public API
// ============================================================

export const db = {
  // Core
  query,
  execute,
  generateId,
  runMigrations,
  deleteConfig,
  // Config
  getConfig,
  setConfig,
  // Livre des recettes
  addLivreRecette,
  getLivreRecettes,
  getLivreRecettesYears,
  deleteLivreRecette,
  // API Usage
  logApiUsage,
  getMonthlyApiCost,
  getApiCredit,
  setApiCredit,
  // Centres
  getCentres,
  getCentre,
  createCentre,
  updateCentre,
  archiveCentre,
  deleteCentre,
  // Formations
  getFormations,
  createFormation,
  deleteFormation,
  // REAC
  saveParsedReac,
  copyReacToFormation,
  // Savoirs
  getSavoirsForFormation,
  // Critères d'évaluation (REAC)
  getCriteriaForCompetences,
  // RC/RE
  saveRcre,
  getRcre,
  // Trames d'évaluation (ECF)
  getEvaluationTemplates,
  createEvaluationTemplate,
  deleteEvaluationTemplate,
  // Dossiers DP / Projet
  saveDossierCorrection,
  getDossierCorrections,
  getDossierCorrection,
  markDossierSent,
  deleteDossierCorrection,
  // Groups & Learners
  getGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  getLearners,
  createLearner,
  deleteLearner,
  // Slots
  getSlots,
  getAllSlots,
  createSlot,
  deleteSlot,
  setSlotCompetences,
  backfillSlotCompetences,
  // Contents
  createContent,
  getContents,
  getAllContents,
  getUnassignedContents,
  getContentsForSlot,
  linkContentToSlot,
  unlinkContentFromSlot,
  linkContentToCompetences,
  getCompetenceIdsByContent,
  duplicateContentToSlot,
  deleteContent,
  // Pedagogical sheets links
  getUnassignedSheets,
  getSheetsForSlot,
  linkSheetToSlot,
  unlinkSheetFromSlot,
  // Invoices
  getInvoices,
  createInvoice,
  deleteInvoice,
  // Fiches pédago
  deletePedagogicalSheet,
  // Corrections
  deleteCorrection,
  // Email templates
  deleteEmailTemplate,
  // Style
  getStyleProfile,
  updateStyleProfile,
  resetStyleProfile,
};

export type { LivreRecetteRow } from "./livre-recettes";
export type { Savoir } from "./formations";
export type { DossierCorrection } from "./dossiers";
