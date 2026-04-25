import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(target) {
  await fs.mkdir(target, { recursive: true });
}

export async function walkFiles(root, predicate) {
  const files = [];
  if (!(await pathExists(root))) return files;

  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (!predicate || predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  await visit(root);
  return files.sort();
}

export async function readJsonl(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const rows = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch (error) {
      rows.push({
        type: "parse-error",
        line: index + 1,
        error: error.message,
        raw: trimmed.slice(0, 500)
      });
    }
  }
  return rows;
}

export function stableId(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && String(part).length > 0)
    .map((part) => String(part).replace(/[^a-zA-Z0-9_.:-]+/g, "_"))
    .join(":");
}

export function safeSnippet(value, max = 180) {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

export function redactText(value, max = 96) {
  const snippet = safeSnippet(value, max);
  if (!snippet) return "";
  return snippet.length >= max ? `${snippet}...` : snippet;
}

export function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block) return "";
      if (typeof block === "string") return block;
      if (block.type === "text") return block.text || "";
      if (block.type === "thinking") return "[thinking]";
      if (block.type === "tool_use") return `[tool_use:${block.name || block.id || "tool"}]`;
      if (block.type === "tool_result") return `[tool_result:${block.tool_use_id || "tool"}]`;
      return `[${block.type || "content"}]`;
    })
    .filter(Boolean)
    .join("\n");
}

export function inferProjectFromClaudePath(filePath) {
  const marker = `${path.sep}.claude${path.sep}projects${path.sep}`;
  const after = filePath.includes(marker) ? filePath.split(marker)[1] : filePath;
  const encoded = after.split(path.sep)[0] || "unknown";
  return encoded.replace(/^-/, "/").replaceAll("-", "/");
}

export function fileMtimeMs(stat) {
  return stat.mtimeMs ? Math.round(stat.mtimeMs) : Date.now();
}
