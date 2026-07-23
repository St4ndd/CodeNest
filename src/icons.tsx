import type { SVGProps } from "react";

interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function base(size: number, props: IconProps) {
  const { size: _s, ...rest } = props;
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...rest,
  };
}

export const IconGrid = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </svg>
);

export const IconPlus = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconSettings = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const IconDownload = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 19.5h16" />
  </svg>
);

export const IconStar = ({ size = 16, filled = false, ...p }: IconProps & { filled?: boolean }) => (
  <svg {...base(size, p)} fill={filled ? "currentColor" : "none"}>
    <path d="M12 3.5l2.6 5.4 5.9.7-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.7z" />
  </svg>
);

export const IconPlay = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <path d="M7 4.5v15l13-7.5z" />
  </svg>
);

export const IconSquare = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <rect x="6" y="6" width="12" height="12" rx="1.5" />
  </svg>
);

export const IconTerminal = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 9.5l3 2.5-3 2.5" />
    <path d="M13 15h4" />
  </svg>
);

export const IconFolder = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2a1.5 1.5 0 0 1 1.2.6l1 1.4H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
  </svg>
);

export const IconMoreHorizontal = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);

export const IconExternalLink = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M14 4h6v6" />
    <path d="M20 4L10 14" />
    <path d="M18 13.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5h5.5" />
  </svg>
);

export const IconTrash = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" />
    <path d="M6.5 7l.7 12a2 2 0 0 0 2 1.9h5.6a2 2 0 0 0 2-1.9l.7-12" />
    <path d="M10.2 11v6M13.8 11v6" />
  </svg>
);

export const IconSliders = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M5 6h9M18 6h1" />
    <path d="M5 12h1M10 12h9" />
    <path d="M5 18h13M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="8" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </svg>
);

export const IconChevronDown = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const IconChevronUp = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M6 15l6-6 6 6" />
  </svg>
);

export const IconCheck = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

export const IconX = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const IconChecklist = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M4 6.5l1.5 1.5L8 5" />
    <path d="M11 6h9" />
    <path d="M4 12.5l1.5 1.5L8 11" />
    <path d="M11 12h9" />
    <path d="M4 18.5l1.5 1.5L8 17" />
    <path d="M11 18h9" />
  </svg>
);

export const IconArrowLeft = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M19 12H5" />
    <path d="M11 6l-6 6 6 6" />
  </svg>
);

export const IconRefresh = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M4 10a8 8 0 0 1 14.5-4.5M20 4v6h-6" />
    <path d="M20 14a8 8 0 0 1-14.5 4.5M4 20v-6h6" />
  </svg>
);

export const IconSearch = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M20 20l-4.8-4.8" />
  </svg>
);

export const IconBox = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4.5 7.5L12 12l7.5-4.5" />
    <path d="M12 12v9" />
  </svg>
);

export const IconLayers = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 3l8.5 4.5L12 12 3.5 7.5z" />
    <path d="M3.5 12L12 16.5 20.5 12" />
    <path d="M3.5 16.5L12 21l8.5-4.5" />
  </svg>
);

export const IconArchive = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <rect x="3.5" y="4" width="17" height="4.5" rx="1.2" />
    <path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5" />
    <path d="M10 12.5h4" />
  </svg>
);

export const IconCopy = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 8.5V5.5A1.5 1.5 0 0 0 14 4H5.5A1.5 1.5 0 0 0 4 5.5V14a1.5 1.5 0 0 0 1.5 1.5h3" />
  </svg>
);

export const IconGlobe = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17" />
    <path d="M12 3.5a13 13 0 0 1 3.2 8.5 13 13 0 0 1-3.2 8.5A13 13 0 0 1 8.8 12 13 13 0 0 1 12 3.5z" />
  </svg>
);

export const IconSend = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M21 3L3 10.5l7.5 3L13.5 21 21 3z" />
    <path d="M10.5 13.5L21 3" />
  </svg>
);

export const IconTag = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12.5 4H6.5A1.5 1.5 0 0 0 5 5.5v6l9.3 9.3a1.5 1.5 0 0 0 2.1 0l5.4-5.4a1.5 1.5 0 0 0 0-2.1z" />
    <circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconFileText = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5z" />
    <path d="M14 3.5V8h4.2" />
    <path d="M9 12.5h6M9 15.8h6" />
  </svg>
);

