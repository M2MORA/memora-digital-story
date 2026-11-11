import { supabase } from "../lib/supabase";
import { publicSiteUrl, type AdminData } from "../lib/useAdminData";

export default function Settings({ data, email }: { data: AdminData; email: string }) {
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
        <h3>Serveur API</h3>
        <label className="field">
          <span>Adresse du site (médias et suppression)</span>
          <input
            type="url"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            value={data.siteUrl}
            onChange={(e) => data.handleSiteUrlChange(e.target.value)}
            placeholder="https://memora.tn"
          />
        </label>
        <p className="muted">Les liens NFC utilisent toujours {publicSiteUrl}.</p>
      </div>
    </section>
  );
}
