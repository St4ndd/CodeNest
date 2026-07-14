import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ApiEndpoint, ApiHeader, ApiResponse, ExitPayload, HttpMethod, IdeConfig, ProcStats } from "./types";

export const spawnProcess = (id: string, command: string, cwd: string) =>
  invoke<void>("spawn_process", { id, command, cwd });

export const killProcess = (id: string) => invoke<void>("kill_process", { id });

export const sendInput = (id: string, text: string) =>
  invoke<void>("send_input", { id, text });

export const checkTool = (name: string) =>
  invoke<string | null>("check_tool", { name });

export const pathExists = (path: string) =>
  invoke<boolean>("path_exists", { path });

export const isDirectory = (path: string) =>
  invoke<boolean>("is_directory", { path });

export const readFile = (path: string) => invoke<string>("read_file", { path });

export const writeFile = (path: string, content: string) =>
  invoke<void>("write_file", { path, content });

export const writeProjectFiles = (
  dir: string,
  files: { path: string; content: string }[]
) => invoke<void>("write_project_files", { dir, files });

export const duplicateFolder = (src: string, dst: string) =>
  invoke<void>("duplicate_folder", { src, dst });

export const processStats = (id: string) =>
  invoke<ProcStats | null>("process_stats", { id });

export const detectIdes = () => invoke<IdeConfig[]>("detect_ides");

export const openInIde = (idePath: string, ideId: string, projectPath: string) =>
  invoke<void>("open_in_ide", { idePath, ideId, projectPath });

export const openExplorer = (path: string) =>
  invoke<void>("open_explorer", { path });

export const openTerminal = (path: string, profile: string) =>
  invoke<void>("open_terminal", { path, profile });

export const openWithDefault = (path: string) =>
  invoke<void>("open_with_default", { path });

export const scaffoldBuiltin = (kind: string, dir: string, name: string) =>
  invoke<void>("scaffold_builtin", { kind, dir, name });

export const detectProjectType = (path: string) =>
  invoke<string>("detect_project_type", { path });

export const httpRequest = (method: HttpMethod, url: string, headers: ApiHeader[], body: string) =>
  invoke<{
    status: number;
    status_text: string;
    headers: ApiHeader[];
    body: string;
    duration_ms: number;
    error: string | null;
  }>("http_request", { method, url, headers, body: body || null }).then(
    (r): ApiResponse => ({
      status: r.status,
      statusText: r.status_text,
      headers: r.headers,
      body: r.body,
      durationMs: r.duration_ms,
      error: r.error,
    })
  );

export const scanApiEndpoints = (path: string) =>
  invoke<{ endpoints: ApiEndpoint[]; guessed_port: number | null }>("scan_api_endpoints", { path });

export const checkPort = (host: string, port: number) =>
  invoke<boolean>("check_port", { host, port });

export const loadData = () => invoke<string | null>("load_data");

export const saveData = (json: string) => invoke<void>("save_data", { json });

export const defaultProjectsDir = () => invoke<string>("default_projects_dir");

export const getCloseToTray = () => invoke<boolean>("get_close_to_tray");

export const setCloseToTray = (value: boolean) =>
  invoke<void>("set_close_to_tray", { value });

/**
 * Spawns a shell command and resolves with its exit code once it finishes.
 * Output arrives via the global "proc-output" event under the given id.
 */
export function runStep(
  id: string,
  command: string,
  cwd: string
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let unlisten: (() => void) | null = null;
    listen<ExitPayload>("proc-exit", (e) => {
      if (e.payload.id === id) {
        unlisten?.();
        resolve(e.payload.code);
      }
    }).then((un) => {
      unlisten = un;
      spawnProcess(id, command, cwd).catch((err) => {
        unlisten?.();
        reject(err);
      });
    });
  });
}
