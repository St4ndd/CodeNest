import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type {
  AppData,
  ConsoleLine,
  CustomPreset,
  ExitPayload,
  IdeConfig,
  ApiRequest,
  InstallJob,
  Note,
  OutputPayload,
  ProcStats,
  Project,
  RunConfig,
  StreamKind,
} from "./types";
import { ensureGitignore, resolveRunConfigs } from "./project-meta";
import type { Preset } from "./presets";
import {
  checkTool,
  defaultProjectsDir,
  detectIdes,
  detectProjectType,
  duplicateFolder,
  ensureDir,
  isDirectory,
  killProcess,
  loadData,
  moveFolder,
  openExplorer,
  openInIde,
  openTerminal,
  openWithDefault,
  pathExists,
  processStats,
  runStep,
  saveData,
  scaffoldBuiltin,
  setCloseToTray,
  spawnProcess,
  writeProjectFiles,
} from "./backend";
import Dashboard from "./components/Dashboard";
import NewProject from "./components/NewProject";
import Settings from "./components/Settings";
import Todos from "./components/Todos";
import Notes from "./components/Notes";
import ApiTester from "./components/ApiTester";
import TitleBar from "./components/TitleBar";
import ProjectSettingsModal from "./components/ProjectSettingsModal";
import DuplicateModal from "./components/DuplicateModal";
import CloneGitModal from "./components/CloneGitModal";
import Console from "./components/Console";
import {
  IconChevronDown,
  IconChevronUp,
  IconGlobe,
  IconGrid,
  IconPlus,
  IconChecklist,
  IconFileText,
  IconSend,
  IconSettings,
  IconSquare,
  IconUpload,
  IconX,
} from "./icons";
import "./App.css";

type View = "dashboard" | "new" | "todos" | "notes" | "api" | "settings";

