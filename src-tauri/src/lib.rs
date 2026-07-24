use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use sysinfo::{Pid, System};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// A tracked running child process: its OS pid (for kill/stats) plus its
/// stdin pipe, kept open so the frontend can answer interactive prompts.
struct ProcHandle {
    pid: u32,
    stdin: Option<std::process::ChildStdin>,
}

/// Tracks running child processes by frontend-assigned id.
#[derive(Default)]
struct ProcessState(Mutex<HashMap<String, ProcHandle>>);

/// Shared sysinfo handle so repeated cpu_usage() calls compute correct deltas.
struct SysState(Mutex<System>);

struct CloseToTray(Mutex<bool>);
impl Default for CloseToTray {
    fn default() -> Self {
        CloseToTray(Mutex::new(true))
    }
}

#[derive(Serialize, Clone)]
struct OutputPayload {
    id: String,
    line: String,
    stream: String,
}

#[derive(Serialize, Clone)]
struct ExitPayload {
    id: String,
    code: Option<i32>,
}

#[derive(Serialize, Clone)]
struct IdeInfo {
    id: String,
    name: String,
    path: String,
}

#[derive(Serialize, Clone)]
struct ProcStats {
    cpu: f32,
    memory_mb: f64,
}

#[derive(serde::Deserialize)]
struct FileEntry {
    path: String,
    content: String,
}

fn hide_window(cmd: &mut Command) {
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
}

/// Builds a `cmd /C <command>` invocation so batch files (npm, npx, ng, …) work.
fn shell_command(command: &str, cwd: Option<&Path>) -> Command {
    let mut cmd = Command::new("cmd");
    #[cfg(windows)]
    cmd.raw_arg(format!("/C {command}"));
    #[cfg(not(windows))]
    cmd.args(["/C", command]);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    hide_window(&mut cmd);
    cmd
}

fn which(name: &str) -> Option<String> {
    let mut cmd = Command::new("where.exe");
    cmd.arg(name);
    hide_window(&mut cmd);
    let out = cmd.output().ok()?;
    if out.status.success() {
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .next()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
    } else {
        None
    }
}

fn stream_lines<R: Read + Send + 'static>(
    app: AppHandle,
    id: String,
    stream: R,
    kind: &'static str,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut reader = BufReader::new(stream);
        let mut buf: Vec<u8> = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) => break,
                Ok(_) => {
                    let text = String::from_utf8_lossy(&buf);
                    // Progress indicators use \r; treat each segment as its own line.
                    for piece in text.split('\r') {
                        let line = piece.trim_end_matches('\n').trim_end();
                        if !line.is_empty() {
                            let _ = app.emit(
                                "proc-output",
                                OutputPayload {
                                    id: id.clone(),
                                    line: line.to_string(),
                                    stream: kind.to_string(),
                                },
                            );
                        }
                    }
                }
                Err(_) => break,
            }
        }
    })
}

#[tauri::command]
fn spawn_process(
    app: AppHandle,
    state: State<'_, ProcessState>,
    id: String,
    command: String,
    cwd: String,
) -> Result<(), String> {
    let mut cmd = shell_command(&command, Some(Path::new(&cwd)));
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start process: {e}"))?;
    let pid = child.id();
    let stdin = child.stdin.take();
    state.0.lock().unwrap().insert(id.clone(), ProcHandle { pid, stdin });

    let mut readers = Vec::new();
    if let Some(out) = child.stdout.take() {
        readers.push(stream_lines(app.clone(), id.clone(), out, "stdout"));
    }
    if let Some(err) = child.stderr.take() {
        readers.push(stream_lines(app.clone(), id.clone(), err, "stderr"));
    }

    std::thread::spawn(move || {
        let code = child.wait().ok().and_then(|s| s.code());
        for r in readers {
            let _ = r.join();
        }
        let proc_state = app.state::<ProcessState>();
        proc_state.0.lock().unwrap().remove(&id);
        let _ = app.emit("proc-exit", ExitPayload { id, code });
    });
    Ok(())
}

