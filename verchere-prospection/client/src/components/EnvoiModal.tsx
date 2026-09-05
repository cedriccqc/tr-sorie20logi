import { useEffect, useState } from "react";
import { Send, X, FlaskConical, AlertTriangle } from "lucide-react";
import { api } from "../api";

export default function EnvoiModal({ selection, contacts, onFermer, onEnvoye }: any) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [simulation, setSimulation] = useState(false);
  const [reenvoyer, setReenvoyer] = useState(false);
  const [plan, setPlan] = useState<{ retenus: number[]; ignores: { contactId: number; message: string }[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    api.templates().then((t) => {
      setTemplates(t);
      if (t[0]) setMessage(t[0].contenu);
    });
  }, []);

  // Apercu du plan : qui recevra vraiment un message, qui sera ignore.
  useEffect(() => {
    api
      .planCampagne({ contactIds: selection, reenvoyer })
      .then(setPlan)
      .catch(() => setPlan(null));
  }, [selection, reenvoyer]);

  const choisis = contacts.filter((c: any) => selection.includes(c.id));
  const apercu = choisis[0]
    ? message
        .replace(/\{\{\s*nom\s*\}\}/gi, choisis[0].nom || "")
        .replace(/\{\{\s*ville\s*\}\}/gi, choisis[0].ville || "")
        .replace(/\{\{\s*titre\s*\}\}/gi, choisis[0].titre || "")
        .replace(/\{\{\s*prix\s*\}\}/gi, choisis[0].prix || "")
    : message;

  const dejaContactes = choisis.filter((c: any) => c.dernierContact).length;
  const ressembleKijiji = /toujours disponible|still available/i.test(message);

  async function lancer() {
    setOccupe(true);
    setErreur(null);
    try {
      await api.demarrerCampagne({ contactIds: selection, message, simulation, reenvoyer });
      onEnvoye();
    } catch (e: any) {
      setErreur(e.message);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-marine-900/50 p-4">
      <div className="carte w-full max-w-2xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="titre-section">Envoyer un message</h3>
            <p className="sous-titre mt-1">
              {selection.length} contact(s) sélectionné(s) — envoi séquencé selon la cadence
              anti-spam.
            </p>
          </div>
          <button className="rounded p-1 hover:bg-marine-100" onClick={onFermer}>
            <X size={18} />
          </button>
        </div>

        <select
          className="champ mt-4"
          onChange={(e) => {
            const t = templates.find((x) => String(x.id) === e.target.value);
            if (t) setMessage(t.contenu);
          }}
        >
          <option value="">— Choisir un modèle —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom}
            </option>
          ))}
        </select>

        <textarea
          className="champ mt-2 h-36 resize-y"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Variables : {{nom}}, {{ville}}, {{titre}}, {{prix}}"
        />

        {choisis[0] && (
          <div className="mt-2 rounded-lg bg-marine-50 p-3 text-sm">
            <div className="etiquette mb-1">Aperçu — {choisis[0].titre}</div>
            <p className="whitespace-pre-wrap">{apercu}</p>
          </div>
        )}

        {ressembleKijiji && (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Ce texte ressemble à la question automatique de Kijiji. L'envoi sera refusé : écrivez un
            vrai message de prospection.
          </p>
        )}

        {plan && (
          <div className="mt-3 rounded-lg border border-marine-100 p-3 text-xs">
            <div className="font-semibold text-marine-800">
              {plan.retenus.length} message(s) seront envoyés
              {plan.ignores.length > 0 && ` · ${plan.ignores.length} contact(s) ignoré(s)`}
            </div>
            {plan.ignores.length > 0 && (
              <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-marine-600/80">
                {plan.ignores.map((i) => {
                  const c = contacts.find((x: any) => x.id === i.contactId);
                  return (
                    <li key={i.contactId}>
                      #{i.contactId} {c ? `« ${c.titre.slice(0, 40)} »` : ""} — {i.message}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={simulation}
            onChange={(e) => setSimulation(e.target.checked)}
          />
          <FlaskConical size={14} /> Mode simulation (aucun message réellement envoyé)
        </label>

        {dejaContactes > 0 && (
          <label className="mt-2 flex items-center gap-2 text-sm text-amber-800">
            <input
              type="checkbox"
              checked={reenvoyer}
              onChange={(e) => setReenvoyer(e.target.checked)}
            />
            <AlertTriangle size={14} /> Renvoyer aux {dejaContactes} contact(s) déjà contacté(s)
            (déconseillé — risque de doublons)
          </label>
        )}

        {erreur && <p className="mt-3 text-sm text-rose-600">{erreur}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondaire" onClick={onFermer}>
            Annuler
          </button>
          <button
            className="btn-primaire"
            onClick={lancer}
            disabled={occupe || !message.trim() || ressembleKijiji || (plan ? plan.retenus.length === 0 : false)}
          >
            <Send size={15} /> Lancer la campagne
          </button>
        </div>
      </div>
    </div>
  );
}
