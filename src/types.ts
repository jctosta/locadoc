export type Manifest = ManifestEntry[];

export interface ManifestEntry {
  name: string;
  slug: string;
  type: string;
  version?: string;
  release?: string;
  mtime: number;
  db_size: number;
  attribution?: string;
  links?: Record<string, string>;
}

export interface DocsetIndex {
  entries: IndexEntry[];
  types: IndexType[];
}

export interface IndexEntry {
  name: string;
  path: string;
  type: string;
}

export interface IndexType {
  name: string;
  count: number;
  slug: string;
}

export type DocsetDb = Record<string, string>;

export interface DocsetMeta {
  name: string;
  slug: string;
  type: string;
  version?: string;
  release?: string;
  mtime: number;
  db_size: number;
  attribution?: string;
  links?: Record<string, string>;
}

export interface InstalledDocset {
  slug: string;
  name: string;
  version?: string;
  release?: string;
  mtime: number;
  installedAt: number;
}

export interface SearchResult {
  docset: string;
  name: string;
  path: string;
  type: string;
  score: number;
}

export interface LsRow {
  slug: string;
  name: string;
  version?: string;
  release?: string;
  mtime: number;
  installed: boolean;
  stale: boolean;
}

export interface ReadResult {
  docset: string;
  path: string;
  fragment?: string;
  title: string;
  markdown: string;
  attribution?: string;
}

export type OutputFormat = "json" | "text";
export type RenderFormat = "md" | "ansi" | "html" | "raw";

export interface GlobalFlags {
  json: boolean;
  text: boolean;
  quiet: boolean;
  home?: string;
}

export const EXIT = {
  OK: 0,
  NOT_FOUND: 1,
  USAGE: 2,
  NETWORK: 3,
  STORAGE: 4,
  CHECK: 5,
} as const;

export type SkillScope = "global" | "project";

export type SkillAction =
  | "installed"
  | "updated"
  | "skipped"
  | "removed"
  | "absent"
  | "dry-run";

export interface SkillInstallResult {
  scope: SkillScope;
  path: string;
  action: SkillAction;
  bytes?: number;
}

export interface SkillWhereResult {
  scope: SkillScope;
  path: string;
  exists: boolean;
}

export type SelfUpdateAction =
  | "updated"
  | "no-op"
  | "available"
  | "dry-run"
  | "refused";

export interface SelfUpdateResult {
  currentVersion: string;
  latestVersion: string;
  action: SelfUpdateAction;
  path?: string;
  reason?: string;
}

export type DoctorStatus = "ok" | "warn" | "fail";

export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
}

export interface DoctorReport {
  checks: DoctorCheck[];
  summary: {
    ok: number;
    warn: number;
    fail: number;
  };
}