#[tauri::command]
fn kill_process(state: State<'_, ProcessState>, id: String) -> Result<(), String> {
    let pid = state.0.lock().unwrap().get(&id).map(|h| h.pid);
    if let Some(pid) = pid {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"]);
        hide_window(&mut cmd);
        cmd.output().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Writes a line of text (e.g. an answer to an interactive "(Y/n)" prompt)
/// to a running process's stdin.
#[tauri::command]
fn send_input(state: State<'_, ProcessState>, id: String, text: String) -> Result<(), String> {
    use std::io::Write;
    let mut map = state.0.lock().unwrap();
    let handle = map.get_mut(&id).ok_or("Process not found")?;
    let stdin = handle.stdin.as_mut().ok_or("Process has no stdin")?;
    stdin.write_all(text.as_bytes()).map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn check_tool(name: String) -> Option<String> {
    which(&name)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Creates a directory (and any missing parents) if it doesn't exist yet.
/// Used for the default projects folder, which is just a computed path
/// (`Documents\CodeNest\Projects`) until something actually needs it to exist.
#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn is_directory(path: String) -> bool {
    Path::new(&path).is_dir()
}

#[derive(Serialize, Clone)]
struct GitStatus {
    has_git: bool,
    branch: Option<String>,
    dirty: bool,
    ahead: u32,
    behind: u32,
}

fn run_git(dir: &Path, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new("git");
    cmd.args(args).current_dir(dir);
    hide_window(&mut cmd);
    let out = cmd.output().ok()?;
    if out.status.success() {
        Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        None
    }
}

/// Reports whether `path` is a git repo and, if so, its current branch,
/// whether it has uncommitted changes, and how far it's diverged from its
/// upstream (0/0 when there's no upstream configured).
#[tauri::command]
fn git_status(path: String) -> GitStatus {
    let dir = Path::new(&path);
    if !dir.join(".git").exists() {
        return GitStatus {
            has_git: false,
            branch: None,
            dirty: false,
            ahead: 0,
            behind: 0,
        };
    }

    let branch = run_git(dir, &["symbolic-ref", "--short", "-q", "HEAD"])
        .filter(|s| !s.is_empty())
        .or_else(|| run_git(dir, &["rev-parse", "--short", "HEAD"]).map(|s| format!("({s})")));

    let dirty = run_git(dir, &["status", "--porcelain"])
        .map(|s| !s.is_empty())
        .unwrap_or(false);

    let (ahead, behind) = run_git(dir, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])
        .and_then(|s| {
            let mut parts = s.split_whitespace();
            let ahead = parts.next()?.parse().ok()?;
            let behind = parts.next()?.parse().ok()?;
            Some((ahead, behind))
        })
        .unwrap_or((0, 0));

    GitStatus {
        has_git: true,
        branch,
        dirty,
        ahead,
        behind,
    }
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

/// Writes a set of relative file entries into `dir`, creating parent folders
/// as needed. Rejects paths that try to escape the target directory.
#[tauri::command]
fn write_project_files(dir: String, files: Vec<FileEntry>) -> Result<(), String> {
    let root = PathBuf::from(&dir);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    for f in files {
        if f.path.contains("..") || Path::new(&f.path).is_absolute() {
            return Err(format!("Invalid file path: {}", f.path));
        }
        let target = root.join(&f.path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, &f.content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

const HEAVY_DIRS: [&str; 8] = [
    "node_modules",
    ".git",
    "bin",
    "obj",
    "dist",
    "target",
    ".venv",
    "__pycache__",
];

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let name = entry.file_name();
        let name_lossy = name.to_string_lossy();
        if entry.path().is_dir() && HEAVY_DIRS.iter().any(|h| h.eq_ignore_ascii_case(&name_lossy)) {
            continue;
        }
        let dst_path = dst.join(&name);
        if entry.path().is_dir() {
            copy_dir_recursive(&entry.path(), &dst_path)?;
        } else {
            fs::copy(entry.path(), dst_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn duplicate_folder(src: String, dst: String) -> Result<(), String> {
    let src = Path::new(&src);
    let dst = Path::new(&dst);
    if dst.exists() {
        return Err(format!("Target folder already exists: {}", dst.display()));
    }
    copy_dir_recursive(src, dst).map_err(|e| e.to_string())
}

/// Moves a folder, used when importing a project into the default projects
/// folder. Tries a plain rename first (instant, same-volume); falls back to a
/// full recursive copy (nothing skipped, unlike `duplicate_folder`) + delete
/// of the source for cross-volume moves, since `fs::rename` can't cross drives.
#[tauri::command]
fn move_folder(src: String, dst: String) -> Result<(), String> {
    let src = Path::new(&src);
    let dst = Path::new(&dst);
    if dst.exists() {
        return Err(format!("Target folder already exists: {}", dst.display()));
    }
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if fs::rename(src, dst).is_ok() {
        return Ok(());
    }
    copy_dir_all(src, dst).map_err(|e| e.to_string())?;
    fs::remove_dir_all(src).map_err(|e| e.to_string())
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let dst_path = dst.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_all(&entry.path(), &dst_path)?;
        } else {
            fs::copy(entry.path(), &dst_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn process_stats(state: State<'_, ProcessState>, sys: State<'_, SysState>, id: String) -> Option<ProcStats> {
    let root_pid = state.0.lock().unwrap().get(&id).map(|h| h.pid)?;
    let mut sys = sys.0.lock().unwrap();
    // The tracked pid is the `cmd /C ...` wrapper, which just waits idle — the
    // actual dev server (node, ng, vite, …) runs as a descendant process with
    // its own pid. Refresh everything and sum cpu/memory across the whole
    // process tree rooted at the tracked pid, not just that single process.
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let root = Pid::from_u32(root_pid);
    sys.process(root)?;

    let mut tree = vec![root];
    let mut frontier = vec![root];
    while let Some(parent) = frontier.pop() {
        for (pid, proc) in sys.processes() {
            if proc.parent() == Some(parent) && !tree.contains(pid) {
                tree.push(*pid);
                frontier.push(*pid);
            }
        }
    }

    let mut cpu = 0f32;
    let mut memory = 0u64;
    for pid in &tree {
        if let Some(proc) = sys.process(*pid) {
            cpu += proc.cpu_usage();
            memory += proc.memory();
        }
    }
    Some(ProcStats {
        cpu,
        memory_mb: memory as f64 / 1_048_576.0,
    })
}

fn add_if_exists(list: &mut Vec<IdeInfo>, id: &str, name: &str, path: PathBuf) {
    if list.iter().any(|i| i.id == id) {
        return;
    }
    if path.is_file() {
        list.push(IdeInfo {
            id: id.to_string(),
            name: name.to_string(),
            path: path.to_string_lossy().to_string(),
        });
    }
}

#[tauri::command]
fn detect_ides() -> Vec<IdeInfo> {
    let mut ides: Vec<IdeInfo> = Vec::new();
    let local = std::env::var("LOCALAPPDATA").ok().map(PathBuf::from);
    let pf = std::env::var("ProgramFiles")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("C:\\Program Files"));
    let pf86 = std::env::var("ProgramFiles(x86)")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("C:\\Program Files (x86)"));

    if let Some(local) = &local {
        add_if_exists(
            &mut ides,
            "vscode",
            "Visual Studio Code",
            local.join("Programs\\Microsoft VS Code\\Code.exe"),
        );
        add_if_exists(
            &mut ides,
            "vscode-insiders",
            "VS Code Insiders",
            local.join("Programs\\Microsoft VS Code Insiders\\Code - Insiders.exe"),
        );
        add_if_exists(
            &mut ides,
            "vscodium",
            "VSCodium",
            local.join("Programs\\VSCodium\\VSCodium.exe"),
        );
        add_if_exists(
            &mut ides,
            "cursor",
            "Cursor",
            local.join("Programs\\cursor\\Cursor.exe"),
        );
        add_if_exists(
            &mut ides,
            "windsurf",
            "Windsurf",
            local.join("Programs\\Windsurf\\Windsurf.exe"),
        );
        add_if_exists(&mut ides, "zed", "Zed", local.join("Zed\\zed.exe"));
    }
    add_if_exists(
        &mut ides,
        "vscode",
        "Visual Studio Code",
        pf.join("Microsoft VS Code\\Code.exe"),
    );

    for edition in ["Enterprise", "Professional", "Community"] {
        add_if_exists(
            &mut ides,
            "visual-studio-2022",
            &format!("Visual Studio 2022 {edition}"),
            pf.join(format!(
                "Microsoft Visual Studio\\2022\\{edition}\\Common7\\IDE\\devenv.exe"
            )),
        );
        add_if_exists(
            &mut ides,
            "visual-studio-2019",
            &format!("Visual Studio 2019 {edition}"),
            pf86.join(format!(
                "Microsoft Visual Studio\\2019\\{edition}\\Common7\\IDE\\devenv.exe"
            )),
        );
    }

    let jetbrains: [(&str, &str, &str); 9] = [
        ("rider", "JetBrains Rider", "rider64.exe"),
        ("intellij", "IntelliJ IDEA", "idea64.exe"),
        ("pycharm", "PyCharm", "pycharm64.exe"),
        ("webstorm", "WebStorm", "webstorm64.exe"),
        ("phpstorm", "PhpStorm", "phpstorm64.exe"),
        ("clion", "CLion", "clion64.exe"),
        ("goland", "GoLand", "goland64.exe"),
        ("rubymine", "RubyMine", "rubymine64.exe"),
        ("datagrip", "DataGrip", "datagrip64.exe"),
    ];
    let mut jb_dirs = vec![pf.join("JetBrains")];
    if let Some(local) = &local {
        jb_dirs.push(local.join("Programs"));
    }
    for dir in jb_dirs {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let dir_name = entry.file_name().to_string_lossy().to_lowercase();
            for (id, name, exe) in jetbrains.iter() {
                if dir_name.contains(id) || dir_name.contains(&name.to_lowercase()) {
                    add_if_exists(&mut ides, id, name, entry.path().join("bin").join(exe));
                }
            }
        }
    }

    add_if_exists(
        &mut ides,
        "notepadpp",
        "Notepad++",
        pf.join("Notepad++\\notepad++.exe"),
    );
    add_if_exists(
        &mut ides,
        "notepadpp",
        "Notepad++",
        pf86.join("Notepad++\\notepad++.exe"),
    );
    add_if_exists(
        &mut ides,
        "sublime",
        "Sublime Text",
        pf.join("Sublime Text\\sublime_text.exe"),
    );
    add_if_exists(
        &mut ides,
        "sublime",
        "Sublime Text",
        pf.join("Sublime Text 3\\sublime_text.exe"),
    );
    add_if_exists(
        &mut ides,
        "android-studio",
        "Android Studio",
        pf.join("Android\\Android Studio\\bin\\studio64.exe"),
    );

    // Fallback: VS Code via PATH (e.g. portable installs)
    if !ides.iter().any(|i| i.id == "vscode") {
        if let Some(p) = which("code.cmd").or_else(|| which("code")) {
            ides.push(IdeInfo {
                id: "vscode".into(),
                name: "Visual Studio Code".into(),
                path: p,
            });
        }
    }

    ides
}

fn find_openable_solution(project: &str) -> Option<String> {
    fn scan(dir: &Path, ext_wanted: &str) -> Option<String> {
        for e in fs::read_dir(dir).ok()?.flatten() {
            let p = e.path();
            if p.extension()
                .map_or(false, |x| x.eq_ignore_ascii_case(ext_wanted))
            {
                return Some(p.to_string_lossy().to_string());
            }
        }
        None
    }
    let root = Path::new(project);
    for ext in ["sln", "csproj"] {
        if let Some(s) = scan(root, ext) {
            return Some(s);
        }
        if let Ok(entries) = fs::read_dir(root) {
            for e in entries.flatten() {
                if e.path().is_dir() {
                    if let Some(s) = scan(&e.path(), ext) {
                        return Some(s);
                    }
                }
            }
        }
    }
    None
}

/// VS Code and its forks are Electron apps: launching the .exe directly with
/// a folder path is unreliable once another window of the same app is
/// already running (it can exit with a failure code instead of opening the
/// folder). Their installers also ship a `bin\<name>.cmd` CLI shim that
/// talks to the running instance properly — prefer that when it exists.
fn cli_shim_for(ide_id: &str, ide_path: &Path) -> Option<PathBuf> {
    let cli_name = match ide_id {
        "vscode" => "code.cmd",
        "vscode-insiders" => "code-insiders.cmd",
        "vscodium" => "codium.cmd",
        "cursor" => "cursor.cmd",
        "windsurf" => "windsurf.cmd",
        _ => return None,
    };
    let dir = ide_path.parent()?;
    let candidate = dir.join("bin").join(cli_name);
    candidate.is_file().then_some(candidate)
}

#[tauri::command]
fn open_in_ide(ide_path: String, ide_id: String, project_path: String) -> Result<(), String> {
    let mut target = project_path.clone();
    // Visual Studio works project/solution based, not folder based.
    if ide_id.starts_with("visual-studio") {
        if let Some(sln) = find_openable_solution(&project_path) {
            target = sln;
        }
    }
    let effective_path = cli_shim_for(&ide_id, Path::new(&ide_path))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| ide_path.clone());
    let lower = effective_path.to_lowercase();
    let mut cmd = if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        let mut c = Command::new("cmd");
        #[cfg(windows)]
        c.raw_arg(format!("/C \"\"{effective_path}\" \"{target}\"\""));
        c
    } else {
        let mut c = Command::new(&effective_path);
        c.arg(&target);
        c
    };
    hide_window(&mut cmd);
    cmd.spawn().map_err(|e| format!("Could not launch IDE: {e}"))?;
    Ok(())
}

#[tauri::command]
fn open_explorer(path: String) -> Result<(), String> {
    let mut cmd = Command::new("explorer");
    cmd.arg(&path);
    hide_window(&mut cmd);
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

fn git_bash_path() -> Option<String> {
    if let Some(p) = which("git-bash.exe") {
        return Some(p);
    }
    let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
    let candidate = PathBuf::from(pf).join("Git\\git-bash.exe");
    candidate.is_file().then(|| candidate.to_string_lossy().to_string())
}

#[tauri::command]
fn open_terminal(path: String, profile: String) -> Result<(), String> {
    match profile.as_str() {
        "powershell" => {
            if let Some(wt) = which("wt") {
                let mut cmd = Command::new(wt);
                cmd.args(["-d", &path, "powershell"]);
                hide_window(&mut cmd);
                if cmd.spawn().is_ok() {
                    return Ok(());
                }
            }
            let mut cmd = Command::new("powershell");
            cmd.args(["-NoExit", "-Command", &format!("Set-Location '{path}'")]);
            hide_window(&mut cmd);
            cmd.spawn().map_err(|e| e.to_string())?;
        }
        "gitbash" => {
            let bash = git_bash_path().ok_or("Git Bash not found")?;
            let mut cmd = Command::new(bash);
            cmd.arg(format!("--cd={path}"));
            hide_window(&mut cmd);
            cmd.spawn().map_err(|e| e.to_string())?;
        }
        "wsl" => {
            if let Some(wt) = which("wt") {
                let mut cmd = Command::new(wt);
                cmd.args(["-d", &path, "wsl"]);
                hide_window(&mut cmd);
                if cmd.spawn().is_ok() {
                    return Ok(());
                }
            }
            let mut cmd = Command::new("wsl.exe");
            cmd.args(["--cd", &path]);
            hide_window(&mut cmd);
            cmd.spawn().map_err(|e| e.to_string())?;
        }
        _ => {
            if let Some(wt) = which("wt") {
                let mut cmd = Command::new(wt);
                cmd.args(["-d", &path]);
                hide_window(&mut cmd);
                if cmd.spawn().is_ok() {
                    return Ok(());
                }
            }
            let mut cmd = Command::new("cmd");
            #[cfg(windows)]
            cmd.raw_arg(format!("/C start \"CodeNest\" cmd /K \"cd /d {path}\""));
            hide_window(&mut cmd);
            cmd.spawn().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn open_with_default(path: String) -> Result<(), String> {
    let mut cmd = Command::new("cmd");
    #[cfg(windows)]
    cmd.raw_arg(format!("/C start \"\" \"{path}\""));
    hide_window(&mut cmd);
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn scaffold_builtin(kind: String, dir: String, name: String) -> Result<(), String> {
    let root = PathBuf::from(&dir);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let write = |file: &str, content: String| -> Result<(), String> {
        fs::write(root.join(file), content).map_err(|e| e.to_string())
    };
    match kind.as_str() {
        "static-html" => {
            write(
                "index.html",
                format!(
                    r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{name}</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>{name}</h1>
    <p>Your new project is ready.</p>
  </main>
  <script src="script.js"></script>
</body>
</html>
"#
                ),
            )?;
            write(
                "style.css",
                String::from(
                    ":root { font-family: system-ui, sans-serif; }\nbody { margin: 0; display: grid; place-items: center; min-height: 100vh; background: #10131a; color: #e8ecf4; }\nmain { text-align: center; }\n",
                ),
            )?;
            write(
                "script.js",
                format!("console.log('{name} is running');\n"),
            )?;
        }
        "empty" => {
            write("README.md", format!("# {name}\n\nCreated with CodeNest.\n"))?;
            write(
                ".gitignore",
                String::from("node_modules/\ndist/\nbin/\nobj/\n.env\n.DS_Store\nThumbs.db\n"),
            )?;
        }
        "webext-chromium" | "webext-firefox" => {
            let firefox = kind == "webext-firefox";
            let manifest = if firefox {
                format!(
                    r#"{{
  "manifest_version": 3,
  "name": "{name}",
  "version": "1.0.0",
  "description": "A browser extension.",
  "browser_specific_settings": {{
    "gecko": {{ "id": "{name}@example.com" }}
  }},
  "action": {{
    "default_popup": "popup.html",
    "default_title": "{name}"
  }},
  "background": {{
    "scripts": ["background.js"]
  }},
  "permissions": []
}}
"#
                )
            } else {
                format!(
                    r#"{{
  "manifest_version": 3,
  "name": "{name}",
  "version": "1.0.0",
  "description": "A browser extension.",
  "action": {{
    "default_popup": "popup.html",
    "default_title": "{name}"
  }},
  "background": {{
    "service_worker": "background.js"
  }},
  "permissions": []
}}
"#
                )
            };
            write("manifest.json", manifest)?;
            write(
                "popup.html",
                format!(
                    r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body {{ font-family: system-ui, sans-serif; width: 220px; padding: 12px; }}
    h1 {{ font-size: 14px; margin: 0 0 8px; }}
  </style>
</head>
<body>
  <h1>{name}</h1>
  <button id="go">Click me</button>
  <script src="popup.js"></script>
</body>
</html>
"#
                ),
            )?;
            write(
                "popup.js",
                String::from(
                    "document.getElementById('go').addEventListener('click', () => {\n  console.log('Popup button clicked');\n});\n",
                ),
            )?;
            write(
                "background.js",
                format!("console.log('{name} background script loaded');\n"),
            )?;
            let load_instructions = if firefox {
                "about:debugging#/runtime/this-firefox → Load Temporary Add-on… → select manifest.json"
            } else {
                "edge://extensions (or opera://extensions) → enable Developer mode → Load unpacked → select this folder"
            };
            write(
                "README.md",
                format!(
                    "# {name}\n\nBrowser extension scaffolded with CodeNest.\n\nLoad it unpacked:\n\n1. Open {load_instructions}\n2. Point it at this project folder.\n\nEdit `manifest.json`, `background.js` and `popup.html`/`popup.js` to build your extension.\n"
                ),
            )?;
            write(
                ".gitignore",
                String::from("node_modules/\ndist/\n.DS_Store\nThumbs.db\n"),
            )?;
        }
        "discord-bot-js" => {
            write(
                "package.json",
                format!(
                    r#"{{
  "name": "{name}",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "index.js",
  "scripts": {{ "start": "node index.js" }},
  "dependencies": {{
    "discord.js": "^14.14.1",
    "dotenv": "^16.4.5"
  }}
}}
"#
                ),
            )?;
            write(
                "index.js",
                String::from(
                    r#"require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.on(Events.MessageCreate, (message) => {
  if (message.author.bot) return;
  if (message.content === '!ping') {
    message.reply('Pong!');
  }
});

client.login(process.env.DISCORD_TOKEN);
"#,
                ),
            )?;
            write(
                ".env.example",
                String::from("DISCORD_TOKEN=your-bot-token-here\n"),
            )?;
            write(
                "README.md",
                format!("# {name}\n\nDiscord bot built with discord.js.\n\n1. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` (from the Discord Developer Portal).\n2. `npm install`\n3. `npm start`\n\nSay `!ping` in a server the bot is in to test it.\n"),
            )?;
            write(".gitignore", String::from("node_modules/\n.env\n"))?;
        }
        "discord-bot-py" => {
            write(
                "requirements.txt",
                String::from("discord.py>=2.3.2\npython-dotenv>=1.0.1\n"),
            )?;
            write(
                "bot.py",
                String::from(
                    r#"import os
import discord
from discord.ext import commands
from dotenv import load_dotenv

load_dotenv()

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user}")


@bot.command()
async def ping(ctx):
    await ctx.send("Pong!")


bot.run(os.environ["DISCORD_TOKEN"])
"#,
                ),
            )?;
            write(
                ".env.example",
                String::from("DISCORD_TOKEN=your-bot-token-here\n"),
            )?;
            write(
                "README.md",
                format!("# {name}\n\nDiscord bot built with discord.py.\n\n1. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`.\n2. `pip install -r requirements.txt`\n3. `python bot.py`\n\nSay `!ping` in a server the bot is in to test it.\n"),
            )?;
            write(
                ".gitignore",
                String::from(".venv/\n__pycache__/\n.env\n"),
            )?;
        }
        "telegram-bot-js" => {
            write(
                "package.json",
                format!(
                    r#"{{
  "name": "{name}",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "index.js",
  "scripts": {{ "start": "node index.js" }},
  "dependencies": {{
    "telegraf": "^4.16.3",
    "dotenv": "^16.4.5"
  }}
}}
"#
                ),
            )?;
            write(
                "index.js",
                String::from(
                    r#"require('dotenv').config();
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => ctx.reply('Welcome!'));
bot.command('ping', (ctx) => ctx.reply('Pong!'));

bot.launch();
console.log('Bot is running…');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
"#,
                ),
            )?;
            write(
                ".env.example",
                String::from("BOT_TOKEN=your-bot-token-here\n"),
            )?;
            write(
                "README.md",
                format!("# {name}\n\nTelegram bot built with Telegraf.\n\n1. Copy `.env.example` to `.env` and fill in `BOT_TOKEN` (from @BotFather).\n2. `npm install`\n3. `npm start`\n\nSend `/ping` to the bot to test it.\n"),
            )?;
            write(".gitignore", String::from("node_modules/\n.env\n"))?;
        }
        "slack-bot-js" => {
            write(
                "package.json",
                format!(
                    r#"{{
  "name": "{name}",
  "version": "1.0.0",
  "type": "commonjs",
  "main": "app.js",
  "scripts": {{ "start": "node app.js" }},
  "dependencies": {{
    "@slack/bolt": "^3.19.0",
    "dotenv": "^16.4.5"
  }}
}}
"#
                ),
            )?;
            write(
                "app.js",
                String::from(
                    r#"require('dotenv').config();
const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
});

