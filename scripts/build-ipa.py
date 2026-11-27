#!/usr/bin/env python3
"""Builds a Distra IPA from a decrypted Discord IPA.

Distra-specific changes (bundled icon packs, extra alternate app icons) are
applied here; tweak injection, renaming and signing prep are delegated to cyan
(https://github.com/asdfzxcvbn/pyzule-rw).

    python3 scripts/build-ipa.py \\
        --ipa Discord.ipa \\
        --deb tweak/packages/dev.distra.tweak_0.1.0_iphoneos-arm.deb \\
        --output dist/Distra.ipa \\
        [--icon-pack path/to/Plumpy ...] \\
        [--alt-icon DistraIcon=icon-1024.png ...] \\
        [--name Distra] [--bundle-id com.example.distra] [--remove-extensions]

Use the rootful (iphoneos-arm) .deb; cyan rewrites its paths for injection.
--alt-icon needs Pillow.
"""

from __future__ import annotations

import argparse
import plistlib
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

# Sizes iOS expects for an alternate icon, matching Discord's own (e.g. AngryIcon*).
ALT_ICON_SIZES = {
    "@2x.png": 120,
    "@3x.png": 180,
    "@2x~ipad.png": 152,
    "@3x~ipad.png": 167,
}


def find_app(payload: Path) -> Path:
    apps = list(payload.glob("*.app"))
    if len(apps) != 1:
        raise SystemExit(f"expected exactly one .app in {payload}, found {len(apps)}")
    return apps[0]


def add_icon_packs(app: Path, packs: list[Path]) -> None:
    for pack in packs:
        if not pack.is_dir():
            raise SystemExit(f"icon pack {pack} is not a directory")
        destination = app / "DistraIconPacks" / pack.name
        shutil.rmtree(destination, ignore_errors=True)
        # Assets.car only matches the Discord version a pack was made for; JS-side packs use the PNGs.
        shutil.copytree(pack, destination, ignore=shutil.ignore_patterns("Assets.car", ".*"))
        # Distra's own additions to the pack (iconpacks/<name>) go on top.
        additions = Path(__file__).resolve().parent.parent / "iconpacks" / pack.name
        if additions.is_dir():
            shutil.copytree(additions, destination, dirs_exist_ok=True)
        print(f"added icon pack {pack.name} ({sum(1 for p in destination.rglob('*') if p.is_file())} files)")


def add_alt_icons(app: Path, info: dict, icons: list[str]) -> None:
    if not icons:
        return
    try:
        from PIL import Image
    except ImportError:
        raise SystemExit("--alt-icon needs Pillow (pip install pillow)")

    for spec in icons:
        name, _, source = spec.partition("=")
        if not name or not source:
            raise SystemExit(f"--alt-icon expects NAME=PATH, got {spec!r}")
        image = Image.open(source).convert("RGBA")
        for suffix, size in ALT_ICON_SIZES.items():
            # Home screen icons must be opaque.
            flattened = Image.new("RGB", image.size, (0, 0, 0))
            flattened.paste(image, mask=image.split()[3])
            flattened.resize((size, size), Image.LANCZOS).save(app / f"{name}{suffix}")

        for key in ("CFBundleIcons", "CFBundleIcons~ipad"):
            alternates = info.setdefault(key, {}).setdefault("CFBundleAlternateIcons", {})
            alternates[name] = {"CFBundleIconFiles": [name]}
        print(f"added alternate app icon {name}")


def patch_info_plist(app: Path, alt_icons: list[str]) -> None:
    info_path = app / "Info.plist"
    info = plistlib.loads(info_path.read_bytes())
    # Show Documents (and Distra/IconPacks) in the Files app. cyan's -d only sets UIFileSharingEnabled.
    info["UIFileSharingEnabled"] = True
    info["LSSupportsOpeningDocumentsInPlace"] = True
    add_alt_icons(app, info, alt_icons)
    info_path.write_bytes(plistlib.dumps(info, fmt=plistlib.FMT_BINARY))


# App extensions that need Distra loaded too: the screen-share extension reaches the app through the
# shared app group container, which the tweak remaps when a signer renamed the group (tweak/Sources/Tweak.x).
EXTENSIONS_WITH_DISTRA = ["BroadcastUpload.appex"]
# cyan puts the tweak in the app's Frameworks; extensions live in PlugIns/<name>.appex.
EXTENSION_DYLIB = "@executable_path/../../Frameworks/Distra.dylib"


