import { Router } from "express";
import { storage } from "./storage.js";
import { closeBrowser, normaliserCookie } from "./browser.js";
import { VILLES, REGIONS, CATEGORIES, MOTS_CLES_DEFAUT } from "../config/territoire.ts";
import {
  scraperKijiji,
  recupererDetailsKijiji,
  connexionKijiji,
  connexionManuelleKijiji,
  etatConnexionManuelle,
  verifierSessionKijiji,
  verifierReponsesKijiji,
} from "./scrapers/kijiji.ts";
import {
  scraperFacebook,
  recupererDetailsFacebook,
  verifierReponsesFacebook,
} from "./scrapers/facebook.ts";
import {
  demarrerCampagne,
  statutCampagne,
  arreterCampagne,
  rendreMessage,
  planifierCampagne,
} from "./campaign.ts";
import { APP_VERSION } from "../shared/types.js";
import type { ScrapeJob } from "../shared/types.js";

export const router = Router();

const jobs = new Map<string, ScrapeJob & { _annule?: boolean }>();

function nouveauJob(plateforme: "kijiji" | "facebook", motsCles: string[], villes: string[]): ScrapeJob {
  const job: ScrapeJob = {
    id: `${plateforme}-${Date.now()}`,
    plateforme,
    status: "running",
    motsCles,
    villes,
    progression: 0,
    total: motsCles.length * villes.length,
    trouves: 0,
    ajoutes: 0,
    logs: [],
    erreur: null,
    demarreA: new Date().toISOString(),
    termineA: null,
  };
  jobs.set(job.id, job);
  // Nettoyage des vieux jobs
  if (jobs.size > 20) {
    const vieux = [...jobs.keys()].slice(0, jobs.size - 20);
    vieux.forEach((k) => jobs.delete(k));
  }
  return job;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

router.get("/config", (_req, res) => {
  res.json({
    marque: "VERCHERE",
    version: APP_VERSION,
    villes: VILLES.map(({ value, label, region }) => ({ value, label, region })),
    regions: REGIONS,
    categories: CATEGORIES,
    motsClesDefaut: MOTS_CLES_DEFAUT,
    sessions: {
      kijiji: {
        connecte: !!storage.getSession("kijiji").cookies?.length,
        email: (storage.getSession("kijiji") as any).email ?? null,
        connecteA: storage.getSession("kijiji").connecteA,
      },
      facebook: {
        connecte: !!storage.getSession("facebook").cookies?.length,
        connecteA: storage.getSession("facebook").connecteA,
      },
    },
    modeVisible: storage.getModeVisible(),
  });
});

/**
 * Mode navigateur visible : Chromium s'affiche a l'ecran pendant les recherches
 * et les envois. Sert a completer soi-meme une verification humaine (captcha)
 * et a voir pourquoi un envoi echoue.
 */
router.post("/settings/mode-visible", async (req, res) => {
  const actif = storage.setModeVisible(req.body?.actif === true);
  // Le navigateur deja ouvert garde son ancien mode : on le ferme pour que le
  // prochain lancement prenne le nouveau reglage.
  await closeBrowser().catch(() => {});
  res.json({ modeVisible: actif });
});

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

router.get("/stats", (_req, res) => res.json(storage.stats()));

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

router.get("/contacts", (req, res) => {
  const q = req.query as any;
  res.json(
    storage.listContacts({
      plateforme: q.plateforme,
      statut: q.statut,
      ville: q.ville,
      categorie: q.categorie,
      q: q.q,
      avecTelephone: q.avecTelephone === "true",
      sansTelephone: q.sansTelephone === "true",
    }),
  );
});

/** Ajout manuel d'un contact (annonce reperee a la main, referencement, etc.). */
router.post("/contacts", (req, res) => {
  const b = req.body || {};
  if (!b.titre && !b.url) return res.status(400).json({ erreur: "titre ou url requis" });
  const { contact, created } = storage.upsertContact({
    plateforme: b.plateforme || "kijiji",
    annonceId: b.annonceId || `manuel-${Date.now()}`,
    ...b,
  });
  res.status(created ? 201 : 200).json(contact);
});

router.patch("/contacts/:id", (req, res) => {
  const c = storage.updateContact(Number(req.params.id), req.body);
  if (!c) return res.status(404).json({ erreur: "Contact introuvable" });
  res.json(c);
});

router.delete("/contacts/:id", (req, res) => {
  const ok = storage.deleteContact(Number(req.params.id));
  res.status(ok ? 200 : 404).json({ ok });
});

router.post("/contacts/mark-contacted", (req, res) => {
  const { ids, message } = req.body || {};
  if (!Array.isArray(ids)) return res.status(400).json({ erreur: "ids requis" });
  res.json({ modifies: storage.markContacted(ids.map(Number), message) });
});

router.post("/contacts/:id/fetch-details", async (req, res) => {
  const c = storage.getContact(Number(req.params.id));
  if (!c) return res.status(404).json({ erreur: "Contact introuvable" });
  try {
    const d =
      c.plateforme === "kijiji"
        ? await recupererDetailsKijiji(c.url)
        : await recupererDetailsFacebook(c.url);
    const maj = storage.updateContact(c.id, {
      nom: c.nom || d.nom,
      telephone: c.telephone || d.telephone,
      courriel: c.courriel || (d as any).courriel,
      adresse: c.adresse || (d as any).adresse || null,
      description: c.description || d.description,
    });
    res.json(maj);
  } catch (e) {
    res.status(500).json({ erreur: (e as Error).message });
  }
});

/** Recupere les numeros manquants en lot (sequentiel, avec pause). */
router.post("/contacts/fetch-missing-phones", async (req, res) => {
  const limite = Number(req.body?.limite) || 10;
  const cibles = storage.listContacts({ sansTelephone: true }).slice(0, limite);
  res.json({ lances: cibles.length });
  for (const c of cibles) {
    try {
      const d =
        c.plateforme === "kijiji"
          ? await recupererDetailsKijiji(c.url)
          : await recupererDetailsFacebook(c.url);
      storage.updateContact(c.id, {
        nom: c.nom || d.nom,
        telephone: d.telephone || null,
        courriel: c.courriel || (d as any).courriel || null,
      });
    } catch {}
    await new Promise((r) => setTimeout(r, 4000 + Math.random() * 5000));
  }
});

router.post("/contacts/:id/envoyer-message", async (req, res) => {
  const c = storage.getContact(Number(req.params.id));
  if (!c) return res.status(404).json({ erreur: "Contact introuvable" });
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ erreur: "message requis" });
  try {
    const statut = await demarrerCampagne([c.id], message, req.body.simulation === true, {
      reenvoyer: req.body.reenvoyer === true,
    });
    res.json(statut);
  } catch (e) {
    res.status(400).json({ erreur: (e as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------------

function lancerScrape(plateforme: "kijiji" | "facebook", req: any, res: any) {
  const { motsCles, villes, categorie, filtreVilleStrict, pagesParRecherche } = req.body || {};
  const mots = (Array.isArray(motsCles) ? motsCles : String(motsCles || "").split("\n"))
    .map((s: string) => s.trim())
    .filter(Boolean);
  const vs = Array.isArray(villes) ? villes : [];
  if (!mots.length) return res.status(400).json({ erreur: "Au moins un mot-clé requis." });
  if (!vs.length) return res.status(400).json({ erreur: "Au moins une ville requise." });

  const job = nouveauJob(plateforme, mots, vs);
  res.json(job);

  const commun = {
    motsCles: mots,
    villes: vs,
    categorie: categorie || "commercial",
    filtreVilleStrict: filtreVilleStrict !== false,
    pagesParRecherche: Number(pagesParRecherche) || 2,
    onLog: (m: string) => {
      job.logs.push(m);
      if (job.logs.length > 400) job.logs.splice(0, job.logs.length - 400);
    },
    onProgress: (fait: number, total: number, trouves: number, ajoutes: number) => {
      job.progression = fait;
      job.total = total;
      job.trouves = trouves;
      job.ajoutes = ajoutes;
    },
    annule: () => !!(jobs.get(job.id) as any)?._annule,
  };

  const run = plateforme === "kijiji" ? scraperKijiji(commun) : scraperFacebook(commun);
  run
    .then((r) => {
      job.status = "done";
      job.trouves = r.trouves;
      job.ajoutes = r.ajoutes;
      job.logs.push(`Terminé — ${r.ajoutes} nouveaux contacts sur ${r.trouves} annonces vues.`);
    })
    .catch((e) => {
      job.status = "error";
      job.erreur = (e as Error).message;
      job.logs.push(`Erreur : ${job.erreur}`);
    })
    .finally(() => {
      job.termineA = new Date().toISOString();
    });
}

router.post("/scrape/kijiji", (req, res) => lancerScrape("kijiji", req, res));
router.post("/scrape/facebook", (req, res) => lancerScrape("facebook", req, res));

router.get("/scrape/jobs", (_req, res) =>
  res.json([...jobs.values()].sort((a, b) => (a.demarreA < b.demarreA ? 1 : -1)).slice(0, 10)),
);

router.get("/scrape/jobs/:id", (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ erreur: "Job introuvable" });
  res.json(j);
});

router.post("/scrape/jobs/:id/stop", (req, res) => {
  const j = jobs.get(req.params.id) as any;
  if (!j) return res.status(404).json({ erreur: "Job introuvable" });
  j._annule = true;
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Reponses
// ---------------------------------------------------------------------------

router.post("/check-replies", async (_req, res) => {
  const resultats: any = { kijiji: [], facebook: [], erreurs: [] };
  try {
    resultats.kijiji = await verifierReponsesKijiji();
  } catch (e) {
    resultats.erreurs.push(`Kijiji : ${(e as Error).message}`);
  }
  try {
    resultats.facebook = await verifierReponsesFacebook();
  } catch (e) {
    resultats.erreurs.push(`Facebook : ${(e as Error).message}`);
  }

  // Rapprochement approximatif : on marque « répondu » si le nom du contact
  // apparait dans une conversation.
  let marques = 0;
  const conversations = [...resultats.kijiji, ...resultats.facebook];
  for (const c of storage.listContacts({ statut: "contacte" })) {
    const cle = (c.nom || c.titre || "").toLowerCase().slice(0, 20);
    if (!cle) continue;
    const trouve = conversations.find((k: any) => k.extrait.toLowerCase().includes(cle));
    if (trouve) {
      storage.updateContact(c.id, { statut: "repondu", reponseRecue: trouve.extrait });
      marques++;
    }
  }
  res.json({ ...resultats, marques });
});

// ---------------------------------------------------------------------------
// Modeles de message
// ---------------------------------------------------------------------------

router.get("/templates", (_req, res) => res.json(storage.listTemplates()));

router.post("/templates", (req, res) => {
  const { nom, contenu, plateforme } = req.body || {};
  if (!nom || !contenu) return res.status(400).json({ erreur: "nom et contenu requis" });
  res.json(storage.createTemplate({ nom, contenu, plateforme: plateforme || "all" }));
});

router.put("/templates/:id", (req, res) => {
  const t = storage.updateTemplate(Number(req.params.id), req.body);
  if (!t) return res.status(404).json({ erreur: "Modèle introuvable" });
  res.json(t);
});

router.delete("/templates/:id", (req, res) => {
  res.json({ ok: storage.deleteTemplate(Number(req.params.id)) });
});

router.post("/templates/preview", (req, res) => {
  const { contenu, contactId } = req.body || {};
  const c = contactId ? storage.getContact(Number(contactId)) : storage.listContacts()[0];
  res.json({ apercu: rendreMessage(contenu || "", c || {}) });
});

// ---------------------------------------------------------------------------
// Campagne
// ---------------------------------------------------------------------------

router.get("/campaign/status", (_req, res) => res.json(statutCampagne()));

/** Apercu de ce que la campagne ferait : qui sera contacte, qui sera ignore et pourquoi. */
router.post("/campaign/plan", (req, res) => {
  const { contactIds, reenvoyer } = req.body || {};
  const { retenus, ignores } = planifierCampagne((contactIds || []).map(Number), {
    reenvoyer: reenvoyer === true,
  });
  res.json({ retenus: retenus.map((c) => c.id), ignores });
});

router.post("/campaign/start", async (req, res) => {
  const { contactIds, message, templateId, simulation, reenvoyer } = req.body || {};
  let modele = message;
  if (!modele && templateId) {
    modele = storage.listTemplates().find((t) => t.id === Number(templateId))?.contenu;
  }
  if (!modele) return res.status(400).json({ erreur: "message ou templateId requis" });
  try {
    res.json(
      await demarrerCampagne((contactIds || []).map(Number), modele, simulation === true, {
        reenvoyer: reenvoyer === true,
      }),
    );
  } catch (e) {
    res.status(400).json({ erreur: (e as Error).message });
  }
});

router.post("/campaign/stop", (_req, res) => res.json(arreterCampagne()));

router.get("/campaign/limits", (_req, res) => res.json(storage.getLimits()));

router.put("/campaign/limits", (req, res) => {
  const l = req.body;
  if (!l?.kijiji || !l?.facebook) return res.status(400).json({ erreur: "format invalide" });
  res.json(storage.setLimits(l));
});

// ---------------------------------------------------------------------------
// Connexions
// ---------------------------------------------------------------------------

router.post("/settings/kijiji-login", async (req, res) => {
  const { email, motDePasse } = req.body || {};
  if (!email || !motDePasse) return res.status(400).json({ erreur: "email et mot de passe requis" });
  try {
    res.json(await connexionKijiji(email, motDePasse));
  } catch (e) {
    res.status(400).json({ erreur: (e as Error).message });
  }
});

function parseCookies(entree: any) {
  if (Array.isArray(entree)) return entree;
  const s = String(entree || "").trim();
  if (s.startsWith("[")) return JSON.parse(s);
  // Format « nom=valeur; nom2=valeur2 »
  return s
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf("=");
      return { name: p.slice(0, i).trim(), value: p.slice(i + 1).trim() };
    });
}

/** Ouvre une fenetre Chromium ou l'utilisateur s'identifie lui-meme. */
router.post("/settings/kijiji-connexion-manuelle", async (_req, res) => {
  try {
    res.json(await connexionManuelleKijiji());
  } catch (e) {
    res.status(400).json({ erreur: (e as Error).message });
  }
});

router.get("/settings/kijiji-connexion-manuelle", (_req, res) => res.json(etatConnexionManuelle));

/** Teste la session enregistree en ouvrant reellement Kijiji. */
router.post("/settings/kijiji-verifier", async (_req, res) => {
  try {
    res.json(await verifierSessionKijiji());
  } catch (e) {
    res.status(400).json({ erreur: (e as Error).message });
  }
});

function enregistrerCookies(
  plateforme: "kijiji" | "facebook",
  entree: any,
  domaine: string,
  res: any,
) {
  try {
    const bruts = parseCookies(entree);
    // Normalisation immediate : les exports d'extensions ne sont pas
    // au format Playwright et seraient rejetes en bloc.
    const cookies = bruts
      .map((c: any) => normaliserCookie(c, domaine))
      .filter(Boolean);
    if (!cookies.length) {
      return res.status(400).json({ erreur: "Aucun témoin exploitable dans ce que vous avez collé." });
    }
    storage.setSession(plateforme, cookies as any[]);
    res.json({ ok: true, cookies: cookies.length, ignores: bruts.length - cookies.length });
  } catch (e) {
    res.status(400).json({ erreur: "Témoins illisibles : " + (e as Error).message });
  }
}

router.post("/settings/kijiji-cookies", (req, res) =>
  enregistrerCookies("kijiji", req.body?.cookies, ".kijiji.ca", res),
);

router.post("/settings/facebook-cookies", (req, res) =>
  enregistrerCookies("facebook", req.body?.cookies, ".facebook.com", res),
);

/**
 * Repare une session deja enregistree dans un mauvais format, sans que
 * l'utilisateur ait a recoller quoi que ce soit.
 */
router.post("/settings/:plateforme/reparer-cookies", (req, res) => {
  const p = req.params.plateforme as "kijiji" | "facebook";
  const session = storage.getSession(p);
  if (!session?.cookies?.length) return res.status(400).json({ erreur: "Aucune session enregistrée." });
  const domaine = p === "kijiji" ? ".kijiji.ca" : ".facebook.com";
  const cookies = (session.cookies as any[]).map((c) => normaliserCookie(c, domaine)).filter(Boolean);
  storage.setSession(p, cookies as any[]);
  res.json({ ok: true, cookies: cookies.length });
});

router.post("/settings/:plateforme/deconnexion", (req, res) => {
  const p = req.params.plateforme as "kijiji" | "facebook";
  storage.clearSession(p);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

router.get("/export/csv", (req, res) => {
  const contacts = storage.listContacts(req.query as any);
  const colonnes = [
    "id", "plateforme", "titre", "nom", "telephone", "courriel", "adresse",
    "ville", "prix", "statut", "motCle", "categorie", "dernierContact", "dateAjout", "url",
  ];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const csv = [
    colonnes.join(","),
    ...contacts.map((c) => colonnes.map((k) => esc((c as any)[k])).join(",")),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="verchere-contacts-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send("﻿" + csv);
});