export const IconActivity = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M3.5 12h4l2-6.5 3 13 2-9.5 1.5 3H20.5" />
  </svg>
);

export const IconPackage = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4.5 7.5L12 12l7.5-4.5" />
    <path d="M12 12v9" />
    <path d="M8.2 5.3l7.6 4.3" />
  </svg>
);

export const IconChevronRight = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconGripVertical = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <circle cx="9" cy="5.5" r="1.4" />
    <circle cx="9" cy="12" r="1.4" />
    <circle cx="9" cy="18.5" r="1.4" />
    <circle cx="15" cy="5.5" r="1.4" />
    <circle cx="15" cy="12" r="1.4" />
    <circle cx="15" cy="18.5" r="1.4" />
  </svg>
);

export const IconGitBranch = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <circle cx="6" cy="5.5" r="2" />
    <circle cx="6" cy="18.5" r="2" />
    <circle cx="18" cy="9.5" r="2" />
    <path d="M6 7.5v9" />
    <path d="M6 10.5c0 3 3 3 6 3s6 0 6-2.5V9.5" />
  </svg>
);

export const IconUpload = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size, p)}>
    <path d="M12 21V9" />
    <path d="M7 14l5-5 5 5" />
    <path d="M4 19.5h16" />
  </svg>
);

/* ── Preset / framework marks (monochrome, brand-inspired) ── */

const glyphByPreset: Record<string, string> = {
  angular: "angular",
  "react-vite": "react",
  "vue-vite": "vue",
  "svelte-vite": "svelte",
  nextjs: "next",
  "vanilla-vite": "code",
  "static-html": "code",
  "dotnet-console": "terminal",
  "dotnet-webapi": "dotnet",
  "dotnet-mvc": "dotnet",
  "dotnet-blazor": "dotnet",
  "dotnet-wpf": "dotnet",
  "dotnet-winforms": "dotnet",
  "dotnet-classlib": "box",
  dotnet: "dotnet",
  node: "hexagon",
  empty: "dashed",
  python: "python",
  rust: "rust",
  go: "terminal",
  imported: "folder",
  "webext-edge": "puzzle",
  "webext-opera": "puzzle",
  "webext-firefox": "puzzle",
  "discord-bot-js": "hexagon",
  "discord-bot-py": "python",
  "telegram-bot-js": "terminal",
  "slack-bot-js": "terminal",
  "express-api-ts": "code",
  "fastapi-py": "python",
  "flask-py": "python",
  "graphql-api-ts": "code",
  "socketio-server-ts": "code",
  "electron-app": "box",
  "tauri-react": "react",
  "tauri-vue": "vue",
  expo: "react",
};

export const GLYPH_KEYS = [
  "folder",
  "code",
  "box",
  "dashed",
  "terminal",
  "hexagon",
  "dotnet",
  "angular",
  "react",
  "vue",
  "svelte",
  "next",
  "python",
  "rust",
  "puzzle",
] as const;

export function Glyph({ glyph, size = 18 }: { glyph: string; size?: number }) {
  return <PresetGlyph glyph={glyph} size={size} />;
}

