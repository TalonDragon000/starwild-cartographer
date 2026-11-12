// Renders a small Markdown subset to HTML. Text is escaped, and the only tags
// emitted are the ones this file writes.

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

export function parseFrontmatter(markdown) {
  const text = String(markdown ?? "").replace(/^\uFEFF/, "");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: text, hasFrontmatter: false };
  return {
    data: parseYamlSubset(match[1]),
    body: text.slice(match[0].length),
    hasFrontmatter: true,
  };
}

export function skillBody(markdown, name) {
  const { body } = parseFrontmatter(markdown);
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start += 1;
  const heading = lines[start]?.match(/^#\s+(.*?)\s*#*\s*$/);
  if (heading && heading[1].trim() === String(name ?? "").trim()) {
    start += 1;
    if (lines[start] === "") start += 1;
  }
  return lines.slice(start).join("\n");
}

export function renderSkillMarkdown(markdown, name) {
  return renderMarkdown(skillBody(markdown, name));
}

export function renderMarkdown(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const fence = line.match(/^(`{3,})(.*)$/);
    if (fence) {
      const marker = fence[1];
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith(marker)) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      const tag = headingTag(heading[1].length);
      html.push(`<${tag}>${inline(heading[2])}</${tag}>`);
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      html.push(`<ul>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ""));
        index += 1;
      }
      html.push(`<ol>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ol>`);
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() !== "" && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }

  return html.join("\n");
}

function headingTag(level) {
  // The card title on the page is an h3, so the body starts at h4.
  if (level <= 2) return "h4";
  if (level === 3) return "h5";
  return "h6";
}

function isBlockStart(line) {
  return (
    /^`{3,}/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^\s*[-*]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line)
  );
}

function inline(source) {
  let html = "";
  let index = 0;
  while (index < source.length) {
    if (source[index] === "`") {
      const marker = source.slice(index).match(/^`+/)[0];
      const end = source.indexOf(marker, index + marker.length);
      if (end !== -1) {
        html += `<code>${escapeHtml(source.slice(index + marker.length, end))}</code>`;
        index = end + marker.length;
        continue;
      }
    }

    if (source.startsWith("**", index) || source.startsWith("__", index)) {
      const marker = source.slice(index, index + 2);
      const end = source.indexOf(marker, index + 2);
      if (end > index + 2) {
        html += `<strong>${inline(source.slice(index + 2, end))}</strong>`;
        index = end + 2;
        continue;
      }
    }

    if ((source[index] === "*" || source[index] === "_") && source[index + 1] !== source[index]) {
      const marker = source[index];
      const end = source.indexOf(marker, index + 1);
      const inner = end === -1 ? "" : source.slice(index + 1, end);
      if (
        end > index + 1 &&
        inner.length <= 200 &&
        !inner.startsWith(" ") &&
        !inner.endsWith(" ") &&
        !inner.includes(marker)
      ) {
        html += `<em>${inline(inner)}</em>`;
        index = end + 1;
        continue;
      }
    }

    if (source[index] === "[") {
      const link = source.slice(index).match(/^\[([^\]]+)\]\(([^)\s]+)\)/);
      if (link) {
        const href = safeUrl(link[2]);
        if (href) {
          html += `<a href="${escapeHtml(href)}">${inline(link[1])}</a>`;
          index += link[0].length;
          continue;
        }
      }
    }

    html += escapeHtml(source[index]);
    index += 1;
  }
  return html;
}

export function safeUrl(url) {
  const trimmed = String(url ?? "").trim();
  if (trimmed === "" || /[\s"'<>\\]/.test(trimmed) || trimmed.startsWith("//")) return null;
  let parsed;
  try {
    parsed = new URL(trimmed, "https://example.invalid");
  } catch {
    return null;
  }
  if (parsed.origin === "https://example.invalid") {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return null;
    return trimmed;
  }
  if (parsed.protocol === "http:" || parsed.protocol === "https:") return trimmed;
  return null;
}

function parseYamlSubset(yaml) {
  const data = {};
  const lines = yaml.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "") continue;
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) {
      data.__invalid = true;
      continue;
    }
    const key = pair[1];
    const raw = pair[2];
    if (raw === ">-" || raw === ">" || raw === "|" || raw === "|-") {
      const block = [];
      index += 1;
      while (index < lines.length && (/^\s+\S/.test(lines[index]) || lines[index].trim() === "")) {
        if (lines[index].trim() === "") {
          const next = lines[index + 1];
          if (!next || !/^\s+\S/.test(next)) break;
          block.push("");
        } else {
          block.push(lines[index].replace(/^\s+/, ""));
        }
        index += 1;
      }
      index -= 1;
      data[key] = raw.startsWith(">")
        ? block.join(" ").replace(/\s+/g, " ").trim()
        : block.join("\n").trim();
    } else {
      data[key] = raw.replace(/^["']|["']$/g, "").trim();
    }
  }
  return data;
}