app.message('ping', async ({ message, say }) => {
  await say(`Pong <@${message.user}>!`);
});

(async () => {
  await app.start();
  console.log('Slack app is running…');
})();
"#,
                ),
            )?;
            write(
                ".env.example",
                String::from(
                    "SLACK_BOT_TOKEN=xoxb-...\nSLACK_APP_TOKEN=xapp-...\nSLACK_SIGNING_SECRET=...\n",
                ),
            )?;
            write(
                "README.md",
                format!("# {name}\n\nSlack app built with Bolt (Socket Mode — no public URL needed).\n\n1. Create an app at https://api.slack.com/apps, enable Socket Mode and Event Subscriptions (message.im/message.channels).\n2. Copy `.env.example` to `.env` and fill in the tokens.\n3. `npm install`\n4. `npm start`\n\nSay \"ping\" in a channel the bot is in to test it.\n"),
            )?;
            write(".gitignore", String::from("node_modules/\n.env\n"))?;
        }
        "express-api-ts" => {
            write(
                "package.json",
                format!(
                    r#"{{
  "name": "{name}",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {{
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }},
  "dependencies": {{
    "express": "^4.19.2",
    "dotenv": "^16.4.5"
  }},
  "devDependencies": {{
    "typescript": "^5.5.4",
    "ts-node-dev": "^2.0.0",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0"
  }}
}}
"#
                ),
            )?;
            write(
                "tsconfig.json",
                String::from(
                    r#"{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
"#,
                ),
            )?;
            write(
                "src/index.ts",
                String::from(
                    r#"import express from 'express';
import 'dotenv/config';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
"#,
                ),
            )?;
            write(".env.example", String::from("PORT=3000\n"))?;
            write(
                "README.md",
                format!("# {name}\n\nExpress + TypeScript REST API.\n\n`npm install` then `npm run dev`. GET `/health` to check it's alive.\n"),
            )?;
            write(
                ".gitignore",
                String::from("node_modules/\ndist/\n.env\n"),
            )?;
        }
        "fastapi-py" => {
            write(
                "requirements.txt",
                String::from("fastapi>=0.111.0\nuvicorn[standard]>=0.30.0\n"),
            )?;
            write(
                "main.py",
                String::from(
                    r#"from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def health():
    return {"ok": True}
"#,
                ),
            )?;
            write(
                "README.md",
                format!("# {name}\n\nFastAPI backend.\n\n1. `pip install -r requirements.txt`\n2. `uvicorn main:app --reload`\n3. Open http://127.0.0.1:8000/docs for the interactive API docs.\n"),
            )?;
            write(
                ".gitignore",
                String::from(".venv/\n__pycache__/\n.env\n"),
            )?;
        }
        "flask-py" => {
            write("requirements.txt", String::from("Flask>=3.0.3\n"))?;
            write(
                "app.py",
                String::from(
                    r#"from flask import Flask, jsonify

app = Flask(__name__)


@app.get("/health")
def health():
    return jsonify(ok=True)


if __name__ == "__main__":
    app.run(debug=True)
"#,
                ),
            )?;
            write(
                "README.md",
                format!("# {name}\n\nFlask backend.\n\n1. `pip install -r requirements.txt`\n2. `python app.py`\n3. GET http://127.0.0.1:5000/health to check it's alive.\n"),
            )?;
            write(
                ".gitignore",
                String::from(".venv/\n__pycache__/\n.env\n"),
            )?;
        }
        "graphql-api-ts" => {
            write(
                "package.json",
                format!(
                    r#"{{
  "name": "{name}",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {{
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }},
  "dependencies": {{
    "@apollo/server": "^4.10.4",
    "graphql": "^16.9.0"
  }},
  "devDependencies": {{
    "typescript": "^5.5.4",
    "ts-node-dev": "^2.0.0",
    "@types/node": "^20.14.0"
  }}
}}
"#
                ),
            )?;
            write(
                "tsconfig.json",
                String::from(
                    r#"{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
"#,
                ),
            )?;
            write(
                "src/index.ts",
                String::from(
                    r#"import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

const typeDefs = `#graphql
  type Query {
    hello: String
  }
`;

const resolvers = {
  Query: {
    hello: () => 'Hello from Apollo!',
  },
};

const server = new ApolloServer({ typeDefs, resolvers });

startStandaloneServer(server, {
  listen: { port: 4000 },
}).then(({ url }) => {
  console.log(`GraphQL server ready at ${url}`);
});
"#,
                ),
            )?;
            write(
                "README.md",
                format!("# {name}\n\nGraphQL API with Apollo Server.\n\n`npm install` then `npm run dev`. Opens a playground at http://localhost:4000.\n"),
            )?;
            write(
                ".gitignore",
                String::from("node_modules/\ndist/\n.env\n"),
            )?;
        }
        "socketio-server-ts" => {
            write(
                "package.json",
                format!(
                    r#"{{
  "name": "{name}",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {{
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }},
  "dependencies": {{
    "express": "^4.19.2",
    "socket.io": "^4.7.5"
  }},
  "devDependencies": {{
    "typescript": "^5.5.4",
    "ts-node-dev": "^2.0.0",
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0"
  }}
}}
"#
                ),
            )?;
            write(
                "tsconfig.json",
                String::from(
                    r#"{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
"#,
                ),
            )?;
            write(
                "src/index.ts",
                String::from(
                    r#"import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
app.use(express.static('public'));
const httpServer = createServer(app);
const io = new Server(httpServer);

io.on('connection', (socket) => {
  console.log('client connected:', socket.id);
  socket.on('message', (msg) => {
    io.emit('message', msg);
  });
});

const port = 3000;
httpServer.listen(port, () => {
  console.log(`Socket.IO server listening on http://localhost:${port}`);
});
"#,
                ),
            )?;
            write(
                "public/index.html",
                String::from(
                    r#"<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /><title>Socket.IO test client</title></head>
<body>
  <input id="msg" placeholder="Type a message" />
  <button onclick="send()">Send</button>
  <ul id="log"></ul>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    socket.on('message', (m) => {
      const li = document.createElement('li');
      li.textContent = m;
      document.getElementById('log').appendChild(li);
    });
    function send() {
      const input = document.getElementById('msg');
      socket.emit('message', input.value);
      input.value = '';
    }
  </script>
</body>
</html>
"#,
                ),
            )?;
            write(
                "README.md",
                format!("# {name}\n\nWebSocket server with Socket.IO + Express.\n\n`npm install` then `npm run dev`, then open http://localhost:3000 for a test client.\n"),
            )?;
            write(
                ".gitignore",
                String::from("node_modules/\ndist/\n.env\n"),
            )?;
        }
        other => return Err(format!("Unknown builtin template: {other}")),
    }
    Ok(())
}

