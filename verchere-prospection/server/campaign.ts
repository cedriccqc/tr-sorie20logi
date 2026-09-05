import { storage, normaliserNom } from "./storage.js";
import { envoyerMessageKijiji, ErreurContenuMessage } from "./scrapers/kijiji.ts";
import { envoyerMessageFacebook } from "./scrapers/facebook.ts";
import type { CampaignStatus } from "../shared/types.js";

/** Au-dela de ce nombre d'echecs d'affilee, la campagne se met en pause. */
const ECHECS_CONSECUTIFS_MAX = 3;

let etat: CampaignStatus = {
  status: "idle",
  current: 0,
  total: 0,
  results: [],
  dailySent: { kijiji: 0, facebook: 0 },
  limits: storage.getLimits(),
  nextSendAt: null,
  erreur: null,
};

let stopDemande = false;
let enCours = false;

export function statutCampagne(): CampaignStatus {
  return { ...etat, dailySent: storage.getDailySent(), limits: storage.getLimits() };
}

export function arreterCampagne() {
  stopDemande = true;
  if (etat.status === "running") etat.status = "paused";
  return statutCampagne();
}

function attendre(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Remplace les variables {{nom}}, {{ville}}, {{titre}}, {{prix}} d'un modele. */
export function rendreMessage(modele: string, contact: any) {
  return modele
    .replace(/\{\{\s*nom\s*\}\}/gi, contact.nom || "")
    .replace(/\{\{\s*ville\s*\}\}/gi, contact.ville || "")
    .replace(/\{\{\s*titre\s*\}\}/gi, contact.titre || "")
    .replace(/\{\{\s*prix\s*\}\}/gi, contact.prix || "")
    .replace(/[ \t]+([,.;:!?])/g, "$1") // « Bonjour , » quand le nom est vide
    .replace(/\s{3,}/g, " ")
    .trim();
}

export interface OptionsCampagne {
  /** Renvoyer aussi aux contacts deja contactes (desactive par defaut). */
  reenvoyer?: boolean;
}

/**
 * Prepare la liste des contacts a traiter : doublons retires, contacts deja
 * contactes ecartes (sauf demande explicite), une seule annonce par vendeur
 * connu. Retourne aussi les raisons des exclusions pour le journal.
 */
export function planifierCampagne(contactIds: number[], options: OptionsCampagne = {}) {
  const vus = new Set<number>();
  const urls = new Set<string>();
  const vendeurs = new Map<string, number>(); // cle vendeur -> id du contact retenu
  const retenus: any[] = [];
  const ignores: { contactId: number; message: string }[] = [];

  for (const id of contactIds) {
    if (vus.has(id)) continue;
    vus.add(id);
    const c = storage.getContact(id);
    if (!c) continue;

    if (c.url && urls.has(c.url)) {
      ignores.push({ contactId: c.id, message: "Même annonce qu'un autre contact sélectionné — ignoré." });
      continue;
    }

    if (c.dernierContact && !options.reenvoyer) {
      ignores.push({
        contactId: c.id,
        message: `Déjà contacté le ${new Date(c.dernierContact).toLocaleString("fr-CA")} — ignoré (cochez « renvoyer » pour forcer).`,
      });
      continue;
    }

    const cleVendeur = c.vendeurId
      ? `${c.plateforme}:id:${c.vendeurId}`
      : normaliserNom(c.nom).length >= 3
        ? `${c.plateforme}:nom:${normaliserNom(c.nom)}`
        : null;
    if (cleVendeur) {
      const deja = vendeurs.get(cleVendeur);
      if (deja != null) {
        ignores.push({ contactId: c.id, message: `Même vendeur que le contact #${deja} — un seul message par personne.` });
        continue;
      }
      if (!options.reenvoyer) {
        const ancien = storage.contactDuMemeVendeur(c.plateforme, c.vendeurId, c.nom, c.id);
        if (ancien) {
          ignores.push({
            contactId: c.id,
            message: `Ce vendeur a déjà été contacté via le contact #${ancien.id} — ignoré.`,
          });
          continue;
        }
      }
      vendeurs.set(cleVendeur, c.id);
    }

    if (c.url) urls.add(c.url);
    retenus.push(c);
  }
  return { retenus, ignores };
}

export async function demarrerCampagne(
  contactIds: number[],
  modele: string,
  simulation = false,
  options: OptionsCampagne = {},
) {
  if (enCours) throw new Error("Une campagne est déjà en cours.");
  if (!modele || !modele.trim()) throw new Error("Le message est vide.");

  const { retenus: contacts, ignores } = planifierCampagne(contactIds, options);
  if (!contacts.length) {
    throw new Error(
      ignores.length
        ? `Aucun contact à traiter : ${ignores.length} ignoré(s) (déjà contactés ou doublons). ` +
          "Cochez « renvoyer aux contacts déjà contactés » si c'est voulu."
        : "Aucun contact valide sélectionné.",
    );
  }

  enCours = true;
  stopDemande = false;
  etat = {
    status: "running",
    current: 0,
    total: contacts.length,
    results: ignores.map((i) => ({ ...i, ok: false, ignore: true, at: new Date().toISOString() })),
    dailySent: storage.getDailySent(),
    limits: storage.getLimits(),
    nextSendAt: null,
    erreur: null,
  };

  // Vendeurs deja servis PENDANT cette campagne (identifies sur la page).
  const vendeursServis = new Map<string, number>();

  (async () => {
    let echecsConsecutifs = 0;
    try {
      for (const contact of contacts) {
        if (stopDemande) {
          etat.status = "paused";
          break;
        }

        const limits = storage.getLimits();
        const envoyes = storage.getDailySent();
        const p = contact.plateforme as "kijiji" | "facebook";

        if (envoyes[p] >= limits[p].daily) {
          etat.results.push({
            contactId: contact.id,
            ok: false,
            ignore: true,
            message: `Limite quotidienne ${p} atteinte (${limits[p].daily}) — reporté à demain.`,
            at: new Date().toISOString(),
          });
          etat.current++;
          continue;
        }

        const message = rendreMessage(modele, contact);
        let aEnvoye = false;
        try {
          if (simulation) {
            await attendre(400);
            aEnvoye = true;
            etat.results.push({
              contactId: contact.id,
              ok: true,
              message: "Simulation — message non envoyé",
              at: new Date().toISOString(),
            });
          } else if (p === "kijiji") {
            const r = await envoyerMessageKijiji(contact.url, message, {
              vendeurDejaContacte: (vendeurId, vendeurNom) => {
                const cle = vendeurId
                  ? `id:${vendeurId}`
                  : normaliserNom(vendeurNom).length >= 3
                    ? `nom:${normaliserNom(vendeurNom)}`
                    : null;
                if (!cle) return null;
                const deja = vendeursServis.get(cle);
                if (deja != null && deja !== contact.id) {
                  return `Même vendeur que le contact #${deja} (${vendeurNom || vendeurId}) — un seul message par personne.`;
                }
                if (!options.reenvoyer) {
                  const ancien = storage.contactDuMemeVendeur("kijiji", vendeurId, vendeurNom, contact.id);
                  if (ancien) {
                    return `Ce vendeur (${vendeurNom || vendeurId}) a déjà été contacté via le contact #${ancien.id} — ignoré.`;
                  }
                }
                vendeursServis.set(cle, contact.id);
                return null;
              },
            });
            // On memorise le vendeur meme si on ignore : utile la prochaine fois.
            if (r.vendeurId || r.vendeurNom) {
              storage.updateContact(contact.id, {
                vendeurId: r.vendeurId,
                vendeurNom: r.vendeurNom,
                nom: contact.nom || r.vendeurNom || null,
              });
            }
            if (r.ok === false) {
              etat.results.push({
                contactId: contact.id,
                ok: false,
                ignore: true,
                message: r.raison,
                at: new Date().toISOString(),
              });
            } else {
              aEnvoye = true;
              // Marque « contacte » MEME si non confirme : un doute ne doit
              // jamais provoquer un deuxieme envoi a la meme personne.
              storage.markContacted([contact.id], message);
              if (!r.confirme) {
                storage.updateContact(contact.id, {
                  notes: [contact.notes, `⚠ ${r.detail}`].filter(Boolean).join("\n"),
                });
              }
              etat.results.push({
                contactId: contact.id,
                ok: true,
                incertain: !r.confirme,
                message: r.detail,
                at: new Date().toISOString(),
              });
            }
          } else {
            await envoyerMessageFacebook(contact.url, message);
            aEnvoye = true;
            storage.markContacted([contact.id], message);
            etat.results.push({
              contactId: contact.id,
              ok: true,
              message: "Message envoyé",
              at: new Date().toISOString(),
            });
          }
          echecsConsecutifs = 0;
        } catch (e) {
          const err = e as Error;
          etat.results.push({
            contactId: contact.id,
            ok: false,
            message: err.message,
            at: new Date().toISOString(),
          });
          if (err instanceof ErreurContenuMessage) {
            // Le texte qui allait partir n'etait pas le bon : on ARRETE tout,
            // plutot que de repeter la meme erreur sur les contacts suivants.
            etat.status = "error";
            etat.erreur =
              "Campagne arrêtée : " + err.message + " Vérifiez votre modèle et la capture d'écran dans data/debug.";
            etat.current++;
            break;
          }
          echecsConsecutifs++;
          if (echecsConsecutifs >= ECHECS_CONSECUTIFS_MAX) {
            etat.status = "paused";
            etat.erreur =
              `Campagne mise en pause après ${ECHECS_CONSECUTIFS_MAX} échecs consécutifs. ` +
              "Dernière erreur : " + err.message;
            etat.current++;
            break;
          }
        }

        etat.current++;
        etat.dailySent = storage.getDailySent();

        // Pause anti-spam uniquement apres un envoi reel (ou simule).
        if (aEnvoye && etat.current < etat.total && !stopDemande) {
          const { delayMinSec, delayMaxSec } = limits[p];
          const attente = simulation
            ? 300
            : (delayMinSec + Math.random() * Math.max(0, delayMaxSec - delayMinSec)) * 1000;
          etat.nextSendAt = new Date(Date.now() + attente).toISOString();
          await attendre(attente);
          etat.nextSendAt = null;
        }
      }
      if (etat.status === "running") etat.status = "done";
    } catch (e) {
      etat.status = "error";
      etat.erreur = (e as Error).message;
    } finally {
      etat.nextSendAt = null;
      enCours = false;
    }
  })();

  return statutCampagne();
}
