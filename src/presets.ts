export interface PresetStep {
  label: string;
  command: string;
  cwd: "parent" | "project";
}

export interface PresetRunConfig {
  name: string;
  command: string;
}

export interface Preset {
  id: string;
  name: string;
  category: "Web" | ".NET" | "Basics" | "Browser Extensions" | "Bots" | "Backend" | "Desktop" | "Mobile";
  description: string;
  accent: string;
  /** CLI tool that must be on PATH before the preset can scaffold. */
  requires?: { tool: string; label: string };
  /** Built-in file template written by the Rust backend before steps run. */
  builtin?:
    | "static-html"
    | "empty"
    | "webext-chromium"
    | "webext-firefox"
    | "discord-bot-js"
    | "discord-bot-py"
    | "telegram-bot-js"
    | "slack-bot-js"
    | "express-api-ts"
    | "fastapi-py"
    | "flask-py"
    | "graphql-api-ts"
    | "socketio-server-ts";
  steps: (name: string) => PresetStep[];
  runConfigs?: PresetRunConfig[];
  /** Hidden presets exist only to classify imported projects. */
  hidden?: boolean;
}

const vite = (template: string) => (name: string): PresetStep[] => [
  {
    label: `Scaffolding Vite project (${template})`,
    command: `npx -y create-vite@latest ${name} --template ${template}`,
    cwd: "parent",
  },
  { label: "Installing dependencies (npm install)", command: "npm install", cwd: "project" },
];

const dotnet = (template: string) => (name: string): PresetStep[] => [
  {
    label: `dotnet new ${template}`,
    command: `dotnet new ${template} -o ${name}`,
    cwd: "parent",
  },
];

const npmReq = { tool: "npm", label: "Node.js / npm" };
const dotnetReq = { tool: "dotnet", label: ".NET SDK" };
const pythonReq = { tool: "python", label: "Python" };

/** A single builtin-scaffolded step that just installs dependencies afterwards. */
const installOnly = (command: string) => (): PresetStep[] => [
  { label: command, command, cwd: "project" },
];

const viteRunConfigs: PresetRunConfig[] = [
  { name: "dev", command: "npm run dev" },
  { name: "build", command: "npm run build" },
  { name: "preview", command: "npm run preview" },
];

