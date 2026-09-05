import { useEffect, useState } from "react";
import { Plus, Trash2, Check, X } from "lucide-react";
import { api } from "../api";

export default function Modeles() {
  const [liste, setListe] = useState<any[]>([]);
  const [edition, setEdition] = useState<any>(null);

  async function charger() {
    setListe(await api.templates());
  }
  useEffect(() => {
    charger();
  }, []);

  async function sauvegarder() {
    if (!edition.nom || !edition.contenu) return;
    if (edition.id) await api.majTemplate(edition.id, edition);
    else await api.creerTemplate(edition);
    setEdition(null);
    charger();
  }

  async function supprimer(id: number) {
    if (!confirm("Supprimer ce modèle ?")) return;
    await api.supprimerTemplate(id);
    charger();
  }

  return (
    <section className="carte p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="titre-section">Modèles de messages</h2>
          <p className="sous-titre mt-1">Messages d'approche pré-rédigés</p>
        </div>
        <button
          className="btn-secondaire"
          onClick={() => setEdition({ nom: "", contenu: "", plateforme: "all" })}
        >
          <Plus size={15} /> Nouveau
        </button>
      </div>

      {edition && (
        <div className="mt-4 rounded-lg border border-marine-200 bg-marine-50/60 p-4">
          <input
            className="champ"
            placeholder="Nom du modèle"
            value={edition.nom}
            onChange={(e) => setEdition({ ...edition, nom: e.target.value })}
          />
          <select
            className="champ mt-2"
            value={edition.plateforme}
            onChange={(e) => setEdition({ ...edition, plateforme: e.target.value })}
          >
            <option value="all">Générique</option>
            <option value="kijiji">Kijiji</option>
            <option value="facebook">Facebook</option>
          </select>
          <textarea
            className="champ mt-2 h-28 resize-y"
            placeholder="Contenu — variables disponibles : {{nom}}, {{ville}}, {{titre}}, {{prix}}"
            value={edition.contenu}
            onChange={(e) => setEdition({ ...edition, contenu: e.target.value })}
          />
          <div className="mt-2 flex gap-2">
            <button className="btn-primaire" onClick={sauvegarder}>
              <Check size={15} /> Enregistrer
            </button>
            <button className="btn-secondaire" onClick={() => setEdition(null)}>
              <X size={15} /> Annuler
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {liste.map((t) => (
          <div key={t.id} className="rounded-lg border border-marine-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{t.nom}</div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-marine-600/50">
                  {t.plateforme === "all" ? "Générique" : t.plateforme}
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  className="rounded p-1.5 text-xs hover:bg-marine-100"
                  onClick={() => setEdition(t)}
                >
                  Modifier
                </button>
                <button
                  className="rounded p-1.5 text-rose-600 hover:bg-rose-50"
                  onClick={() => supprimer(t.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-marine-600/90">{t.contenu}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
