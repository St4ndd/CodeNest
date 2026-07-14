import { memo, useEffect, useMemo, useState } from "react";
import type { AppData, IdeConfig, InstallJob, ProcStats, Project, RunConfig } from "../types";
import { getProjectMeta, groupTree, resolveRunConfigs } from "../project-meta";
import { pathExists } from "../backend";
import Menu from "./Menu";
import {
  IconArchive,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconFolder,
  IconGlobe,
  IconMoreHorizontal,
  IconPackage,
  IconPlay,
  IconPlus,
  IconSearch,
  IconSliders,
  IconSquare,
  IconStar,
  IconTerminal,
  IconTrash,
  IconX,
  PresetIcon,
} from "../icons";

const COLLAPSED_GROUPS_KEY = "codenest.collapsedGroups";

function loadCollapsedGroups(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

interface DashboardProps {
  data: AppData;
  running: Record<string, boolean>;
  procStats: Record<string, ProcStats>;
  runUrls: Record<string, string>;
  showArchived: boolean;
  installs: Record<string, InstallJob>;
  onResumeInstall: (id: string) => void;
  onToggleShowArchived: () => void;
  onNew: () => void;
  onImport: () => void;
  onCloneGit: () => void;
  onOpenIde: (p: Project, ide?: IdeConfig) => void;
  onRun: (p: Project, config: RunConfig) => void;
  onRunExternal: (p: Project, config: RunConfig) => void;
  onStop: (procId: string) => void;
  onTerminal: (p: Project) => void;
  onExplorer: (p: Project) => void;
  onOpenUrl: (url: string) => void;
  onToggleFavorite: (p: Project) => void;
  onEdit: (p: Project) => void;
  onArchive: (p: Project) => void;
  onRemove: (p: Project) => void;
  onDuplicate: (p: Project) => void;
  onCheckDeps: (p: Project) => void;
  onShowConsole: (procId: string) => void;
}

const DOCKER_FILES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
const DOCKER_CONFIG: RunConfig = { id: "docker-up", name: "Docker Compose Up", command: "docker compose up" };

export default function Dashboard(props: DashboardProps) {
  const { data } = props;
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(loadCollapsedGroups);

  function toggleCollapsed(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  const recentlyOpened = useMemo(
    () =>
      data.projects
        .filter((p) => p.lastOpenedAt && !p.archived)
        .sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""))
        .slice(0, 8),
    [data.projects]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.projects.filter((p) => {
      if (!props.showArchived && p.archived) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        getProjectMeta(p.presetId, data.customPresets).name.toLowerCase().includes(q)
      );
    });
  }, [data.projects, data.customPresets, query, props.showArchived]);

  const archivedCount = data.projects.filter((p) => p.archived).length;
  const pendingInstalls = Object.values(props.installs).filter((j) => j.phase !== "done");

  const sortFn = (a: Project, b: Project) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    const at = a.lastOpenedAt ?? a.createdAt;
    const bt = b.lastOpenedAt ?? b.createdAt;
    return bt.localeCompare(at);
  };

  const groups = data.settings.groups;
  const sections = useMemo(() => {
    if (groups.length === 0) {
      return [
        { id: null as string | null, name: null as string | null, depth: 0, projects: [...visible].sort(sortFn) },
      ];
    }
    const byGroup = groupTree(groups).map(({ group: g, depth }) => ({
      id: g.id as string | null,
      name: g.name as string | null,
      depth,
      projects: visible.filter((p) => p.groupId === g.id).sort(sortFn),
    }));
    const ungrouped = visible.filter((p) => !p.groupId || !groups.some((g) => g.id === p.groupId));
    const result = byGroup.filter((s) => s.projects.length > 0);
    if (ungrouped.length > 0) {
      result.push({ id: null, name: "Ungrouped", depth: 0, projects: ungrouped.sort(sortFn) });
    }
    return result;
  }, [groups, visible]);

  const visibleSections = useMemo(() => {
    const out: { section: (typeof sections)[number]; collapsed: boolean }[] = [];
    let hideUntilDepth: number | null = null;
    for (const section of sections) {
      if (hideUntilDepth !== null) {
        if (section.depth > hideUntilDepth) continue;
        hideUntilDepth = null;
      }
      const collapsed = section.id != null && collapsedGroups.has(section.id);
      if (collapsed) hideUntilDepth = section.depth;
      out.push({ section, collapsed });
    }
    return out;
  }, [sections, collapsedGroups]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="muted">
            {data.projects.length === 0
              ? "No projects yet — create your first one"
              : `${visible.length} project${visible.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="page-actions">
          <div className="search-wrap">
            <IconSearch size={15} className="search-icon" />
            <input
              className="search"
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {archivedCount > 0 && (
            <button
              className={`btn btn-sm ${props.showArchived ? "btn-toggle-active" : ""}`}
              onClick={props.onToggleShowArchived}
            >
              <IconArchive size={14} /> {props.showArchived ? "Hide" : "Show"} archived ({archivedCount})
            </button>
          )}
          <button className="btn" onClick={props.onImport}>
            <IconDownload size={15} /> Import
          </button>
          <button className="btn" onClick={props.onCloneGit}>
            <IconGlobe size={15} /> Clone from Git
          </button>
          <button className="btn btn-primary" onClick={props.onNew}>
            <IconPlus size={15} /> New Project
          </button>
        </div>
      </div>

      {!query && recentlyOpened.length > 0 && (
        <div className="recent-row">
          <h3 className="preset-category">Recently opened</h3>
          <div className="recent-strip">
            {recentlyOpened.map((p) => {
              const meta = getProjectMeta(p.presetId, data.customPresets);
              return (
                <button
                  key={p.id}
                  className="recent-chip"
                  title={p.path}
                  onClick={() => props.onOpenIde(p)}
                >
                  <PresetIcon presetId={p.presetId} glyph={meta.glyphOverride} size={15} />
                  <span className="recent-chip-name">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {pendingInstalls.length > 0 && (
        <div className="group-section">
          <div className="project-grid">
            {pendingInstalls.map((job) => (
              <InstallCard key={job.id} job={job} onClick={() => props.onResumeInstall(job.id)} />
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 && data.projects.length === 0 && pendingInstalls.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <IconFolder size={28} />
          </div>
          <h2>Your nest is empty</h2>
          <p className="muted">
            Create a new project from a preset or import an existing folder — you can also drag a
            folder onto this window.
          </p>
          <button className="btn btn-primary btn-lg" onClick={props.onNew}>
            <IconPlus size={16} /> Create your first project
          </button>
        </div>
      ) : visible.length === 0 ? (
        pendingInstalls.length === 0 && <p className="muted">No projects match “{query}”.</p>
      ) : (
        visibleSections.map(({ section, collapsed }) => (
          <div
            key={section.id ?? section.name ?? "flat"}
            className="group-section"
            style={section.depth > 0 ? { marginLeft: section.depth * 22 } : undefined}
          >
            {section.name && (
              <h3 className={`preset-category ${section.depth > 0 ? "preset-category-nested" : ""}`}>
                {section.id != null ? (
                  <button
                    className="group-collapse-btn"
                    onClick={() => toggleCollapsed(section.id!)}
                    title={collapsed ? "Expand" : "Collapse"}
                  >
                    {collapsed ? <IconChevronRight size={13} /> : <IconChevronDown size={13} />}
                  </button>
                ) : (
                  section.depth > 0 && <span className="group-nest-marker">└</span>
                )}
                {section.name}
                <span className="group-count">{section.projects.length}</span>
              </h3>
            )}
            {!collapsed && (
              <div className="project-grid">
                {section.projects.map((p) => (
                  <ProjectCard key={p.id} project={p} {...props} />
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

function InstallCard({ job, onClick }: { job: InstallJob; onClick: () => void }) {
  return (
    <button className={`card install-card ${job.phase === "error" ? "install-card-error" : ""}`} onClick={onClick}>
      <div className="card-top">
        <div className="card-icon">
          <PresetIcon presetId={job.presetId} size={18} />
        </div>
        <div className="card-title">
          <div className="card-name-row">
            <span className="card-name" title={job.name}>{job.name}</span>
            {job.phase === "creating" && (
              <span className="badge badge-running">
                <span className="spinner spinner-sm" /> installing
              </span>
            )}
            {job.phase === "error" && (
              <span className="badge badge-error">
                <IconX size={11} /> failed
              </span>
            )}
          </div>
          <span className="card-preset">{job.phase === "error" ? job.error : "Click to view progress"}</span>
        </div>
      </div>
      <span className="card-path">{job.path}</span>
    </button>
  );
}

function ProjectCardInner(props: DashboardProps & { project: Project }) {
  const { project: p, data } = props;
  const meta = getProjectMeta(p.presetId, data.customPresets);
  const runConfigs = resolveRunConfigs(p, data.customPresets);
  const ides = data.settings.ides;
  const projectIde =
    ides.find((i) => i.id === (p.ideId ?? data.settings.defaultIdeId)) ?? ides[0];

  const [hasDocker, setHasDocker] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const f of DOCKER_FILES) {
        if (await pathExists(`${p.path}\\${f}`)) {
          if (!cancelled) setHasDocker(true);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [p.path]);

  const allConfigs = hasDocker && !runConfigs.some((c) => c.id === "docker-up")
    ? [...runConfigs, DOCKER_CONFIG]
    : runConfigs;
  const primary = allConfigs[0];
  const rest = allConfigs.slice(1);

  const activeIds = Object.keys(props.running).filter(
    (id) => props.running[id] && id.startsWith(`run:${p.id}:`)
  );
  const isRunning = activeIds.length > 0;
  const primaryActiveUrl = activeIds.map((id) => props.runUrls[id]).find(Boolean);
  const primaryStats = activeIds.map((id) => props.procStats[id]).find(Boolean);

  return (
    <div className={`card ${isRunning ? "card-running" : ""}`}>
      <div className="card-top">
        <div className="card-icon">
          <PresetIcon presetId={p.presetId} glyph={meta.glyphOverride} size={18} />
        </div>
        <div className="card-title">
          <div className="card-name-row">
            <span className="card-name" title={p.name}>{p.name}</span>
            {isRunning && (
              <span className="badge badge-running">
                <span className="dot dot-on" /> {activeIds.length > 1 ? `${activeIds.length} running` : "running"}
              </span>
            )}
            {p.archived && <span className="badge">archived</span>}
          </div>
          <span className="card-preset">{meta.name}</span>
        </div>
        <button
          className={`icon-btn star ${p.favorite ? "star-on" : ""}`}
          title={p.favorite ? "Remove favorite" : "Mark as favorite"}
          onClick={() => props.onToggleFavorite(p)}
        >
          <IconStar size={15} filled={p.favorite} />
        </button>
      </div>

      <button className="card-path" title="Show in Explorer" onClick={() => props.onExplorer(p)}>
        {p.path}
      </button>

      {p.notes && <p className="card-notes">{p.notes}</p>}

      {isRunning && primaryStats && (
        <span className="stat-pill stat-pill-inline">
          {primaryStats.cpu.toFixed(0)}% CPU · {primaryStats.memory_mb.toFixed(0)} MB
        </span>
      )}

      <div className="card-actions">
        <button
          className="btn btn-primary btn-sm"
          title={projectIde ? `Open in ${projectIde.name}` : "No IDE configured"}
          disabled={!projectIde}
          onClick={() => props.onOpenIde(p)}
        >
          Open{projectIde ? ` · ${projectIde.name}` : ""}
        </button>

        {isRunning ? (
          <>
            {primaryActiveUrl && (
              <button className="btn btn-sm" onClick={() => props.onOpenUrl(primaryActiveUrl)}>
                <IconGlobe size={12} /> Browser
              </button>
            )}
            <button className="btn btn-sm" onClick={() => props.onShowConsole(activeIds[0])}>
              Console
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => activeIds.forEach((id) => props.onStop(id))}
            >
              <IconSquare size={12} /> Stop
            </button>
          </>
        ) : (
          <button
            className="btn btn-sm"
            disabled={!primary}
            title={primary?.command ?? "No run command configured"}
            onClick={() => primary && props.onRun(p, primary)}
          >
            <IconPlay size={12} /> {primary ? `Run ${primary.name}` : "Run"}
          </button>
        )}

        <Menu
          className="card-menu"
          trigger={
            <button className="icon-btn">
              <IconMoreHorizontal size={16} />
            </button>
          }
          items={[
            ...rest.map((cfg) => ({
              label: `Run: ${cfg.name}`,
              icon: <IconPlay size={13} />,
              onClick: () => props.onRun(p, cfg),
            })),
            ...(rest.length > 0 ? ["divider" as const] : []),
            ...ides.map((ide) => ({
              label: `Open with ${ide.name}`,
              icon: <IconExternalLink size={14} />,
              onClick: () => props.onOpenIde(p, ide),
            })),
            "divider" as const,
            {
              label: "Run in external terminal",
              icon: <IconTerminal size={14} />,
              disabled: !primary,
              onClick: () => primary && props.onRunExternal(p, primary),
            },
            {
              label: "Open terminal here",
              icon: <IconTerminal size={14} />,
              onClick: () => props.onTerminal(p),
            },
            {
              label: "Show in Explorer",
              icon: <IconFolder size={14} />,
              onClick: () => props.onExplorer(p),
            },
            {
              label: "Check dependencies",
              icon: <IconPackage size={14} />,
              onClick: () => props.onCheckDeps(p),
            },
            "divider" as const,
            {
              label: "Duplicate project",
              icon: <IconCopy size={14} />,
              onClick: () => props.onDuplicate(p),
            },
            {
              label: "Project settings",
              icon: <IconSliders size={14} />,
              onClick: () => props.onEdit(p),
            },
            {
              label: p.archived ? "Unarchive" : "Archive",
              icon: <IconArchive size={14} />,
              onClick: () => props.onArchive(p),
            },
            {
              label: "Remove from list",
              icon: <IconTrash size={14} />,
              danger: true,
              onClick: () => props.onRemove(p),
            },
          ]}
        />
      </div>
    </div>
  );
}

/** The CPU/RAM polling in App.tsx updates `procStats` / `running` every few
 * seconds with fresh object identities, which would otherwise re-render
 * every card in the grid on every tick. Only re-render a card when
 * something it actually shows (its own project data, or its own proc's
 * entries in those maps) changed. */
function sameRelevantEntries(
  pid: string,
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): boolean {
  if (prev === next) return true;
  const prefix = `run:${pid}:`;
  const keys = new Set(
    [...Object.keys(prev), ...Object.keys(next)].filter((k) => k.startsWith(prefix))
  );
  for (const k of keys) {
    if (prev[k] !== next[k]) return false;
  }
  return true;
}

const ProjectCard = memo(ProjectCardInner, (prev, next) => {
  if (prev.project !== next.project) return false;
  if (prev.data !== next.data) return false;
  if (prev.showArchived !== next.showArchived) return false;
  if (prev.installs !== next.installs) return false;
  const pid = next.project.id;
  if (!sameRelevantEntries(pid, prev.running, next.running)) return false;
  if (!sameRelevantEntries(pid, prev.procStats, next.procStats)) return false;
  if (!sameRelevantEntries(pid, prev.runUrls, next.runUrls)) return false;
  return true;
});
