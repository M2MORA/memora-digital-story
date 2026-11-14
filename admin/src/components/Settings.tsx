import { Bell, BellOff, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";
import { publicSiteUrl } from "../lib/useAdminData";
import { usePush } from "../lib/usePush";

function Notifications() {
  const push = usePush();

  return (
    <div className="panel">
      <h3 className="panel-title">Notifications</h3>

      {push.state === "checking" && <p className="muted">Vérification…</p>}

      {push.state === "unsupported" && (
        <p className="muted">Ce navigateur ne gère pas les notifications. Essaie Chrome ou Safari à jour.</p>
      )}

      {push.state === "needs-install" && (
        <p className="muted">
          Sur iPhone, ajoute d'abord l'admin à l'écran d'accueil : bouton Partager, puis « Sur l'écran d'accueil ».
          Ouvre-le depuis cette icône et reviens ici pour activer les notifications.
        </p>
      )}

      {push.state === "denied" && (
        <p className="muted">
          Les notifications sont bloquées pour ce site. Autorise-les dans les réglages du navigateur (ou de l'iPhone),
          puis reviens ici.
        </p>
      )}

      {(push.state === "off" || push.state === "on") && (
        <>
          <p className="muted">
            {push.state === "on"
              ? "Activées sur cet appareil : tu reçois une notification à chaque nouvelle commande, même admin fermé."
              : "Reçois une notification sur ce téléphone à chaque nouvelle commande, même admin fermé."}
          </p>
          <div className="actions-row">
            {push.state === "off" ? (
              <button type="button" className="btn primary" onClick={() => void push.enable()} disabled={push.busy}>
                <Bell size={16} aria-hidden /> Activer les notifications
              </button>
            ) : (
              <>
                <button type="button" className="btn" onClick={() => void push.test()} disabled={push.busy}>
                  <Bell size={16} aria-hidden /> Envoyer un test
                </button>
                <button type="button" className="btn" onClick={() => void push.disable()} disabled={push.busy}>
                  <BellOff size={16} aria-hidden /> Désactiver
                </button>
              </>
            )}
          </div>
        </>
      )}

      {push.message && (
        <p className="muted" role="status">
          {push.message}
        </p>
      )}
    </div>
  );
}

export default function Settings({ email }: { email: string }) {
  return (
    <section className="settings">
      <div className="panel">
        <h3 className="panel-title">Compte</h3>
        <dl className="facts">
          <div><dt>Connecté</dt><dd>{email}</dd></div>
        </dl>
        <button type="button" className="btn" onClick={() => supabase.auth.signOut()}>
          <LogOut size={16} aria-hidden /> Se déconnecter
        </button>
      </div>

      <Notifications />

      <div className="panel">
        <h3 className="panel-title">Site</h3>
        <dl className="facts">
          <div><dt>Médias et liens NFC</dt><dd>{publicSiteUrl}</dd></div>
        </dl>
      </div>
    </section>
  );
}
