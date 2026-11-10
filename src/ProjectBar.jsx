import { useT } from "look/kit/i18n.js";
import { tip } from "look/kit/Tooltip.jsx";
import { baseName } from "./session.js";

const CHIP = { unsupported: "pjAsUnsupported", off: "pjAsOff", nofile: "pjAsNoFile", pending: "pjAsPending", saving: "pjAsSaving", saved: "pjAsSaved", error: "pjAsError", conflict: "pjAsConflict", reconnect: "pjAsReconnect" };
const pad = (n) => String(n).padStart(2, "0");

// Second top-bar row: project name + dirty dot, New / Open / Save / Save as, autosave chip (+ switch, + conflict choice).
export function ProjectBar({ p, onNew, onOpen, onSave, onSaveAs }) {
  const t = useT();
  const time = p.savedAt ? `${pad(p.savedAt.getHours())}:${pad(p.savedAt.getMinutes())}` : "";
  const text = p.kind === "saved" && !time ? t("pjAsOn") : t(CHIP[p.kind], { time, error: p.error });
  return (
    <div className="projbar" role="group" aria-label={t("pjProject")}>
      <span className="proj-name" data-testid="proj-name" title={p.name ?? ""}>
        <strong className="ell">{baseName(p.name) || t("pjUntitled")}</strong>
        {p.dirty && <span className="dirty-dot" data-testid="dirty" role="img" aria-label={t("pjUnsaved")} data-tip={t("pjUnsaved")} />}
      </span>
      <button type="button" className="btn btn-ghost" data-testid="pj-new" onClick={onNew}>{t("pjNew")}</button>
      <button type="button" className="btn btn-ghost" data-testid="pj-open" data-tip={tip(t("open"), "mod+o")} onClick={onOpen}>{t("pjOpen")}</button>
      <button type="button" className="btn btn-ghost" data-testid="pj-save" data-tip={tip(t("save"), "mod+s")} onClick={onSave}>{t("pjSave")}</button>
      <button type="button" className="btn btn-ghost" data-testid="pj-saveas" data-tip={tip(t("pjSaveAs"), "mod+shift+s")} onClick={onSaveAs}>{t("pjSaveAs")}</button>
      <span className="proj-gap" />
      <span className="status-chip as-chip" data-s={p.kind === "saved" ? "saved" : p.kind === "error" || p.kind === "conflict" ? "error" : p.kind === "saving" || p.kind === "pending" ? "saving" : "idle"} data-state={p.kind} data-testid="autosave-status" role="status" title={p.kind === "unsupported" ? t("pjAsUnsupportedTip") : p.error || undefined}>
        <span className="status-dot" aria-hidden />
        <span data-testid="autosave-text">{text}</span>
      </span>
      {p.kind === "conflict" && (
        <>
          <button type="button" className="btn btn-soft" data-testid="autosave-mine" data-tip={t("pjUseMineTip")} onClick={p.keepMine}>{t("pjUseMine")}</button>
          <button type="button" className="btn btn-soft" data-testid="autosave-disk" data-tip={t("pjLoadDiskTip")} onClick={p.loadDisk}>{t("pjLoadDisk")}</button>
        </>
      )}
      {p.kind === "reconnect" && <button type="button" className="btn btn-soft" data-testid="pj-reconnect" onClick={p.reconnectNow}>{t("pjReconnect")}</button>}
      {p.fsa && (
        <button type="button" role="switch" aria-checked={p.enabled} className="as-switch" data-testid="autosave-toggle" aria-label={t("pjAutosave")}
          data-tip={t(p.enabled ? "pjToggleOn" : "pjToggleOff")} onClick={() => p.setEnabled(!p.enabled)}><span className="as-knob" /></button>
      )}
    </div>
  );
}