#[tauri::command]
fn detect_project_type(path: String) -> String {
    let p = Path::new(&path);
    let has = |f: &str| p.join(f).exists();
    if has("angular.json") {
        return "angular".into();
    }
    if has("package.json") {
        if let Ok(s) = fs::read_to_string(p.join("package.json")) {
            if s.contains("\"next\"") {
                return "nextjs".into();
            }
            if s.contains("\"@angular/core\"") {
                return "angular".into();
            }
            if s.contains("\"svelte\"") {
                return "svelte-vite".into();
            }
            if s.contains("\"vue\"") {
                return "vue-vite".into();
            }
            if s.contains("\"react\"") {
                return "react-vite".into();
            }
        }
        return "node".into();
    }
    if let Ok(entries) = fs::read_dir(p) {
        for e in entries.flatten() {
            if let Some(ext) = e.path().extension() {
                let ext = ext.to_string_lossy().to_lowercase();
                if ext == "sln" || ext == "csproj" {
                    return "dotnet".into();
                }
            }
        }
    }
    if has("Cargo.toml") {
        return "rust".into();
    }
    if has("go.mod") {
        return "go".into();
    }
    if has("pyproject.toml") || has("requirements.txt") || has("main.py") {
        return "python".into();
    }
    if has("index.html") {
        return "static-html".into();
    }
    "imported".into()
}

