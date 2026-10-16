import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isAdmin } from "./lib/supabase";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="splash">Chargement…</div>;
  if (!session) return <Login />;

  if (!isAdmin(session.user)) {
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1 className="brand">MÉMORA</h1>
          <p className="error">
            Ce compte ({session.user.email}) n'a pas le rôle administrateur.
          </p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return <Dashboard email={session.user.email ?? ""} />;
}
