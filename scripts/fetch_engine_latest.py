from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from fetch_engine import ROOT, git_environment


def run(*args: str, cwd: Path | None = None, capture: bool = False) -> str:
    result = subprocess.run(
        args,
        cwd=cwd,
        check=True,
        env=git_environment(),
        text=True,
        stdout=subprocess.PIPE if capture else None,
    )
    return result.stdout.strip() if capture else ""


def read_lock() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw_line in (ROOT / "engine.latest.lock").read_text(encoding="utf-8").splitlines():
        key, separator, value = raw_line.strip().partition("=")
        if separator and key and value:
            values[key] = value
    required = {"repository", "branch", "commit"}
    if not required.issubset(values):
        raise ValueError("engine.latest.lock requires repository, branch and commit")
    return values


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch the exact upstream revision used by the next Web port"
    )
    parser.add_argument(
        "--destination",
        type=Path,
        default=ROOT / ".engine" / "TomCat_Engine-latest",
    )
    args = parser.parse_args()
    destination = args.destination.resolve()
    lock = read_lock()

    if not (destination / ".git").exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        run("git", "clone", "--filter=blob:none", "--no-checkout", lock["repository"], str(destination))
    elif run("git", "status", "--porcelain", cwd=destination, capture=True):
        raise RuntimeError(f"Refusing to overwrite local changes in {destination}")

    run("git", "fetch", "--depth", "1", "origin", lock["commit"], cwd=destination)
    run("git", "checkout", "--detach", lock["commit"], cwd=destination)
    actual = run("git", "rev-parse", "HEAD", cwd=destination, capture=True)
    if actual != lock["commit"]:
        raise RuntimeError(f"Expected {lock['commit']}, checked out {actual}")
    run("git", "submodule", "sync", "--recursive", cwd=destination)
    run("git", "submodule", "update", "--init", "--recursive", "--depth", "1", cwd=destination)
    print(f"TomCat_Engine {actual} is ready in {destination}")


if __name__ == "__main__":
    main()