#[derive(Serialize, Clone)]
struct HttpHeader {
    key: String,
    value: String,
}

#[derive(Serialize, Clone)]
struct HttpResponsePayload {
    status: u16,
    status_text: String,
    headers: Vec<HttpHeader>,
    body: String,
    duration_ms: u64,
    error: Option<String>,
}

#[derive(serde::Deserialize)]
struct HttpHeaderIn {
    key: String,
    value: String,
}

#[tauri::command]
async fn http_request(
    method: String,
    url: String,
    headers: Vec<HttpHeaderIn>,
    body: Option<String>,
) -> Result<HttpResponsePayload, String> {
    let started = std::time::Instant::now();

    // Users testing local dev servers almost never want a corporate/VPN
    // proxy in the way — but reqwest honors HTTP_PROXY/HTTPS_PROXY (and the
    // Windows system proxy) by default. On a machine with one configured,
    // that silently breaks every request here even though the target is
    // reachable (a plain TCP check like check_port doesn't go through the
    // proxy and would still report "online"), which is exactly the
    // confusing "server is up but requests fail" symptom this caused.
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .no_proxy()
        .build()
        .map_err(|e| e.to_string())?;

    // Be forgiving about a missing scheme (e.g. "localhost:3000/health")
    // instead of letting url::Url reject it outright.
    let url = if url.contains("://") {
        url
    } else {
        format!("http://{url}")
    };

    let method = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|_| format!("Invalid HTTP method: {method}"))?;
    let mut req = client
        .request(method.clone(), &url)
        // Belt-and-suspenders: make sure nothing between here and the
        // target server (an intermediary proxy despite no_proxy, a
        // misbehaving dev-server middleware, etc.) can hand back a cached
        // response instead of actually re-running the handler.
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache");

    let has_content_type = headers
        .iter()
        .any(|h| h.key.trim().eq_ignore_ascii_case("content-type"));
    for h in &headers {
        if !h.key.trim().is_empty() {
            req = req.header(h.key.trim(), &h.value);
        }
    }

    let body_is_empty = body.as_deref().map(str::is_empty).unwrap_or(true);
    // Only auto-attach a JSON content type when there's actually a body to
    // describe — sending it on GET/DELETE requests with no body confuses
    // some strict body-parsing middleware into expecting (and failing to
    // find) a JSON payload.
    if !body_is_empty && !has_content_type {
        req = req.header("Content-Type", "application/json");
    }
    if let Some(b) = body {
        if !b.is_empty() {
            req = req.body(b);
        }
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            let resp_headers: Vec<HttpHeader> = resp
                .headers()
                .iter()
                .map(|(k, v)| HttpHeader {
                    key: k.to_string(),
                    value: v.to_str().unwrap_or("").to_string(),
                })
                .collect();
            let text = resp.text().await.unwrap_or_default();
            Ok(HttpResponsePayload {
                status: status.as_u16(),
                status_text: status.canonical_reason().unwrap_or("").to_string(),
                headers: resp_headers,
                body: text,
                duration_ms: started.elapsed().as_millis() as u64,
                error: None,
            })
        }
        Err(e) => {
            // reqwest's Display message is often terse ("error sending
            // request"); layer on a concrete reason so failures are
            // actionable instead of a generic blob.
            let reason = if e.is_timeout() {
                "timed out"
            } else if e.is_connect() {
                "connection refused/unreachable"
            } else if e.is_decode() {
                "failed to decode response"
            } else if e.is_builder() {
                "invalid request (bad URL or headers)"
            } else {
                "request failed"
            };
            Ok(HttpResponsePayload {
                status: 0,
                status_text: String::new(),
                headers: vec![],
                body: String::new(),
                duration_ms: started.elapsed().as_millis() as u64,
                error: Some(format!("{reason}: {e}")),
            })
        }
    }
}

