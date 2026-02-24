# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_data_files, collect_submodules


async_driver_hiddenimports = []
async_driver_hiddenimports += collect_submodules('engineio.async_drivers')
spellchecker_datas = collect_data_files('spellchecker', include_py_files=False)


a = Analysis(
    ['backend/app.py'],
    pathex=['backend'],
    binaries=[],
    datas=spellchecker_datas,
    hiddenimports=async_driver_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='talus-tally-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='talus-tally-backend',
)
