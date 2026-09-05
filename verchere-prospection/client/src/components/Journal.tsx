import { useState } from "react";
import { Download, Phone, RefreshCw, Send, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { api } from "../api";
import { STATUTS } from "../../../shared/types";

export default function Journal({
  contacts,
  config,
  filtres,
  setFiltres,
  selection,
  setSelection,
  onRafraichir,
  onEnvoyer,
}: any) {
  const [occupe, setOccupe] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const tousSelectionnes = contacts.length > 0 && selection.length === contacts.length;

  function basculer(id: number) {
    setSelection((s: number[]) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function details(id: number) {
    setOccupe(id);
    try {
      await api.detailsContact(id);
      onRafraichir();
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setOccupe(null);
    }
  }

  async function supprimer(id: number) {
    if (!confirm("Supprimer ce contact ?")) return;
    await api.supprimerContact(id);
    onRafraichir();
  }

  async function numerosManquants() {
    const r = await api.numerosManquants(15);
    setMessage(`Récupération lancée pour ${r.lances} annonce(s). Rafraîchissez dans une minute.`);
  }

  async function verifierReponses() {
    setMessage("Vérification des boîtes de messages…");
    try {
      const r = await api.verifierReponses();
      setMessage(
        `${r.marques} contact(s) marqué(s) « répondu ».` +
          (r.erreurs?.length ? ` Erreurs : ${r.erreurs.join(" · ")}` : ""),
      );
      onRafraichir();
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  const statutDe = (s: string) => STATUTS.find((x) => x.value === s) || STATUTS[0];

  return (
    <section className="carte p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="titre-section">Journal de prospection</h2>
          <p className="sous-titre mt-1">{contacts.length} résultat(s)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondaire" onClick={numerosManquants}>
            <Phone size={15} /> Récupérer numéros manquants
          </button>
          <button className="btn-secondaire" onClick={verifierReponses}>
            <RefreshCw size={15} /> Vérifier les réponses
          </button>
          <a className="btn-secondaire" href="/api/export/csv" target="_blank" rel="noreferrer">
            <Download size={15} /> Exporter CSV
          </a>
          <button className="btn-primaire" disabled={!selection.length} onClick={onEnvoyer}>
            <Send size={15} /> Envoyer un message ({selection.length})
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select
          className="champ w-auto"
          value={filtres.plateforme}
          onChange={(e) => setFiltres({ ...filtres, plateforme: e.target.value })}
        >
          <option value="all">Toutes les plateformes</option>
          <option value="kijiji">Kijiji</option>
          <option value="facebook">Facebook</option>
        </select>
        <select
          className="champ w-auto"
          value={filtres.statut}
          onChange={(e) => setFiltres({ ...filtres, statut: e.target.value })}
        >
          <option value="all">Tous les statuts</option>
          {STATUTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className="champ w-auto"
          value={filtres.ville || "all"}
          onChange={(e) => setFiltres({ ...filtres, ville: e.target.value })}
        >
          <option value="all">Toutes les villes</option>
          {(config?.villes || []).map((v: any) => (
            <option key={v.value} value={v.label}>
              {v.label}
            </option>
          ))}
        </select>
        <input
          className="champ w-auto min-w-[220px] flex-1"
          placeholder="Rechercher (titre, nom, téléphone, adresse…)"
          value={filtres.q}
          onChange={(e) => setFiltres({ ...filtres, q: e.target.value })}
        />
      </div>

      {message && (
        <div className="mt-3 rounded-lg bg-marine-50 px-3 py-2 text-sm text-marine-700">{message}</div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-marine-100 text-left text-xs uppercase tracking-wide text-marine-600/60">
              <th className="w-8 py-2">
                <input
                  type="checkbox"
                  checked={tousSelectionnes}
                  onChange={() =>
                    setSelection(tousSelectionnes ? [] : contacts.map((c: any) => c.id))
                  }
                />
              </th>
              <th className="py-2 pr-3">Source</th>
              <th className="py-2 pr-3">Annonce</th>
              <th className="py-2 pr-3">Nom</th>
              <th className="py-2 pr-3">Téléphone</th>
              <th className="py-2 pr-3">Prix</th>
              <th className="py-2 pr-3">Lieu</th>
              <th className="py-2 pr-3">Statut</th>
              <th className="py-2 pr-3">Dernier contact</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-marine-600/60">
                  Aucun contact trouvé.
                </td>
              </tr>
            )}
            {contacts.map((c: any) => {
              const st = statutDe(c.statut);
              return (
                <tr key={c.id} className="border-b border-marine-50 hover:bg-marine-50/50">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={selection.includes(c.id)}
                      onChange={() => basculer(c.id)}
                    />
                  </td>
                  <td className="py-2 pr-3 capitalize">{c.plateforme}</td>
                  <td className="max-w-[280px] truncate py-2 pr-3">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                      title={c.titre}
                    >
                      {c.titre}
                      <ExternalLink size={12} className="shrink-0 opacity-40" />
                    </a>
                  </td>
                  <td className="py-2 pr-3">{c.nom || "—"}</td>
                  <td className="py-2 pr-3">{c.telephone || "—"}</td>
                  <td className="py-2 pr-3">{c.prix || "—"}</td>
                  <td className="max-w-[150px] truncate py-2 pr-3">{c.ville || "—"}</td>
                  <td className="py-2 pr-3">
                    <select
                      className={`puce cursor-pointer border-0 ${st.couleur}`}
                      value={c.statut}
                      onChange={async (e) => {
                        await api.majContact(c.id, { statut: e.target.value });
                        onRafraichir();
                      }}
                    >
                      {STATUTS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3 text-xs text-marine-600/70">
                    {c.dernierContact ? new Date(c.dernierContact).toLocaleString("fr-CA") : "—"}
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      <button
                        className="rounded p-1.5 hover:bg-marine-100"
                        title="Récupérer les détails (nom, téléphone)"
                        onClick={() => details(c.id)}
                        disabled={occupe === c.id}
                      >
                        {occupe === c.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Phone size={14} />
                        )}
                      </button>
                      <button
                        className="rounded p-1.5 text-rose-600 hover:bg-rose-50"
                        title="Supprimer"
                        onClick={() => supprimer(c.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
