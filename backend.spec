# PyInstaller sidecar for the local FastAPI image processing service.
from PyInstaller.utils.hooks import collect_all, copy_metadata
from PyInstaller.building.datastruct import Tree

datas, binaries, hiddenimports = [], [], []
datas.append(('static', 'static'))
for package in ('rembg', 'onnxruntime', 'PIL', 'uvicorn', 'fastapi', 'multipart'):
    package_datas, package_binaries, package_hiddenimports = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hiddenimports

a = Analysis(['main.py'], pathex=[], binaries=binaries, datas=datas,
             hiddenimports=hiddenimports, hookspath=[], hooksconfig={},
             runtime_hooks=[], excludes=[], noarchive=False,
             module_collection_mode={'pymatting': 'py'})
# Source-loaded pymatting reads its distribution version during import.
for source, destination in copy_metadata('pymatting'):
    a.datas += Tree(source, prefix=destination)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='clearcut-api',
          debug=False, bootloader_ignore_signals=False, strip=False,
          upx=False, console=True)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='clearcut-api')
