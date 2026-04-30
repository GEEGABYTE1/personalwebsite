const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = "/Users/jaivalpatel/Documents/Obsidian/article";
const OUT_DIR = path.join(ROOT, "research-notes");
const OUT_READMES = path.join(OUT_DIR, "readmes");
const OUT_IMAGES = path.join(OUT_DIR, "image");

const NOTE_TAG = /^\s*\[\[article\]\]\s*$/gim;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugify(name) {
  return name
    .replace(/\.md$/i, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "note";
}

function titleFromFile(file) {
  return path.basename(file, ".md").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function protectMath(markdown) {
  const stash = [];
  const save = match => {
    const token = `@@MATH_${stash.length}@@`;
    stash.push(match);
    return token;
  };

  const text = markdown
    .replace(/\$\$[\s\S]*?\$\$/g, save)
    .replace(/\\\[[\s\S]*?\\\]/g, save)
    .replace(/\\\([\s\S]*?\\\)/g, save);

  return { text, stash };
}

function restoreMath(html, stash) {
  return html.replace(/@@MATH_(\d+)@@/g, (_, index) => stash[Number(index)]);
}

function inlineMarkdown(text) {
  let html = escapeHtml(text);

  html = html.replace(/!\[\[([^\]]+)\]\]/g, (_, target) => {
    const file = target.split("|")[0].trim();
    return `<img src="image/${encodeURI(file)}" alt="${escapeHtml(path.basename(file))}">`;
  });

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const cleanSrc = src.trim();
    const localSrc = /^https?:\/\//i.test(cleanSrc) ? cleanSrc : `image/${encodeURI(cleanSrc.replace(/^\.?\//, ""))}`;
    return `<img src="${localSrc}" alt="${escapeHtml(alt)}">`;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s)]+)/g, '$1<a href="$2">$2</a>');
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return html;
}

function markdownToHtml(markdown) {
  const { text, stash } = protectMath(markdown.replace(NOTE_TAG, "").trim());
  const lines = text.split(/\r?\n/);
  const out = [];
  let paragraph = [];
  let listOpen = false;
  let quoteOpen = false;
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (listOpen) out.push("</ul>");
    listOpen = false;
  };
  const closeQuote = () => {
    if (quoteOpen) out.push("</blockquote>");
    quoteOpen = false;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        flushParagraph();
        closeList();
        closeQuote();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      closeList();
      closeQuote();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      closeList();
      closeQuote();
      const level = Math.min(heading[1].length + 1, 4);
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      flushParagraph();
      closeQuote();
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      flushParagraph();
      closeList();
      if (!quoteOpen) {
        out.push("<blockquote>");
        quoteOpen = true;
      }
      out.push(`<p>${inlineMarkdown(quote[1])}</p>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  closeQuote();
  if (inCode) out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);

  return restoreMath(out.join("\n"), stash);
}

function excerpt(markdown) {
  const text = markdown
    .replace(NOTE_TAG, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[#>*_`$\\[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function themeHead(title, cssHref, faviconHref) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} - Jaival Patel</title>
  <link rel="icon" href="${faviconHref}" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Geist+Mono:wght@300;400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">
  <link rel="stylesheet" href="${cssHref}" />
</head>`;
}

function themeScript() {
  return `<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/contrib/auto-render.min.js"></script>
<script>
const rootEl = document.documentElement;
const themeToggle = document.querySelector('.theme-toggle');
function setTheme(theme) {
  rootEl.dataset.theme = theme;
  localStorage.setItem('theme', theme);
  themeToggle.innerHTML = theme === 'dark'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 14.2A7.4 7.4 0 0 1 9.8 3a8.7 8.7 0 1 0 11.2 11.2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  themeToggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
  themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
}
const savedTheme = localStorage.getItem('theme');
const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
setTheme(savedTheme || preferredTheme);
themeToggle.addEventListener('click', () => setTheme(rootEl.dataset.theme === 'dark' ? 'light' : 'dark'));
document.addEventListener('DOMContentLoaded', () => {
  if (window.renderMathInElement) {
    renderMathInElement(document.body, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '\\\\[', right: '\\\\]', display: true},
        {left: '\\\\(', right: '\\\\)', display: false}
      ],
      throwOnError: false
    });
  }
});
</script>`;
}

function pageShell({ title, body, rootPrefix = "", cssHref = "research-notes.css" }) {
  return `${themeHead(title, cssHref, `${rootPrefix}favicon.svg`)}
<body>
  <main class="notes-shell">
    <nav class="notes-nav">
      <div class="nav-links">
        <a href="${rootPrefix}index.html">Home</a>
        <a href="${rootPrefix}research-notes.html">Research Notes</a>
        <a href="${rootPrefix}research-work.html">Research Work</a>
        <a href="${rootPrefix}projects.html">Systems Work</a>
      </div>
      <button class="theme-toggle" type="button"></button>
    </nav>
    ${body}
  </main>
  ${themeScript()}
</body>
</html>
`;
}

function copyRecursive(source, dest) {
  if (!fs.existsSync(source)) return;
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(source)) {
      copyRecursive(path.join(source, entry), path.join(dest, entry));
    }
    return;
  }
  fs.copyFileSync(source, dest);
}

function writeStyles() {
  fs.writeFileSync(path.join(OUT_DIR, "research-notes.css"), `*, *::before, *::after { box-sizing: border-box; }
