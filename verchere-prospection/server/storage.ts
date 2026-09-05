import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { Contact, Template, CadenceLimits, Statut, Stats } from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../data");
const DB_FILE = path.join(DATA_DIR, "verchere.json");

interface DBShape {
  contacts: Contact[];
  templates: Template[];
  limits: CadenceLimits;
  sessions: {
    kijiji: { cookies: any[] | null; email: string | null; connecteA: string | null };
    facebook: { cookies: any[] | null; connecteA: string | null };
  };
  compteurs: { date: string; kijiji: number; facebook: number };
  parametres: { modeVisible: boolean };
  nextContactId: number;
  nextTemplateId: number;
}

const DEFAULT_DB: DBShape = {
  contacts: [],
  templates: [
    {
      id: 1,
      nom: "Local commercial — Kijiji",
      plateforme: "kijiji",
      contenu:
        "Bonjour, je suis intéressé par votre local commercial. Je représente Verchere, une firme d'investissement immobilier. Seriez-vous ouvert à discuter d'une entente? Cordialement.",
    },
    {
      id: 2,
      nom: "Complexe résidentiel — Facebook",
      plateforme: "facebook",
      contenu:
        "Bonjour! Votre immeuble m'intéresse. Je travaille avec Verchere et nous acquérons des complexes résidentiels dans votre secteur. Seriez-vous disponible pour en discuter?",
    },
    {
      id: 3,
      nom: "Approche générique investisseur",
      plateforme: "all",
      contenu:
        "Bonjour, je suis investisseur immobilier. Nous achetons principalement ce type d'immeuble.\n\nJe me demandais si vous seriez ouvert à recevoir une offre.",
    },
  ],
  limits: {
    kijiji: { daily: 15, delayMinSec: 65, delayMaxSec: 120 },
    facebook: { daily: 10, delayMinSec: 180, delayMaxSec: 300 },
  },
  sessions: {
    kijiji: { cookies: null, email: null, connecteA: null },
    facebook: { cookies: null, connecteA: null },
  },
  compteurs: { date: today(), kijiji: 0, facebook: 0 },
  parametres: { modeVisible: false },
  nextContactId: 1,
  nextTemplateId: 4,
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Nom de vendeur normalise (accents, casse, espaces) pour comparaison. */
export function normaliserNom(nom: string | null | undefined): string {
  return (nom || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

let db: DBShape;

function load(): DBShape {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      return { ...structuredClone(DEFAULT_DB), ...raw };
    }
  } catch (e) {
    console.error("[storage] lecture impossible, base neuve:", (e as Error).message);
  }
  return structuredClone(DEFAULT_DB);
}

let saveTimer: NodeJS.Timeout | null = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
      console.error("[storage] ecriture impossible:", (e as Error).message);
    }
  }, 150);
}

db = load();

function rolloverCompteurs() {
  if (db.compteurs.date !== today()) {
    db.compteurs = { date: today(), kijiji: 0, facebook: 0 };
    save();
  }
}

// --------------------------------------------------------------------------
// Contacts
// --------------------------------------------------------------------------

export interface ContactFilters {
  plateforme?: string;
  statut?: string;
  ville?: string;
  categorie?: string;
  q?: string;
  avecTelephone?: boolean;
  sansTelephone?: boolean;
}