#[derive(Serialize, Clone)]
struct ApiEndpoint {
    method: String,
    path: String,
    file: String,
}

const SCAN_HEAVY_DIRS: [&str; 8] = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "target",
    ".venv",
    "venv",
    "__pycache__",
];

struct ScanRegexes {
    js: regex::Regex,
    py_decorator: regex::Regex,
    flask_route: regex::Regex,
    port_js: regex::Regex,
    port_py: regex::Regex,
    mount_js: regex::Regex,
    mount_py: regex::Regex,
}

/// Tracks which kind of route syntax was seen, so a sensible default port can
/// be guessed (uvicorn/FastAPI: 8000, Flask: 5000, Express-style: 3000) when
/// no literal port is written in the source at all.
#[derive(Default)]
struct FrameworkCounts {
    js: u32,
    fastapi: u32,
    flask: u32,
}

fn scan_dir_for_endpoints(
    dir: &Path,
    root: &Path,
    re: &ScanRegexes,
    out: &mut Vec<(ApiEndpoint, bool)>,
    guessed_port: &mut Option<u16>,
    counts: &mut FrameworkCounts,
    js_mounts: &mut Vec<String>,
    py_mounts: &mut Vec<String>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name_lossy = name.to_string_lossy();
        if path.is_dir() {
            if SCAN_HEAVY_DIRS.iter().any(|h| h.eq_ignore_ascii_case(&name_lossy)) {
                continue;
            }
            scan_dir_for_endpoints(&path, root, re, out, guessed_port, counts, js_mounts, py_mounts);
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if !["js", "ts", "mjs", "cjs", "py"].contains(&ext) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if meta.len() > 512 * 1024 {
            continue; // skip huge files, unlikely to be hand-written route files
        }
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let rel = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_string();

        if ext == "py" {
            for cap in re.py_decorator.captures_iter(&content) {
                out.push((
                    ApiEndpoint {
                        method: cap[1].to_uppercase(),
                        path: cap[2].to_string(),
                        file: rel.clone(),
                    },
                    true,
                ));
                counts.fastapi += 1;
            }
            for cap in re.flask_route.captures_iter(&content) {
                let methods = cap.get(2).map(|m| m.as_str()).unwrap_or("GET");
                for m in methods.split(',') {
                    let m = m.trim().trim_matches('"').trim_matches('\'');
                    if m.is_empty() {
                        continue;
                    }
                    out.push((
                        ApiEndpoint {
                            method: m.to_uppercase(),
                            path: cap[1].to_string(),
                            file: rel.clone(),
                        },
                        true,
                    ));
                }
                counts.flask += 1;
            }
            if guessed_port.is_none() {
                if let Some(cap) = re.port_py.captures(&content) {
                    *guessed_port = cap[1].parse().ok();
                }
            }
            for cap in re.mount_py.captures_iter(&content) {
                let prefix = cap[1].to_string();
                if prefix != "/" && !py_mounts.contains(&prefix) {
                    py_mounts.push(prefix);
                }
            }
        } else {
            for cap in re.js.captures_iter(&content) {
                out.push((
                    ApiEndpoint {
                        method: cap[1].to_uppercase(),
                        path: cap[2].to_string(),
                        file: rel.clone(),
                    },
                    false,
                ));
                counts.js += 1;
            }
            if guessed_port.is_none() {
                if let Some(cap) = re.port_js.captures(&content) {
                    *guessed_port = cap[1].parse().ok();
                }
            }
            for cap in re.mount_js.captures_iter(&content) {
                let prefix = cap[1].to_string();
                if prefix != "/" && !js_mounts.contains(&prefix) {
                    js_mounts.push(prefix);
                }
            }
        }
    }
}