def find_cyan_tools(cyan: str) -> tuple[str, str, Path | None]:
    """Find insert_dylib, ldid, and cyan's zero.requirements (needed to preserve entitlements)."""
    insert_dylib = shutil.which("insert_dylib")
    ldid = shutil.which("ldid")
    zero_req: Path | None = None

    script = Path(shutil.which(cyan) or cyan)
    python = script.read_text(errors="ignore").splitlines()[0].removeprefix("#!").strip() if script.is_file() else sys.executable
    result = subprocess.run(
        [python, "-c", "import cyan.tbhutils as t; a, b = t.get_tools_dir(); print(a); print(b)"],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
        if len(lines) == 2:
            install_dir, tools_dir = Path(lines[0]), Path(lines[1])
            if not insert_dylib and (tools_dir / "insert_dylib").is_file():
                insert_dylib = str(tools_dir / "insert_dylib")
            if not ldid and (tools_dir / "ldid").is_file():
                ldid = str(tools_dir / "ldid")
            candidate_req = install_dir / "extras" / "zero.requirements"
            if candidate_req.is_file():
                zero_req = candidate_req

    if not insert_dylib:
        raise SystemExit("insert_dylib not found (it comes with cyan)")
    if not ldid:
        raise SystemExit("ldid not found (it comes with cyan)")
    return insert_dylib, ldid, zero_req


def load_distra_in_extensions(app: Path, work: Path, cyan: str) -> None:
    insert_dylib, ldid, zero_req = find_cyan_tools(cyan)
    for name in EXTENSIONS_WITH_DISTRA:
        extension = app / "PlugIns" / name
        info_path = extension / "Info.plist"
        if not info_path.is_file():
            print(f"no {name}, skipping")
            continue
        executable = extension / plistlib.loads(info_path.read_bytes())["CFBundleExecutable"]
        # insert_dylib strips LC_CODE_SIGNATURE, which also drops the embedded entitlements plist.
        # Signers (SideStore, AltStore, etc.) read those entitlements to decide which App Groups to grant,
        # so extract them first and re-embed them ad-hoc afterwards (same as cyan does for the main binary).
        entitlements = work / f"{name}.entitlements"
        dumped = subprocess.run([ldid, "-e", str(executable)], capture_output=True)
        has_entitlements = len(dumped.stdout) > 0
        if has_entitlements:
            entitlements.write_bytes(dumped.stdout)

        # Weak, so the extension still starts if the dylib is missing.
        subprocess.run([insert_dylib, "--weak", "--inplace", "--all-yes", EXTENSION_DYLIB, str(executable)], check=True, capture_output=True)

        if has_entitlements:
            sign_cmd = [ldid, f"-S{entitlements}", "-M", "-Cadhoc"]
            if zero_req is not None:
                sign_cmd.append(f"-Q{zero_req}")
            sign_cmd.append(str(executable))
            subprocess.run(sign_cmd, check=True)
        print(f"loading Distra in {name}" + (" (entitlements preserved)" if has_entitlements else ""))


def zip_payload(root: Path, output: Path) -> None:
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
        for path in sorted((root / "Payload").rglob("*")):
            relative = path.relative_to(root).as_posix()
            if path.is_symlink():
                info = zipfile.ZipInfo(relative)
                info.external_attr = 0o120777 << 16
                archive.writestr(info, str(path.readlink()))
            elif path.is_file():
                archive.write(path, relative)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ipa", type=Path, required=True, help="decrypted Discord IPA")
    parser.add_argument("--deb", type=Path, required=True, help="Distra .deb (rootful, iphoneos-arm)")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--icon-pack", type=Path, action="append", default=[], help="icon pack folder to bundle (repeatable)")
    parser.add_argument("--alt-icon", action="append", default=[], help="NAME=PNG alternate app icon to add (repeatable)")
    parser.add_argument("--name", help="display name")
    parser.add_argument("--bundle-id", help="bundle id, to install next to the App Store Discord")
    parser.add_argument("--remove-extensions", action="store_true", help="remove app extensions (needed by some signing setups)")
    parser.add_argument("--cyan", default="cyan", help="cyan executable")
    args = parser.parse_args()

    for path in (args.ipa, args.deb):
        if not path.is_file():
            raise SystemExit(f"{path} does not exist")
    if shutil.which(args.cyan) is None and not Path(args.cyan).is_file():
        raise SystemExit("cyan not found; install it with: pipx install https://github.com/asdfzxcvbn/pyzule-rw/archive/main.zip")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="distra-ipa-") as temp:
        work = Path(temp)
        with zipfile.ZipFile(args.ipa) as archive:
            archive.extractall(work)
        app = find_app(work / "Payload")

        add_icon_packs(app, args.icon_pack)
        patch_info_plist(app, args.alt_icon)
        if not args.remove_extensions:
            load_distra_in_extensions(app, work, args.cyan)

        staged = work / "staged.ipa"
        zip_payload(work, staged)

        command = [args.cyan, "-i", str(staged), "-o", str(args.output.resolve()), "-f", str(args.deb.resolve()),
                   "-d", "-u", "-w", "--overwrite"]
        if args.name:
            command += ["-n", args.name]
        if args.bundle_id:
            command += ["-b", args.bundle_id]
        if args.remove_extensions:
            command.append("-e")
        print("+", " ".join(command))
        subprocess.run(command, check=True)

    print(f"built {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
