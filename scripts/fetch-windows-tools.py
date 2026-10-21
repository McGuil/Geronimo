"""Fetch exact official Windows components; retain checksum verification and source notices."""
import hashlib
from pathlib import Path
import shutil
import subprocess
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
destination = root / 'artifacts/vendor'
destination.mkdir(parents=True, exist_ok=True)
components = [
    ('PresentMon.exe', 'https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe',
     'b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af'),
    ('PawnIO_setup.exe', 'https://github.com/namazso/PawnIO.Setup/releases/download/2.1.0/PawnIO_setup.exe',
     'a3a46226c5e2824f4cdd42be0eecbabfc672c86f7889710f5ab1e6ad385b47a0'),
    ('MicrosoftEdgeWebview2Setup.exe', 'https://msedge.sf.dl.delivery.mp.microsoft.com/filestreamingservice/files/ed55121c-0243-4978-b7e7-56505b5b96ff/MicrosoftEdgeWebview2Setup.exe',
     'f414de01c4680f0bb0694d1ea7803c6968f3a81bf6bad01b89bfc65dce14c2a2'),
]
for name, url, expected in components:
    target = destination / name
    if not target.exists():
        subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--retry', '2', '--max-time', '120', url, '-o', str(target)], check=True)
    if hashlib.sha256(target.read_bytes()).hexdigest() != expected:
        target.unlink()
        raise SystemExit(f'{name}: SHA-256 mismatch; refusing to package.')
    print(f'{name}: official component SHA-256 verified')

# Distribute corresponding GPL driver sources, including pinned submodules, beside the unmodified installer.
source = root / 'artifacts/vendor-source/PawnIO'
if not source.exists():
    source.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['git', 'clone', '--depth', '1', '--branch', '2.1.0', '--recurse-submodules', '--shallow-submodules',
                    'https://github.com/namazso/PawnIO.git', str(source)], check=True)
commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
if commit != 'e1043d7750f501b6b0d3ac0a71bd5b9406cd17b6':
    raise SystemExit('Unexpected PawnIO source revision.')
subprocess.run(['git', '-C', str(source), 'submodule', 'update', '--init', '--recursive', '--depth', '1'], check=True)
archive = destination / 'PawnIO-2.1.0-source.zip'
with ZipFile(archive, 'w', ZIP_DEFLATED) as package:
    for file in sorted(source.rglob('*')):
        relative = file.relative_to(source)
        if '.git' not in relative.parts and file.is_file():
            package.write(file, Path('PawnIO-2.1.0') / relative)
shutil.copyfile(source / 'COPYING', destination / 'PawnIO-COPYING.txt')
shutil.copyfile(source / 'README.md', destination / 'PawnIO-README.md')
shutil.copyfile(root / 'vendor-licenses/PresentMon-LICENSE.txt', destination / 'PresentMon-LICENSE.txt')
print('Corresponding PawnIO source and component notices included.')
