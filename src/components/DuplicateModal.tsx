import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Project } from "../types";
import { IconCopy } from "../icons";

interface DuplicateModalProps {
  project: Project;
  onConfirm: (name: string, location: string) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}

function parentDir(path: string) {
  const idx = path.lastIndexOf("\\");
  return idx > 0 ? path.slice(0, idx) : path;
}

export default function DuplicateModal({ project, onConfirm, onClose, busy, error }: DuplicateModalProps) {
  const [name, setName] = useState(`${project.name}-copy`);
  const [location, setLocation] = useState(parentDir(project.path));

  async function browse() {
    const dir = await open({ directory: true, title: "Choose parent folder" });
    if (typeof dir === "string") setLocation(dir);
  }

  const valid = name.trim() !== "" && location.trim() !== "";

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal">
        <h3 className="preset-line">
          <IconCopy size={16} /> Duplicate project
        </h3>

        <div className="form-row">
          <label>New name</label>
          <input value={name} autoFocus onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="form-row">
          <label>Location</label>
          <div className="input-with-btn">
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
            <button className="btn" onClick={browse}>
              Browse…
            </button>
          </div>
          <span className="field-hint">
            Will copy to: {location.replace(/[\\/]+$/, "")}\{name}
          </span>
        </div>

        {error && <div className="tool-check tool-missing">{error}</div>}

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid || busy}
            onClick={() => onConfirm(name.trim(), location.trim())}
          >
            {busy ? "Copying…" : "Duplicate"}
          </button>
        </div>
      </div>
    </div>
  );
}
