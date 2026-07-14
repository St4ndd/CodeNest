import { useEffect, useState } from "react";
import type { AppData, Group, Project, RunConfig } from "../types";
import { getProjectMeta, groupTree, resolveRunConfigs } from "../project-meta";
import { pathExists, readFile, writeFile } from "../backend";
import { IconFileText, IconPlus, IconTrash, PresetIcon } from "../icons";

interface ModalProps {
  data: AppData;
  project: Project;
  onSave: (project: Project) => void;
  onChangeSettings: (data: AppData) => void;
  onClose: () => void;
}

export default function ProjectSettingsModal({ data, project, onSave, onChangeSettings, onClose }: ModalProps) {
  const meta = getProjectMeta(project.presetId, data.customPresets);
  const [name, setName] = useState(project.name);
  const [ideId, setIdeId] = useState<string>(project.ideId ?? "");
  const [notes, setNotes] = useState(project.notes ?? "");
  const [groupId, setGroupId] = useState<string>(project.groupId ?? "");
  const [newGroupName, setNewGroupName] = useState("");
  const [configs, setConfigs] = useState<RunConfig[]>(() =>
    resolveRunConfigs(project, data.customPresets).map((c) => ({ ...c }))
  );

  const [envExists, setEnvExists] = useState<boolean | null>(null);
  const [envContent, setEnvContent] = useState("");
  const [envLoaded, setEnvLoaded] = useState(false);
  const envPath = `${project.path}\\.env`;

  useEffect(() => {
    pathExists(envPath).then((exists) => {
      setEnvExists(exists);
      if (exists) readFile(envPath).then((c) => setEnvContent(c)).finally(() => setEnvLoaded(true));
      else setEnvLoaded(true);
    });
  }, [envPath]);

  function addGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    const group: Group = { id: crypto.randomUUID(), name: trimmed };
    onChangeSettings({ ...data, settings: { ...data.settings, groups: [...data.settings.groups, group] } });
    setGroupId(group.id);
    setNewGroupName("");
  }

  function addConfig() {
    setConfigs((c) => [...c, { id: crypto.randomUUID(), name: "", command: "" }]);
  }

  function updateConfig(id: string, field: "name" | "command", value: string) {
    setConfigs((c) => c.map((cfg) => (cfg.id === id ? { ...cfg, [field]: value } : cfg)));
  }

  function removeConfig(id: string) {
    setConfigs((c) => c.filter((cfg) => cfg.id !== id));
  }

  async function saveEnv() {
    await writeFile(envPath, envContent);
    setEnvExists(true);
  }

  function save() {
    onSave({
      ...project,
      name: name.trim() || project.name,
      ideId: ideId || null,
      notes,
      groupId: groupId || null,
      runConfigs: configs.filter((c) => c.name.trim() && c.command.trim()),
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <h3 className="preset-line">
          <PresetIcon presetId={project.presetId} glyph={meta.glyphOverride} size={16} /> Project settings
        </h3>

        <div className="modal-scroll">
          <div className="form-row">
            <label>Display name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="form-row">
            <label>IDE for this project</label>
            <select value={ideId} onChange={(e) => setIdeId(e.target.value)}>
              <option value="">
                Use default (
                {data.settings.ides.find((i) => i.id === data.settings.defaultIdeId)?.name ?? "none"})
              </option>
              {data.settings.ides.map((ide) => (
                <option key={ide.id} value={ide.id}>
                  {ide.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>Group</label>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">No group</option>
              {groupTree(data.settings.groups).map(({ group: g, depth }) => (
                <option key={g.id} value={g.id}>
                  {"— ".repeat(depth)}
                  {g.name}
                </option>
              ))}
            </select>
            <div className="input-with-btn">
              <input
                placeholder="New group name…"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addGroup()}
              />
              <button className="btn btn-sm" onClick={addGroup} disabled={!newGroupName.trim()}>
                <IconPlus size={13} /> Add
              </button>
            </div>
          </div>

          <div className="form-row">
            <label>Notes</label>
            <textarea
              className="notes-area"
              placeholder="TODOs, credentials hints, context…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Run configurations</label>
            <div className="run-config-list">
              {configs.map((cfg) => (
                <div key={cfg.id} className="run-config-row">
                  <input
                    className="run-config-name"
                    placeholder="name"
                    value={cfg.name}
                    onChange={(e) => updateConfig(cfg.id, "name", e.target.value)}
                  />
                  <input
                    className="run-config-command"
                    placeholder="command"
                    value={cfg.command}
                    onChange={(e) => updateConfig(cfg.id, "command", e.target.value)}
                  />
                  <button className="icon-btn" title="Remove" onClick={() => removeConfig(cfg.id)}>
                    <IconTrash size={14} />
                  </button>
                </div>
              ))}
              {configs.length === 0 && <p className="muted">No run configurations yet.</p>}
            </div>
            <button className="btn btn-sm" onClick={addConfig}>
              <IconPlus size={13} /> Add run configuration
            </button>
          </div>

          <div className="form-row">
            <label className="preset-line">
              <IconFileText size={14} /> Environment variables (.env)
            </label>
            {!envLoaded ? (
              <span className="field-hint">Checking…</span>
            ) : (
              <>
                <textarea
                  className="notes-area env-area"
                  placeholder={envExists ? "" : "No .env file yet — content you enter here will create one."}
                  value={envContent}
                  onChange={(e) => setEnvContent(e.target.value)}
                />
                <button className="btn btn-sm" onClick={saveEnv}>
                  {envExists ? "Save .env" : "Create .env"}
                </button>
              </>
            )}
          </div>

          <div className="form-row">
            <label>Path</label>
            <span className="field-hint">{project.path}</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
