import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppData, ConsoleLine, CustomPreset, InstallJob, Project } from "../types";
import { CATEGORIES, PRESETS, Preset } from "../presets";
import { groupTree } from "../project-meta";
import { checkTool } from "../backend";
import Console from "./Console";
import PresetEditor from "./PresetEditor";
import {
  IconArrowLeft,
  IconCheck,
  IconPlus,
  IconSearch,
  IconSliders,
  IconTrash,
  IconX,
  PresetIcon,
} from "../icons";

interface NewProjectProps {
  data: AppData;
  lines: Record<string, ConsoleLine[]>;
  installs: Record<string, InstallJob>;
  /** Set when navigating here by clicking an in-progress card in the dashboard. */
  resumeInstallId: string | null;
  onStartCreate: (cfg: {
    name: string;
    location: string;
    gitInit: boolean;
    openAfter: boolean;
    preset: Preset | null;
    customPreset: CustomPreset | null;
    groupId: string | null;
  }) => string;
  onDismissInstall: (id: string) => void;
  onSaveCustomPreset: (preset: CustomPreset) => void;
  onUpdateCustomPreset: (preset: CustomPreset) => void;
  onDeleteCustomPreset: (id: string) => void;
  onOpenIde: (project: Project) => void;
  onCancel: () => void;
}

const NAME_RE = /^[A-Za-z][A-Za-z0-9._-]*$/;

