import { useState } from "react";
import { KeyRound, Cookie, LogOut, Loader2, Eye, ExternalLink, ShieldCheck } from "lucide-react";
import { api } from "../api";

export default function Connexions({ config, onChange }: { config: any; onChange: () => void }) {
  const [onglet, setOnglet] = useState<"manuelle" | "auto" | "cookies">("manuelle");
  const [etatManuel, setEtatManuel] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [cookiesK, setCookiesK] = useState("");
  const [cookiesF, setCookiesF] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const kijiji = config?.sessions?.kijiji;
  const facebook = config?.sessions?.facebook;

  async function connecter() {
    setOccupe(true);
    setMsg(null);
    try {
      await api.connexionKijiji(email, mdp);
      setMdp("");
      setMsg("Connecté à Kijiji.");
      onChange();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setOccupe(false);
    }
  }

  async function envoyerCookies(p: "kijiji" | "facebook") {
    setOccupe(true);
    setMsg(null);
    try {
      const r =
        p === "kijiji" ? await api.cookiesKijiji(cookiesK) : await api.cookiesFacebook(cookiesF);
      setMsg(`${r.cookies} cookie(s) enregistré(s) pour ${p}.`);
      onChange();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setOccupe(false);
    }
  }

  const Badge = ({ actif, quand }: { actif: boolean; quand?: string }) => (
    <span
      className={`puce ${actif ? "bg-emerald-100 text-emerald-700" : "bg-marine-100 text-marine-600"}`}
    >
      {actif ? `Connecté${quand ? " · " + new Date(quand).toLocaleDateString("fr-CA") : ""}` : "Non configuré"}
    </span>
  );

  return (
    <section className="carte p-6">
      <h2 className="titre-section">Connexions</h2>
      <p className="sous-titre mt-1">
        Nécessaires pour l'envoi automatique de messages et la lecture des réponses.
      </p>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        {/* Kijiji */}
        <div className="rounded-lg border border-marine-100 p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">Kijiji</span>
            <Badge actif={!!kijiji?.connecte} quand={kijiji?.connecteA} />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-marine-50 p-1">
            <button
              className={`rounded-md px-2 py-1.5 text-xs font-medium ${onglet === "manuelle" ? "bg-white shadow-sm" : "text-marine-600/70"}`}
              onClick={() => setOnglet("manuelle")}
            >
              Manuelle ★
            </button>
            <button
              className={`rounded-md px-2 py-1.5 text-xs font-medium ${onglet === "auto" ? "bg-white shadow-sm" : "text-marine-600/70"}`}
              onClick={() => setOnglet("auto")}
            >
              Automatique
            </button>
            <button
              className={`rounded-md px-2 py-1.5 text-xs font-medium ${onglet === "cookies" ? "bg-white shadow-sm" : "text-marine-600/70"}`}
              onClick={() => setOnglet("cookies")}
            >
              Cookies
            </button>
          </div>

          {onglet === "manuelle" ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-marine-600/70">
                La méthode fiable. Une fenêtre Chromium s'ouvre sur la page de connexion Kijiji.
                Vous vous identifiez vous-même — votre mot de passe ne passe jamais par
                l'application — et la session est enregistrée dès que Kijiji vous reconnaît.
              </p>
              <button
                className="btn-primaire w-full"
                disabled={occupe || etatManuel?.etat === "attente"}
                onClick={async () => {
                  setMsg(null);
                  try {
                    await api.connexionManuelle();
                    const suivre = setInterval(async () => {
                      const e = await api.etatConnexionManuelle().catch(() => null);
                      setEtatManuel(e);
                      if (e && e.etat !== "attente") {
                        clearInterval(suivre);
                        onChange();
                      }
                    }, 2500);
                  } catch (err: any) {
                    setMsg(err.message);
                  }
                }}
              >
                {etatManuel?.etat === "attente" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ExternalLink size={15} />
                )}
                Ouvrir la fenêtre de connexion Kijiji
              </button>
              {etatManuel?.message && (
                <p
                  className={`text-xs ${
                    etatManuel.etat === "reussi"
                      ? "text-emerald-600"
                      : etatManuel.etat === "echec"
                        ? "text-rose-600"
                        : "text-marine-600/80"
                  }`}
                >
                  {etatManuel.message}
                </p>
              )}
              <button
                className="btn-secondaire w-full"
                disabled={occupe}
                onClick={async () => {
                  setOccupe(true);
                  setMsg("Vérification de la session sur kijiji.ca…");
                  try {
                    const r = await api.verifierSessionKijiji();
                    setMsg(r.detail);
                  } catch (err: any) {
                    setMsg(err.message);
                  } finally {
                    setOccupe(false);
                  }
                }}
              >
                <ShieldCheck size={15} /> Vérifier la session
              </button>
            </div>
          ) : onglet === "auto" ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-marine-600/70">
                Kijiji refuse souvent la connexion automatisée. Si ça échoue, passez à
                « Manuelle ». Vos identifiants ne servent qu'à ouvrir la session; seuls les témoins
                sont conservés, dans <code>data/verchere.json</code>.
              </p>
              <input
                className="champ"
                placeholder="Courriel Kijiji"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className="champ"
                type="password"
                placeholder="Mot de passe"
                value={mdp}
                onChange={(e) => setMdp(e.target.value)}
              />
              <button className="btn-primaire w-full" onClick={connecter} disabled={occupe || !email || !mdp}>
                {occupe ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                Se connecter à Kijiji
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-marine-600/70">
                Copiez vos cookies depuis le navigateur (format JSON ou{" "}
                <code>nom=valeur; nom2=valeur2</code>).
              </p>
              <textarea
                className="champ h-24 font-mono text-[11px]"
                value={cookiesK}
                onChange={(e) => setCookiesK(e.target.value)}
              />
              <button
                className="btn-secondaire w-full"
                onClick={() => envoyerCookies("kijiji")}
                disabled={occupe || !cookiesK}
              >
                <Cookie size={15} /> Enregistrer les cookies Kijiji
              </button>
            </div>
          )}

          {kijiji?.connecte && (
            <button
              className="mt-2 text-xs text-rose-600 hover:underline"
              onClick={async () => {
                await api.deconnexion("kijiji");
                onChange();
              }}
            >
              <LogOut size={12} className="inline" /> Déconnecter
            </button>
          )}
        </div>

        {/* Facebook */}
        <div className="rounded-lg border border-marine-100 p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium">Facebook Marketplace</span>
            <Badge actif={!!facebook?.connecte} quand={facebook?.connecteA} />
          </div>
          <p className="mt-3 text-xs text-marine-600/70">
            Facebook bloque la connexion automatisée. Collez vos cookies de session (extension type
            « Cookie Editor », export JSON) — à refaire environ tous les 30 jours.
          </p>
          <textarea
            className="champ mt-2 h-32 font-mono text-[11px]"
            placeholder='[{"name":"c_user","value":"..."},{"name":"xs","value":"..."}]'
            value={cookiesF}
            onChange={(e) => setCookiesF(e.target.value)}
          />
          <button
            className="btn-secondaire mt-2 w-full"
            onClick={() => envoyerCookies("facebook")}
            disabled={occupe || !cookiesF}
          >
            <Cookie size={15} /> Enregistrer les cookies Facebook
          </button>
          {facebook?.connecte && (
            <button
              className="mt-2 text-xs text-rose-600 hover:underline"
              onClick={async () => {
                await api.deconnexion("facebook");
                onChange();
              }}
            >
              <LogOut size={12} className="inline" /> Déconnecter
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-marine-100 bg-marine-50/50 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!!config?.modeVisible}
            onChange={async (e) => {
              setOccupe(true);
              try {
                await api.modeVisible(e.target.checked);
                setMsg(
                  e.target.checked
                    ? "Mode visible activé — le navigateur s'affichera à la prochaine recherche ou au prochain envoi."
                    : "Mode visible désactivé — le navigateur travaille en arrière-plan.",
                );
                onChange();
              } catch (err: any) {
                setMsg(err.message);
              } finally {
                setOccupe(false);
              }
            }}
          />
          <span>
            <span className="flex items-center gap-2 font-medium">
              <Eye size={15} /> Mode navigateur visible
            </span>
            <span className="mt-1 block text-xs text-marine-600/70">
              Affiche Chromium à l'écran pendant les recherches et les envois. À activer pour
              compléter vous-même une vérification humaine (captcha), ou pour voir ce qui bloque
              quand un envoi échoue. Un peu plus lent, à désactiver ensuite.
            </span>
          </span>
        </label>
      </div>

      {msg && <p className="mt-3 text-sm text-marine-700">{msg}</p>}
    </section>
  );
}
