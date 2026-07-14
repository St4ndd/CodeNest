import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppData } from "../types";
import { groupTree } from "../project-meta";
import { IconGlobe } from "../icons";

interface CloneGitModalProps {
  data: AppData;
  onConfirm: (cfg: { url: string; name: string; location: string; groupId: string | null }) => void;
  onClose: () => void;
}

function nameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  const last = trimmed.split(/[/\\]/).pop() ?? "";
  return last.replace(/[^A-Za-z0-9._-]/g, "-");
}

export default function CloneGitModal({ data, onConfirm, onClose }: CloneGitModalProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [location, setLocation] = useState(data.settings.projectsDir);
  const [groupId, setGroupId] = useState<string>(data.settings.defaultGroupId ?? "");

  function updateUrl(value: string) {
    setUrl(value);
    if (!nameTouched) setName(nameFromUrl(value));
  }

  async function browseLocation() {
    const dir = await open({ directory: true, title: "Choose parent folder" });
    if (typeof dir === "string") setLocation(dir);
  }

  const valid = url.trim() !== "" && name.trim() !== "" && location.trim() !== "";

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3 className="preset-line">
          <IconGlobe size={16} /> Clone from Git
        </h3>

        <div className="form-row">
          <label>Repository URL</label>
          <input
            autoFocus
            placeholder="https://github.com/user/repo.git"
            value={url}
            onChange={(e) => updateUrl(e.target.value)}
          />
        </div>

        <div className="form-row">
          <label>Project name</label>
          <input
            value={name}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
          />
        </div>

        <div className="form-row">
          <label>Location</label>
          <div className="input-with-btn">
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
            <button className="btn" onClick={browseLocation}>
              Browse…
            </button>
          </div>
          {name.trim() && (
            <span className="field-hint">
              Will clone to: {location.replace(/[\\/]+$/, "")}\{name.trim()}
            </span>
          )}
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
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() =>
              onConfirm({ url: url.trim(), name: name.trim(), location: location.trim(), groupId: groupId || null })
            }
          >
            Clone
          </button>
        </div>
      </div>
    </div>
  );
}
