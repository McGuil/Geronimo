"""Install the pinned official Linux SDK after verifying its published SHA-512."""
import hashlib
from pathlib import Path
import subprocess
import tarfile
import tempfile

SDK_VERSION = "10.0.402"
SDK_URL = f"https://builds.dotnet.microsoft.com/dotnet/Sdk/{SDK_VERSION}/dotnet-sdk-{SDK_VERSION}-linux-x64.tar.gz"
SDK_SHA512 = "1904a98dda2db34ba78ba3c4fb1b224455329af91c341d83547843c1839e112b04ae699ee92fa2449a8f62249196a938723078c0c60b9f65c88539d5687729c2"
target = Path("/workspace/.tools/dotnet")
if not (target / "sdk" / SDK_VERSION / "dotnet.dll").is_file():
    with tempfile.TemporaryDirectory(prefix="geronimo-sdk-") as temporary:
        archive = Path(temporary) / "sdk.tar.gz"
        subprocess.run(["curl", "--fail", "--silent", "--show-error", "--location", SDK_URL, "-o", str(archive)], check=True)
        with archive.open("rb") as source:
            digest = hashlib.file_digest(source, "sha512").hexdigest()
        if digest.lower() != SDK_SHA512:
            raise SystemExit("Official SDK SHA-512 mismatch; refusing installation.")
        target.mkdir(parents=True, exist_ok=True)
        with tarfile.open(archive) as source:
            source.extractall(target, filter="data")
print(f".NET SDK {SDK_VERSION} is available at {target}")
