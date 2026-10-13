#!/usr/bin/env python3
"""Indexes Discord's Hermes bundle per Metro module, from hermes-dec disassembly.

    hbc-disassembler main.jsbundle main.disasm.txt      # pip install git+https://github.com/P1sec/hermes-dec
    python3 tools/index_modules.py main.disasm.txt modules.json

Every function is attributed to the module factory that (transitively) creates
it. Per module the index records: source path (fileFinishedImporting), every
property name read or written, object literal keys, function names, string
constants, and displayName values. tools/audit_plugins.py checks plugin
lookups against it.
"""
import json
import re
import sys
from collections import defaultdict

header_re = re.compile(r'^=> \[Function #(\d+) "([^"]*)"')
instr_re = re.compile(r"^==> [0-9a-f]+: <(\w+)>: (.*)$")
string_comment_re = re.compile(r"# String: '((?:[^'\\]|\\.)*)'")
function_id_re = re.compile(r"function_id: (\d+)")
regs_re = re.compile(r"Reg(?:8|32): (\d+)")
imm_re = re.compile(r"(?:UInt8|UInt16|UInt32|Imm32): (-?\d+)")
object_keys_re = re.compile(r"# Object: \{(.*)\}")
path_re = re.compile(r"^(?:[\w@.-]+/)+[\w@.-]+\.(?:tsx|ts|jsx|js)$")

functions = {}           # id -> {name, keys, strings, children, displayNames, paths}
module_factories = {}    # module id -> function id

current = None
regs_string = {}
regs_const = {}
regs_closure = {}
regs_global = {}


def new_function(fid, name):
    return {"name": name, "keys": set(), "strings": set(), "children": [], "displayNames": set(), "paths": []}


with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
    for line in f:
        h = header_re.match(line)
        if h:
            fid = int(h.group(1))
            current = functions.setdefault(fid, new_function(fid, h.group(2)))
            current["id"] = fid
            regs_string, regs_const, regs_closure, regs_global = {}, {}, {}, {}
            continue
        if current is None:
            continue
        m = instr_re.match(line)
        if not m:
            continue
        op, rest = m.group(1), m.group(2)
        regs = [int(r) for r in regs_re.findall(rest)]
        sm = string_comment_re.search(rest)

        if "Closure" in op or op.startswith("CreateGenerator"):
            fm = function_id_re.search(rest)
            if fm:
                child = int(fm.group(1))
                current["children"].append(child)
                if regs:
                    regs_closure[regs[0]] = child
            continue

        # Native classes (bytecode 96+): the last operand is the constructor's function id.
        if op.startswith(("CreateBaseClass", "CreateDerivedClass")):
            ids = imm_re.findall(rest)
            if ids:
                current["children"].append(int(ids[-1]))
            continue

        if op.startswith("LoadConstString") and sm:
            value = sm.group(1)
            current["strings"].add(value)
            if regs:
                regs_string[regs[0]] = value
            if path_re.match(value):
                current["paths"].append(value)
            continue

        if op in ("LoadConstZero", "LoadConstUInt8", "LoadConstInt"):
            im = imm_re.search(rest)
            if regs:
                regs_const[regs[0]] = 0 if op == "LoadConstZero" else (int(im.group(1)) if im else None)
            continue

        if "ById" in op and sm:
            key = sm.group(1)
            current["keys"].add(key)
            if op.startswith("TryGetById") and key == "__d" and regs:
                regs_global[regs[0]] = "__d"
            # PutById*: <obj, value, cache, string_id>
            if op.startswith(("PutById", "PutNewOwnById", "TryPutById")) and key == "displayName" and len(regs) >= 2:
                value = regs_string.get(regs[1])
                if value:
                    current["displayNames"].add(value)
            continue

        om = object_keys_re.search(rest)
        if om:
            for key in re.findall(r"'([A-Za-z_$][\w$]*)'\s*:", om.group(1)):
                current["keys"].add(key)

        # Module definitions in the global function: __d(factory, moduleId, deps)
        if current.get("id") == 0 and op.startswith("Call") and len(regs) >= 5:
            callee, factory_reg, id_reg = regs[1], regs[3], regs[4]
            if regs_global.get(callee) == "__d" and factory_reg in regs_closure and regs_const.get(id_reg) is not None:
                module_factories[regs_const[id_reg]] = regs_closure[factory_reg]

modules = {}
for module_id, factory in module_factories.items():
    keys, strings, names, display, paths = set(), set(), set(), set(), []
    stack, seen = [factory], set()
    while stack:
        fid = stack.pop()
        if fid in seen or fid not in functions:
            continue
        seen.add(fid)
        fn = functions[fid]
        keys |= fn["keys"]
        strings |= fn["strings"]
        display |= fn["displayNames"]
        if fn["name"]:
            names.add(fn["name"])
        stack.extend(fn["children"])
    factory_paths = functions.get(factory, {}).get("paths", [])
    modules[str(module_id)] = {
        "path": factory_paths[-1] if factory_paths else None,
        "keys": sorted(keys),
        "names": sorted(names),
        "displayNames": sorted(display),
        "strings": sorted(s for s in strings if len(s) <= 120),
        "functions": len(seen),
        "fids": sorted(seen),
    }

with open(sys.argv[2], "w") as out:
    json.dump(modules, out)
print(f"indexed {len(modules)} modules from {len(functions)} functions; {sum(1 for m in modules.values() if m['path'])} with source paths")
