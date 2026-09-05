import { useEffect, useState } from "react";
import { Save, Square } from "lucide-react";
import { api } from "../api";

export default function Campagne({ onRafraichir }: { onRafraichir: () => void }) {
  const [etat, setEtat] = useState<any>(null);
  const [limites, setLimites] = useState<any>(null);
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    api.limites().then(setLimites);
    const t = setInterval(async () => {
      const s = await api.campagne().catch(() => null);
      setEtat(s);
      if (s?.status === "done") onRafraichir();
    }, 3000);
    return () => clearInterval(t);
  }, [onRafraichir]);

  async function sauvegarder() {
    await api.majLimites(limites);
    setEnregistre(true);
    setTimeout(() => setEnregistre(false), 2000);
  }

  function maj(p: string, champ: string, valeur: number) {
    setLimites((l: any) => ({ ...l, [p]: { ...l[p], [champ]: valeur } }));
  }

  const actif = etat?.status === "running";

  return (
    <section className="carte p-6">
      <h2 className="titre-section">Campagne d'envoi</h2>

      <div className="mt-4">
        <div className="etiquette">Suivi campagne active</div>
        {!actif && etat?.status !== "paused" && etat?.total ? (
          <p className="mt-2 text-sm text-marine-600/80">
            Dernière campagne : {etat.current}/{etat.total} — {etat.status}
          </p>
        ) : null}
        {!etat?.total ? (
          <p className="mt-2 text-sm text-marine-600/70">
            Aucune campagne active. Sélectionnez des contacts et cliquez « Envoyer un message ».
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-marine-100">
              <div
                className="h-full bg-marine-700 transition-all"
                style={{ width: `${(etat.current / Math.max(1, etat.total)) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>
                {etat.current}/{etat.total} · statut : <strong>{etat.status}</strong>
              </span>
              {actif && (
                <button className="btn-danger !py-1 !text-xs" onClick={() => api.arreterCampagne()}>
                  <Square size={12} /> Arrêter
                </button>
              )}
            </div>
            {etat.nextSendAt && (
              <p className="text-xs text-marine-600/70">
                Prochain envoi vers {new Date(etat.nextSendAt).toLocaleTimeString("fr-CA")}
              </p>
            )}
            {etat.erreur && (
              <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{etat.erreur}</p>
            )}
            <div className="max-h-40 overflow-y-auto rounded-lg bg-marine-50 p-2 text-xs">
              {(etat.results || []).slice(-20).reverse().map((r: any, i: number) => (
                <div
                  key={i}
                  className={
                    r.ignore
                      ? "text-marine-600/60"
                      : r.incertain
                        ? "text-amber-700"
                        : r.ok
                          ? "text-emerald-700"
                          : "text-rose-600"
                  }
                >
                  #{r.contactId} — {r.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-marine-100 pt-5">
        <div className="etiquette">Paramètres de cadence</div>
        {limites &&
          (["kijiji", "facebook"] as const).map((p) => (
            <div key={p} className="mt-3">
              <div className="text-xs font-semibold uppercase text-marine-600/60">{p}</div>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {[
                  ["daily", "Max/jour"],
                  ["delayMinSec", "Délai min (s)"],
                  ["delayMaxSec", "Délai max (s)"],
                ].map(([champ, label]) => (
                  <div key={champ}>
                    <label className="text-[11px] text-marine-600/70">{label}</label>
                    <input
                      type="number"
                      className="champ mt-0.5 !py-1.5"
                      value={limites[p][champ]}
                      onChange={(e) => maj(p, champ, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

        <p className="mt-3 text-xs text-marine-600/70">
          Anti-spam recommandé : Kijiji max 15/jour · 65-120 s · Facebook max 10/jour · 180-300 s
        </p>

        <div className="mt-3 flex items-center gap-3">
          <button className="btn-primaire" onClick={sauvegarder}>
            <Save size={15} /> Enregistrer
          </button>
          {enregistre && <span className="text-sm text-emerald-600">Enregistré.</span>}
          {etat?.dailySent && (
            <span className="ml-auto text-xs text-marine-600/70">
              Envoyés aujourd'hui : Kijiji {etat.dailySent.kijiji} · Facebook {etat.dailySent.facebook}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
