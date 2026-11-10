import { useEffect, useRef, useState } from "react";
import { useT } from "look/kit/i18n.js";
import { baseName } from "./session.js";
import { forgetRecent, listRecents } from "./recentsStore.js";

const when = (at, lang) => new Date(at).toLocaleString(lang === "tr" ? "tr-TR" : "en-GB", { dateStyle: "medium", timeStyle: "short" });

// Shown only when there is no session snapshot: New, Open, and the recent projects (handles in IndexedDB; null = hidden).
export function StartPage({ onNew, onOpen, onRecent, lang }) {
  const t = useT();
  const [recents, setRecents] = useState(null);
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); listRecents().then(setRecents); }, []);
  const forget = async (id) => { await forgetRecent(id); setRecents(await listRecents()); };
  return (
    <main className="start" data-testid="start-page">
      <section className="start-card" aria-labelledby="start-h">
        <h1 id="start-h" className="start-title">pergel</h1>
        <p className="muted">{t("pjStartSub")}</p>
        <div className="start-actions">
          <button ref={first} type="button" className="btn btn-primary" data-testid="start-new" onClick={onNew}>{t("pjNewProject")}</button>
          <button type="button" className="btn" data-testid="start-open" onClick={onOpen}>{t("pjOpenFile")}</button>
        </div>
        {recents && (
          <div className="start-recents">
            <h2>{t("pjRecent")}</h2>
            {recents.length === 0 ? <p className="muted" data-testid="start-empty">{t("pjRecentEmpty")}</p> : (
              <ul data-testid="start-recents">
                {recents.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="start-recent" data-testid="start-recent" title={r.name} onClick={() => onRecent(r.id)}>
                      <span className="rn">{baseName(r.name)}</span><span className="rw muted">{when(r.at, lang)}</span>
                    </button>
                    <button type="button" className="icon-btn" aria-label={t("pjRecentRemove", { name: r.name })} data-tip={t("pjRecentRemove", { name: r.name })} data-testid="start-forget" onClick={() => forget(r.id)}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
