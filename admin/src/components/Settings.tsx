import { LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";
import { publicSiteUrl } from "../lib/useAdminData";

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

      <div className="panel">
        <h3 className="panel-title">Site</h3>
        <dl className="facts">
          <div><dt>Médias et liens NFC</dt><dd>{publicSiteUrl}</dd></div>
        </dl>
      </div>
    </section>
  );
}
