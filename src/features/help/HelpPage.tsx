import { useState } from "react";
import {
  Building2,
  GraduationCap,
  Users,
  Calendar,
  Sparkles,
  FileText,
  CheckCircle,
  Send,
  Receipt,
  PiggyBank,
  Palette,
  Settings,
  LayoutDashboard,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary: string;
  content: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: "demarrage",
    icon: <HelpCircle className="h-5 w-5" />,
    title: "Par où commencer ?",
    summary: "Les 5 étapes pour bien démarrer avec FormAssist",
    content: (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          FormAssist fonctionne selon un ordre logique. Voici les 5 étapes à suivre la première fois :
        </p>
        <ol className="space-y-3">
          {[
            { num: 1, title: "Crée un Centre", desc: "Va dans « Centres » et crée le premier organisme pour lequel tu travailles. Remplis le nom, l'adresse, et le RIB si tu veux que les factures soient complètes automatiquement." },
            { num: 2, title: "Crée une Formation", desc: "Va dans « Formations », clique sur « Nouvelle formation », choisis le centre, et saisis le titre et le code RNCP de ton titre professionnel." },
            { num: 3, title: "Importe le REAC", desc: "Dans la fiche de ta formation, onglet REAC, dépose le PDF du Référentiel. Claude va automatiquement extraire toutes les compétences. C'est l'étape la plus importante !" },
            { num: 4, title: "Ajoute tes apprenants", desc: "Va dans « Apprenants », sélectionne ta formation, crée un groupe, puis ajoute chaque apprenant (ou importe un CSV)." },
            { num: 5, title: "Commence à générer", desc: "Va dans « Génération », choisis ta formation, sélectionne un type de contenu (cours, exercice…) et laisse Claude travailler !" },
          ].map((step) => (
            <li key={step.num} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {step.num}
              </span>
              <div>
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800">
            <strong>Sans REAC importé</strong>, Claude ne connaît pas les compétences de ton titre et les contenus générés seront génériques. L'import du REAC est vraiment la clé de tout.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "centres",
    icon: <Building2 className="h-5 w-5" />,
    title: "Centres de formation",
    summary: "Gérer les organismes pour lesquels tu travailles",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Un <strong>centre</strong> est l'organisme qui t'emploie ou qui t'a confié la formation (ex : AFPA, CFA, association…). Tu peux avoir plusieurs centres si tu travailles pour différents organismes.
        </p>
        <div className="space-y-2">
          <p className="font-semibold">Ce que tu peux renseigner :</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">•</span> Nom, adresse, logo</li>
            <li className="flex gap-2"><span className="text-primary">•</span> Contact principal (coordinateur pédagogique)</li>
            <li className="flex gap-2"><span className="text-primary">•</span> Coordonnées bancaires (RIB/IBAN) pour les factures</li>
            <li className="flex gap-2"><span className="text-primary">•</span> Couleur distinctive (pour t'y retrouver dans le planning)</li>
            <li className="flex gap-2"><span className="text-primary">•</span> Taux horaire et modalité de facturation par défaut</li>
          </ul>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            Le <strong>centre actif</strong> se sélectionne dans le bandeau en haut de l'écran. Toutes les données affichées (formations, factures, planning) correspondent au centre sélectionné.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "formations",
    icon: <GraduationCap className="h-5 w-5" />,
    title: "Formations et REAC",
    summary: "Créer une formation et importer le référentiel de compétences",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Une <strong>formation</strong> correspond à un titre professionnel que tu dispenses (ex : MSADS, ADVF, Agent de médiation…). Elle contient trois onglets importants :
        </p>
        <div className="space-y-3">
          {[
            { title: "Onglet REAC", desc: "Importe le PDF du Référentiel Emploi Activités Compétences téléchargé sur le site du Ministère du Travail. Claude va lire le PDF et extraire automatiquement tous les CCP et toutes les compétences (CP). Si quelque chose manque, tu peux supprimer et réimporter." },
            { title: "Onglet Périmètre", desc: "Coche les compétences que tu as en charge (si plusieurs formateurs interviennent sur la même formation). Cela permet à Claude de ne générer que pour TES compétences." },
            { title: "Onglet Hors-REAC", desc: "Ajoute les activités non-pédagogiques facturables (accueil, bilans, oraux de certification…) pour qu'elles apparaissent dans tes factures." },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border bg-muted/30 p-3">
              <p className="font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-amber-800">
            Si Claude ne trouve pas toutes les compétences lors du premier import, clique sur <strong>Supprimer</strong> puis réimporte le même PDF. Le traitement peut varier selon la structure du document.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "apprenants",
    icon: <Users className="h-5 w-5" />,
    title: "Apprenants",
    summary: "Gérer les groupes et les profils des apprenants",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Les apprenants sont organisés en <strong>groupes</strong> rattachés à une formation. Un groupe = une promotion ou une classe.
        </p>
        <div className="space-y-2">
          <p className="font-semibold">Comment créer des apprenants :</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">1.</span> Sélectionne une formation dans le menu déroulant</li>
            <li className="flex gap-2"><span className="text-primary">2.</span> Crée un groupe (ex : "Groupe A – Septembre 2025")</li>
            <li className="flex gap-2"><span className="text-primary">3.</span> Ajoute les apprenants un par un, ou importe un fichier CSV</li>
          </ul>
        </div>
        <div className="space-y-2">
          <p className="font-semibold">Informations utiles à renseigner :</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">•</span> Niveau scolaire et rythme d'apprentissage → personnalise les contenus</li>
            <li className="flex gap-2"><span className="text-primary">•</span> Besoins spécifiques (dyslexie, handicap…) → Claude les prend en compte</li>
            <li className="flex gap-2"><span className="text-primary">•</span> Email → utilisé pour l'envoi de documents</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "planning",
    icon: <Calendar className="h-5 w-5" />,
    title: "Planning",
    summary: "Gérer ton calendrier de formation",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Le planning te permet de visualiser et organiser toutes tes journées de formation sur un calendrier mensuel ou hebdomadaire.
        </p>
        <div className="space-y-2">
          <p className="font-semibold">Les principales actions :</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Créer un créneau</strong> : clique sur un jour et remplis les infos (formation, horaires, groupe)</li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Importer un planning</strong> : si ton coordinateur t'envoie un fichier Excel ou CSV, tu peux l'importer directement</li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Détecter les conflits</strong> : les créneaux qui se chevauchent apparaissent en rouge</li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Vue mensuelle / hebdomadaire</strong> : bascule avec les boutons en haut à droite</li>
          </ul>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            Chaque centre a sa propre couleur dans le calendrier, ce qui te permet de voir d'un coup d'œil pour quel organisme tu travailles chaque jour.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "style",
    icon: <Palette className="h-5 w-5" />,
    title: "Profil de style pédagogique",
    summary: "Personnaliser la façon dont Claude rédige pour toi",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Le profil de style, c'est comme donner ta <strong>signature pédagogique</strong> à Claude. Une fois configuré, tous tes contenus générés auront TON style, pas un style générique.
        </p>
        <div className="space-y-3">
          {[
            { step: "1. Décris-toi", desc: "Réponds à quelques questions : comment tu t'adresses à tes apprenants ? Tu utilises beaucoup d'exemples concrets ? Tu privilégies les mises en situation ? Tu es plutôt directive ou participative ?" },
            { step: "2. Analyse par Claude", desc: "Claude analyse ta description et génère un profil structuré : ton style d'animation, ton registre de langage, tes méthodes préférées." },
            { step: "3. Tu valides", desc: "Tu lis le profil généré et tu peux dialoguer avec Claude pour affiner : « Non, j'utilise aussi beaucoup de jeux de rôle », « Oui, c'est exactement ça »." },
          ].map((item) => (
            <div key={item.step} className="rounded-lg border bg-muted/30 p-3">
              <p className="font-semibold text-foreground">{item.step}</p>
              <p className="mt-1 text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "generation",
    icon: <Sparkles className="h-5 w-5" />,
    title: "Génération de contenu",
    summary: "Créer des cours, exercices et activités avec Claude",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          C'est le cœur de FormAssist. En quelques clics, Claude génère des contenus pédagogiques complets, adaptés à ta formation et à ton style.
        </p>
        <div className="space-y-2">
          <p className="font-semibold">Types de contenus disponibles :</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Cours</strong> : contenu structuré avec objectifs, plan et ressources</li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Exercice individuel / petit groupe / collectif</strong></li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Jeu pédagogique</strong> : activité ludique liée aux compétences</li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Mise en situation</strong> : scénario de jeu de rôle professionnel</li>
          </ul>
        </div>
        <div className="space-y-2">
          <p className="font-semibold">Comment utiliser :</p>
          <ol className="space-y-1.5 text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">1.</span> Sélectionne la formation et le type de contenu</li>
            <li className="flex gap-2"><span className="text-primary">2.</span> Choisis une ou plusieurs compétences (CP) à cibler</li>
            <li className="flex gap-2"><span className="text-primary">3.</span> Précise la durée, le niveau Bloom, et la taille du groupe</li>
            <li className="flex gap-2"><span className="text-primary">4.</span> Clique sur « Générer »</li>
            <li className="flex gap-2"><span className="text-primary">5.</span> Relis, modifie si besoin, puis sauvegarde</li>
          </ol>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-amber-800">
            Le bouton <strong>Estimer le coût</strong> te permet de voir le prix avant de lancer. Pour les générations longues (cours complets), préfère <strong>Claude Opus</strong> pour une qualité optimale.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "fiches",
    icon: <FileText className="h-5 w-5" />,
    title: "Fiches pédagogiques",
    summary: "Créer et organiser tes fiches de déroulement de séance",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Une fiche pédagogique décrit le déroulement complet d'une séance : objectifs, phases, durée de chaque activité, matériel nécessaire, modalités d'évaluation.
        </p>
        <div className="space-y-2">
          <p className="font-semibold">Structure d'une fiche :</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>En-tête</strong> : titre, formation, compétences ciblées, durée totale</li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Phases</strong> : introduction, développement, synthèse, évaluation</li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Pour chaque phase</strong> : durée, activité formateur, activité apprenant, matériel</li>
          </ul>
        </div>
        <p className="text-muted-foreground">
          Tu peux créer une fiche manuellement, ou demander à Claude de la générer à partir d'un contenu existant. Claude peut aussi affiner une fiche existante par conversation.
        </p>
      </div>
    ),
  },
  {
    id: "corrections",
    icon: <CheckCircle className="h-5 w-5" />,
    title: "Corrections",
    summary: "Faire corriger les travaux des apprenants par Claude",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Claude peut corriger les exercices, productions écrites ou mises en situation de tes apprenants, avec une grille d'évaluation basée sur les critères du REAC.
        </p>
        <div className="space-y-2">
          <p className="font-semibold">Comment corriger :</p>
          <ol className="space-y-1.5 text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">1.</span> Sélectionne la formation → le groupe → l'apprenant</li>
            <li className="flex gap-2"><span className="text-primary">2.</span> Choisis la compétence évaluée</li>
            <li className="flex gap-2"><span className="text-primary">3.</span> Colle le texte du travail de l'apprenant dans la zone prévue</li>
            <li className="flex gap-2"><span className="text-primary">4.</span> Clique sur « Corriger »</li>
            <li className="flex gap-2"><span className="text-primary">5.</span> Claude rend une évaluation critériée avec des pistes d'amélioration</li>
          </ol>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            La correction est un <strong>outil d'aide</strong>, pas un remplacement de ton jugement. Relis toujours le retour de Claude et adapte-le si besoin avant de le communiquer à l'apprenant.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "documents",
    icon: <Send className="h-5 w-5" />,
    title: "Documents & Envoi",
    summary: "Envoyer des emails depuis l'application",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Envoie des emails à tes coordinateurs, apprenants ou organismes directement depuis FormAssist. Claude peut t'aider à rédiger des mails professionnels adaptés.
        </p>
        <div className="space-y-2">
          <p className="font-semibold">Prérequis :</p>
          <p className="text-muted-foreground">
            Configure d'abord ton compte email dans <strong>Paramètres → Sécurité</strong> (serveur SMTP, identifiants). Sans cette configuration, l'envoi ne fonctionnera pas.
          </p>
        </div>
        <div className="space-y-2">
          <p className="font-semibold">Fonctionnalités :</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">•</span> Rédaction assistée par Claude (mail au coordinateur, relance, bilan…)</li>
            <li className="flex gap-2"><span className="text-primary">•</span> Modèles de mails réutilisables</li>
            <li className="flex gap-2"><span className="text-primary">•</span> Historique des envois</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "facturation",
    icon: <Receipt className="h-5 w-5" />,
    title: "Facturation",
    summary: "Créer et suivre tes factures",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Génère tes factures en quelques clics. Les informations du centre (adresse, SIRET, RIB) et tes tarifs sont pré-remplis automatiquement depuis les données du centre.
        </p>
        <div className="space-y-2">
          <p className="font-semibold">Cycle de vie d'une facture :</p>
          <div className="flex items-center gap-2 flex-wrap">
            {["Brouillon", "→", "Envoyée", "→", "Payée"].map((s, i) => (
              <span key={i} className={s === "→" ? "text-muted-foreground" : "rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"}>
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="font-semibold">Les ajustements :</p>
          <p className="text-muted-foreground">
            Tu peux ajouter des lignes supplémentaires (frais de déplacement, matériel) ou des déductions (absences, remises). Chaque ligne a un intitulé, une quantité, et un tarif unitaire.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-muted-foreground">
            Le numéro de facture est généré automatiquement et incrémenté. Tu peux le personnaliser dans les paramètres du centre.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "finances",
    icon: <PiggyBank className="h-5 w-5" />,
    title: "Tableau de bord financier",
    summary: "Suivre tes revenus et ta consommation API",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Le tableau de bord financier te donne une vue synthétique de ta situation mensuelle.
        </p>
        <div className="space-y-2">
          <p className="font-semibold">Ce que tu vois ici :</p>
          <ul className="space-y-1.5 text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Revenus du mois</strong> : total des factures marquées "Payée" ce mois</li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Montant en attente</strong> : factures envoyées non encore payées</li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Coût API Claude</strong> : ce que tu as dépensé en génération ce mois</li>
            <li className="flex gap-2"><span className="text-primary">•</span> <strong>Répartition par modèle</strong> : Opus / Sonnet / Haiku</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "parametres",
    icon: <Settings className="h-5 w-5" />,
    title: "Paramètres",
    summary: "Configurer la clé API, les modèles et le budget",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Les paramètres se divisent en plusieurs sections accessibles dans le menu à gauche de la page.
        </p>
        <div className="space-y-3">
          {[
            { title: "Clé API Claude", desc: "Colle ici ta clé API Anthropic (commence par sk-ant-…). Elle est chiffrée et stockée uniquement sur ton ordinateur. Sans cette clé, aucune génération n'est possible." },
            { title: "Modèles IA", desc: "Choisis entre 3 préréglages : Qualité maximale (Opus, meilleurs résultats), Équilibré (Sonnet, bon compromis), Économique (Haiku, moins cher). Tu peux aussi personnaliser modèle par modèle." },
            { title: "Budget", desc: "Fixe un budget mensuel (défaut : 25 €). FormAssist t'alertera avant chaque génération coûteuse et bloquera si le budget est dépassé." },
            { title: "Sécurité", desc: "Configure le verrouillage automatique (l'app se verrouille après X minutes d'inactivité). Recommandé pour protéger les données des apprenants." },
            { title: "Sauvegardes", desc: "Crée des sauvegardes de ta base de données et restaure-les si besoin. À faire régulièrement !" },
            { title: "À propos / Mises à jour", desc: "Vérifie si une nouvelle version est disponible et installe-la en un clic." },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border bg-muted/30 p-3">
              <p className="font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "budget-api",
    icon: <BookOpen className="h-5 w-5" />,
    title: "Comprendre le budget API",
    summary: "Comment fonctionne la facturation de Claude et comment maîtriser les coûts",
    content: (
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          FormAssist utilise l'API Anthropic (Claude) pour générer du contenu. Chaque utilisation a un coût mesuré en <strong>tokens</strong> (des fragments de mots).
        </p>
        <div className="space-y-2">
          <p className="font-semibold">Les 3 modèles et leurs coûts :</p>
          <div className="space-y-2">
            {[
              { model: "Claude Opus 4.7", cost: "~5 €/M tokens entrée, 25 €/M sortie", usage: "Cours complets, fiches pédago complexes", badge: "bg-amber-100 text-amber-800" },
              { model: "Claude Sonnet 4.6", cost: "~3 €/M tokens entrée, 15 €/M sortie", usage: "Exercices, corrections, REAC", badge: "bg-blue-100 text-blue-800" },
              { model: "Claude Haiku 4.5", cost: "~1 €/M tokens entrée, 5 €/M sortie", usage: "Tâches rapides, reformulations", badge: "bg-green-100 text-green-800" },
            ].map((m) => (
              <div key={m.model} className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${m.badge}`}>{m.model}</span>
                </div>
                <p className="text-muted-foreground">{m.cost}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Idéal pour : {m.usage}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-amber-800">
            En pratique : générer un cours complet avec Opus coûte environ <strong>0,05 à 0,15 €</strong>. Avec un budget de 25 €/mois, tu peux générer <strong>150 à 500 contenus</strong> selon leur longueur.
          </p>
        </div>
      </div>
    ),
  },
];

export function HelpPage() {
  const [openId, setOpenId] = useState<string | null>("demarrage");

  function toggle(id: string) {
    setOpenId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Guide d'utilisation</h1>
        <p className="mt-1 text-muted-foreground">
          Tout ce dont tu as besoin pour utiliser FormAssist. Clique sur une section pour l'ouvrir.
        </p>
      </div>

      {/* Raccourci démarrage */}
      <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <LayoutDashboard className="h-4 w-4 text-primary" />
          <p className="font-semibold text-primary">Première utilisation ?</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Commence par la section <strong>« Par où commencer ? »</strong> ci-dessous — elle t'explique les 5 étapes dans l'ordre.
        </p>
      </div>

      {/* Accordéon */}
      <div className="space-y-2">
        {SECTIONS.map((section) => {
          const isOpen = openId === section.id;
          return (
            <div
              key={section.id}
              className={`overflow-hidden rounded-xl border transition-all ${
                isOpen ? "border-primary/30 shadow-sm" : "border-border"
              }`}
            >
              <button
                onClick={() => toggle(section.id)}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${
                  isOpen ? "bg-primary/5" : "bg-card hover:bg-muted/50"
                }`}
              >
                <span className={isOpen ? "text-primary" : "text-muted-foreground"}>
                  {section.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${isOpen ? "text-primary" : "text-foreground"}`}>
                    {section.title}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{section.summary}</p>
                </div>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>

              {isOpen && (
                <div className="border-t bg-card px-4 pb-5 pt-4">
                  {section.content}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pied de page */}
      <div className="rounded-xl border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        <p>
          Un problème ? Une question ? Les bandeaux d'aide en haut de chaque page se réinitialisent
          en vidant le cache du navigateur. Tu peux aussi contacter le support.
        </p>
      </div>
    </div>
  );
}
