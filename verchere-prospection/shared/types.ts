export type Plateforme = "kijiji" | "facebook";

export type Statut =
  | "nouveau"
  | "contacte"
  | "repondu"
  | "interesse"
  | "refuse"
  | "closed";

export const STATUTS: { value: Statut; label: string; couleur: string }[] = [
  { value: "nouveau", label: "Nouveau", couleur: "bg-slate-100 text-slate-700" },
  { value: "contacte", label: "Contacté", couleur: "bg-blue-100 text-blue-700" },
  { value: "repondu", label: "Répondu", couleur: "bg-amber-100 text-amber-800" },
  { value: "interesse", label: "Intéressé", couleur: "bg-emerald-100 text-emerald-700" },
  { value: "refuse", label: "Refusé", couleur: "bg-rose-100 text-rose-700" },
  { value: "closed", label: "Fermé", couleur: "bg-neutral-200 text-neutral-600" },
];

export interface Contact {
  id: number;
  plateforme: Plateforme;
  annonceId: string;
  titre: string;
  url: string;
  nom: string | null;
  telephone: string | null;
  courriel: string | null;
  adresse: string | null;
  ville: string | null;
  prix: string | null;
  description: string | null;
  motCle: string | null;
  categorie: string | null;
  statut: Statut;
  notes: string | null;
  messageEnvoye: string | null;
  reponseRecue: string | null;
  dernierContact: string | null;
  dateAjout: string;
  /** Identifiant du vendeur sur la plateforme (releve au moment de l'envoi). */
  vendeurId?: string | null;
  vendeurNom?: string | null;
}

export interface Template {
  id: number;
  nom: string;
  contenu: string;
  plateforme: Plateforme | "all";
}

export interface CadenceLimits {
  kijiji: { daily: number; delayMinSec: number; delayMaxSec: number };
  facebook: { daily: number; delayMinSec: number; delayMaxSec: number };
}

export interface CampaignStatus {
  status: "idle" | "running" | "paused" | "done" | "error";
  current: number;
  total: number;
  results: {
    contactId: number;
    ok: boolean;
    message: string;
    at: string;
    /** Envoi effectue mais non confirme par la plateforme. */
    incertain?: boolean;
    /** Contact volontairement saute (deja contacte, meme vendeur, limite). */
    ignore?: boolean;
  }[];
  dailySent: { kijiji: number; facebook: number };
  limits: CadenceLimits;
  nextSendAt: string | null;
  erreur?: string | null;
}

export interface ScrapeJob {
  id: string;
  plateforme: Plateforme;
  status: "running" | "done" | "error";
  motsCles: string[];
  villes: string[];
  progression: number;
  total: number;
  trouves: number;
  ajoutes: number;
  logs: string[];
  erreur?: string | null;
  demarreA: string;
  termineA?: string | null;
}

export interface Stats {
  total: number;
  kijiji: number;
  facebook: number;
  contactes: number;
  reponses: number;
  parStatut: { statut: Statut; count: number }[];
}