#[derive(Serialize)]
struct ScanResult {
    endpoints: Vec<ApiEndpoint>,
    guessed_port: Option<u16>,
}

/// Best-effort static scan for REST endpoints (Express/Fastify-style JS/TS
/// route calls, FastAPI/Flask-style Python decorators) plus a guessed listen
/// port. Regex-based, not a real parser — good enough for typical scaffolded
/// projects, may miss unusual routing patterns in larger/imported codebases.
#[tauri::command]
fn scan_api_endpoints(path: String) -> ScanResult {
    let root = Path::new(&path);
    let re = ScanRegexes {
        js: regex::Regex::new(
            r#"(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]"#,
        )
        .unwrap(),
        py_decorator: regex::Regex::new(
            r#"@(?:app|router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']"#,
        )
        .unwrap(),
        flask_route: regex::Regex::new(
            r#"@app\.route\(\s*["']([^"']+)["'](?:\s*,\s*methods\s*=\s*\[([^\]]*)\])?"#,
        )
        .unwrap(),
        port_js: regex::Regex::new(r#"\.listen\(\s*(\d{2,5})"#).unwrap(),
        port_py: regex::Regex::new(r#"port\s*=\s*(\d{2,5})|--port[= ](\d{2,5})"#).unwrap(),
        // Express/Fastify-style sub-router mounting: app.use('/api', router).
        // Our route regex only sees the router-relative path ("/users"), not
        // the full mounted path ("/api/users"), which is a common cause of a
        // detected route still 404ing — the actual server never registers
        // just "/users".
        mount_js: regex::Regex::new(r#"\.use\(\s*["']([^"']+)["']\s*,"#).unwrap(),
        // FastAPI's include_router(prefix=...) / Flask's Blueprint(url_prefix=...).
        mount_py: regex::Regex::new(r#"(?:prefix|url_prefix)\s*=\s*["']([^"']+)["']"#).unwrap(),
    };

    let mut out = Vec::new();
    let mut guessed_port = None;
    let mut counts = FrameworkCounts::default();
    let mut js_mounts = Vec::new();
    let mut py_mounts = Vec::new();
    scan_dir_for_endpoints(
        root,
        root,
        &re,
        &mut out,
        &mut guessed_port,
        &mut counts,
        &mut js_mounts,
        &mut py_mounts,
    );

    // Only auto-prepend a mount prefix when there's exactly one candidate
    // for that language across the whole project — with multiple distinct
    // `app.use(prefix, …)` calls we can't tell which router owns which
    // route without real import/AST analysis, so guessing would just trade
    // one wrong path for another. Each prefix is only applied to endpoints
    // from the matching language, never cross-applied.
    if js_mounts.len() == 1 {
        let prefix = &js_mounts[0];
        for (ep, is_py) in out.iter_mut() {
            if !*is_py && !ep.path.starts_with(prefix.as_str()) {
                ep.path = format!("{prefix}{}", ep.path);
            }
        }
    }
    if py_mounts.len() == 1 {
        let prefix = &py_mounts[0];
        for (ep, is_py) in out.iter_mut() {
            if *is_py && !ep.path.starts_with(prefix.as_str()) {
                ep.path = format!("{prefix}{}", ep.path);
            }
        }
    }

    let mut out: Vec<ApiEndpoint> = out.into_iter().map(|(ep, _)| ep).collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out.dedup_by(|a, b| a.method == b.method && a.path == b.path);

    // No literal port found in the source — fall back to each framework's
    // conventional default instead of a single hardcoded guess.
    if guessed_port.is_none() {
        guessed_port = if counts.flask >= counts.fastapi && counts.flask > 0 {
            Some(5000)
        } else if counts.fastapi > 0 {
            Some(8000)
        } else if counts.js > 0 {
            Some(3000)
        } else {
            None
        };
    }

    ScanResult { endpoints: out, guessed_port }
}

/// Fast TCP reachability check for "is a dev server running on this port".
#[tauri::command]
fn check_port(host: String, port: u16) -> bool {
    use std::net::{TcpStream, ToSocketAddrs};
    let addr = format!("{host}:{port}");
    let Ok(mut addrs) = addr.to_socket_addrs() else {
        return false;
    };
    let Some(a) = addrs.next() else {
        return false;
    };
    TcpStream::connect_timeout(&a, std::time::Duration::from_millis(600)).is_ok()
}

fn data_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("codenest.json"))
}

// A rolling copy of the last known-good save, kept next to the main data
// file (same app-data dir, so it survives app updates/reinstalls exactly
// like codenest.json) and used to auto-recover if a write gets interrupted
// (crash, power loss, update mid-save) and leaves codenest.json corrupted.
fn backup_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("codenest.backup.json"))
}

