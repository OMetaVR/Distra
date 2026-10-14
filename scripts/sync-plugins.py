#!/usr/bin/env python3
"""Vendors built-in plugin sources into builtin-plugins/sources/.

Each repository in builtin-plugins/catalog.json is fetched at its pinned commit
and copied without VCS data, dependencies, lockfiles or large media. An
UPSTREAM.json with the origin, commit and license is written next to the
upstream LICENSE.

    python3 scripts/sync-plugins.py            # sync every repo
    python3 scripts/sync-plugins.py owner/repo # sync one repo
    python3 scripts/sync-plugins.py --update   # move every pin to the repo's latest commit first
    python3 scripts/sync-plugins.py --save-patches   # record local edits to sources/ as patches/

Distra's fixes to vendored plugins live in builtin-plugins/patches/<dir>.patch and are
re-applied after every sync. Edit files under sources/, then run --save-patches.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "builtin-plugins"
CATALOG = ROOT / "catalog.json"
PATCHES = ROOT / "patches"

SKIP_DIRS = {".git", ".github", "node_modules", ".vscode", ".idea", ".husky"}
SKIP_FILES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock", "yarn-error.log", ".DS_Store"}
MEDIA_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".mov", ".mp3", ".wav"}
MAX_MEDIA_BYTES = 256 * 1024


def run(*command: str, cwd: Path | None = None) -> str:
    return subprocess.run(command, cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


def portable(relative: Path) -> Path:
    """Strips trailing spaces/dots from path parts, which Windows filesystems reject."""
    return Path(*(part.rstrip(" .") or part for part in relative.parts))


def keep(path: Path) -> bool:
    if path.name in SKIP_FILES:
        return False
    if path.suffix.lower() in MEDIA_SUFFIXES and path.stat().st_size > MAX_MEDIA_BYTES:
        return False
    return True


def checkout(repo: dict, into: Path, update: bool) -> None:
    run("git", "clone", "--quiet", "--filter=blob:none", "--no-checkout", repo["url"], str(into))
    if update:
        repo["commit"] = run("git", "rev-parse", "origin/HEAD", cwd=into)
    run("git", "checkout", "--quiet", repo["commit"], cwd=into)


def copy_tree(source_root: Path, destination: Path) -> None:
    for source in sorted(source_root.rglob("*")):
        relative = source.relative_to(source_root)
        if any(part in SKIP_DIRS for part in relative.parts) or not source.is_file() or not keep(source):
            continue
        target = destination / portable(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def sync(name: str, repo: dict, update: bool) -> None:
    with tempfile.TemporaryDirectory() as temp:
        upstream = Path(temp) / "repo"
        checkout(repo, upstream, update)
        destination = ROOT / repo["dir"]
        shutil.rmtree(destination, ignore_errors=True)
        copy_tree(upstream, destination)

    patch = PATCHES / f"{Path(repo['dir']).name}.patch"
    if patch.exists():
        result = subprocess.run(["patch", "-p1", "--forward", "--no-backup-if-mismatch", "-d", str(destination), "-i", str(patch)],
                                capture_output=True, text=True)
        if result.returncode != 0:
            print(f"!! {patch.name} no longer applies cleanly:\n{result.stdout}{result.stderr}")

    (destination / "UPSTREAM.json").write_text(json.dumps({
        "repository": repo["url"],
        "commit": repo["commit"],
        "license": repo["license"],
        "patches": f"builtin-plugins/patches/{patch.name}" if patch.exists() else None,
    }, indent=2) + "\n")
    print(f"synced {name} @ {repo['commit'][:10]}{' + patches' if patch.exists() else ''}")


def save_patches(name: str, repo: dict) -> None:
    """Diffs sources/<dir> against pristine upstream and writes patches/<dir>.patch."""
    destination = ROOT / repo["dir"]
    patch = PATCHES / f"{Path(repo['dir']).name}.patch"
    with tempfile.TemporaryDirectory() as temp:
        upstream = Path(temp) / "repo"
        checkout(repo, upstream, False)
        copy_tree(upstream, Path(temp) / "a")
        shutil.copytree(destination, Path(temp) / "b", ignore=shutil.ignore_patterns("UPSTREAM.json", *SKIP_DIRS))
        diff = subprocess.run(["diff", "-ruN", "a", "b"], cwd=temp, capture_output=True, text=True).stdout
    if diff:
        PATCHES.mkdir(exist_ok=True)
        patch.write_text(diff)
        print(f"saved {patch.name} ({diff.count(chr(10) + '+++ ')+diff.startswith('+++ ')} files)")
    elif patch.exists():
        patch.unlink()
        print(f"removed {patch.name} (no changes)")


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    update = "--update" in sys.argv
    catalog = json.loads(CATALOG.read_text())
    for name, repo in catalog["repos"].items():
        if args and name not in args:
            continue
        if "--save-patches" in sys.argv:
            save_patches(name, repo)
        else:
            sync(name, repo, update)
    if update:
        CATALOG.write_text(json.dumps(catalog, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
