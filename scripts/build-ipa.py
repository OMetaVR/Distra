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
