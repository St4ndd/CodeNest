import { useEffect, useMemo, useState } from "react";
import type { AppData, Note } from "../types";
import { getProjectMeta } from "../project-meta";
import Menu from "./Menu";
import { IconFileText, IconPlus, IconTrash, IconX, PresetIcon } from "../icons";

interface NotesProps {
  data: AppData;
  onAddNote: () => Note;
  onUpdateNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
}

export default function Notes({ data, onAddNote, onUpdateNote, onDeleteNote }: NotesProps) {
  const notes = useMemo(
    () => [...data.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [data.notes]
  );
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null);
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  const [title, setTitle] = useState(selected?.title ?? "");
  const [body, setBody] = useState(selected?.body ?? "");

  useEffect(() => {
    setTitle(selected?.title ?? "");
    setBody(selected?.body ?? "");
  }, [selected?.id]);

  function createNote() {
    const note = onAddNote();
    setSelectedId(note.id);
  }

  function saveField(patch: Partial<Note>) {
    if (!selected) return;
    onUpdateNote({ ...selected, ...patch });
  }

  function toggleProjectTag(projectId: string) {
    if (!selected) return;
    const has = selected.projectIds.includes(projectId);
    saveField({
      projectIds: has
        ? selected.projectIds.filter((id) => id !== projectId)
        : [...selected.projectIds, projectId],
    });
  }

  function deleteNote(id: string) {
    onDeleteNote(id);
    if (selectedId === id) setSelectedId(null);
  }

  const linkableProjects = data.projects.filter((p) => !selected?.projectIds.includes(p.id));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="preset-line">
            <IconFileText size={22} /> Notes
          </h1>
          <p className="muted">Freeform notes — optionally tagged to one or more projects.</p>
        </div>
      </div>

      <div className="todos-layout">
        <div className="todos-sidebar">
          <button className="btn btn-sm notes-new-btn" onClick={createNote}>
            <IconPlus size={13} /> New note
          </button>
          {notes.map((n) => (
            <button
              key={n.id}
              className={`todos-project-row ${selected?.id === n.id ? "todos-project-active" : ""}`}
              onClick={() => setSelectedId(n.id)}
            >
              <IconFileText size={14} />
              <span className="todos-project-name">{n.title || "Untitled note"}</span>
              {n.projectIds.length > 0 && <span className="badge todos-count">{n.projectIds.length}</span>}
            </button>
          ))}
          {notes.length === 0 && <p className="muted notes-empty-hint">No notes yet.</p>}
        </div>

        <div className="todos-main">
          {selected ? (
            <>
              <div className="note-header-row">
                <input
                  className="note-title-input"
                  value={title}
                  placeholder="Note title…"
                  onChange={(e) => setTitle(e.target.value)}
                  onBlur={() => saveField({ title: title.trim() || "Untitled note" })}
                />
                <button className="icon-btn" title="Delete note" onClick={() => deleteNote(selected.id)}>
                  <IconTrash size={15} />
                </button>
              </div>

              <textarea
                className="note-body-area"
                placeholder="Write your note…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onBlur={() => saveField({ body })}
              />

              <div className="note-tags-section">
                <span className="note-tags-label">Linked projects</span>
                <div className="note-tags">
                  {selected.projectIds.map((pid) => {
                    const p = data.projects.find((x) => x.id === pid);
                    if (!p) return null;
                    return (
                      <span key={pid} className="note-tag">
                        <PresetIcon
                          presetId={p.presetId}
                          glyph={getProjectMeta(p.presetId, data.customPresets).glyphOverride}
                          size={12}
                        />
                        {p.name}
                        <button className="note-tag-remove" onClick={() => toggleProjectTag(pid)}>
                          <IconX size={10} />
                        </button>
                      </span>
                    );
                  })}
                  {linkableProjects.length > 0 && (
                    <Menu
                      trigger={
                        <button className="note-tag note-tag-add">
                          <IconPlus size={11} /> Link project
                        </button>
                      }
                      items={linkableProjects.map((p) => ({
                        label: p.name,
                        icon: <PresetIcon presetId={p.presetId} size={13} />,
                        onClick: () => toggleProjectTag(p.id),
                      }))}
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="notes-placeholder">
              <p className="muted">Select a note, or create a new one.</p>
              <button className="btn btn-primary" onClick={createNote}>
                <IconPlus size={14} /> New note
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
