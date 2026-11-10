import { app } from "./app.js";
import { useT } from "./i18n.js";
import { setPrefs, usePrefs } from "./prefs.js";
import { nextTheme } from "./pick-logic.js";
import { tip } from "./Tooltip.jsx";
import { StatusChip } from "./Controls.jsx";

// Stroke icons (stagerider's set); stroke width follows the icon-weight pick via tokens.css.
const Icon = ({ d }) => (
  <svg viewBox="0 0 20 20" width={16} height={16} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);
const UNDO = <Icon d={<path d="M8 5 4 9l4 4M4 9h7a5 5 0 0 1 0 10" transform="translate(0 -2)" />} />;
const REDO = <Icon d={<path d="m12 5 4 4-4 4M16 9H9a5 5 0 0 0 0 10" transform="translate(0 -2)" />} />;
const GEAR = <Icon d={<><circle cx={10} cy={10} r={2.6} /><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" /><circle cx={10} cy={10} r={5.2} /></>} />;

const osDark = () => matchMedia("(prefers-color-scheme: dark)").matches;

// Top bar (picks: left · centre · right, back bar, Mac toolbar and big title, combined). Left: back (non-root only),
// title, autosave status chip. Centre: underline tabs. Right: undo/redo, file, ⌘K, ?, settings gear (when onSettings; settings is never a tab), one theme icon, and (only when
// app.users) the avatar. Each tooltip names its shortcut. On narrow screens the tabs move to a bottom bar (CSS).
export function Navbar({ tabs, route, go, canBack, onBack, history, onSave, onOpen, onPalette, onHelp, onSettings, settingsOpen, status, user, onSignOut }) {
  const t = useT();
  const { theme } = usePrefs();
  const dark = (theme === "system" ? (osDark() ? "dark" : "light") : theme) === "dark";
  return (
    <>
      <header className="nav">
        <div className="nav-side">
          {canBack && <button className="btn btn-ghost btn-icon" onClick={onBack} aria-label={t("back")} data-tip={tip(t("back"), "escape")}>←</button>}
          <strong className="nav-title ell">{app.title}</strong>
          {status && <StatusChip state={status} />}
        </div>
        {tabs.length > 1 && <nav className="tabs nav-tabs" aria-label="Views">
          {tabs.map((tab) => (
            <button key={tab.id} className="tab" aria-current={route === tab.id ? "page" : undefined} onClick={() => go(tab.id)}>{t(tab.label)}</button>
          ))}
        </nav>}
        <div className="nav-side nav-end">
          <button className="btn btn-ghost btn-icon" disabled={!history.canUndo} onClick={history.undo} aria-label={t("undo")} data-tip={tip(t("undo"), "mod+z")}>{UNDO}</button>
          <button className="btn btn-ghost btn-icon" disabled={!history.canRedo} onClick={history.redo} aria-label={t("redo")} data-tip={tip(t("redo"), "mod+shift+z")}>{REDO}</button>
          <button className="btn btn-ghost btn-icon" onClick={onOpen} aria-label={t("open")} data-tip={tip(t("open"), "mod+o")}>⤒</button>
          <button className="btn btn-ghost btn-icon" onClick={onSave} aria-label={t("save")} data-tip={tip(t("save"), "mod+s")}>⤓</button>
          <button className="btn btn-ghost btn-icon" onClick={onPalette} aria-label={t("palette")} data-tip={tip(t("palette"), "mod+k")}>⌘</button>
          <button className="btn btn-ghost btn-icon" onClick={onHelp} aria-label={t("shortcuts")} data-tip={tip(t("shortcuts"), "?")}>?</button>
          {onSettings && <button className="btn btn-ghost btn-icon" onClick={onSettings} aria-pressed={settingsOpen || undefined} aria-label={t("settings")} data-tip={t("settings")}>{GEAR}</button>}
          <button className="btn btn-ghost btn-icon" onClick={() => setPrefs({ theme: nextTheme(theme, osDark()) })} aria-label={t("theme")} data-tip={dark ? t("light") : t("dark")}>{dark ? "☀" : "☾"}</button>
          {app.users && user && (
            <button className="btn avatar" onClick={onSignOut} data-tip={t("signOut")} aria-label={`${user.name} — ${t("signOut")}`}>{user.name.slice(0, 1).toUpperCase()}</button>
          )}
        </div>
      </header>
      {tabs.length > 1 && <nav className="tabs tabbar" aria-label="Views (mobile)">
        {tabs.map((tab) => (
          <button key={tab.id} className="tab" aria-current={route === tab.id ? "page" : undefined} onClick={() => go(tab.id)}>{t(tab.label)}</button>
        ))}
      </nav>}
    </>
  );
}