export const PRESETS: Preset[] = [
  // Web
  {
    id: "angular",
    name: "Angular",
    category: "Web",
    description: "Full-featured framework with CLI, routing and TypeScript.",
    accent: "#dd0031",
    requires: npmReq,
    steps: (name) => [
      {
        label: "Scaffolding Angular workspace (installs dependencies, takes a while)",
        // Pinned to v19: newer Angular CLI majors require very recent Node.js
        // patch versions (e.g. 22.22.3+) that most installed Node 22.x builds don't satisfy.
        command: `npx -y @angular/cli@19 new ${name} --defaults --skip-git --package-manager=npm`,
        cwd: "parent",
      },
    ],
    runConfigs: [
      { name: "dev", command: "npm start" },
      { name: "build", command: "npm run build" },
      { name: "test", command: "npm test" },
    ],
  },
  {
    id: "react-vite",
    name: "React",
    category: "Web",
    description: "React 19 + TypeScript on Vite.",
    accent: "#61dafb",
    requires: npmReq,
    steps: vite("react-ts"),
    runConfigs: viteRunConfigs,
  },
  {
    id: "vue-vite",
    name: "Vue",
    category: "Web",
    description: "Vue 3 + TypeScript on Vite.",
    accent: "#42b883",
    requires: npmReq,
    steps: vite("vue-ts"),
    runConfigs: viteRunConfigs,
  },
  {
    id: "svelte-vite",
    name: "Svelte",
    category: "Web",
    description: "Svelte 5 + TypeScript on Vite.",
    accent: "#ff3e00",
    requires: npmReq,
    steps: vite("svelte-ts"),
    runConfigs: viteRunConfigs,
  },
  {
    id: "nextjs",
    name: "Next.js",
    category: "Web",
    description: "React framework with SSR, routing and API routes.",
    accent: "#ffffff",
    requires: npmReq,
    steps: (name) => [
      {
        label: "Scaffolding Next.js app (installs dependencies, takes a while)",
        command: `npx -y create-next-app@latest ${name} --yes --ts --use-npm`,
        cwd: "parent",
      },
    ],
    runConfigs: [
      { name: "dev", command: "npm run dev" },
      { name: "build", command: "npm run build" },
      { name: "start", command: "npm run start" },
    ],
  },
  {
    id: "vanilla-vite",
    name: "Vanilla TS",
    category: "Web",
    description: "Plain TypeScript + Vite, no framework.",
    accent: "#f7df1e",
    requires: npmReq,
    steps: vite("vanilla-ts"),
    runConfigs: viteRunConfigs,
  },
  {
    id: "static-html",
    name: "Static HTML",
    category: "Web",
    description: "index.html, style.css and script.js - nothing else.",
    accent: "#e34c26",
    builtin: "static-html",
    steps: () => [],
    runConfigs: [{ name: "open", command: 'start "" index.html' }],
  },

  // .NET
  {
    id: "dotnet-console",
    name: "C# Console",
    category: ".NET",
    description: "Console application (dotnet new console).",
    accent: "#9b4f96",
    requires: dotnetReq,
    steps: dotnet("console"),
    runConfigs: [
      { name: "run", command: "dotnet run" },
      { name: "build", command: "dotnet build" },
    ],
  },
  {
    id: "dotnet-webapi",
    name: "ASP.NET Web API",
    category: ".NET",
    description: "REST API with ASP.NET Core (dotnet new webapi).",
    accent: "#512bd4",
    requires: dotnetReq,
    steps: dotnet("webapi"),
    runConfigs: [
      { name: "run", command: "dotnet run" },
      { name: "watch", command: "dotnet watch run" },
      { name: "build", command: "dotnet build" },
    ],
  },
  {
    id: "dotnet-mvc",
    name: "ASP.NET MVC",
    category: ".NET",
    description: "Web app with Model-View-Controller (dotnet new mvc).",
    accent: "#512bd4",
    requires: dotnetReq,
    steps: dotnet("mvc"),
    runConfigs: [
      { name: "run", command: "dotnet run" },
      { name: "watch", command: "dotnet watch run" },
      { name: "build", command: "dotnet build" },
    ],
  },
  {
    id: "dotnet-blazor",
    name: "Blazor",
    category: ".NET",
    description: "Interactive web UI with C# (dotnet new blazor).",
    accent: "#702af7",
    requires: dotnetReq,
    steps: dotnet("blazor"),
    runConfigs: [
      { name: "run", command: "dotnet run" },
      { name: "watch", command: "dotnet watch run" },
      { name: "build", command: "dotnet build" },
    ],
  },
  {
    id: "dotnet-wpf",
    name: "WPF",
    category: ".NET",
    description: "Windows desktop app with WPF (dotnet new wpf).",
    accent: "#0078d4",
    requires: dotnetReq,
    steps: dotnet("wpf"),
    runConfigs: [
      { name: "run", command: "dotnet run" },
      { name: "build", command: "dotnet build" },
    ],
  },
  {
    id: "dotnet-winforms",
    name: "WinForms",
    category: ".NET",
    description: "Classic Windows Forms app (dotnet new winforms).",
    accent: "#0078d4",
    requires: dotnetReq,
    steps: dotnet("winforms"),
    runConfigs: [
      { name: "run", command: "dotnet run" },
      { name: "build", command: "dotnet build" },
    ],
  },
  {
    id: "dotnet-classlib",
    name: "C# Class Library",
    category: ".NET",
    description: "Reusable library (dotnet new classlib).",
    accent: "#9b4f96",
    requires: dotnetReq,
    steps: dotnet("classlib"),
    runConfigs: [
      { name: "build", command: "dotnet build" },
      { name: "test", command: "dotnet test" },
    ],
  },

  // Basics
  {
    id: "node",
    name: "Node.js",
    category: "Basics",
    description: "Empty npm package (npm init -y).",
    accent: "#3c873a",
    requires: npmReq,
    builtin: "empty",
    steps: () => [
      { label: "npm init -y", command: "npm init -y", cwd: "project" },
    ],
    runConfigs: [{ name: "start", command: "node index.js" }],
  },
  {
    id: "empty",
    name: "Empty Project",
    category: "Basics",
    description: "Just a folder with README and .gitignore.",
    accent: "#8b94a7",
    builtin: "empty",
    steps: () => [],
  },

  // Browser Extensions
  {
    id: "webext-edge",
    name: "Edge Extension",
    category: "Browser Extensions",
    description: "Manifest V3 extension for Microsoft Edge.",
    accent: "#0078d7",
    builtin: "webext-chromium",
    steps: () => [],
  },
  {
    id: "webext-opera",
    name: "Opera Extension",
    category: "Browser Extensions",
    description: "Manifest V3 extension for Opera.",
    accent: "#ff1b2d",
    builtin: "webext-chromium",
    steps: () => [],
  },
  {
    id: "webext-firefox",
    name: "Firefox Add-on",
    category: "Browser Extensions",
    description: "WebExtension for Firefox (about:debugging).",
    accent: "#ff9500",
    builtin: "webext-firefox",
    steps: () => [],
  },

  // Bots
  {
    id: "discord-bot-js",
    name: "Discord Bot (Node.js)",
    category: "Bots",
    description: "discord.js bot with a starter command.",
    accent: "#5865f2",
    requires: npmReq,
    builtin: "discord-bot-js",
    steps: installOnly("npm install"),
    runConfigs: [{ name: "start", command: "node index.js" }],
  },
  {
    id: "discord-bot-py",
    name: "Discord Bot (Python)",
    category: "Bots",
    description: "discord.py bot with a starter command.",
    accent: "#5865f2",
    requires: pythonReq,
    builtin: "discord-bot-py",
    steps: installOnly("pip install -r requirements.txt"),
    runConfigs: [{ name: "start", command: "python bot.py" }],
  },
  {
    id: "telegram-bot-js",
    name: "Telegram Bot",
    category: "Bots",
    description: "Telegraf bot with a starter command.",
    accent: "#26a5e4",
    requires: npmReq,
    builtin: "telegram-bot-js",
    steps: installOnly("npm install"),
    runConfigs: [{ name: "start", command: "node index.js" }],
  },
  {
    id: "slack-bot-js",
    name: "Slack Bot / App",
    category: "Bots",
    description: "Bolt app (Socket Mode) with a starter listener.",
    accent: "#4a154b",
    requires: npmReq,
    builtin: "slack-bot-js",
    steps: installOnly("npm install"),
    runConfigs: [{ name: "start", command: "node app.js" }],
  },

  // Backend
  {
    id: "express-api-ts",
    name: "Express REST API",
    category: "Backend",
    description: "Express + TypeScript starter with a /health route.",
    accent: "#000000",
    requires: npmReq,
    builtin: "express-api-ts",
    steps: installOnly("npm install"),
    runConfigs: [
      { name: "dev", command: "npx ts-node-dev --respawn src/index.ts" },
      { name: "build", command: "npx tsc" },
      { name: "start", command: "node dist/index.js" },
    ],
  },
  {
    id: "fastapi-py",
    name: "FastAPI",
    category: "Backend",
    description: "FastAPI starter with interactive docs.",
    accent: "#009688",
    requires: pythonReq,
    builtin: "fastapi-py",
    steps: installOnly("pip install -r requirements.txt"),
    runConfigs: [{ name: "dev", command: "uvicorn main:app --reload" }],
  },
  {
    id: "flask-py",
    name: "Flask",
    category: "Backend",
    description: "Flask starter with a /health route.",
    accent: "#8b94a7",
    requires: pythonReq,
    builtin: "flask-py",
    steps: installOnly("pip install -r requirements.txt"),
    runConfigs: [{ name: "dev", command: "python app.py" }],
  },
  {
    id: "graphql-api-ts",
    name: "GraphQL API",
    category: "Backend",
    description: "Apollo Server + TypeScript starter.",
    accent: "#e535ab",
    requires: npmReq,
    builtin: "graphql-api-ts",
    steps: installOnly("npm install"),
    runConfigs: [{ name: "dev", command: "npx ts-node-dev --respawn src/index.ts" }],
  },
  {
    id: "socketio-server-ts",
    name: "WebSocket Server",
    category: "Backend",
    description: "Express + Socket.IO starter with a test client.",
    accent: "#010101",
    requires: npmReq,
    builtin: "socketio-server-ts",
    steps: installOnly("npm install"),
    runConfigs: [{ name: "dev", command: "npx ts-node-dev --respawn src/index.ts" }],
  },

  // Desktop
  {
    id: "electron-app",
    name: "Electron App",
    category: "Desktop",
    description: "Desktop app scaffolded with Electron Forge.",
    accent: "#47848f",
    requires: npmReq,
    steps: (name) => [
      {
        label: "Scaffolding Electron app (installs dependencies, takes a while)",
        command: `npx -y create-electron-app@latest ${name}`,
        cwd: "parent",
      },
    ],
    runConfigs: [
      { name: "start", command: "npm start" },
      { name: "package", command: "npm run package" },
    ],
  },
  {
    id: "tauri-react",
    name: "Tauri (React)",
    category: "Desktop",
    description: "Rust-backed desktop app with a React + TS frontend.",
    accent: "#ffc131",
    requires: npmReq,
    steps: (name) => [
      {
        label: "Scaffolding Tauri + React app (installs dependencies, takes a while)",
        command: `npx -y create-tauri-app@latest ${name} --template react-ts --manager npm --yes`,
        cwd: "parent",
      },
    ],
    runConfigs: [
      { name: "dev", command: "npm run tauri dev" },
      { name: "build", command: "npm run tauri build" },
    ],
  },
  {
    id: "tauri-vue",
    name: "Tauri (Vue)",
    category: "Desktop",
    description: "Rust-backed desktop app with a Vue + TS frontend.",
    accent: "#ffc131",
    requires: npmReq,
    steps: (name) => [
      {
        label: "Scaffolding Tauri + Vue app (installs dependencies, takes a while)",
        command: `npx -y create-tauri-app@latest ${name} --template vue-ts --manager npm --yes`,
        cwd: "parent",
      },
    ],
    runConfigs: [
      { name: "dev", command: "npm run tauri dev" },
      { name: "build", command: "npm run tauri build" },
    ],
  },

  // Mobile
  {
    id: "expo",
    name: "Expo (React Native)",
    category: "Mobile",
    description: "React Native app scaffolded with Expo.",
    accent: "#000020",
    requires: npmReq,
    steps: (name) => [
      {
        label: "Scaffolding Expo app (installs dependencies, takes a while)",
        command: `npx -y create-expo-app@latest ${name} --template blank-typescript`,
        cwd: "parent",
      },
    ],
    runConfigs: [
      { name: "start", command: "npx expo start" },
      { name: "android", command: "npx expo start --android" },
      { name: "web", command: "npx expo start --web" },
    ],
  },

  // Hidden presets for imported projects
  {
    id: "dotnet",
    name: ".NET",
    category: ".NET",
    description: "Imported .NET project.",
    accent: "#512bd4",
    steps: () => [],
    runConfigs: [
      { name: "run", command: "dotnet run" },
      { name: "build", command: "dotnet build" },
    ],
    hidden: true,
  },
  {
    id: "python",
    name: "Python",
    category: "Basics",
    description: "Imported Python project.",
    accent: "#ffd343",
    steps: () => [],
    runConfigs: [{ name: "run", command: "python main.py" }],
    hidden: true,
  },
  {
    id: "rust",
    name: "Rust",
    category: "Basics",
    description: "Imported Rust project.",
    accent: "#f74c00",
    steps: () => [],
    runConfigs: [
      { name: "run", command: "cargo run" },
      { name: "build", command: "cargo build" },
    ],
    hidden: true,
  },
  {
    id: "go",
    name: "Go",
    category: "Basics",
    description: "Imported Go project.",
    accent: "#00add8",
    steps: () => [],
    runConfigs: [{ name: "run", command: "go run ." }],
    hidden: true,
  },
  {
    id: "imported",
    name: "Imported",
    category: "Basics",
    description: "Imported project.",
    accent: "#8b94a7",
    steps: () => [],
    hidden: true,
  },
];

export const CATEGORIES = [
  "Web",
  "Backend",
  "Bots",
  "Desktop",
  "Mobile",
  ".NET",
  "Basics",
  "Browser Extensions",
] as const;

export function presetById(id: string): Preset {
  return (
    PRESETS.find((p) => p.id === id) ?? PRESETS.find((p) => p.id === "imported")!
  );
}
