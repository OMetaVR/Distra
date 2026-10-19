// Tokenizes chat code blocks with highlight.js, the highlighter desktop Discord uses (vendored in
// ./hljs: 11.11.1 core plus a curated set of languages, BSD-3-Clause, see hljs/LICENSE). Tokens
// keep hljs's scope names ("keyword", "title.function", "string", ...) so palettes colour them
// like desktop's stylesheet does. ```ansi blocks are coloured from their escape codes, as on desktop.

import hljs from "./hljs/core.js";
import bash from "./hljs/languages/bash.js";
import c from "./hljs/languages/c.js";
import cmake from "./hljs/languages/cmake.js";
import cpp from "./hljs/languages/cpp.js";
import csharp from "./hljs/languages/csharp.js";
import css from "./hljs/languages/css.js";
import dart from "./hljs/languages/dart.js";
import diff from "./hljs/languages/diff.js";
import dockerfile from "./hljs/languages/dockerfile.js";
import elixir from "./hljs/languages/elixir.js";
import go from "./hljs/languages/go.js";
import graphql from "./hljs/languages/graphql.js";
import haskell from "./hljs/languages/haskell.js";
import ini from "./hljs/languages/ini.js";
import java from "./hljs/languages/java.js";
import javascript from "./hljs/languages/javascript.js";
import json from "./hljs/languages/json.js";
import kotlin from "./hljs/languages/kotlin.js";
import lua from "./hljs/languages/lua.js";
import makefile from "./hljs/languages/makefile.js";
import markdown from "./hljs/languages/markdown.js";
import nginx from "./hljs/languages/nginx.js";
import objectivec from "./hljs/languages/objectivec.js";
import php from "./hljs/languages/php.js";
import plaintext from "./hljs/languages/plaintext.js";
import powershell from "./hljs/languages/powershell.js";
import properties from "./hljs/languages/properties.js";
import python from "./hljs/languages/python.js";
import r from "./hljs/languages/r.js";
import ruby from "./hljs/languages/ruby.js";
import rust from "./hljs/languages/rust.js";
import scala from "./hljs/languages/scala.js";
import scss from "./hljs/languages/scss.js";
import shell from "./hljs/languages/shell.js";
import sql from "./hljs/languages/sql.js";
import swift from "./hljs/languages/swift.js";
import typescript from "./hljs/languages/typescript.js";
import xml from "./hljs/languages/xml.js";
import yaml from "./hljs/languages/yaml.js";

/** A run of code and its hljs scopes, outermost first ("" for plain text). */
export type Token = [scopes: string, text: string];

/** A run of ```ansi text: SGR foreground/background colour indices, bold, underline. */
export interface AnsiRun { text: string; fg?: number; bg?: number; bold?: boolean; underline?: boolean }

const GRAMMARS: Record<string, [name: string, grammar: any]> = {
    javascript: ["JavaScript", javascript],
    typescript: ["TypeScript", typescript],
    json: ["JSON", json],
    python: ["Python", python],
    bash: ["Bash", bash],
    shell: ["Shell", shell],
    powershell: ["PowerShell", powershell],
    css: ["CSS", css],
    scss: ["SCSS", scss],
    xml: ["HTML", xml],
    c: ["C", c],
    cpp: ["C++", cpp],
    objectivec: ["Objective-C", objectivec],
    csharp: ["C#", csharp],
    java: ["Java", java],
    kotlin: ["Kotlin", kotlin],
    swift: ["Swift", swift],
    go: ["Go", go],
    rust: ["Rust", rust],
    ruby: ["Ruby", ruby],
    php: ["PHP", php],
    lua: ["Lua", lua],
    sql: ["SQL", sql],
    yaml: ["YAML", yaml],
    ini: ["TOML", ini],
    diff: ["Diff", diff],
    markdown: ["Markdown", markdown],
    dart: ["Dart", dart],
    dockerfile: ["Dockerfile", dockerfile],
    makefile: ["Makefile", makefile],
    haskell: ["Haskell", haskell],
    elixir: ["Elixir", elixir],
    r: ["R", r],
    scala: ["Scala", scala],
    graphql: ["GraphQL", graphql],
    nginx: ["Nginx", nginx],
    properties: ["Properties", properties],
    cmake: ["CMake", cmake],
    plaintext: ["Text", plaintext],
};

/** Fence tags hljs doesn't know, mapped to a grammar we ship (desktop leaves most of these plain). */
const EXTRA_ALIASES: Record<string, string> = {
    sh: "bash", zsh: "bash", shellscript: "bash", fish: "bash", console: "shell", shellsession: "shell",
    ps: "powershell", ps1: "powershell", pwsh: "powershell",
    html: "xml", htm: "xml", xhtml: "xml", svg: "xml", plist: "xml", vue: "xml", svelte: "xml",
    tsx: "typescript", ts: "typescript", mts: "typescript", cts: "typescript", json5: "json",
    py: "python", py3: "python", gyp: "python", rb: "ruby", "c++": "cpp", hpp: "cpp", cc: "cpp", h: "c",
    "c#": "csharp", cs: "csharp", kt: "kotlin", kts: "kotlin", "objective-c": "objectivec", objc: "objectivec", m: "objectivec", mm: "objectivec",
    luau: "lua", less: "scss", sass: "scss", yml: "yaml", toml: "ini", cfg: "ini", conf: "ini", md: "markdown",
    mysql: "sql", postgres: "sql", postgresql: "sql", sqlite: "sql", docker: "dockerfile", make: "makefile",
    text: "plaintext", txt: "plaintext", gql: "graphql", ex: "elixir", exs: "elixir", hs: "haskell",
};

