from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_lock() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in (ROOT / "engine.lock").read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not value.strip():
            raise ValueError(f"Invalid engine.lock line: {raw_line}")
        values[key.strip()] = value.strip()
    if "repository" not in values or "branch" not in values:
        raise ValueError("engine.lock requires repository and branch")
    return values


def run(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(args, cwd=cwd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch the pinned TomCat_Engine source")
    parser.add_argument("--destination", type=Path, default=ROOT / ".engine" / "TomCat_Engine")
    args = parser.parse_args()
    destination = args.destination.resolve()
    lock = read_lock()
    if not (destination / ".git").exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        run("git", "clone", "--filter=blob:none", "--branch", lock["branch"], "--single-branch", lock["repository"], str(destination))
    run("git", "fetch", "--depth", "1", "origin", lock["branch"], cwd=destination)
    run("git", "checkout", "-B", lock["branch"], f"origin/{lock['branch']}", cwd=destination)
    print(f"TomCat_Engine branch '{lock['branch']}' updated in {destination}")


if __name__ == "__main__":
    main()
