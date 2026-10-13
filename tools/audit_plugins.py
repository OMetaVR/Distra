#!/usr/bin/env python3
"""Checks every built-in plugin's module lookups against an index of Discord's bundle.

    python3 tools/audit_plugins.py <modules.json> [plugin-id-substring]

modules.json comes from tools/index_modules.py run over hermes-dec output of
Discord's main.jsbundle (see tools/README.md). For each plugin, every
findByProps/findByName/findByStoreName/... call with literal arguments is
extracted from its source and checked; lookups no module satisfies are listed.
The check over-approximates (a module "has" every key it assigns anywhere), so
a MISSING result is reliable while a match is only likely.
"""
import json
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "builtin-plugins")
modules = json.load(open(sys.argv[1]))
only = sys.argv[2].lower() if len(sys.argv) > 2 else None

key_index = defaultdict(set)      # property names, including class method names
name_index = defaultdict(set)     # function / class names
display_index = defaultdict(set)  # displayName values and string constants (stores are built with their name)
paths = {}
basenames = defaultdict(set)      # "UserProfileCard" -> modules from .../UserProfileCard.tsx
for mid, m in modules.items():
    if m["path"]:
        basenames[re.sub(r"(?:\.(?:native|ios|android))?\.[jt]sx?$", "", os.path.basename(m["path"]))].add(mid)
    for k in m["keys"] + m["names"]:
        key_index[k].add(mid)
    for n in m["names"]:
        name_index[n].add(mid)
    for d in m["displayNames"] + m.get("strings", []):
        display_index[d].add(mid)
    if m["path"]:
        paths[m["path"]] = mid

STR = r"""(?:"([^"\\]*)"|'([^'\\]*)'|`([^`$\\]*)`)"""
call_re = re.compile(
    r"\b(findByProps(?:Lazy|All|Proxy)?|findByName(?:Lazy|All)?|findByDisplayName(?:Lazy|All)?|findByTypeName(?:Lazy|All)?|"
    r"findByTypeDisplayName(?:Lazy)?|findByStoreName(?:Lazy)?|findByFilePath(?:Lazy)?|"
    r"getByProps|getByName|getByDisplayName|getByTypeName|byProps|byName|byDisplayName|byTypeName|byStoreName)\s*\(\s*((?:" + STR + r"\s*,?\s*)+)")
str_re = re.compile(STR)


def strings(arglist):
    return [next(g for g in m.groups() if g is not None) for m in str_re.finditer(arglist)]


def check(kind, args):
    kind = kind.replace("Lazy", "").replace("All", "").replace("Proxy", "")
    if kind in ("findByProps", "getByProps", "byProps"):
        if not args:
            return True
        hits = set.intersection(*(key_index.get(a, set()) for a in args))
        return bool(hits)
    if kind in ("findByName", "getByName", "byName", "findByTypeName", "getByTypeName", "byTypeName"):
        # Discord minifies component names; Discordia falls back to the module's source file name.
        return bool(name_index.get(args[0])) or bool(basenames.get(args[0]))
    if kind in ("findByDisplayName", "getByDisplayName", "byDisplayName", "findByTypeDisplayName", "findByStoreName", "byStoreName"):
        return bool(display_index.get(args[0])) or bool(name_index.get(args[0])) or bool(basenames.get(args[0]))
    if kind == "findByFilePath":
        return args[0] in paths
    return True


def source_files(directory):
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d not in ("node_modules", "dist", ".git")]
        for f in files:
            if f.endswith((".ts", ".tsx", ".js", ".jsx")):
                yield os.path.join(root, f)


catalog = json.load(open(os.path.join(ROOT, "catalog.json")))
total_missing = 0
for plugin in catalog["plugins"]:
    if only and only not in plugin["id"]:
        continue
    repo = catalog["repos"][plugin["repo"]]
    directory = os.path.normpath(os.path.join(ROOT, repo["dir"], plugin["path"]))
    missing = []
    seen = set()
    for file in source_files(directory):
        text = open(file, encoding="utf-8", errors="ignore").read()
        for m in call_re.finditer(text):
            kind, args = m.group(1), strings(m.group(2))
            key = (kind, tuple(args))
            if key in seen or not args:
                continue
            seen.add(key)
            if not check(kind, args):
                missing.append(f"{kind}({', '.join(args)})  [{os.path.relpath(file, directory)}]")
    status = "OK " if not missing else "BAD"
    print(f"{status} {plugin['id']}  ({len(seen)} lookups)")
    for line in missing:
        print(f"      missing: {line}")
    total_missing += len(missing)
print(f"\n{total_missing} unresolvable lookups")
