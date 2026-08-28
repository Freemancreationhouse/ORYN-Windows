# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).parents[1]

datas = []
for folder in [
    "static",
    "patterns",
    "templates",
    "firmware",
    "wifi",
    "steps_calibration",
]:
    source = ROOT / folder
    if source.exists():
        datas.append((str(source), folder))

for filename in [
    "VERSION",
    "LICENSE",
    "LICENSE-GPL-3.0",
    "PATTERN_CREDITS.md",
    "THIRD_PARTY_NOTICE_STUDIO_KINEMATICS.md",
]:
    source = ROOT / filename
    if source.exists():
        datas.append((str(source), "."))

hiddenimports = []
for package in [
    "webview",
    "uvicorn",
    "fastapi",
    "pydantic",
    "serial",
    "aiohttp",
    "zeroconf",
    "PIL",
    "numpy",
    "svgpathtools",
    "ezdxf",
    "websockets",
    "multipart",
    "jinja2",
]:
    try:
        hiddenimports += collect_submodules(package)
    except Exception:
        pass

a = Analysis(
    [str(ROOT / "packaging" / "windows" / "oryn_windows_entry.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "lgpio",
        "rpi_ws281x",
        "RPi",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ORYN",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(ROOT / "packaging" / "windows" / "ORYN.ico"),
    # PyInstaller 6 normally places bundled data under "_internal".
    # ORYN's proven runtime uses normal relative paths such as ./patterns and
    # ./static, so preserve the classic one-folder layout beside ORYN.exe.
    contents_directory=".",
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="ORYN",
)
