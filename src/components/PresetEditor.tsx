import { useState } from "react";
import type { CustomPreset, CustomPresetFile, RunConfig } from "../types";
import { GLYPH_KEYS, Glyph, IconPlus, IconTrash } from "../icons";

interface PresetEditorProps {
  initial: CustomPreset | null;
  onSave: (preset: CustomPreset) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

function blank(): CustomPreset {
  return {
    id: `custom:${crypto.randomUUID()}`,
    name: "",
    description: "",
    accent: "#4f8cff",
    glyph: "box",
    requiresTool: "",
    setupCommands: [],
    files: [],
    runConfigs: [],
  };
}

export default function PresetEditor({ initial, onSave, onDelete, onClose }: PresetEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [accent, setAccent] = useState(initial?.accent ?? "#4f8cff");
  const [glyph, setGlyph] = useState(initial?.glyph ?? "box");
  const [requiresTool, setRequiresTool] = useState(initial?.requiresTool ?? "");
  const [files, setFiles] = useState<CustomPresetFile[]>(initial?.files ?? []);
  const [setupText, setSetupText] = useState((initial?.setupCommands ?? []).join("\n"));
  const [runConfigs, setRunConfigs] = useState<RunConfig[]>(
    (initial?.runConfigs ?? []).map((c) => ({ ...c }))
  );

  const valid = name.trim() !== "";

  function addFile() {
    setFiles((f) => [...f, { path: "", content: "" }]);
  }
  function updateFile(i: number, field: "path" | "content", value: string) {
    setFiles((f) => f.map((entry, idx) => (idx === i ? { ...entry, [field]: value } : entry)));
  }
  function removeFile(i: number) {
    setFiles((f) => f.filter((_, idx) => idx !== i));
  }

  function addRunConfig() {
    setRunConfigs((c) => [...c, { id: crypto.randomUUID(), name: "", command: "" }]);
  }
  function updateRunConfig(id: string, field: "name" | "command", value: string) {
    setRunConfigs((c) => c.map((cfg) => (cfg.id === id ? { ...cfg, [field]: value } : cfg)));
  }
  function removeRunConfig(id: string) {
    setRunConfigs((c) => c.filter((cfg) => cfg.id !== id));
  }

  function save() {
    const base = initial ?? blank();
    onSave({
      ...base,
      name: name.trim(),
      description: description.trim(),
      accent,
      glyph,
      requiresTool: requiresTool.trim() || null,
      setupCommands: setupText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      files: files.filter((f) => f.path.trim()),
      runConfigs: runConfigs.filter((c) => c.name.trim() && c.command.trim()),
    });
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <h3>{initial ? "Edit custom preset" : "Create custom preset"}</h3>

        <div className="modal-scroll">
          <div className="form-row">
            <label>Name</label>
            <input value={name} autoFocus placeholder="My Stack" onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="form-row">
            <label>Description</label>
            <input
              value={description}
              placeholder="Shown under the name in the wizard"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Accent color</label>
            <input
              type="color"
              className="color-input"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
            />
          </div>

          <div className="form-row">
            <label>Icon</label>
            <div className="glyph-grid">
              {GLYPH_KEYS.map((g) => (
                <button
                  key={g}
                  className={`glyph-btn ${glyph === g ? "glyph-selected" : ""}`}
                  onClick={() => setGlyph(g)}
                  title={g}
                >
                  <Glyph glyph={g} size={18} />
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label>Required CLI tool (optional)</label>
            <input
              value={requiresTool}
              placeholder="e.g. docker, node, python"
              onChange={(e) => setRequiresTool(e.target.value)}
            />
            <span className="field-hint">Checked on PATH before this preset can scaffold.</span>
          </div>

          <div className="form-row">
            <label>Files to create</label>
            <div className="file-list">
              {files.map((f, i) => (
                <div key={i} className="file-row">
                  <div className="file-row-head">
                    <input
                      className="file-path-input"
                      placeholder="relative/path.ext"
                      value={f.path}
                      onChange={(e) => updateFile(i, "path", e.target.value)}
                    />
                    <button className="icon-btn" title="Remove file" onClick={() => removeFile(i)}>
                      <IconTrash size={14} />
                    </button>
                  </div>
                  <textarea
                    className="file-content-area"
                    placeholder="File content…"
                    value={f.content}
                    onChange={(e) => updateFile(i, "content", e.target.value)}
                  />
                </div>
              ))}
              {files.length === 0 && <p className="muted">No files yet.</p>}
            </div>
            <button className="btn btn-sm" onClick={addFile}>
              <IconPlus size={13} /> Add file
            </button>
          </div>

          <div className="form-row">
            <label>Setup commands (optional, one per line)</label>
            <textarea
              className="notes-area"
              placeholder={"npm install\nnpm run prepare"}
              value={setupText}
              onChange={(e) => setSetupText(e.target.value)}
            />
            <span className="field-hint">Run in the new project folder, in order, after files are written.</span>
          </div>

          <div className="form-row">
            <label>Run configurations</label>
            <div className="run-config-list">
              {runConfigs.map((cfg) => (
                <div key={cfg.id} className="run-config-row">
                  <input
                    className="run-config-name"
                    placeholder="name"
                    value={cfg.name}
                    onChange={(e) => updateRunConfig(cfg.id, "name", e.target.value)}
                  />
                  <input
                    className="run-config-command"
                    placeholder="command"
                    value={cfg.command}
                    onChange={(e) => updateRunConfig(cfg.id, "command", e.target.value)}
                  />
                  <button className="icon-btn" title="Remove" onClick={() => removeRunConfig(cfg.id)}>
                    <IconTrash size={14} />
                  </button>
                </div>
              ))}
              {runConfigs.length === 0 && <p className="muted">No run configurations yet.</p>}
            </div>
            <button className="btn btn-sm" onClick={addRunConfig}>
              <IconPlus size={13} /> Add run configuration
            </button>
          </div>
        </div>

        <div className="modal-footer">
          {initial && onDelete && (
            <button className="btn btn-danger" onClick={() => onDelete(initial.id)}>
              Delete preset
            </button>
          )}
          <div className="modal-footer-spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>
            Save preset
          </button>
        </div>
      </div>
    </div>
  );
}