export const storage = {
  listContacts(f: ContactFilters = {}): Contact[] {
    let out = [...db.contacts];
    if (f.plateforme && f.plateforme !== "all") out = out.filter((c) => c.plateforme === f.plateforme);
    if (f.statut && f.statut !== "all") out = out.filter((c) => c.statut === f.statut);
    if (f.ville && f.ville !== "all") out = out.filter((c) => (c.ville || "").toLowerCase() === f.ville.toLowerCase());
    if (f.categorie && f.categorie !== "all") out = out.filter((c) => c.categorie === f.categorie);
    if (f.avecTelephone) out = out.filter((c) => !!c.telephone);
    if (f.sansTelephone) out = out.filter((c) => !c.telephone);
    if (f.q) {
      const q = f.q.toLowerCase();
      out = out.filter((c) =>
        [c.titre, c.nom, c.telephone, c.adresse, c.ville, c.description, c.notes]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return out.sort((a, b) => (a.dateAjout < b.dateAjout ? 1 : -1));
  },

  getContact(id: number): Contact | undefined {
    return db.contacts.find((c) => c.id === id);
  },

  /** Insere si l'annonce n'existe pas deja (cle: plateforme + annonceId). */
  upsertContact(data: Partial<Contact>): { contact: Contact; created: boolean } {
    const existing = db.contacts.find(
      (c) => c.plateforme === data.plateforme && c.annonceId === data.annonceId,
    );
    if (existing) {
      // On enrichit sans ecraser ce qui existe deja
      for (const [k, v] of Object.entries(data)) {
        if (v != null && v !== "" && (existing as any)[k] == null) (existing as any)[k] = v;
      }
      save();
      return { contact: existing, created: false };
    }
    const contact: Contact = {
      id: db.nextContactId++,
      plateforme: (data.plateforme as any) || "kijiji",
      annonceId: data.annonceId || String(Date.now()),
      titre: data.titre || "(sans titre)",
      url: data.url || "",
      nom: data.nom ?? null,
      telephone: data.telephone ?? null,
      courriel: data.courriel ?? null,
      adresse: data.adresse ?? null,
      ville: data.ville ?? null,
      prix: data.prix ?? null,
      description: data.description ?? null,
      motCle: data.motCle ?? null,
      categorie: data.categorie ?? null,
      statut: "nouveau",
      notes: null,
      messageEnvoye: null,
      reponseRecue: null,
      dernierContact: null,
      dateAjout: new Date().toISOString(),
    };
    db.contacts.push(contact);
    save();
    return { contact, created: true };
  },

  updateContact(id: number, patch: Partial<Contact>): Contact | undefined {
    const c = db.contacts.find((x) => x.id === id);
    if (!c) return undefined;
    Object.assign(c, patch);
    save();
    return c;
  },

  deleteContact(id: number): boolean {
    const i = db.contacts.findIndex((c) => c.id === id);
    if (i < 0) return false;
    db.contacts.splice(i, 1);
    save();
    return true;
  },

  markContacted(ids: number[], message?: string): number {
    let n = 0;
    for (const id of ids) {
      const c = db.contacts.find((x) => x.id === id);
      if (!c) continue;
      c.statut = c.statut === "nouveau" ? "contacte" : c.statut;
      c.dernierContact = new Date().toISOString();
      if (message) c.messageEnvoye = message;
      n++;
    }
    save();
    return n;
  },

  /**
   * Un contact deja contacte appartenant au meme vendeur (par identifiant de
   * profil, ou a defaut par nom). Sert a ne pas ecrire vingt fois a la meme
   * personne qui publie vingt annonces.
   */
  contactDuMemeVendeur(
    plateforme: string,
    vendeurId: string | null | undefined,
    nom: string | null | undefined,
    exclureId?: number,
  ): Contact | undefined {
    const normNom = normaliserNom(nom);
    return db.contacts.find((c) => {
      if (c.id === exclureId || c.plateforme !== plateforme || !c.dernierContact) return false;
      if (vendeurId && c.vendeurId && c.vendeurId === vendeurId) return true;
      if (normNom && normNom.length >= 3) {
        const n2 = normaliserNom(c.nom) || normaliserNom(c.vendeurNom);
        if (n2 && n2 === normNom) return true;
      }
      return false;
    });
  },

  // ------------------------------------------------------------------------
  // Templates
  // ------------------------------------------------------------------------
  listTemplates(): Template[] {
    return db.templates;
  },
  createTemplate(t: Omit<Template, "id">): Template {
    const tpl: Template = { ...t, id: db.nextTemplateId++ };
    db.templates.push(tpl);
    save();
    return tpl;
  },
  updateTemplate(id: number, patch: Partial<Template>): Template | undefined {
    const t = db.templates.find((x) => x.id === id);
    if (!t) return undefined;
    Object.assign(t, patch);
    save();
    return t;
  },
  deleteTemplate(id: number): boolean {
    const i = db.templates.findIndex((t) => t.id === id);
    if (i < 0) return false;
    db.templates.splice(i, 1);
    save();
    return true;
  },

  // ------------------------------------------------------------------------
  // Cadence / limites
  // ------------------------------------------------------------------------
  getLimits(): CadenceLimits {
    return db.limits;
  },
  setLimits(l: CadenceLimits): CadenceLimits {
    db.limits = l;
    save();
    return db.limits;
  },
  getDailySent() {
    rolloverCompteurs();
    return { kijiji: db.compteurs.kijiji, facebook: db.compteurs.facebook };
  },
  incrementDailySent(plateforme: "kijiji" | "facebook") {
    rolloverCompteurs();
    db.compteurs[plateforme]++;
    save();
  },

  // ------------------------------------------------------------------------
  // Sessions (cookies de connexion)
  // ------------------------------------------------------------------------
  getSession(p: "kijiji" | "facebook") {
    return db.sessions[p];
  },
  setSession(p: "kijiji" | "facebook", cookies: any[], email?: string) {
    db.sessions[p] = { ...db.sessions[p], cookies, connecteA: new Date().toISOString() } as any;
    if (email) (db.sessions.kijiji as any).email = email;
    save();
  },
  clearSession(p: "kijiji" | "facebook") {
    db.sessions[p] = { cookies: null, connecteA: null, email: null } as any;
    save();
  },

  // ------------------------------------------------------------------------
  // Parametres
  // ------------------------------------------------------------------------
  /** Mode navigateur visible : affiche Chromium a l'ecran (captcha, debogage). */
  getModeVisible(): boolean {
    if (process.env.HEADFUL === "1") return true;
    return !!db.parametres?.modeVisible;
  },
  setModeVisible(actif: boolean): boolean {
    db.parametres = { ...(db.parametres || {}), modeVisible: !!actif };
    save();
    return db.parametres.modeVisible;
  },

  // ------------------------------------------------------------------------
  // Stats
  // ------------------------------------------------------------------------
  stats(): Stats {
    const cs = db.contacts;
    const parStatut = new Map<Statut, number>();
    for (const c of cs) parStatut.set(c.statut, (parStatut.get(c.statut) || 0) + 1);
    return {
      total: cs.length,
      kijiji: cs.filter((c) => c.plateforme === "kijiji").length,
      facebook: cs.filter((c) => c.plateforme === "facebook").length,
      contactes: cs.filter((c) => c.dernierContact).length,
      reponses: cs.filter((c) => c.reponseRecue).length,
      parStatut: [...parStatut.entries()].map(([statut, count]) => ({ statut, count })),
    };
  },
};
