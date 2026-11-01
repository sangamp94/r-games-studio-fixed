import fs from "node:fs";
import path from "node:path";

const TARGET_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".md",
  ".svg",
  ".prisma",
  ".html",
  ".yml",
  ".yaml",
]);

const IGNORED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".storage",
  "dist",
  "coverage",
  "playwright-report",
]);

const EMOJI_REGEX =
  /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{FE0E}\u{FE0F}\u{200D}]/gu;

interface Violation {
  file: string;
  line: number;
  column: number;
  codePoint: string;
}

function scanDirectory(dirPath: string, violations: Violation[]) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        scanDirectory(fullPath, violations);
      }
      continue;
    }

    const ext = path.extname(entry.name);
    if (!TARGET_EXTENSIONS.has(ext)) {
      continue;
    }

    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split(/\r?\n/);

    lines.forEach((lineText, idx) => {
      for (const match of lineText.matchAll(EMOJI_REGEX)) {
        const char = match[0];
        const codePoint = `U+${char.codePointAt(0)?.toString(16).toUpperCase()}`;
        violations.push({
          file: path.relative(process.cwd(), fullPath),
          line: idx + 1,
          column: (match.index ?? 0) + 1,
          codePoint,
        });
      }
    });
  }
}

const violations: Violation[] = [];
scanDirectory(process.cwd(), violations);

if (violations.length > 0) {
  console.error("Rule B violation: Disallowed emoji or symbol characters detected:");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}:${v.column} (${v.codePoint})`);
  }
  process.exit(1);
}

console.log("check:no-emoji passed with zero violations.");