const MAX_LINES = 3000;
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d{2,5})?[^\s"'<>)]*/i;
const DOCKER_RE = /docker(-|\s+)compose/i;
// Strips ANSI CSI sequences (colors, cursor movement, …) so URL detection
// doesn't pick up escape codes some CLIs interleave into the printed URL.
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;

function normalizeUrl(url: string) {
  return url.replace(/0\.0\.0\.0/, "localhost").replace(/\[::1\]/, "localhost");
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [lines, setLines] = useState<Record<string, ConsoleLine[]>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [runningMeta, setRunningMeta] = useState<Record<string, { command: string; cwd: string }>>(
    {}
  );
  const [procStats, setProcStats] = useState<Record<string, ProcStats>>({});
  const [runUrls, setRunUrls] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<{ open: boolean; active: string | null }>({
    open: false,
    active: null,
  });
  const [drawerHeight, setDrawerHeight] = useState(260);
  const drawerResizing = useRef(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [duplicating, setDuplicating] = useState<Project | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [installs, setInstalls] = useState<Record<string, InstallJob>>({});
  const [resumeInstallId, setResumeInstallId] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const toastId = useRef(0);
  const dataRef = useRef<AppData | null>(null);
  const runningRef = useRef<Record<string, boolean>>({});

  const toast = useCallback((msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const pushLine = useCallback((id: string, line: string, stream: StreamKind) => {
    setLines((prev) => {
      const arr = [...(prev[id] ?? []), { line, stream }];
      if (arr.length > MAX_LINES) arr.splice(0, arr.length - MAX_LINES);
      return { ...prev, [id]: arr };
    });
  }, []);

  const clearLines = useCallback((id: string) => {
    setLines((prev) => ({ ...prev, [id]: [] }));
  }, []);

  const persist = useCallback((d: AppData) => {
    // Keep the ref in sync synchronously so handlers called back-to-back
    // (e.g. "create project" immediately followed by "open in IDE") always
    // read the latest state instead of a stale render-time closure.
    dataRef.current = d;
    setData(d);
    saveData(JSON.stringify(d, null, 2)).catch(() => {});
    setCloseToTray(d.settings.closeToTray).catch(() => {});
  }, []);

  // ── Startup: load data + detect IDEs + migrate legacy fields ─────
  useEffect(() => {
    (async () => {
      let d: any;
      const raw = await loadData();
      if (raw) {
        d = JSON.parse(raw);
      } else {
        d = {
          projects: [],
          settings: { defaultIdeId: null, projectsDir: await defaultProjectsDir(), ides: [] },
          customPresets: [],
        };
        // Falls through to the migration block below, which fills in the rest
        // of `settings` (groups, terminalProfile, windowPresets, …) with defaults.
      }
      d.customPresets = d.customPresets ?? [];
      d.notes = d.notes ?? [];
      d.apiRequests = d.apiRequests ?? [];
      d.settings.groups = d.settings.groups ?? [];
      d.settings.defaultGroupId = d.settings.defaultGroupId ?? null;
      if (!d.settings.groups.some((g: { id: string }) => g.id === d.settings.defaultGroupId)) {
        d.settings.defaultGroupId = null;
      }
      d.settings.closeToTray = d.settings.closeToTray ?? true;
      d.settings.terminalProfile = d.settings.terminalProfile ?? "cmd";
      d.settings.moveImportedProjects = d.settings.moveImportedProjects ?? false;
      d.settings.autoGitignore = d.settings.autoGitignore ?? true;
      d.settings.windowPresets = d.settings.windowPresets ?? {
        small: { width: 1024, height: 700 },
        middle: { width: 1280, height: 820 },
        big: { width: 1600, height: 1000 },
      };
      d.settings.activeWindowPreset = d.settings.activeWindowPreset ?? "middle";
      d.projects = (d.projects ?? []).map((p: any) => ({
        ...p,
        runConfigs: p.runConfigs ?? (p.runCommand ? [{ id: "run", name: "run", command: p.runCommand }] : undefined),
        archived: p.archived ?? false,
        groupId: p.groupId ?? null,
        notes: p.notes ?? "",
        todos: p.todos ?? [],
      }));
      try {
        const detected = await detectIdes();
        const custom = d.settings.ides.filter((i: IdeConfig) => i.custom);
        d.settings.ides = [...detected, ...custom];
      } catch {
        // keep stored list if detection fails
      }
      if (!d.settings.defaultIdeId || !d.settings.ides.some((i: IdeConfig) => i.id === d.settings.defaultIdeId)) {
        d.settings.defaultIdeId =
          d.settings.ides.find((i: IdeConfig) => i.id === "vscode")?.id ?? d.settings.ides[0]?.id ?? null;
      }
      setData(d as AppData);
      saveData(JSON.stringify(d, null, 2)).catch(() => {});
      setCloseToTray(d.settings.closeToTray).catch(() => {});
    })();
  }, []);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  // ── Global process events ────────────────────────────────
  useEffect(() => {
    const un1 = listen<OutputPayload>("proc-output", (e) => {
      const { id, line } = e.payload;
      pushLine(id, line, e.payload.stream === "stderr" ? "stderr" : "stdout");
      if (id.startsWith("run:")) {
        const match = line.replace(ANSI_RE, "").match(URL_RE);
        if (match) {
          setRunUrls((prev) => (prev[id] ? prev : { ...prev, [id]: normalizeUrl(match[0]) }));
        }
      }
    });
    const un2 = listen<ExitPayload>("proc-exit", (e) => {
      const { id } = e.payload;
      setRunning((prev) => (prev[id] ? { ...prev, [id]: false } : prev));
      setProcStats((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (id.startsWith("run:") || id.startsWith("deps:")) {
        pushLine(id, `— process exited (code ${e.payload.code ?? "?"}) —`, "info");
      }
    });
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
    };
  }, [pushLine]);

  // ── CPU / RAM polling for running configs ─────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      const ids = Object.keys(runningRef.current).filter(
        (id) => runningRef.current[id] && id.startsWith("run:")
      );
      ids.forEach((id) => {
        processStats(id)
          .then((stats) => {
            if (!stats) return;
            setProcStats((prev) => ({ ...prev, [id]: stats }));
          })
          .catch(() => {});
      });
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  // ── Drag & drop folder import ──────────────────────────────
  const handleImportPaths = useCallback(
    async (paths: string[]) => {
      const current = dataRef.current;
      if (!current) return;
      const { projectsDir, moveImportedProjects } = current.settings;
      const additions: Project[] = [];
      for (const p of paths) {
        if (!(await isDirectory(p))) continue;
        if (current.projects.some((x) => x.path.toLowerCase() === p.toLowerCase())) continue;
        if (additions.some((x) => x.path.toLowerCase() === p.toLowerCase())) continue;
        const type = await detectProjectType(p);
        const name = p.split("\\").filter(Boolean).pop() ?? p;

        let finalPath = p;
        const alreadyInsideProjectsDir = p
          .toLowerCase()
          .startsWith(`${projectsDir.replace(/\\+$/, "")}\\`.toLowerCase());
        if (moveImportedProjects && projectsDir && !alreadyInsideProjectsDir) {
          let target = `${projectsDir.replace(/\\+$/, "")}\\${name}`;
          let suffix = 2;
          while (await pathExists(target)) {
            target = `${projectsDir.replace(/\\+$/, "")}\\${name} (${suffix})`;
            suffix++;
          }
          try {
            await moveFolder(p, target);
            finalPath = target;
          } catch (err) {
            toast(`Could not move "${name}" into projects folder: ${err}`);
          }
        }

        await ensureGitignore(finalPath, current.settings.autoGitignore);

        additions.push({
          id: crypto.randomUUID(),
          name,
          path: finalPath,
          presetId: type,
          favorite: false,
          archived: false,
          groupId: null,
          notes: "",
          createdAt: new Date().toISOString(),
        });
      }
      if (additions.length === 0) return;
      persist({ ...current, projects: [...current.projects, ...additions] });
      toast(`Imported ${additions.length} project${additions.length === 1 ? "" : "s"}`);
    },
    [persist, toast]
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload as { type: string; paths?: string[] };
        if (payload.type === "enter" || payload.type === "over") {
          setDragOver(true);
        } else if (payload.type === "drop") {
          setDragOver(false);
          if (payload.paths?.length) handleImportPaths(payload.paths);
        } else {
          setDragOver(false);
        }
      })
      .then((un) => {
        unlisten = un;
      });
    return () => unlisten?.();
  }, [handleImportPaths]);

  if (!data) {
    return (
      <>
        <TitleBar />
        <div className="app-loading">
          <span className="spinner" /> Loading CodeNest…
        </div>
      </>
    );
  }

  // ── Project actions ──────────────────────────────────────
  // These read/write dataRef.current (not the `data` closure) so that handlers
  // invoked back-to-back in the same tick (e.g. create → auto "open in IDE")
  // always operate on the latest state instead of clobbering each other.
  const markOpened = (p: Project) => {
    const current = dataRef.current!;
    persist({
      ...current,
      projects: current.projects.map((x) =>
        x.id === p.id ? { ...x, lastOpenedAt: new Date().toISOString() } : x
      ),
    });
  };

  const handleOpenIde = async (p: Project, ide?: IdeConfig) => {
    const current = dataRef.current!;
    const chosen =
      ide ??
      current.settings.ides.find((i) => i.id === (p.ideId ?? current.settings.defaultIdeId)) ??
      current.settings.ides[0];
    if (!chosen) {
      toast("No IDE configured — add one in Settings.");
      return;
    }
    try {
      await openInIde(chosen.path, chosen.id, p.path);
      markOpened(p);
    } catch (e: any) {
      toast(String(e));
    }
  };

  const handleRun = async (p: Project, config: RunConfig) => {
    const id = `run:${p.id}:${config.id}`;
    clearLines(id);
    setRunUrls((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    pushLine(id, `$ ${config.command}`, "info");
    try {
      setRunningMeta((m) => ({ ...m, [id]: { command: config.command, cwd: p.path } }));
      await spawnProcess(id, config.command, p.path);
      setRunning((r) => ({ ...r, [id]: true }));
      setDrawer({ open: true, active: id });
    } catch (e: any) {
      pushLine(id, String(e), "stderr");
      toast(String(e));
    }
  };

  const handleRunExternal = async (p: Project, config: RunConfig) => {
    try {
      await spawnProcess(
        `ext:${p.id}:${Date.now()}`,
        `start "CodeNest — ${p.name}" cmd /K "cd /d ${p.path} && ${config.command}"`,
        p.path
      );
    } catch (e: any) {
      toast(String(e));
    }
  };

  const handleStop = async (procId: string) => {
    try {
      const meta = runningMeta[procId];
      await killProcess(procId);
      if (meta && DOCKER_RE.test(meta.command)) {
        const downCmd = meta.command.replace(/(docker(?:-|\s+)compose)\s+up.*/i, "$1 down");
        spawnProcess(`stop:${Date.now()}`, downCmd, meta.cwd).catch(() => {});
      }
    } catch (e: any) {
      toast(String(e));
    }
  };

  const handleImport = async () => {
    const dirs = await open({ directory: true, multiple: true, title: "Select project folder(s)" });
    if (!dirs) return;
    const paths = Array.isArray(dirs) ? dirs : [dirs];
    await handleImportPaths(paths);
  };

  const handleRemove = (p: Project) => {
    const current = dataRef.current!;
    persist({ ...current, projects: current.projects.filter((x) => x.id !== p.id) });
    toast(`Removed “${p.name}” from the list (files stay on disk).`);
  };

  const handleToggleFavorite = (p: Project) => {
    const current = dataRef.current!;
    persist({
      ...current,
      projects: current.projects.map((x) => (x.id === p.id ? { ...x, favorite: !x.favorite } : x)),
    });
  };

  const handleArchive = (p: Project) => {
    const current = dataRef.current!;
    persist({
      ...current,
      projects: current.projects.map((x) => (x.id === p.id ? { ...x, archived: !x.archived } : x)),
    });
    toast(p.archived ? `Unarchived “${p.name}”` : `Archived “${p.name}”`);
  };

  const handleSaveProject = (p: Project) => {
    const current = dataRef.current!;
    persist({ ...current, projects: current.projects.map((x) => (x.id === p.id ? p : x)) });
    setEditing(null);
  };

  const updateProjectTodos = (projectId: string, fn: (todos: Project["todos"]) => Project["todos"]) => {
    const current = dataRef.current!;
    persist({
      ...current,
      projects: current.projects.map((x) =>
        x.id === projectId ? { ...x, todos: fn(x.todos ?? []) } : x
      ),
    });
  };

  const handleAddTodo = (projectId: string, text: string) => {
    updateProjectTodos(projectId, (todos) => [
      ...(todos ?? []),
      { id: crypto.randomUUID(), text, done: false, createdAt: new Date().toISOString() },
    ]);
  };

  const handleToggleTodo = (projectId: string, todoId: string) => {
    updateProjectTodos(projectId, (todos) =>
      (todos ?? []).map((t) => (t.id === todoId ? { ...t, done: !t.done } : t))
    );
  };

  const handleDeleteTodo = (projectId: string, todoId: string) => {
    updateProjectTodos(projectId, (todos) => (todos ?? []).filter((t) => t.id !== todoId));
  };

  const handleAddNote = (): Note => {
    const current = dataRef.current!;
    const now = new Date().toISOString();
    const note: Note = { id: crypto.randomUUID(), title: "Untitled note", body: "", projectIds: [], createdAt: now, updatedAt: now };
    persist({ ...current, notes: [note, ...current.notes] });
    return note;
  };

  const handleUpdateNote = (note: Note) => {
    const current = dataRef.current!;
    persist({
      ...current,
      notes: current.notes.map((n) => (n.id === note.id ? { ...note, updatedAt: new Date().toISOString() } : n)),
    });
  };

  const handleDeleteNote = (id: string) => {
    const current = dataRef.current!;
    persist({ ...current, notes: current.notes.filter((n) => n.id !== id) });
  };

  const handleSaveApiRequest = (request: ApiRequest) => {
    const current = dataRef.current!;
    const exists = current.apiRequests.some((r) => r.id === request.id);
    persist({
      ...current,
      apiRequests: exists
        ? current.apiRequests.map((r) => (r.id === request.id ? request : r))
        : [request, ...current.apiRequests],
    });
  };

  const handleDeleteApiRequest = (id: string) => {
    const current = dataRef.current!;
    persist({ ...current, apiRequests: current.apiRequests.filter((r) => r.id !== id) });
  };

  const handleDuplicateConfirm = async (name: string, location: string) => {
    if (!duplicating) return;
    setDuplicateBusy(true);
    setDuplicateError(null);
    try {
      const newPath = `${location.replace(/[\\/]+$/, "")}\\${name}`;
      if (await pathExists(newPath)) {
        throw new Error(`Target folder already exists: ${newPath}`);
      }
      await duplicateFolder(duplicating.path, newPath);
      const project: Project = {
        ...duplicating,
        id: crypto.randomUUID(),
        name,
        path: newPath,
        favorite: false,
        createdAt: new Date().toISOString(),
        lastOpenedAt: null,
      };
      const current = dataRef.current!;
      persist({ ...current, projects: [...current.projects, project] });
      toast(`Duplicated as “${name}”`);
      setDuplicating(null);
    } catch (e: any) {
      setDuplicateError(String(e?.message ?? e));
    } finally {
      setDuplicateBusy(false);
    }
  };

  const handleCheckDeps = async (p: Project) => {
    const id = `deps:${p.id}`;
    let command: string | null = null;
    if (await pathExists(`${p.path}\\package.json`)) command = "npm outdated";
    else if (await pathExists(`${p.path}\\Cargo.toml`)) command = "cargo update --dry-run";
    else if (await pathExists(`${p.path}\\requirements.txt`)) command = "pip list --outdated";
    else {
      const type = await detectProjectType(p.path);
      if (type === "dotnet") command = "dotnet list package --outdated";
    }
    if (!command) {
      toast("No supported dependency manifest found for this project.");
      return;
    }
    clearLines(id);
    pushLine(id, `$ ${command}`, "info");
    try {
      await spawnProcess(id, command, p.path);
      setRunning((r) => ({ ...r, [id]: true }));
      setDrawer({ open: true, active: id });
    } catch (e: any) {
      pushLine(id, String(e), "stderr");
      toast(String(e));
    }
  };

  const updateInstall = (id: string, patch: Partial<InstallJob>) => {
    setInstalls((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));
  };

  const dismissInstall = (id: string) => {
    setInstalls((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Runs project creation at the App level (not inside the wizard component)
  // so it keeps going — and stays visible as a card in the dashboard — even
  // if the user navigates away from the "New Project" view while it runs.
  const handleCreateProject = (cfg: {
    name: string;
    location: string;
    gitInit: boolean;
    openAfter: boolean;
    preset: Preset | null;
    customPreset: CustomPreset | null;
    groupId: string | null;
  }): string => {
    const selected = cfg.preset ?? cfg.customPreset!;
    const id = crypto.randomUUID();
    const procId = `new:${id}`;
    const loc = cfg.location.replace(/[\\/]+$/, "");
    const projectPath = `${loc}\\${cfg.name}`;

    setInstalls((prev) => ({
      ...prev,
      [id]: { id, procId, name: cfg.name, path: projectPath, presetId: selected.id, phase: "creating" },
    }));

    (async () => {
      try {
        if (await pathExists(projectPath)) {
          throw new Error(`Target folder already exists: ${projectPath}`);
        }
        await ensureDir(cfg.location);
        pushLine(procId, `Creating "${cfg.name}" (${selected.name}) in ${cfg.location}`, "info");

        if (cfg.customPreset) {
          pushLine(procId, "Generating files…", "info");
          await writeProjectFiles(projectPath, cfg.customPreset.files);
          for (const cmd of cfg.customPreset.setupCommands) {
            pushLine(procId, cmd, "info");
            const code = await runStep(procId, cmd, projectPath);
            if (code !== 0) {
              throw new Error(`Step failed with exit code ${code ?? "?"}`);
            }
          }
        } else if (cfg.preset) {
          const preset = cfg.preset;
          if (preset.builtin) {
            pushLine(procId, "Generating starter files…", "info");
            await scaffoldBuiltin(preset.builtin, projectPath, cfg.name);
          }
          for (const step of preset.steps(cfg.name)) {
            if (step.cwd === "project" && !(await pathExists(projectPath))) {
              throw new Error(
                `Expected "${projectPath}" to exist before this step but it doesn't — a previous step likely failed silently. Check the log above.`
              );
            }
            pushLine(procId, step.label, "info");
            const cwd = step.cwd === "parent" ? cfg.location : projectPath;
            const code = await runStep(procId, step.command, cwd);
            if (code !== 0) {
              throw new Error(`Step failed with exit code ${code ?? "?"}`);
            }
          }
          if (!preset.builtin && !(await pathExists(projectPath))) {
            throw new Error(
              "The scaffolding tool exited without errors but did not create the project folder. Check the log above for a warning it may have printed (e.g. a Node.js version mismatch)."
            );
          }
        }

        if (cfg.gitInit) {
          const git = await checkTool("git");
          if (git) {
            pushLine(procId, "Initializing git repository…", "info");
            await runStep(procId, "git init -b main", projectPath);
          } else {
            pushLine(procId, "Git not found — skipping repository init.", "stderr");
          }
        }

        await ensureGitignore(projectPath, dataRef.current!.settings.autoGitignore);

        const project: Project = {
          id: crypto.randomUUID(),
          name: cfg.name,
          path: projectPath,
          presetId: selected.id,
          favorite: false,
          archived: false,
          groupId: cfg.groupId,
          notes: "",
          todos: [],
          createdAt: new Date().toISOString(),
        };
        const current = dataRef.current!;
        persist({ ...current, projects: [...current.projects, project] });
        pushLine(procId, `Project "${cfg.name}" created successfully.`, "info");
        updateInstall(id, { phase: "done" });
        if (cfg.openAfter) handleOpenIde(project);
      } catch (e: any) {
        pushLine(procId, `${e?.message ?? e}`, "stderr");
        updateInstall(id, { phase: "error", error: String(e?.message ?? e) });
      }
    })();

    return id;
  };

  // Cloning a git repo is just another way to populate a project folder, so
  // it reuses the same install-job tracking as handleCreateProject (pending
  // dashboard card, resumable progress view, survives navigating away).
  const handleCloneRepo = (cfg: {
    url: string;
    name: string;
    location: string;
    groupId: string | null;
  }): string => {
    const id = crypto.randomUUID();
    const procId = `new:${id}`;
    const loc = cfg.location.replace(/[\\/]+$/, "");
    const projectPath = `${loc}\\${cfg.name}`;

    setInstalls((prev) => ({
      ...prev,
      [id]: { id, procId, name: cfg.name, path: projectPath, presetId: "imported", phase: "creating" },
    }));

    (async () => {
      try {
        if (await pathExists(projectPath)) {
          throw new Error(`Target folder already exists: ${projectPath}`);
        }
        await ensureDir(cfg.location);
        const git = await checkTool("git");
        if (!git) {
          throw new Error("Git not found on PATH — install it first, then try again.");
        }
        pushLine(procId, `Cloning ${cfg.url} into ${projectPath}`, "info");
        const code = await runStep(procId, `git clone "${cfg.url}" "${cfg.name}"`, cfg.location);
        if (code !== 0) {
          throw new Error(`git clone failed with exit code ${code ?? "?"}`);
        }
        if (!(await pathExists(projectPath))) {
          throw new Error("git clone reported success but the target folder wasn't created.");
        }

        await ensureGitignore(projectPath, dataRef.current!.settings.autoGitignore);

        const presetId = await detectProjectType(projectPath);
        const project: Project = {
          id: crypto.randomUUID(),
          name: cfg.name,
          path: projectPath,
          presetId,
          favorite: false,
          archived: false,
          groupId: cfg.groupId,
          notes: "",
          todos: [],
          createdAt: new Date().toISOString(),
        };
        const current = dataRef.current!;
        persist({ ...current, projects: [...current.projects, project] });
        pushLine(procId, `Cloned "${cfg.name}" successfully.`, "info");
        updateInstall(id, { phase: "done" });
      } catch (e: any) {
        pushLine(procId, `${e?.message ?? e}`, "stderr");
        updateInstall(id, { phase: "error", error: String(e?.message ?? e) });
      }
    })();

    return id;
  };

  const startDrawerResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    drawerResizing.current = true;
    const startY = e.clientY;
    const startHeight = drawerHeight;
    const onMove = (ev: MouseEvent) => {
      if (!drawerResizing.current) return;
      const delta = startY - ev.clientY;
      setDrawerHeight(Math.min(600, Math.max(140, startHeight + delta)));
    };
    const onUp = () => {
      drawerResizing.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleCloseTab = (id: string) => {
    clearLines(id);
    setRunUrls((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setProcStats((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRunningMeta((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setDrawer((d) => (d.active === id ? { ...d, active: null } : d));
  };

  const drawerProcs = Object.keys(lines).filter(
    (id) =>
      (id.startsWith("run:") || id.startsWith("deps:")) &&
      (running[id] || (lines[id]?.length ?? 0) > 0)
  );
  const activeProc =
    drawer.active && drawerProcs.includes(drawer.active) ? drawer.active : drawerProcs[0] ?? null;

  const procLabel = (procId: string) => {
    const parts = procId.split(":");
    const project = data.projects.find((p) => p.id === parts[1]);
    const projectName = project?.name ?? "process";
    if (parts[0] === "deps") return `${projectName} · dependencies`;
    const cfg = project
      ? resolveRunConfigs(project, data.customPresets).find((c) => c.id === parts[2])
      : null;
    return cfg ? `${projectName} · ${cfg.name}` : projectName;
  };

  const activeStats = activeProc ? procStats[activeProc] : null;
  const activeUrl = activeProc ? runUrls[activeProc] : null;

  return (
    <>
      <TitleBar />
      <div className="app">
      <aside className="sidebar">
        <nav>
          <button
            className={`nav-item ${view === "dashboard" ? "nav-active" : ""}`}
            onClick={() => setView("dashboard")}
          >
            <IconGrid size={16} /> Projects
          </button>
          <button
            className={`nav-item ${view === "new" ? "nav-active" : ""}`}
            onClick={() => setView("new")}
          >
            <IconPlus size={16} /> New Project
          </button>
          <button
            className={`nav-item ${view === "todos" ? "nav-active" : ""}`}
            onClick={() => setView("todos")}
          >
            <IconChecklist size={16} /> Todos
          </button>
          <button
            className={`nav-item ${view === "notes" ? "nav-active" : ""}`}
            onClick={() => setView("notes")}
          >
            <IconFileText size={16} /> Notes
          </button>
          <button
            className={`nav-item ${view === "api" ? "nav-active" : ""}`}
            onClick={() => setView("api")}
          >
            <IconSend size={16} /> API Tester
          </button>
          <button
            className={`nav-item ${view === "settings" ? "nav-active" : ""}`}
            onClick={() => setView("settings")}
          >
            <IconSettings size={16} /> Settings
          </button>
        </nav>
        <div className="sidebar-footer">v0.2.0</div>
      </aside>

      <main className="main">
      <div className="main-content">
        {view === "dashboard" && (
          <Dashboard
            data={data}
            running={running}
            procStats={procStats}
            runUrls={runUrls}
            showArchived={showArchived}
            installs={installs}
            onResumeInstall={(id) => {
              setResumeInstallId(id);
              setView("new");
            }}
            onToggleShowArchived={() => setShowArchived((s) => !s)}
            onNew={() => {
              setResumeInstallId(null);
              setView("new");
            }}
            onImport={handleImport}
            onCloneGit={() => setCloning(true)}
            onOpenIde={handleOpenIde}
            onRun={handleRun}
            onRunExternal={handleRunExternal}
            onStop={handleStop}
            onTerminal={(p) =>
              openTerminal(p.path, data.settings.terminalProfile).catch((e) => toast(String(e)))
            }
            onExplorer={(p) => openExplorer(p.path).catch((e) => toast(String(e)))}
            onOpenUrl={(url) => openWithDefault(url).catch(() => {})}
            onToggleFavorite={handleToggleFavorite}
            onEdit={setEditing}
            onArchive={handleArchive}
            onRemove={handleRemove}
            onDuplicate={(p) => {
              setDuplicating(p);
              setDuplicateError(null);
            }}
            onCheckDeps={handleCheckDeps}
            onShowConsole={(procId) => setDrawer({ open: true, active: procId })}
          />
        )}
        {view === "new" && (
          <NewProject
            data={data}
            lines={lines}
            installs={installs}
            resumeInstallId={resumeInstallId}
            onStartCreate={handleCreateProject}
            onDismissInstall={dismissInstall}
            onSaveCustomPreset={(cp) => {
              const current = dataRef.current!;
              persist({ ...current, customPresets: [...current.customPresets, cp] });
            }}
            onUpdateCustomPreset={(cp) => {
              const current = dataRef.current!;
              persist({
                ...current,
                customPresets: current.customPresets.map((x) => (x.id === cp.id ? cp : x)),
              });
            }}
            onDeleteCustomPreset={(id) => {
              const current = dataRef.current!;
              persist({ ...current, customPresets: current.customPresets.filter((x) => x.id !== id) });
            }}
            onOpenIde={handleOpenIde}
            onCancel={() => setView("dashboard")}
          />
        )}
        {view === "todos" && (
          <Todos
            data={data}
            onAdd={handleAddTodo}
            onToggle={handleToggleTodo}
            onDelete={handleDeleteTodo}
          />
        )}
        {view === "notes" && (
          <Notes
            data={data}
            onAddNote={handleAddNote}
            onUpdateNote={handleUpdateNote}
            onDeleteNote={handleDeleteNote}
          />
        )}
        {view === "api" && (
          <ApiTester
            data={data}
            onSave={handleSaveApiRequest}
            onDelete={handleDeleteApiRequest}
            toast={toast}
          />
        )}
        {view === "settings" && <Settings data={data} onChange={persist} toast={toast} />}
      </div>

        {view !== "new" && drawerProcs.length > 0 && (
          <div className={`drawer ${drawer.open ? "drawer-open" : ""}`}>
            {drawer.open && (
              <div className="drawer-resize-handle" onMouseDown={startDrawerResize} />
            )}
            <div className="drawer-header">
              <div className="drawer-tabs">
                {drawerProcs.map((id) => (
                  <div
                    key={id}
                    className={`drawer-tab ${activeProc === id ? "drawer-tab-active" : ""}`}
                    onClick={() => setDrawer({ open: true, active: id })}
                  >
                    <span className={`dot ${running[id] ? "dot-on" : "dot-off"}`} />
                    {procLabel(id)}
                    {!running[id] && (
                      <button
                        className="drawer-tab-close"
                        title="Close tab"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseTab(id);
                        }}
                      >
                        <IconX size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="drawer-actions">
                {activeStats && (
                  <span className="stat-pill">
                    {activeStats.cpu.toFixed(0)}% CPU · {activeStats.memory_mb.toFixed(0)} MB
                  </span>
                )}
                {activeUrl && (
                  <button className="btn btn-sm" onClick={() => openWithDefault(activeUrl)}>
                    <IconGlobe size={13} /> Open in Browser
                  </button>
                )}
                {activeProc && running[activeProc] && (
                  <button className="btn btn-danger btn-sm" onClick={() => handleStop(activeProc)}>
                    <IconSquare size={12} /> Stop
                  </button>
                )}
                <button
                  className="icon-btn"
                  title={drawer.open ? "Collapse" : "Expand"}
                  onClick={() => setDrawer((d) => ({ ...d, open: !d.open }))}
                >
                  {drawer.open ? <IconChevronDown size={16} /> : <IconChevronUp size={16} />}
                </button>
              </div>
            </div>
            {drawer.open && activeProc && (
              <div style={{ height: drawerHeight }}>
                <Console
                  lines={lines[activeProc] ?? []}
                  procId={activeProc}
                  running={running[activeProc]}
                />
              </div>
            )}
          </div>
        )}
      </main>

      {editing && (
        <ProjectSettingsModal
          data={data}
          project={editing}
          onSave={handleSaveProject}
          onChangeSettings={persist}
          onClose={() => setEditing(null)}
        />
      )}

      {duplicating && (
        <DuplicateModal
          project={duplicating}
          busy={duplicateBusy}
          error={duplicateError}
          onConfirm={handleDuplicateConfirm}
          onClose={() => !duplicateBusy && setDuplicating(null)}
        />
      )}

      {cloning && (
        <CloneGitModal
          data={data}
          onClose={() => setCloning(false)}
          onConfirm={(cfg) => {
            const id = handleCloneRepo(cfg);
            setCloning(false);
            setResumeInstallId(id);
            setView("new");
          }}
        />
      )}

      {dragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">
            <IconUpload size={28} />
            <span>Drop folder to import</span>
          </div>
        </div>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.msg}
          </div>
        ))}
      </div>
      </div>
    </>
  );
}
