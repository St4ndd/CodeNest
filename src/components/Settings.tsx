import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getVersion } from "@tauri-apps/api/app";
import { check as checkForUpdate, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import type { AppData, Group, IdeConfig, TerminalProfile, WindowPresetKey } from "../types";
import { detectIdes, exportData, importData } from "../backend";
import { groupTree } from "../project-meta";
import { IconPlus, IconRefresh, IconStar, IconTag, IconTrash } from "../icons";

const TERMINAL_PROFILES: { id: TerminalProfile; label: string }[] = [
  { id: "cmd", label: "Command Prompt (cmd)" },
  { id: "powershell", label: "PowerShell" },
  { id: "gitbash", label: "Git Bash" },
  { id: "wsl", label: "WSL" },
];

const WINDOW_PRESET_LABELS: { id: WindowPresetKey; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "middle", label: "Middle" },
  { id: "big", label: "Big" },
];

interface SettingsProps {
  data: AppData;
  onChange: (data: AppData) => void;
  toast: (msg: string) => void;
}

export default function Settings({ data, onChange, toast }: SettingsProps) {
  const { settings } = data;
  const [customName, setCustomName] = useState("");
  const [customPath, setCustomPath] = useState("");
  const [scanning, setScanning] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupParentId, setNewGroupParentId] = useState("");
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [updateState, setUpdateState] = useState<
    "idle" | "checking" | "none" | "available" | "installing"
  >("idle");
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [backupBusy, setBackupBusy] = useState<"export" | "import" | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  async function checkUpdates() {
    setUpdateState("checking");
    try {
      const update = await checkForUpdate();
      if (update) {
        setPendingUpdate(update);
        setUpdateState("available");
      } else {
        setUpdateState("none");
      }
    } catch (err) {
      setUpdateState("idle");
      toast(`Update check failed: ${err}`);
    }
  }

  async function installUpdate() {
    if (!pendingUpdate) return;
    setUpdateState("installing");
    try {
      await pendingUpdate.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setUpdateState("available");
      toast(`Update failed: ${err}`);
    }
  }

  function update(patch: Partial<AppData["settings"]>) {
    onChange({ ...data, settings: { ...settings, ...patch } });
  }

  async function browseProjectsDir() {
    const dir = await open({ directory: true, title: "Default projects folder" });
    if (typeof dir === "string") update({ projectsDir: dir });
  }

  function updateWindowPreset(key: WindowPresetKey, patch: Partial<{ width: number; height: number }>) {
    update({
      windowPresets: {
        ...settings.windowPresets,
        [key]: { ...settings.windowPresets[key], ...patch },
      },
    });
  }

  async function tryWindowSize(key: WindowPresetKey) {
    const { width, height } = settings.windowPresets[key];
    const win = getCurrentWindow();
    await win.setSize(new LogicalSize(width, height));
    await win.center();
  }

  async function rescan() {
    setScanning(true);
    try {
      const detected = await detectIdes();
      const custom = settings.ides.filter((i) => i.custom);
      const ides = [...detected, ...custom];
      let defaultIdeId = settings.defaultIdeId;
      if (!ides.some((i) => i.id === defaultIdeId)) {
        defaultIdeId = ides.find((i) => i.id === "vscode")?.id ?? ides[0]?.id ?? null;
      }
      update({ ides, defaultIdeId });
      toast(`Found ${detected.length} IDE${detected.length === 1 ? "" : "s"}`);
    } finally {
      setScanning(false);
    }
  }

  async function browseCustomExe() {
    const file = await open({
      title: "Select IDE executable",
      filters: [{ name: "Programs", extensions: ["exe", "cmd", "bat"] }],
    });
    if (typeof file === "string") {
      setCustomPath(file);
      if (!customName) {
        const base = file.split("\\").pop()?.replace(/\.(exe|cmd|bat)$/i, "");
        if (base) setCustomName(base);
      }
    }
  }

  function addCustom() {
    if (!customName.trim() || !customPath.trim()) return;
    const ide: IdeConfig = {
      id: `custom:${crypto.randomUUID()}`,
      name: customName.trim(),
      path: customPath.trim(),
      custom: true,
    };
    update({
      ides: [...settings.ides, ide],
      defaultIdeId: settings.defaultIdeId ?? ide.id,
    });
    setCustomName("");
    setCustomPath("");
    toast(`Added ${ide.name}`);
  }

  function removeCustom(id: string) {
    const ides = settings.ides.filter((i) => i.id !== id);
    update({
      ides,
      defaultIdeId:
        settings.defaultIdeId === id
          ? ides.find((i) => i.id === "vscode")?.id ?? ides[0]?.id ?? null
          : settings.defaultIdeId,
    });
  }

  function addGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    const group: Group = {
      id: crypto.randomUUID(),
      name: trimmed,
      parentId: newGroupParentId || null,
    };
    update({ groups: [...settings.groups, group] });
    setNewGroupName("");
    setNewGroupParentId("");
  }

  function startRename(g: Group) {
    setRenamingGroupId(g.id);
    setRenameValue(g.name);
  }

  function confirmRename() {
    if (!renamingGroupId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      update({
        groups: settings.groups.map((g) => (g.id === renamingGroupId ? { ...g, name: trimmed } : g)),
      });
    }
    setRenamingGroupId(null);
  }

  async function handleExportBackup() {
    const target = await save({
      title: "Export CodeNest settings",
      defaultPath: "codenest-settings.json",
      filters: [{ name: "CodeNest settings", extensions: ["json"] }],
    });
    if (!target) return;
    setBackupBusy("export");
    try {
      await exportData(target);
      toast("Settings exported.");
    } catch (err) {
      toast(`Export failed: ${err}`);
    } finally {
      setBackupBusy(null);
    }
  }

  async function handleImportBackup() {
    const source = await open({
      title: "Import CodeNest settings",
      filters: [{ name: "CodeNest settings", extensions: ["json"] }],
    });
    if (typeof source !== "string") return;
    if (
      !window.confirm(
        "This replaces all current projects, todos, notes, API requests and settings with the contents of this file. CodeNest will restart. Continue?"
      )
    ) {
      return;
    }
    setBackupBusy("import");
    try {
      await importData(source);
      toast("Settings imported — restarting…");
      await relaunch();
    } catch (err) {
      toast(`Import failed: ${err}`);
      setBackupBusy(null);
    }
  }

  function removeGroup(id: string) {
    onChange({
      ...data,
      settings: {
        ...settings,
        // Sub-groups of the removed group become top-level instead of being deleted.
        groups: settings.groups
          .filter((g) => g.id !== id)
          .map((g) => (g.parentId === id ? { ...g, parentId: null } : g)),
        defaultGroupId: settings.defaultGroupId === id ? null : settings.defaultGroupId,
      },
      projects: data.projects.map((p) => (p.groupId === id ? { ...p, groupId: null } : p)),
    });
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">IDEs, default folders and more.</p>
        </div>
      </div>

      <div className="settings-section">
        <h3>Default projects folder</h3>
        <p className="muted">New projects will be created here by default.</p>
        <div className="input-with-btn settings-input">
          <input
            value={settings.projectsDir}
            onChange={(e) => update({ projectsDir: e.target.value })}
          />
          <button className="btn" onClick={browseProjectsDir}>
            Browse…
          </button>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.moveImportedProjects}
            onChange={(e) => update({ moveImportedProjects: e.target.checked })}
          />
          When importing a folder, move it into the default projects folder
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.autoGitignore}
            onChange={(e) => update({ autoGitignore: e.target.checked })}
          />
          Create a .gitignore for new/imported projects that don't already have one
        </label>
      </div>

      <div className="settings-section">
        <div className="settings-section-head">
          <h3>IDEs &amp; Editors</h3>
          <button className="btn" onClick={rescan} disabled={scanning}>
            <IconRefresh size={14} /> {scanning ? "Scanning…" : "Re-scan installed IDEs"}
          </button>
        </div>
        <p className="muted">
          The default IDE is used by the “Open” button; every project can override it.
        </p>

        {settings.ides.length === 0 ? (
          <p className="muted">No IDEs found. Add one manually below.</p>
        ) : (
          <div className="ide-list">
            {settings.ides.map((ide) => (
              <div key={ide.id} className="ide-row">
                <label className="ide-radio">
                  <input
                    type="radio"
                    name="default-ide"
                    checked={settings.defaultIdeId === ide.id}
                    onChange={() => update({ defaultIdeId: ide.id })}
                  />
                  <span className="ide-name">
                    {ide.name}
                    {settings.defaultIdeId === ide.id && (
                      <span className="badge badge-default">default</span>
                    )}
                    {ide.custom && <span className="badge">custom</span>}
                  </span>
                </label>
                <span className="ide-path" title={ide.path}>
                  {ide.path}
                </span>
                {ide.custom && (
                  <button
                    className="icon-btn"
                    title="Remove"
                    onClick={() => removeCustom(ide.id)}
                  >
                    <IconTrash size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <h4>Add IDE manually</h4>
        <div className="custom-ide-form">
          <input
            placeholder="Display name (e.g. Eclipse)"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
          />
          <div className="input-with-btn">
            <input
              placeholder="Path to executable…"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
            />
            <button className="btn" onClick={browseCustomExe}>
              Browse…
            </button>
          </div>
          <button
            className="btn btn-primary"
            disabled={!customName.trim() || !customPath.trim()}
            onClick={addCustom}
          >
            <IconPlus size={14} /> Add IDE
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="preset-line">
          <IconTag size={15} /> Project groups
        </h3>
        <p className="muted">Group projects (e.g. for a monorepo or a client) in the dashboard.</p>

        {settings.groups.length > 0 && (
          <div className="ide-list">
            {groupTree(settings.groups).map(({ group: g, depth }) => (
              <div key={g.id} className="ide-row" style={{ paddingLeft: 10 + depth * 20 }}>
                {renamingGroupId === g.id ? (
                  <input
                    className="rename-input"
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={confirmRename}
                    onKeyDown={(e) => e.key === "Enter" && confirmRename()}
                  />
                ) : (
                  <span className="ide-name group-name" onClick={() => startRename(g)}>
                    {depth > 0 && <span className="group-nest-marker">└</span>}
                    {g.name}
                    {settings.defaultGroupId === g.id && (
                      <span className="badge badge-default">default</span>
                    )}
                  </span>
                )}
                <span className="ide-path">
                  {data.projects.filter((p) => p.groupId === g.id).length} project(s)
                </span>
                <button
                  className={`icon-btn star ${settings.defaultGroupId === g.id ? "star-on" : ""}`}
                  title={settings.defaultGroupId === g.id ? "Default group" : "Set as default group"}
                  onClick={() =>
                    update({ defaultGroupId: settings.defaultGroupId === g.id ? null : g.id })
                  }
                >
                  <IconStar size={14} filled={settings.defaultGroupId === g.id} />
                </button>
                <button className="icon-btn" title="Remove group" onClick={() => removeGroup(g.id)}>
                  <IconTrash size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="new-group-form">
          <input
            className="new-group-name-input"
            placeholder="New group name…"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addGroup()}
          />
          {settings.groups.length > 0 && (
            <select
              className="new-group-parent-select"
              value={newGroupParentId}
              onChange={(e) => setNewGroupParentId(e.target.value)}
            >
              <option value="">No parent (top-level)</option>
              {groupTree(settings.groups).map(({ group: g, depth }) => (
                <option key={g.id} value={g.id}>
                  {"— ".repeat(depth)}
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn" onClick={addGroup} disabled={!newGroupName.trim()}>
            <IconPlus size={14} /> Add group
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>Terminal</h3>
        <p className="muted">Shell used by “Open terminal here” and “Run in external terminal”.</p>
        <select
          className="settings-input"
          value={settings.terminalProfile}
          onChange={(e) => update({ terminalProfile: e.target.value as TerminalProfile })}
        >
          {TERMINAL_PROFILES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-section">
        <h3>Window behavior</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.closeToTray}
            onChange={(e) => update({ closeToTray: e.target.checked })}
          />
          Minimize to system tray instead of closing
        </label>
        <p className="muted tray-hint">
          When enabled, the close button hides the window. Use the tray icon's “Quit” entry to
          fully exit CodeNest.
        </p>
      </div>

      <div className="settings-section">
        <h3>Window size</h3>
        <p className="muted">
          Set exact dimensions for three presets, then use “Try it” to resize the window live and
          find the sizes you like. “Use at startup” picks which preset CodeNest opens with next
          time.
        </p>
        <div className="window-preset-list">
          {WINDOW_PRESET_LABELS.map(({ id, label }) => {
            const size = settings.windowPresets[id];
            return (
              <div key={id} className="window-preset-row">
                <label className="ide-radio">
                  <input
                    type="radio"
                    name="active-window-preset"
                    checked={settings.activeWindowPreset === id}
                    onChange={() => update({ activeWindowPreset: id })}
                  />
                  <span className="ide-name">{label}</span>
                </label>
                <div className="window-preset-fields">
                  <label>
                    W
                    <input
                      type="number"
                      min={800}
                      max={4000}
                      value={size.width}
                      onChange={(e) =>
                        updateWindowPreset(id, { width: Math.max(800, Number(e.target.value) || 0) })
                      }
                    />
                  </label>
                  <label>
                    H
                    <input
                      type="number"
                      min={600}
                      max={3000}
                      value={size.height}
                      onChange={(e) =>
                        updateWindowPreset(id, { height: Math.max(600, Number(e.target.value) || 0) })
                      }
                    />
                  </label>
                </div>
                <button className="btn" onClick={() => tryWindowSize(id)}>
                  Try it
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="settings-section">
        <h3>Export / Import settings</h3>
        <p className="muted">
          Projects, todos, notes, API requests, IDEs and settings already live in your Windows
          user profile (not the app's install folder), so they survive normal app updates and
          reinstalls automatically. Use "Export settings" to save everything into a single file
          you can bring to another PC, then use "Import settings" there to get it all back.
        </p>
        <div className="settings-input" style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={handleExportBackup} disabled={backupBusy !== null}>
            {backupBusy === "export" ? "Exporting…" : "Export settings…"}
          </button>
          <button className="btn" onClick={handleImportBackup} disabled={backupBusy !== null}>
            {backupBusy === "import" ? "Importing…" : "Import settings…"}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>About</h3>
        <p className="muted">
          CodeNest {appVersion && `v${appVersion}`} — built with Tauri 2 + React. Your project
          list is stored locally.
        </p>

        {updateState === "available" && pendingUpdate ? (
          <div className="update-row">
            <span>
              Update {pendingUpdate.version} is available
              {pendingUpdate.body ? ` — ${pendingUpdate.body}` : ""}.
            </span>
            <button className="btn btn-primary" onClick={installUpdate}>
              Download &amp; install
            </button>
          </div>
        ) : (
          <button className="btn" onClick={checkUpdates} disabled={updateState === "checking"}>
            {updateState === "checking"
              ? "Checking…"
              : updateState === "installing"
                ? "Installing…"
                : updateState === "none"
                  ? "You're up to date"
                  : "Check for updates"}
          </button>
        )}
      </div>
    </div>
  );
}