function PresetGlyph({ glyph, size }: { glyph: string; size: number }) {
  const s = base(size, {});
  switch (glyph) {
    case "angular":
      return (
        <svg {...s}>
          <path d="M12 3l8 3-1.2 10.5L12 21l-6.8-4.5L4 6z" />
          <path d="M12 7.5L8.3 16h1.7l.8-2h4.4l.8 2h1.7z" />
          <path d="M10.3 12.5h3.4L12 8.8z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "react":
      return (
        <svg {...s}>
          <ellipse cx="12" cy="12" rx="9" ry="3.5" />
          <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      );
    case "vue":
      return (
        <svg {...s}>
          <path d="M3.5 5h4L12 13l4.5-8h4L12 20z" />
        </svg>
      );
    case "svelte":
      return (
        <svg {...s}>
          <path d="M16.5 5.5a4.6 4.6 0 0 0-6.4-1L7 6.6a4.4 4.4 0 0 0-2 3 4.3 4.3 0 0 0 .6 2.9 4.5 4.5 0 0 0-.7 1.7 4.6 4.6 0 0 0 .8 3.5 4.6 4.6 0 0 0 6.4 1l3.1-2.1a4.4 4.4 0 0 0 2-3 4.3 4.3 0 0 0-.6-2.9 4.5 4.5 0 0 0 .7-1.7 4.6 4.6 0 0 0-.8-3.5z" />
          <path d="M9 16.2a2.5 2.5 0 0 0 3.4.6l3.1-2.1a2.2 2.2 0 0 0 1-1.5 2.2 2.2 0 0 0-.3-1.6l-.2-.3-.2.4a1 1 0 0 1-.4.4l-3.1 2.1a1 1 0 0 1-1.4-.3" />
        </svg>
      );
    case "next":
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="9" />
          <path d="M9 8.5v7M9 8.5l6.5 8.3" />
          <path d="M15.5 8.5v6" />
        </svg>
      );
    case "code":
      return (
        <svg {...s}>
          <path d="M8.5 7L4 12l4.5 5" />
          <path d="M15.5 7L20 12l-4.5 5" />
          <path d="M13.2 5.5l-2.4 13" />
        </svg>
      );
    case "dotnet":
      return (
        <svg {...s}>
          <path d="M8 12a3.2 3.2 0 1 1 0-4.5" />
          <path d="M16 12a3.2 3.2 0 1 0 0-4.5" />
          <circle cx="8" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="16" cy="16.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "hexagon":
      return (
        <svg {...s}>
          <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />
        </svg>
      );
    case "python":
      return (
        <svg {...s}>
          <path d="M12 3.5c-3 0-3.6 1.2-3.6 2.7v2h7.2v1H6.4C4.9 9.2 4 10.6 4 13.3c0 2.7 1 4 3 4h1.6v-2.4c0-2.2 1.6-3.4 3.6-3.4h4.4c1.6 0 2.9-1.3 2.9-2.9V6.2c0-1.5-1.5-2.7-4-2.7z" />
          <circle cx="9.7" cy="5.9" r="0.7" fill="currentColor" stroke="none" />
          <path d="M12 20.5c3 0 3.6-1.2 3.6-2.7v-2H8.4v-1h9.2c1.5 0 2.4-1.4 2.4-4.1 0-2.7-1-4-3-4h-1.6v2.4c0 2.2-1.6 3.4-3.6 3.4H7.4c-1.6 0-2.9 1.3-2.9 2.9v2.9c0 1.5 1.5 2.7 4 2.7z" />
          <circle cx="14.3" cy="18.1" r="0.7" fill="currentColor" stroke="none" />
        </svg>
      );
    case "rust":
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="2.3" />
          <path d="M12 4.5v2.3M12 17.2v2.3M4.5 12h2.3M17.2 12h2.3M6.6 6.6l1.6 1.6M15.8 15.8l1.6 1.6M6.6 17.4l1.6-1.6M15.8 8.2l1.6-1.6" />
        </svg>
      );
    case "terminal":
      return (
        <svg {...s}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
          <path d="M7 9.5l3 2.5-3 2.5" />
          <path d="M13 15h4" />
        </svg>
      );
    case "dashed":
      return (
        <svg {...s}>
          <rect x="4" y="4" width="16" height="16" rx="2.5" strokeDasharray="3.5 3.5" />
        </svg>
      );
    case "box":
      return (
        <svg {...s}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M4.5 7.5L12 12l7.5-4.5" />
          <path d="M12 12v9" />
        </svg>
      );
    case "puzzle":
      return (
        <svg {...s}>
          <circle cx="9" cy="12" r="6.5" />
          <circle cx="15" cy="12" r="6.5" />
        </svg>
      );
    case "folder":
    default:
      return (
        <svg {...s}>
          <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2a1.5 1.5 0 0 1 1.2.6l1 1.4H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" />
        </svg>
      );
  }
}

export function PresetIcon({
  presetId,
  glyph,
  size = 20,
}: {
  presetId: string;
  /** Explicit glyph override, used by custom presets that pick their own icon. */
  glyph?: string | null;
  size?: number;
}) {
  const g = glyph ?? glyphByPreset[presetId] ?? "folder";
  return <PresetGlyph glyph={g} size={size} />;
}