:root {
  --bg: #ffffff;
  --fg: #111111;
  --text: #333333;
  --muted: #777777;
  --soft: #cccccc;
  --surface: #f7f7f7;
  --border: #e4e4e4;
  --font-sans: 'Lora', Georgia, serif;
  --font-mono: 'Geist Mono', 'Courier New', monospace;
}
[data-theme="dark"] {
  --bg: #111111;
  --fg: #f3f3f3;
  --text: #d5d5d5;
  --muted: #999999;
  --soft: #555555;
  --surface: #181818;
  --border: #333333;
}
html { color-scheme: light; }
html[data-theme="dark"] { color-scheme: dark; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.7;
  margin: 0;
  transition: background-color 0.2s ease, color 0.2s ease;
}
a {
  color: var(--fg);
  text-decoration: underline;
  text-decoration-color: var(--soft);
  text-underline-offset: 3px;
}
a:hover { text-decoration-color: var(--fg); }
.notes-shell {
  max-width: 720px;
  margin: 0 auto;
  padding: 48px 32px 72px;
}
.notes-nav {
  display: flex;
  align-items: center;
  gap: 28px;
  margin-bottom: 52px;
}
.nav-links {
  display: flex;
  flex-wrap: wrap;
  gap: 28px;
}
.notes-nav a {
  color: var(--muted);
  font-size: 0.85rem;
  text-decoration: none;
}
.notes-nav a:hover { color: var(--fg); }
.theme-toggle {
  appearance: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 30px;
  margin-left: auto;
  padding: 0;
  width: 30px;
}
.theme-toggle:hover {
  border-color: var(--muted);
  color: var(--fg);
}
.theme-toggle svg {
  height: 15px;
  width: 15px;
}
.page-kicker {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  margin-bottom: 12px;
  text-transform: uppercase;
}
h1 {
  font-size: 1.55rem;
  font-weight: 500;
  line-height: 1.3;
  margin: 0 0 16px;
}
.intro {
  color: var(--text);
  margin: 0 0 40px;
  max-width: 620px;
}
.note-list {
  border-top: 1px solid var(--border);
}
.note-row {
  display: grid;
  gap: 8px;
  padding: 22px 0;
  text-decoration: none;
  border-bottom: 1px solid var(--border);
}
.note-row h2 {
  font-size: 1.05rem;
  font-weight: 500;
  line-height: 1.35;
  margin: 0;
}
.note-row p {
  color: var(--text);
  margin: 0;
}
.note-meta {
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}
.note {
  color: var(--text);
}
.note-header {
  margin-bottom: 36px;
}
.note h2, .note h3, .note h4 {
  color: var(--fg);
  font-weight: 500;
  line-height: 1.35;
  margin: 34px 0 12px;
}
.note p, .note li {
  font-size: 0.98rem;
}
.note p {
  margin: 0 0 16px;
}
.note ul {
  margin: 0 0 18px 1.3rem;
  padding: 0;
}
.note blockquote {
  border-left: 1px solid var(--soft);
  color: var(--text);
  margin: 24px 0;
  padding-left: 18px;
}
.note pre {
  background: var(--surface);
  border: 1px solid var(--border);
  overflow-x: auto;
  padding: 14px;
}
.note code {
  font-family: var(--font-mono);
  font-size: 0.88em;
}
.note img {
  display: block;
  height: auto;
  margin: 28px auto;
  max-width: 100%;
}
.katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0;
}
@media (max-width: 600px) {
  .notes-shell { padding: 28px 20px 56px; }
  .notes-nav { gap: 16px; margin-bottom: 40px; }
  .nav-links { gap: 18px; }
}
`);
}

function build() {
  ensureDir(OUT_READMES);
  ensureDir(OUT_IMAGES);
  copyRecursive(path.join(SOURCE_DIR, "image"), OUT_IMAGES);

  const files = fs.readdirSync(SOURCE_DIR)
    .filter(file => file.toLowerCase().endsWith(".md"))
    .map(file => {
      const sourcePath = path.join(SOURCE_DIR, file);
      const markdown = fs.readFileSync(sourcePath, "utf8");
      const stat = fs.statSync(sourcePath);
      const slug = slugify(file);
      return {
        title: titleFromFile(file),
        file,
        slug,
        markdown,
        html: markdownToHtml(markdown),
        excerpt: excerpt(markdown),
        updated: stat.mtime,
      };
    })
    .sort((a, b) => b.updated - a.updated);

  writeStyles();

  for (const note of files) {
    fs.copyFileSync(path.join(SOURCE_DIR, note.file), path.join(OUT_READMES, note.file));
    const noteBody = `<article class="note">
      <header class="note-header">
        <div class="page-kicker">${formatDate(note.updated)}</div>
        <h1>${escapeHtml(note.title)}</h1>
      </header>
      ${note.html}
    </article>`;
    fs.writeFileSync(path.join(OUT_DIR, `${note.slug}.html`), pageShell({
      title: note.title,
      body: noteBody,
      rootPrefix: "../",
      cssHref: "research-notes.css",
    }));
  }

  const list = files.map(note => `<a class="note-row" href="research-notes/${note.slug}.html">
      <span class="note-meta">${formatDate(note.updated)}</span>
      <h2>${escapeHtml(note.title)}</h2>
      ${note.excerpt ? `<p>${escapeHtml(note.excerpt)}</p>` : ""}
    </a>`).join("\n");

  fs.writeFileSync(path.join(ROOT, "research-notes.html"), pageShell({
    title: "Research Notes",
    body: `<header>
      <div class="page-kicker">Research Notes</div>
      <h1>Fragments, Working Ideas.</h1>
      <p class="intro">Thoughts that I think that are worth documenting when I work</p>
    </header>
    <section class="note-list">${list}</section>`,
    rootPrefix: "",
    cssHref: "research-notes/research-notes.css",
  }));

  console.log(`Built ${files.length} research notes.`);
}

build();