fn is_valid_json(content: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(content).is_ok()
}

#[tauri::command]
fn load_data(app: AppHandle) -> Result<Option<String>, String> {
    let f = data_file(&app)?;
    if let Ok(content) = fs::read_to_string(&f) {
        if is_valid_json(&content) {
            return Ok(Some(content));
        }
        // codenest.json exists but is corrupted — fall back to the backup
        // instead of silently starting the user over with an empty state.
        if let Ok(backup) = fs::read_to_string(backup_file(&app)?) {
            if is_valid_json(&backup) {
                return Ok(Some(backup));
            }
        }
        return Ok(Some(content));
    }
    Ok(None)
}

#[tauri::command]
fn save_data(app: AppHandle, json: String) -> Result<(), String> {
    let f = data_file(&app)?;
    // Keep a backup of the previous good save before overwriting it.
    if f.exists() {
        let _ = fs::copy(&f, backup_file(&app)?);
    }
    // Write to a temp file first and rename into place so a crash or power
    // loss mid-write can never leave codenest.json half-written/corrupted.
    let tmp = f.with_extension("json.tmp");
    fs::write(&tmp, &json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &f).map_err(|e| e.to_string())
}

/// Copies the current data file to a user-chosen location so todos, projects,
/// notes, settings etc. can be backed up manually (e.g. before moving to a
/// new machine or wiping %APPDATA%).
#[tauri::command]
fn export_data(app: AppHandle, target: String) -> Result<(), String> {
    fs::copy(data_file(&app)?, &target).map_err(|e| e.to_string())?;
    Ok(())
}

/// Restores app data from a previously exported backup file, replacing the
/// current codenest.json (after backing it up first).
#[tauri::command]
fn import_data(app: AppHandle, source: String) -> Result<String, String> {
    let content = fs::read_to_string(&source).map_err(|e| e.to_string())?;
    if !is_valid_json(&content) {
        return Err("This file isn't a valid CodeNest backup.".into());
    }
    let f = data_file(&app)?;
    if f.exists() {
        let _ = fs::copy(&f, backup_file(&app)?);
    }
    fs::write(&f, &content).map_err(|e| e.to_string())?;
    Ok(content)
}

#[tauri::command]
fn get_close_to_tray(state: State<'_, CloseToTray>) -> bool {
    *state.0.lock().unwrap()
}

#[tauri::command]
fn set_close_to_tray(state: State<'_, CloseToTray>, value: bool) {
    *state.0.lock().unwrap() = value;
}

#[tauri::command]
fn default_projects_dir(app: AppHandle) -> String {
    let docs = app
        .path()
        .document_dir()
        .unwrap_or_else(|_| PathBuf::from("C:\\"));
    let dir = docs.join("CodeNest").join("Projects");
    dir.to_string_lossy().to_string()
}

/// Reads `settings.windowPresets[settings.activeWindowPreset]` straight out of
/// codenest.json and resizes the (still-hidden) main window before it's shown,
/// so the saved preset applies natively at startup instead of only via the
/// frontend's live-preview resize in Settings.
fn apply_saved_window_size(app: &AppHandle, window: &tauri::WebviewWindow) {
    let Ok(data_path) = data_file(app) else { return };
    let Ok(raw) = fs::read_to_string(&data_path) else { return };
    let Ok(json) = serde_json::from_str::<serde_json::Value>(&raw) else { return };
    let preset_key = json["settings"]["activeWindowPreset"].as_str().unwrap_or("middle");
    let preset = &json["settings"]["windowPresets"][preset_key];
    if let (Some(width), Some(height)) = (preset["width"].as_f64(), preset["height"].as_f64()) {
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // A second launch attempt was made while we're already running —
            // bring the existing window to the front instead of allowing a
            // second instance to start (also covers the case where the app
            // is minimized to the tray, not just backgrounded).
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ProcessState::default())
        .manage(SysState(Mutex::new(System::new())))
        .manage(CloseToTray::default())
        .invoke_handler(tauri::generate_handler![
            spawn_process,
            kill_process,
            send_input,
            check_tool,
            path_exists,
            ensure_dir,
            is_directory,
            read_file,
            write_file,
            write_project_files,
            duplicate_folder,
            move_folder,
            process_stats,
            detect_ides,
            open_in_ide,
            open_explorer,
            open_terminal,
            open_with_default,
            scaffold_builtin,
            detect_project_type,
            git_status,
            load_data,
            save_data,
            export_data,
            import_data,
            default_projects_dir,
            get_close_to_tray,
            set_close_to_tray,
            http_request,
            scan_api_endpoints,
            check_port
        ])
        .setup(|app| {
            let show_item = MenuItem::with_id(app, "show", "Show CodeNest", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let icon = app.default_window_icon().cloned();
            let mut builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("CodeNest")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                });
            if let Some(icon) = icon {
                builder = builder.icon(icon);
            }
            builder.build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                apply_saved_window_size(app.handle(), &window);
                let _ = window.center();
                let _ = window.show();

                let window_handle = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let app = window_handle.app_handle();
                        let should_hide = *app.state::<CloseToTray>().0.lock().unwrap();
                        if should_hide {
                            api.prevent_close();
                            let _ = window_handle.hide();
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
