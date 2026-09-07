from __future__ import annotations

import argparse
import os
import shutil
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


def git_environment() -> dict[str, str]:
    """Give Git's shell scripts the unix tools they expect on Windows."""
    env = os.environ.copy()
    if os.name != "nt":
        return env
    git_exe = shutil.which("git")
    if not git_exe:
        return env
    git = Path(git_exe).resolve()
    unix_bins = [
        git.parent.parent / "usr" / "bin",
        git.parent.parent / "mingw64" / "bin",
    ]
    additions = [str(path) for path in unix_bins if path.exists()]
    if additions:
        env["PATH"] = os.pathsep.join(additions + [env.get("PATH", "")])
    return env


def run(*args: str, cwd: Path | None = None) -> None:
    subprocess.run(args, cwd=cwd, check=True, env=git_environment())


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch the pinned TomCat_Engine source")
    parser.add_argument("--destination", type=Path, default=ROOT / ".engine" / "TomCat_Engine")
    args = parser.parse_args()
    destination = args.destination.resolve()
    lock = read_lock()
    if not (destination / ".git").exists():
        destination.parent.mkdir(parents=True, exist_ok=True)
        run(
            "git", "clone", "--filter=blob:none", "--recurse-submodules", "--branch",
            lock["branch"], "--single-branch", lock["repository"], str(destination)
        )
    run("git", "fetch", "--depth", "1", "origin", lock["branch"], cwd=destination)
    run("git", "checkout", "-B", lock["branch"], f"origin/{lock['branch']}", cwd=destination)
    # The checkout is a disposable build cache owned by this script; reset it
    # to the exact upstream revision before applying the Web port patch so a
    # rerun is identical to a fresh clone.
    run("git", "reset", "--hard", "--quiet", f"origin/{lock['branch']}", cwd=destination)
    # TomCat_Engine records its actual third-party revisions as gitlinks.  The
    # Web build must compile those exact revisions (including Box2D and GLFW),
    # so a shallow parent checkout is never considered complete on its own.
    run("git", "submodule", "sync", "--recursive", cwd=destination)
    run("git", "submodule", "update", "--init", "--recursive", cwd=destination)
    run("git", "submodule", "status", "--recursive", cwd=destination)
    web_patch = ROOT / "port" / "tomcat-web-runtime.patch"
    if web_patch.exists():
        # The Web runtime is the upstream engine compiled as-is after a
        # deterministic Web port patch is applied.  The patch is checked
        # against the pinned parent commit; drift fails the build loudly.
        run("git", "apply", "--check", str(web_patch), cwd=destination)
        run("git", "apply", str(web_patch), cwd=destination)
        print(f"Applied Web port patch {web_patch.name}")
    print(f"TomCat_Engine branch '{lock['branch']}' updated in {destination}")


if __name__ == "__main__":
    main()
