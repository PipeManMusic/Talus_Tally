# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for Talus Tally backend

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect all backend modules
backend_modules = collect_submodules('backend')

# Collect data files (templates, assets, frontend dist, etc)
datas = []
datas += collect_data_files('flask_socketio')
datas += collect_data_files('socketio')
datas += collect_data_files('engineio')
datas += [('data', 'data'), ('assets', 'assets')]
# Include frontend static files if built
if os.path.exists('frontend/dist'):
    datas += [('frontend/dist', 'frontend/dist')]

a = Analysis(
    ['backend/__main__.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=backend_modules + [
        'flask',
        'flask_cors',
        'flask_socketio',
        'socketio',
        'engineio',
        'engineio.async_drivers.threading',
        'engineio.async_drivers.eventlet',
        'eventlet',
        'eventlet.green',
        'eventlet.greenthread',
        'eventlet.wsgi',
        'dns',
        'dns.resolver',
        'greenlet',
        'simple_websocket',
        'wsproto',
        'h11',
        'yaml',
        'backend.api.routes',
        'backend.api.socketio_handlers',
        'backend.api.broadcaster',
        'backend.api.graph_service',
        'backend.api.session',
        'backend.api.project_manager',
        'backend.core.graph',
        'backend.core.node',
        'backend.handlers.dispatcher',
        'backend.handlers.command',
        'backend.handlers.commands.node_commands',
        'backend.handlers.commands.macro_commands',
        'backend.infra.schema_loader',
        'backend.infra.persistence',
        'backend.infra.icon_catalog',
        'backend.infra.logging',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='talus-tally-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
