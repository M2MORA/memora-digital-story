import { Save, Undo2 } from "lucide-react";

export type Status = { saving: boolean; message: string; ok: boolean };
export const IDLE: Status = { saving: false, message: "", ok: false };

/** Message d'état et boutons Enregistrer / Annuler des formulaires du Catalogue. */
export function SaveRow({ dirty, status, onSave, onReset }: { dirty: boolean; status: Status; onSave: () => void; onReset: () => void }) {
  return (
    <>
      {status.message ? (
        <p className={`note ${status.ok && !dirty ? "is-ok" : status.ok ? "" : "is-error"}`} role={status.ok ? "status" : "alert"}>
          {status.message}
        </p>
      ) : (
        dirty && <p className="hint">Modifications non enregistrées.</p>
      )}
      <div className="actions-row">
        <button type="button" className="btn primary" onClick={onSave} disabled={!dirty || status.saving}>
          <Save size={16} aria-hidden /> {status.saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" className="btn" onClick={onReset} disabled={!dirty || status.saving}>
          <Undo2 size={16} aria-hidden /> Annuler
        </button>
      </div>
    </>
  );
}