export default function NewProject(props: NewProjectProps) {
  const { data } = props;
  const visible = PRESETS.filter((p) => !p.hidden);

  const [preset, setPreset] = useState<Preset | null>(null);
  const [customPreset, setCustomPreset] = useState<CustomPreset | null>(null);
  const [presetEditorTarget, setPresetEditorTarget] = useState<CustomPreset | "new" | null>(null);
  const [presetQuery, setPresetQuery] = useState("");
  const q = presetQuery.trim().toLowerCase();
  const matchesQuery = (name: string, description: string) =>
    !q || name.toLowerCase().includes(q) || description.toLowerCase().includes(q);

  const [name, setName] = useState("");
  const [location, setLocation] = useState(data.settings.projectsDir);
  const [gitInit, setGitInit] = useState(false);
  const [openAfter, setOpenAfter] = useState(true);
  const [groupId, setGroupId] = useState<string>(data.settings.defaultGroupId ?? "");
  const [toolPath, setToolPath] = useState<string | null | "checking">(null);
  const [activeInstallId, setActiveInstallId] = useState<string | null>(props.resumeInstallId);

  const activeJob = activeInstallId ? props.installs[activeInstallId] : null;

  const selected = preset ?? customPreset;
  const requiredTool = useMemo(() => {
    if (preset?.requires) return preset.requires;
    if (customPreset?.requiresTool) return { tool: customPreset.requiresTool, label: customPreset.requiresTool };
    return undefined;
  }, [preset, customPreset]);

  const projectPath = useMemo(() => {
    const loc = location.replace(/[\\/]+$/, "");
    return name ? `${loc}\\${name}` : loc;
  }, [location, name]);

  useEffect(() => {
    if (!requiredTool) {
      setToolPath(null);
      return;
    }
    setToolPath("checking");
    checkTool(requiredTool.tool).then((p) => setToolPath(p));
  }, [requiredTool]);

  const nameValid = NAME_RE.test(name);
  const toolMissing = !!requiredTool && toolPath === null;
  const canCreate =
    !!selected && nameValid && location.trim() !== "" && !toolMissing && toolPath !== "checking";

  function selectBuiltin(p: Preset) {
    setPreset(p);
    setCustomPreset(null);
  }
  function selectCustom(p: CustomPreset) {
    setCustomPreset(p);
    setPreset(null);
  }

  async function browseLocation() {
    const dir = await open({ directory: true, title: "Choose parent folder" });
    if (typeof dir === "string") setLocation(dir);
  }

  function create() {
    if (!selected) return;
    const id = props.onStartCreate({
      name,
      location,
      gitInit,
      openAfter,
      preset,
      customPreset,
      groupId: groupId || null,
    });
    setActiveInstallId(id);
  }

  function backToConfigure() {
    if (activeInstallId) props.onDismissInstall(activeInstallId);
    setActiveInstallId(null);
  }

  function goToDashboard() {
    if (activeInstallId && activeJob?.phase !== "creating") props.onDismissInstall(activeInstallId);
    props.onCancel();
  }

  if (activeJob) {
    const createdProject = data.projects.find((p) => p.path === activeJob.path) ?? null;
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1>
              {activeJob.phase === "creating" && "Creating project…"}
              {activeJob.phase === "done" && "Project created"}
              {activeJob.phase === "error" && "Something went wrong"}
            </h1>
            <p className="muted preset-line">
              <PresetIcon presetId={activeJob.presetId} size={14} /> {activeJob.name} —{" "}
              {activeJob.path}
            </p>
          </div>
        </div>
        <div className="wizard-console">
          <Console
            lines={props.lines[activeJob.procId] ?? []}
            procId={activeJob.procId}
            running={activeJob.phase === "creating"}
          />
        </div>
        <div className="wizard-footer">
          {activeJob.phase === "creating" && (
            <>
              <span className="spinner" />
              <button className="btn" onClick={props.onCancel}>
                Go to Dashboard (keeps installing)
              </button>
            </>
          )}
          {activeJob.phase === "done" && (
            <>
              {createdProject && (
                <button className="btn btn-primary" onClick={() => props.onOpenIde(createdProject)}>
                  Open in IDE
                </button>
              )}
              <button className="btn" onClick={goToDashboard}>
                Go to Dashboard
              </button>
            </>
          )}
          {activeJob.phase === "error" && (
            <>
              <button className="btn btn-primary" onClick={backToConfigure}>
                <IconArrowLeft size={14} /> Back
              </button>
              <button className="btn" onClick={goToDashboard}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>New Project</h1>
          <p className="muted">Pick a preset, name it, done.</p>
        </div>
        <div className="page-actions">
          <div className="search-wrap">
            <IconSearch size={15} className="search-icon" />
            <input
              className="search"
              placeholder="Search templates…"
              value={presetQuery}
              onChange={(e) => setPresetQuery(e.target.value)}
            />
          </div>
          <button className="btn" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>

      {CATEGORIES.map((cat) => {
        const catPresets = visible.filter(
          (p) => p.category === cat && matchesQuery(p.name, p.description)
        );
        if (catPresets.length === 0) return null;
        return (
          <div key={cat} className="preset-section">
            <h3 className="preset-category">{cat}</h3>
            <div className="preset-grid">
              {catPresets.map((p) => (
                <button
                  key={p.id}
                  className={`preset-card ${preset?.id === p.id ? "preset-selected" : ""}`}
                  style={{ ["--accent-color" as any]: p.accent }}
                  onClick={() => selectBuiltin(p)}
                >
                  <span className="preset-icon">
                    <PresetIcon presetId={p.id} size={18} />
                  </span>
                  <span className="preset-name">{p.name}</span>
                  <span className="preset-desc">{p.description}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {(data.customPresets.some((p) => matchesQuery(p.name, p.description)) || !q) && (
      <div className="preset-section">
        <h3 className="preset-category">Custom</h3>
        <div className="preset-grid">
          {data.customPresets
            .filter((p) => matchesQuery(p.name, p.description))
            .map((p) => (
            <div
              key={p.id}
              className={`preset-card ${customPreset?.id === p.id ? "preset-selected" : ""}`}
              style={{ ["--accent-color" as any]: p.accent }}
              onClick={() => selectCustom(p)}
              role="button"
              tabIndex={0}
            >
              <div className="preset-card-actions">
                <button
                  className="icon-btn"
                  title="Edit preset"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPresetEditorTarget(p);
                  }}
                >
                  <IconSliders size={13} />
                </button>
                <button
                  className="icon-btn"
                  title="Delete preset"
                  onClick={(e) => {
                    e.stopPropagation();
                    props.onDeleteCustomPreset(p.id);
                    if (customPreset?.id === p.id) setCustomPreset(null);
                  }}
                >
                  <IconTrash size={13} />
                </button>
              </div>
              <span className="preset-icon">
                <PresetIcon presetId={p.id} glyph={p.glyph} size={18} />
              </span>
              <span className="preset-name">{p.name}</span>
              <span className="preset-desc">{p.description || "Custom preset"}</span>
            </div>
          ))}
          {!q && (
            <button
              className="preset-card preset-card-dashed"
              onClick={() => setPresetEditorTarget("new")}
            >
              <span className="preset-icon">
                <IconPlus size={18} />
              </span>
              <span className="preset-name">Create custom preset</span>
              <span className="preset-desc">Your own files, setup commands and run configs.</span>
            </button>
          )}
        </div>
      </div>
      )}

      {q &&
        visible.filter((p) => matchesQuery(p.name, p.description)).length === 0 &&
        data.customPresets.filter((p) => matchesQuery(p.name, p.description)).length === 0 && (
          <p className="muted">No templates match “{presetQuery}”.</p>
        )}

      {selected && (
        <div className="wizard-config">
          <h3 className="preset-line">
            <PresetIcon presetId={selected.id} glyph={customPreset?.glyph} size={16} /> {selected.name} — configuration
          </h3>

          {requiredTool && (
            <div
              className={`tool-check ${
                toolPath === "checking" ? "" : toolPath ? "tool-ok" : "tool-missing"
              }`}
            >
              {toolPath === "checking" && `Checking for ${requiredTool.label}…`}
              {toolPath && toolPath !== "checking" && (
                <span className="preset-line">
                  <IconCheck size={14} /> {requiredTool.label} found ({toolPath})
                </span>
              )}
              {toolPath === null && (
                <span className="preset-line">
                  <IconX size={14} /> {requiredTool.label} not found on PATH — install it first,
                  then come back.
                </span>
              )}
            </div>
          )}

          <div className="form-row">
            <label>Project name</label>
            <input
              value={name}
              autoFocus
              placeholder="my-awesome-app"
              onChange={(e) => setName(e.target.value.replace(/ /g, "-"))}
            />
            {name && !nameValid && (
              <span className="field-error">
                Must start with a letter; only letters, digits, “.”, “_”, “-”.
              </span>
            )}
          </div>

          <div className="form-row">
            <label>Location</label>
            <div className="input-with-btn">
              <input value={location} onChange={(e) => setLocation(e.target.value)} />
              <button className="btn" onClick={browseLocation}>
                Browse…
              </button>
            </div>
            {name && nameValid && <span className="field-hint">Will create: {projectPath}</span>}
          </div>

          {data.settings.groups.length > 0 && (
            <div className="form-row">
              <label>Group</label>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">No group</option>
                {groupTree(data.settings.groups).map(({ group: g, depth }) => (
                  <option key={g.id} value={g.id}>
                    {"— ".repeat(depth)}
                    {g.name}
                    {g.id === data.settings.defaultGroupId ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row form-checks">
            <label className="check">
              <input
                type="checkbox"
                checked={gitInit}
                onChange={(e) => setGitInit(e.target.checked)}
              />
              Initialize git repository
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={openAfter}
                onChange={(e) => setOpenAfter(e.target.checked)}
              />
              Open in IDE when done
            </label>
          </div>

          <div className="wizard-footer">
            <button className="btn btn-primary btn-lg" disabled={!canCreate} onClick={create}>
              <IconPlus size={16} /> Create project
            </button>
          </div>
        </div>
      )}

      {presetEditorTarget && (
        <PresetEditor
          initial={presetEditorTarget === "new" ? null : presetEditorTarget}
          onClose={() => setPresetEditorTarget(null)}
          onDelete={(id) => {
            props.onDeleteCustomPreset(id);
            if (customPreset?.id === id) setCustomPreset(null);
            setPresetEditorTarget(null);
          }}
          onSave={(cp) => {
            if (presetEditorTarget === "new") props.onSaveCustomPreset(cp);
            else props.onUpdateCustomPreset(cp);
            setPresetEditorTarget(null);
            selectCustom(cp);
          }}
        />
      )}
    </div>
  );
}
