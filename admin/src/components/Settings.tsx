import { supabase } from "../lib/supabase";
import { publicSiteUrl } from "../lib/useAdminData";

export default function Settings({ email }: { email: string }) {
  return (
    <section className="list-pane settings">
      <div className="block">
        <h3>Compte</h3>
        <p className="muted">Connecté : {email}</p>
        <button type="button" className="btn big" onClick={() => supabase.auth.signOut()}>
          Se déconnecter
        </button>
      </div>

      <div className="block">
        <h3>Site</h3>
        <p className="muted">Médias et liens NFC : {publicSiteUrl}</p>
      </div>
    </section>
  );
}
