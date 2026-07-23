export interface RunConfig {
  id: string;
  name: string;
  command: string;
}

export interface Group {
  id: string;
  name: string;
  /** Parent group id for nested sub-groups; null/undefined for top-level. */
  parentId?: string | null;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  /** Projects this note is tagged with — a note doesn't have to belong to any project. */
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomPresetFile {
  path: string;
  content: string;
}

export interface CustomPreset {
  id: string;
  name: string;
  description: string;
  accent: string;
  glyph: string;
  requiresTool?: string | null;
  setupCommands: string[];
  files: CustomPresetFile[];
  runConfigs: RunConfig[];
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  presetId: string;
  /** Per-project IDE override; falls back to the global default. */
  ideId?: string | null;
  /** Per-project run configurations; falls back to the preset defaults when empty. */
  runConfigs?: RunConfig[];
  notes?: string;
  todos?: TodoItem[];
  archived?: boolean;
  groupId?: string | null;
  favorite: boolean;
  createdAt: string;
  lastOpenedAt?: string | null;
}

export interface IdeConfig {
  id: string;
  name: string;
  path: string;
  custom?: boolean;
}

export type TerminalProfile = "cmd" | "powershell" | "gitbash" | "wsl";

export type WindowPresetKey = "small" | "middle" | "big";

export interface WindowSize {
  width: number;
  height: number;
}

export type WindowPresets = Record<WindowPresetKey, WindowSize>;

export interface Settings {
  defaultIdeId: string | null;
  projectsDir: string;
  ides: IdeConfig[];
  groups: Group[];
  defaultGroupId: string | null;
  closeToTray: boolean;
  terminalProfile: TerminalProfile;
  /** When importing an existing folder, move it into `projectsDir` instead of leaving it in place. */
  moveImportedProjects: boolean;
  /** Create a .gitignore for new/imported projects that don't already have one. */
  autoGitignore: boolean;
  windowPresets: WindowPresets;
  activeWindowPreset: WindowPresetKey;
}

export interface ApiHeader {
  key: string;
  value: string;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: ApiHeader[];
  body: string;
  /** Optional link to a project, like notes — a request doesn't have to belong to one. */
  projectId?: string | null;
  createdAt: string;
}

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: ApiHeader[];
  body: string;
  durationMs: number;
  error?: string | null;
}

export interface ApiEndpoint {
  method: string;
  path: string;
  file: string;
}

export interface AppData {
  projects: Project[];
  settings: Settings;
  customPresets: CustomPreset[];
  notes: Note[];
  apiRequests: ApiRequest[];
}

export type StreamKind = "stdout" | "stderr" | "info";

export interface ConsoleLine {
  line: string;
  stream: StreamKind;
}

export interface OutputPayload {
  id: string;
  line: string;
  stream: string;
}

export interface ExitPayload {
  id: string;
  code: number | null;
}

export interface ProcStats {
  cpu: number;
  memory_mb: number;
}

export interface GitStatusInfo {
  has_git: boolean;
  branch: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
}

/** An in-flight (or just-finished) project creation, tracked at the App level
 * so it survives navigating away from the "New Project" wizard. */
export interface InstallJob {
  id: string;
  procId: string;
  name: string;
  path: string;
  presetId: string;
  phase: "creating" | "done" | "error";
  error?: string;
}