/** Labels for tags that share a grammar with another language. */
const TAG_NAMES: Record<string, string> = {
    xml: "XML", svg: "SVG", plist: "plist", vue: "Vue", svelte: "Svelte", jsx: "JSX", tsx: "TSX", sh: "Shell", zsh: "Zsh",
    fish: "Fish", ini: "INI", cfg: "Config", conf: "Config", less: "Less", sass: "Sass", jsonc: "JSONC", json5: "JSON5",
    console: "Console", h: "C header", hpp: "C++ header", luau: "Luau", mysql: "MySQL", postgres: "PostgreSQL",
    postgresql: "PostgreSQL", sqlite: "SQLite", patch: "Patch", txt: "Text",
};

let registered = false;
function register() {
    if (registered) return;
    registered = true;
    for (const [id, [, grammar]] of Object.entries(GRAMMARS)) hljs.registerLanguage(id, grammar);
}

export interface Language {
    /** hljs language id, or "ansi". */
    id: string;
    /** Display name for the label. */
    name: string;
}

/** The language for a code fence's tag (`js`, `JavaScript`, `C++`, ...), if we highlight it. */
export function getLanguage(tag: string | undefined): Language | undefined {
    const key = tag?.trim().toLowerCase();
    if (!key) return undefined;
    if (key === "ansi") return { id: "ansi", name: "ANSI" };
    register();
    let id: string | undefined = GRAMMARS[key] ? key : EXTRA_ALIASES[key];
    if (!id) {
        const language = hljs.getLanguage(key);
        id = language ? Object.keys(GRAMMARS).find(name => hljs.getLanguage(name) === language) : undefined;
    }
    return id ? { id, name: TAG_NAMES[key] ?? GRAMMARS[id][0] } : undefined;
}

/** Splits `code` into tokens; adjacent tokens with the same scopes are merged. */
export function tokenize(code: string, languageId: string): Token[] {
    register();
    const result = hljs.highlight(code, { language: languageId, ignoreIllegals: true });
    const root = result?._emitter?.rootNode;
    if (!root) return [["", code]];
    const out: Token[] = [];
    const push = (scopes: string, text: string) => {
        if (!text) return;
        const last = out[out.length - 1];
        if (last && last[0] === scopes) last[1] += text;
        else out.push([scopes, text]);
    };
    const walk = (node: any, scopes: string, depth: number) => {
        for (const child of node.children ?? []) {
            if (typeof child === "string") push(scopes, child);
            else if (depth < 32) {
                // Embedded languages ("language:css" in HTML) only group their tokens.
                const scope = typeof child.scope === "string" && !child.scope.startsWith("language:") ? child.scope : "";
                walk(child, scope ? (scopes ? `${scopes} ${scope}` : scope) : scopes, depth + 1);
            }
        }
    };
    walk(root, "", 0);
    // The emitter holds what hljs matched; anything it dropped would shift every offset after it.
    return out.reduce((n, [, text]) => n + text.length, 0) === code.length ? out : [["", code]];
}

// --- ANSI ------------------------------------------------------------------------------------

/** ESC [ params m, as desktop parses them (other escape sequences are left as text). */
const SGR = /\u001b\[([\d;]*)m/g;

/** Splits an ```ansi block into styled runs with the escape codes removed. */
export function parseAnsi(code: string): AnsiRun[] {
    const runs: AnsiRun[] = [];
    let state: Omit<AnsiRun, "text"> = {};
    let last = 0;
    const push = (text: string) => {
        if (!text) return;
        const prev = runs[runs.length - 1];
        if (prev && prev.fg === state.fg && prev.bg === state.bg && prev.bold === state.bold && prev.underline === state.underline) prev.text += text;
        else runs.push({ text, ...state });
    };
    for (const m of code.matchAll(SGR)) {
        push(code.slice(last, m.index));
        last = m.index! + m[0].length;
        const params = m[1] ? m[1].split(";").map(Number) : [0];
        for (const p of params) {
            if (p === 0) state = {};
            else if (p === 1) state = { ...state, bold: true };
            else if (p === 4) state = { ...state, underline: true };
            else if (p >= 30 && p <= 37) state = { ...state, fg: p - 30 };
            else if (p >= 40 && p <= 47) state = { ...state, bg: p - 40 };
        }
    }
    push(code.slice(last));
    return runs;
}

export const stripAnsi = (code: string) => code.replace(SGR, "");
