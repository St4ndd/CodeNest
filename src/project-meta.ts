import { presetById } from "./presets";
import { pathExists, writeFile } from "./backend";
import type { CustomPreset, Group, Project, RunConfig } from "./types";

/** Broad, tech-agnostic .gitignore used for new/imported projects that don't
 * already have one — most scaffolding tools (npm create, dotnet new, cargo
 * new, …) ship their own, so this mainly covers "Empty project" and imports. */
const DEFAULT_GITIGNORE = `# Dependencies
node_modules/
.pnp
.pnp.js

# Build output
dist/
build/
out/
bin/
obj/

# Env / secrets
.env
.env.local

# Python
__pycache__/
*.pyc
.venv/
venv/

# IDE / OS
.vs/
.idea/
*.user
.DS_Store
Thumbs.db

# Logs
*.log
`;

/** Writes a .gitignore into `path` unless one is already there or the setting is off. */
export async function ensureGitignore(path: string, enabled: boolean): Promise<void> {
  if (!enabled) return;
  if (await pathExists(`${path}\\.gitignore`)) return;
  await writeFile(`${path}\\.gitignore`, DEFAULT_GITIGNORE);
}

/** Flattens groups into tree order (parents before children) with depth, for
 * indented rendering in selects and lists. */
export function groupTree(groups: Group[]): { group: Group; depth: number }[] {
  const byParent = new Map<string | null, Group[]>();
  for (const g of groups) {
    const key = g.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(g);
  }
  const result: { group: Group; depth: number }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const g of byParent.get(parentId) ?? []) {
      result.push({ group: g, depth });
      walk(g.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

export interface ProjectMeta {
  name: string;
  description: string;
  accent: string;
  /** Set for custom presets, which pick their own icon; null falls back to the built-in glyph map. */
  glyphOverride: string | null;
  runConfigs: RunConfig[];
  isCustom: boolean;
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "cfg"
  );
}

export function findCustomPreset(
  id: string,
  customPresets: CustomPreset[]
): CustomPreset | undefined {
  return customPresets.find((c) => c.id === id);
}

export function getProjectMeta(presetId: string, customPresets: CustomPreset[]): ProjectMeta {
  const custom = findCustomPreset(presetId, customPresets);
  if (custom) {
    return {
      name: custom.name,
      description: custom.description,
      accent: custom.accent,
      glyphOverride: custom.glyph,
      runConfigs: custom.runConfigs,
      isCustom: true,
    };
  }
  const p = presetById(presetId);
  return {
    name: p.name,
    description: p.description,
    accent: p.accent,
    glyphOverride: null,
    runConfigs: (p.runConfigs ?? []).map((c) => ({
      id: slug(c.name),
      name: c.name,
      command: c.command,
    })),
    isCustom: false,
  };
}

/** A project's effective run configs: its own overrides if set, otherwise the preset defaults. */
export function resolveRunConfigs(project: Project, customPresets: CustomPreset[]): RunConfig[] {
  if (project.runConfigs && project.runConfigs.length > 0) return project.runConfigs;
  return getProjectMeta(project.presetId, customPresets).runConfigs;
}

