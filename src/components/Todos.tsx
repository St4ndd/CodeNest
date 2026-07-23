import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AppData, Project, TodoItem } from "../types";
import { getProjectMeta } from "../project-meta";
import {
  IconChecklist,
  IconChevronDown,
  IconGripVertical,
  IconPlus,
  IconSearch,
  IconTrash,
  PresetIcon,
} from "../icons";

interface TodosProps {
  data: AppData;
  onAdd: (projectId: string, text: string) => void;
  onToggle: (projectId: string, todoId: string) => void;
  onDelete: (projectId: string, todoId: string) => void;
  onReorder: (projectId: string, todoIds: string[]) => void;
}

/** Moves `id` to sit right before `beforeId` in `ids`, returning the same
 * array reference when nothing actually changes (so React can skip the
 * re-render while a drag hovers over the same spot). */
function reorderIds(ids: string[], id: string, beforeId: string): string[] {
  const from = ids.indexOf(id);
  const to = ids.indexOf(beforeId);
  if (from === -1 || to === -1 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export default function Todos({ data, onAdd, onToggle, onDelete, onReorder }: TodosProps) {
  const allProjects = useMemo(
    () => data.projects.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name)),
    [data.projects]
  );
  // Only projects that already have at least one todo clutter the sidebar —
  // everything else is reachable via the searchable picker below.
  const projectsWithTodos = useMemo(
    () => allProjects.filter((p) => (p.todos?.length ?? 0) > 0),
    [allProjects]
  );

  const [selectedId, setSelectedId] = useState<string | null>(projectsWithTodos[0]?.id ?? null);
  const [text, setText] = useState("");

  const selected: Project | undefined =
    allProjects.find((p) => p.id === selectedId) ?? projectsWithTodos[0];

  // The todo list's display order *is* its priority order — drag handles let
  // the user set it directly instead of it being derived from createdAt/done.
  const [orderIds, setOrderIds] = useState<string[]>([]);
  useEffect(() => {
    const ids = (selected?.todos ?? []).map((t) => t.id);
    setOrderIds((prev) => {
      const prevSet = new Set(prev);
      const sameSet = prev.length === ids.length && ids.every((id) => prevSet.has(id));
      if (sameSet) return prev;
      const idsSet = new Set(ids);
      const kept = prev.filter((id) => idsSet.has(id));
      const added = ids.filter((id) => !prevSet.has(id));
      return [...kept, ...added];
    });
  }, [selected?.id, selected?.todos]);

  const todoById = useMemo(() => {
    const map = new Map<string, TodoItem>();
    for (const t of selected?.todos ?? []) map.set(t.id, t);
    return map;
  }, [selected]);
  const todos = orderIds.map((id) => todoById.get(id)).filter((t): t is TodoItem => !!t);

  // Drag-to-reorder with a FLIP animation: before an order change we snapshot
  // every row's position, then on the next layout animate from there to the
  // new position instead of letting rows just jump.
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const flipRectsRef = useRef<Map<string, DOMRect> | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function snapshotRects() {
    const map = new Map<string, DOMRect>();
    rowRefs.current.forEach((el, id) => map.set(id, el.getBoundingClientRect()));
    return map;
  }

  function dragOver(overId: string) {
    if (!dragId || dragId === overId) return;
    flipRectsRef.current = snapshotRects();
    setOrderIds((prev) => reorderIds(prev, dragId, overId));
  }

  function endDrag() {
    if (dragId && selected) onReorder(selected.id, orderIds);
    setDragId(null);
  }

  useLayoutEffect(() => {
    const before = flipRectsRef.current;
    if (!before) return;
    flipRectsRef.current = null;
    rowRefs.current.forEach((el, id) => {
      const from = before.get(id);
      if (!from) return;
      const to = el.getBoundingClientRect();
      const dy = from.top - to.top;
      if (!dy) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 220ms cubic-bezier(0.2, 0, 0, 1)";
        el.style.transform = "";
      });
    });
  }, [orderIds]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || !selected) return;
    onAdd(selected.id, trimmed);
    setText("");
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="preset-line">
            <IconChecklist size={22} /> Todos
          </h1>
          <p className="muted">Per-project task lists.</p>
        </div>
      </div>

      {allProjects.length === 0 ? (
        <p className="muted">No projects yet — create one first.</p>
      ) : (
        <div className="todos-layout">
          <div className="todos-sidebar">
            <ProjectCombobox
              data={data}
              projects={allProjects}
              selectedId={selected?.id ?? null}
              onSelect={setSelectedId}
            />

            {projectsWithTodos.length === 0 ? (
              <p className="muted notes-empty-hint">No todos yet — pick a project above to add one.</p>
            ) : (
              projectsWithTodos.map((p) => {
                const open = (p.todos ?? []).filter((t) => !t.done).length;
                return (
                  <button
                    key={p.id}
                    className={`todos-project-row ${selected?.id === p.id ? "todos-project-active" : ""}`}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <PresetIcon
                      presetId={p.presetId}
                      glyph={getProjectMeta(p.presetId, data.customPresets).glyphOverride}
                      size={15}
                    />
                    <span className="todos-project-name">{p.name}</span>
                    {open > 0 && <span className="badge todos-count">{open}</span>}
                  </button>
                );
              })
            )}
          </div>

          <div className="todos-main">
            {selected ? (
              <>
                <h3 className="preset-line">
                  <PresetIcon
                    presetId={selected.presetId}
                    glyph={getProjectMeta(selected.presetId, data.customPresets).glyphOverride}
                    size={16}
                  />
                  {selected.name}
                </h3>

                <div className="input-with-btn todo-add-row">
                  <input
                    placeholder="Add a todo…"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                  />
                  <button className="btn btn-primary" onClick={submit} disabled={!text.trim()}>
                    <IconPlus size={14} /> Add
                  </button>
                </div>

                {todos.length === 0 ? (
                  <p className="muted">No todos yet.</p>
                ) : (
                  <div className="todo-list">
                    {todos.map((t) => (
                      <div
                        key={t.id}
                        ref={(el) => {
                          if (el) rowRefs.current.set(t.id, el);
                          else rowRefs.current.delete(t.id);
                        }}
                        className={`todo-row ${t.done ? "todo-done" : ""} ${dragId === t.id ? "todo-row-dragging" : ""}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          dragOver(t.id);
                        }}
                        onDrop={(e) => e.preventDefault()}
                        onTransitionEnd={(e) => {
                          if (e.propertyName === "transform") e.currentTarget.style.transition = "";
                        }}
                      >
                        <span
                          className="todo-grab"
                          draggable
                          title="Drag to reorder"
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(t.id);
                          }}
                          onDragEnd={endDrag}
                        >
                          <IconGripVertical size={14} />
                        </span>
                        <input
                          type="checkbox"
                          className="todo-checkbox"
                          checked={t.done}
                          onChange={() => onToggle(selected.id, t.id)}
                        />
                        <span className="todo-text">{t.text}</span>
                        <button
                          className="icon-btn todo-delete"
                          title="Delete todo"
                          onClick={() => onDelete(selected.id, t.id)}
                        >
                          <IconTrash size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted">Pick a project on the left to add a todo.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectCombobox({
  data,
  projects,
  selectedId,
  onSelect,
}: {
  data: AppData;
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = projects.find((p) => p.id === selectedId);
  const filtered = projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="combobox" ref={ref}>
      <button className="combobox-trigger" onClick={() => setOpen((o) => !o)}>
        {selected ? (
          <>
            <PresetIcon
              presetId={selected.presetId}
              glyph={getProjectMeta(selected.presetId, data.customPresets).glyphOverride}
              size={14}
            />
            <span className="combobox-trigger-label">{selected.name}</span>
          </>
        ) : (
          <span className="combobox-trigger-label muted">Select a project…</span>
        )}
        <IconChevronDown size={13} />
      </button>
      {open && (
        <div className="combobox-popup">
          <div className="combobox-search">
            <IconSearch size={13} />
            <input
              ref={inputRef}
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="combobox-list">
            {filtered.length === 0 && <p className="muted combobox-empty">No matching projects.</p>}
            {filtered.map((p) => (
              <button
                key={p.id}
                className={`combobox-option ${p.id === selectedId ? "combobox-option-active" : ""}`}
                onClick={() => {
                  onSelect(p.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <PresetIcon
                  presetId={p.presetId}
                  glyph={getProjectMeta(p.presetId, data.customPresets).glyphOverride}
                  size={14}
                />
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
