"""Package a published output folder and include dependency/source notices."""
import hashlib
import json
import os
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
folder = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'artifacts/windows-win-x64'
if not (folder / 'Geronimo.exe').is_file() or not (folder / 'Assets/index.html').is_file():
    raise SystemExit('Publish the complete Windows application before packaging.')
lock = json.loads((root / 'desktop/Geronimo.Desktop/packages.lock.json').read_text())
packages = {(name, value['resolved']) for target in lock['dependencies'].values() for name, value in target.items() if 'resolved' in value}
cache = Path(os.environ.get('NUGET_PACKAGES', str(Path.home() / '.nuget/packages')))
notices = ['Geronimo dependencies — unmodified NuGet packages', 'See THIRD-PARTY-NOTICES.md for covered source locations.', '']
for name, version in sorted(packages):
    notices.extend([f'{name} {version}', f'https://www.nuget.org/packages/{name}/{version}'])
    spec = cache / name.lower() / version.lower() / (name.lower() + '.nuspec')
    if spec.exists():
        element = ET.parse(spec).getroot()
        for tag in ['license', 'projectUrl', 'copyright']:
            match = element.find(f'.//{{*}}{tag}')
            if match is not None and match.text:
                notices.append(f'{tag}: {match.text}')
                if tag == 'license' and match.attrib.get('type') == 'file':
                    license_file = spec.parent / match.text
                    if license_file.is_file():
                        destination = folder / 'licenses' / name
                        destination.mkdir(parents=True, exist_ok=True)
                        (destination / license_file.name).write_bytes(license_file.read_bytes())
    notices.append('')
(folder / 'dependency-notices.txt').write_text('\n'.join(notices), encoding='utf-8')
output = folder.parent / f'Geronimo-{folder.name}.zip'
with ZipFile(output, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for source in sorted(folder.rglob('*')):
        if source.is_file():
            archive.write(source, Path('Geronimo') / source.relative_to(folder))
with output.open('rb') as source:
    digest = hashlib.file_digest(source, 'sha256').hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n')
with ZipFile(output) as archive:
    if archive.testzip() is not None:
        raise SystemExit('Archive integrity check failed.')
print(f'{output} ({output.stat().st_size / 1048576:.1f} MiB); ZIP integrity verified')
