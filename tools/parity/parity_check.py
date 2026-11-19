#!/usr/bin/env python3
"""
Platform parity checker: WerkPages and RateMyManagers are one platform with two brands.

Run it with no arguments from either frontend repository. It locates the other three trees,
compares the shared surfaces, and fails on any difference that `exceptions.yaml` does not
account for.

    python3 tools/parity/parity_check.py            # check
    python3 tools/parity/parity_check.py --list     # what each check looks at
    python3 tools/parity/parity_check.py --require-all   # a skipped check is a failure

WHY THIS EXISTS

Functionality added to one product and never ported to the other kept being discovered months
later: a pending-company moderation queue only one brand could reach while BOTH created the rows,
a workplace score on a company tile in one product and not the other, a component copied by hand
instead of shared, and a daily maintenance sweep scheduled twice against one shared database.
Every one of those looked locally correct. None of them was findable without comparing the two.

EXIT CODES
    0   every applicable check passed
    1   a parity violation (the diff is printed, with the file and the symbol)
    2   a check could not run because its inputs are not present, and --require-all was given
        or nothing else failed. NOT a pass: the summary says which, and why.

SKIPPING IS NOT PASSING. In CI only one repository is checked out, so the cross-product checks
have no data unless the sibling trees are made available (see tools/parity/README.md). Those
checks then report SKIPPED with the missing path named, the job summary says so, and the exit
code is 2. Do not "fix" that by deleting the check.
"""

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.stderr.write("PyYAML is required: pip install pyyaml\n")
    sys.exit(2)

HERE = Path(__file__).resolve().parent
EXCEPTIONS = HERE / "exceptions.yaml"

PASS, FAIL, SKIP, DRIFT = "PASS", "FAIL", "SKIP", "DRIFT"


# ── Where the four trees are ────────────────────────────────────────────────────
#
# Overridable per location, because the layouts differ: RateMyManagers keeps its client in a
# subdirectory while WerkPages keeps it at the repository root, and the two backends are separate
# repositories again. Defaults are this project's checkout layout.
DEFAULTS = {
    "wp_frontend":  "~/code-workspace/Werkpages/werkpages",
    "wp_corpus":    "~/code-workspace/Werkpages/werkpages-c/.ai-corpus",
    "wp_backend":   "~/eclipse-workspace/WerkpagesBackend/WerkpagesBackend",
    "rmm_frontend": "~/code-workspace/ratemymanager/ratemymanager",
    "rmm_corpus":   "~/code-workspace/ratemymanager/ratemymanager-c/.ai-corpus",
    "rmm_backend":  "~/eclipse-workspace/RateMyManagerBackend/RateMyManagerBackend",
}
ENV_PREFIX = "PARITY_"


def roots():
    out = {}
    for key, default in DEFAULTS.items():
        raw = os.environ.get(ENV_PREFIX + key.upper(), default)
        out[key] = Path(os.path.expanduser(raw))
    return out


# ── Exceptions ─────────────────────────────────────────────────────────────────
class Exceptions:
    """The documented list, flattened into substring patterns the checks can ask about."""

    def __init__(self, path):
        self.doc = yaml.safe_load(open(path, encoding="utf-8"))
        self.patterns = {}
        for feature in self.doc.get("werkpages_only_features", []):
            for kind, values in (feature.get("owns") or {}).items():
                self.patterns.setdefault(kind, []).extend(values)
        search = self.doc.get("search_page", {})
        for f in search.get("allowed_differing_files", []):
            self.patterns.setdefault("frontend_files", []).append(f)
        # A page allowed to differ is also allowed its own spec.
        self.patterns.setdefault("specs", []).extend(["explore", "find-your-manager", "find-manager"])
        for e in (self.doc.get("branding", {}).get("allowed_exports") or []):
            self.patterns.setdefault("frontend_files", []).append(e)
        for e in (self.doc.get("infrastructure", {}).get("allowed_exports") or []):
            self.patterns.setdefault("frontend_files", []).append(e)

        """
        TRACKED DRIFT is kept SEPARATE from the exception patterns on purpose.

        An exception says "these two are allowed to differ, for this reason, forever". Tracked
        drift says "this differs, nobody decided to keep it, and here is the date by which it
        stops differing". Folding the second into the first would quietly turn every unfixed
        difference into a permanent one, which is the failure this whole checker exists to stop.
        """
        self.tracked = {}
        td = self.doc.get("tracked_drift") or {}
        self.tracked_review_by = td.get("review_by")
        for item in td.get("items", []):
            for key in ("openapi_operations", "java_classes", "specs", "frontend_files"):
                for v in (item.get(key) or []):
                    self.tracked.setdefault(key, {})[str(v)] = item["id"]
            for cls, methods in (item.get("java_methods") or {}).items():
                for m in methods:
                    self.tracked.setdefault("java_methods", {})[cls + "." + m] = item["id"]

    def excused(self, kind, item):
        low = str(item).lower()
        return any(p.lower() in low for p in self.patterns.get(kind, []))

    def tracked_as(self, kind, item):
        """The tracked-drift id covering this item, or None. Exact match, never a substring."""
        return (self.tracked.get(kind) or {}).get(str(item))

    def filter(self, kind, items):
        """
        Returns (undocumented, tracked). The first fails the build; the second is reported.
        """
        undocumented, tracked = [], []
        for i in sorted(items):
            if self.excused(kind, i):
                continue
            tid = self.tracked_as(kind, i)
            (tracked if tid else undocumented).append((i, tid) if tid else i)
        return undocumented, tracked


# ── Helpers ────────────────────────────────────────────────────────────────────
def need(*paths):
    """None when every path exists, else the message naming the first one that does not."""
    for p in paths:
        if not Path(p).exists():
            return "inputs unavailable: %s" % p
    return None


def read(path):
    return Path(path).read_text(encoding="utf-8", errors="replace")


def brand_neutral(text):
    """
    Collapse the two brands to one token, so a real difference is what survives.

    Product name, package path, domain, image name, compose service and local port all differ
    legitimately and every one of them appears constantly. Without this, every file differs and
    the output is noise.
    """
    t = re.sub(r"[Ww]erk[Pp]ages|WERKPAGES", "BRAND", text)
    t = re.sub(r"[Rr]ate[Mm]y[Mm]anagers?|RATEMYMANAGERS?", "BRAND", t)
    t = t.replace("org/werkpages", "org/PKG").replace("org/ratemymanager", "org/PKG")
    t = re.sub(r"\b(8080|8081|8888|8889|4173|4174|5433|5434)\b", "PORT", t)
    return t


def exported_symbols(src):
    """Every name this module exports. Order is not a difference; presence is."""
    names = set()
    for m in re.finditer(r"^export\s+(?:default\s+)?(?:async\s+)?"
                         r"(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z0-9_$]+)",
                         src, re.M):
        names.add(m.group(1))
    for m in re.finditer(r"^export\s*\{([^}]*)\}", src, re.M):
        for part in m.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            names.add(part.split(" as ")[-1].strip())
    return names


def java_public_methods(src):
    out = set()
    for m in re.finditer(r"^\s{4}public\s+(?:static\s+)?(?:final\s+)?[\w<>,.\[\]?\s]+?\s+(\w+)\s*\(",
                         src, re.M):
        out.add(m.group(1))
    return out


# ── The checks ─────────────────────────────────────────────────────────────────
#
# A check returns (status, lines, tracked). `tracked` is the list of (item, drift_id) pairs it
# found that tools/parity/exceptions.yaml already admits to, so they can be reported without
# being mistaken for either a pass or a new regression.

def check_rmm_migrations_frozen(r, exc, _):
    """RateMyManagers adds no migrations, ever. WerkPages owns the one stream."""
    folder = r["rmm_backend"] / "Api/src/main/resources/db/migrations"
    missing = need(folder)
    if missing:
        return SKIP, [missing], []
    frozen = int(exc.doc["meta"]["rmm_migrations_frozen_at"])
    offenders = []
    for f in sorted(folder.glob("V*__*.sql")):
        m = re.match(r"V(\d+)__", f.name)
        if m and int(m.group(1)) > frozen:
            offenders.append(f.name)
    if offenders:
        return FAIL, [
            "RateMyManagers' migration folder is frozen at V%d and must never gain another." % frozen,
            "If both repositories contain a V%d, the shared flyway_schema_history binds that" % (frozen + 1),
            "version to WerkPages' file, and RMM's different checksum then refuses to boot.",
            "Every migration belongs to the WerkPages stream, including one needed only here.",
            "Found: " + ", ".join(offenders),
        ], []
    return PASS, ["frozen at V%d, %d files, none above it"
                  % (frozen, len(list(folder.glob("V*__*.sql"))))], []


def check_single_scheduler(r, exc, _):
    """One executor for anything that should run once against the shared database."""
    rmm = r["rmm_backend"] / "RestApi/src/main/java/org/ratemymanager/rest/MainVerticle.java"
    wp = r["wp_backend"] / "RestApi/src/main/java/org/werkpages/rest/MainVerticle.java"
    missing = need(rmm, wp)
    if missing:
        return SKIP, [missing], []

    rmm_src, wp_src = read(rmm), read(wp)
    problems, notes = [], []

    if re.search(r"^\s*new MaintenanceSweep\(", rmm_src, re.M):
        problems.append("RateMyManagers constructs and schedules MaintenanceSweep. WerkPages owns "
                        "that timer: two backends against one database ran every step twice a day, "
                        "including METERED logo-provider calls.")
    if re.search(r"setPeriodic", rmm_src):
        problems.append("RateMyManagers calls setPeriodic in MainVerticle. A scheduled job against "
                        "shared data has exactly one executor, and it is WerkPages.")

    if not re.search(r"^\s*new MaintenanceSweep\(", wp_src, re.M):
        problems.append("WerkPages does NOT schedule MaintenanceSweep. It is the sole executor, so "
                        "nobody is running it at all.")
    else:
        notes.append("WerkPages schedules the daily sweep")
    if not re.search(r"setPeriodic\(\s*120_000L", wp_src):
        problems.append("WerkPages does NOT schedule the company_stats_live reconciliation.")
    else:
        notes.append("WerkPages schedules the six-hourly reconciliation")

    # The rebuilder itself must stay reachable here: an admin action is not a scheduled job.
    if "CompanyStatsRebuilder" not in rmm_src:
        problems.append("RateMyManagers no longer builds CompanyStatsRebuilder at all. Removing the "
                        "TIMER is correct; removing the admin-triggered rebuild is not.")
    else:
        notes.append("RateMyManagers keeps the admin-triggered rebuild")

    # The sweep must still be re-entrancy guarded wherever it IS scheduled.
    sweep = r["wp_backend"] / "Api/src/main/java/org/werkpages/service/MaintenanceSweep.java"
    if sweep.exists() and "compareAndSet" not in read(sweep):
        problems.append("MaintenanceSweep has no re-entrancy guard. setPeriodic does not wait, so a "
                        "sweep that outlives its period is started on top of itself and the metered "
                        "resolution steps are paid for twice.")
    elif sweep.exists():
        notes.append("the sweep is guarded against overlapping itself")

    return (FAIL, problems, []) if problems else (PASS, notes, [])


def check_ci_workflows(r, exc, _):
    """
    The two pipelines are one pipeline.

    Compared on EXECUTABLE lines only. Comments differ legitimately - each copy documents its own
    history, and one of them carries the "keep this in step" header - and comparing prose produced
    a wall of output that buried the one line that mattered. Steps, not sentences.
    """
    import difflib
    results, problems = [], []
    allowed = re.compile(
        r"working-directory|BRAND/|/BRAND|cache-dependency-path|packageManager"
        r"|VITE_API_URL|docker compose|Dockerfile|ECR_REGISTRY|_IMAGE|\.ca|\.com"
        # Artifact paths ARE the subdirectory layout: one product uploads
        # playwright-report/ and the other ratemymanager/playwright-report/.
        r"|path:\s*(all-)?(playwright|blob)-report|path:\s*all-blob-reports",
        re.I)

    def executable(text):
        """
        The pipeline, with prose and layout removed.

        Comments go, because each copy documents its own history and one carries the "keep this in
        step" header. Indentation and the YAML list marker go with them: RateMyManagers needs a
        `working-directory` on steps WerkPages does not, which turns `- run: x` into a two-key
        mapping and shifts everything after it. The step's CONTENT is what has to match.
        """
        out = []
        for line in brand_neutral(text).splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            out.append(re.sub(r"^-\s+", "", stripped))
        return out

    for name in ("ci.yml", "full-suite.yml"):
        a = r["wp_frontend"] / ".github/workflows" / name
        # RateMyManagers keeps .github at the repository root, one level above the app.
        b = r["rmm_frontend"].parent / ".github/workflows" / name
        missing = need(a, b)
        if missing:
            return SKIP, [missing], []
        diff = [d for d in difflib.unified_diff(executable(read(a)), executable(read(b)),
                                                lineterm="", n=0)
                if d.startswith(("+", "-")) and not d.startswith(("+++", "---"))]
        real = [d for d in diff if not allowed.search(d)]
        if real:
            problems.append("%s differs beyond the four differences its own header allows:" % name)
            problems.extend("    " + d for d in real[:30])
            if len(real) > 30:
                problems.append("    ... and %d more" % (len(real) - 30))
        else:
            results.append("%s: in step" % name)
    return (FAIL, problems, []) if problems else (PASS, results, [])


def _tsx_map(root, subdir):
    out = {}
    base = root / subdir
    if not base.exists():
        return out
    for f in sorted(base.rglob("*")):
        if f.suffix in (".ts", ".tsx") and not f.name.endswith(".spec.ts"):
            out[str(f.relative_to(root))] = f
    return out


def check_frontend_components(r, exc, _):
    """A shared component exists in both products, or it is an exception with a reason."""
    missing = need(r["wp_frontend"] / "client", r["rmm_frontend"] / "client")
    if missing:
        return SKIP, [missing], []
    problems, notes, tracked = [], [], []
    for subdir in ("client/components", "client/lib", "client/hooks", "client/contexts"):
        wp = _tsx_map(r["wp_frontend"], subdir)
        rm = _tsx_map(r["rmm_frontend"], subdir)
        for side, diff in (("WerkPages", set(wp) - set(rm)), ("RateMyManagers", set(rm) - set(wp))):
            bad, trk = exc.filter("frontend_files", diff)
            tracked.extend(trk)
            if bad:
                problems.append("only in %s: %s" % (side, ", ".join(bad)))
        notes.append("%s: %d / %d files" % (subdir, len(wp), len(rm)))

        for rel in sorted(set(wp) & set(rm)):
            a, b = exported_symbols(read(wp[rel])), exported_symbols(read(rm[rel]))
            for side, diff in (("WerkPages", a - b), ("RateMyManagers", b - a)):
                bad, trk = exc.filter("frontend_files", diff)
                tracked.extend(trk)
                if bad:
                    problems.append("%s exports only in %s: %s" % (rel, side, ", ".join(bad)))
    return (FAIL, problems, tracked) if problems else (PASS, notes, tracked)


def check_specs(r, exc, _):
    """A behaviour proven in one product and not the other is a behaviour nobody ported."""
    a, b = r["wp_frontend"] / "tests", r["rmm_frontend"] / "tests"
    missing = need(a, b)
    if missing:
        return SKIP, [missing], []
    wp = {f.name for f in a.glob("*.spec.ts")}
    rm = {f.name for f in b.glob("*.spec.ts")}
    problems, tracked = [], []
    for side, diff in (("WerkPages", wp - rm), ("RateMyManagers", rm - wp)):
        bad, trk = exc.filter("specs", diff)
        tracked.extend(trk)
        if bad:
            problems.append("specs only in %s: %s" % (side, ", ".join(bad)))
    notes = ["%d / %d spec files" % (len(wp), len(rm))]
    return (FAIL, problems, tracked) if problems else (PASS, notes, tracked)


def check_corpus(r, exc, _):
    """Shared platform documentation is shared, or the next reader trusts a document that rotted."""
    a, b = r["wp_corpus"], r["rmm_corpus"]
    missing = need(a, b)
    if missing:
        return SKIP, [missing], []
    wp = {str(f.relative_to(a)) for f in a.rglob("*") if f.is_file()}
    rm = {str(f.relative_to(b)) for f in b.rglob("*") if f.is_file()}
    problems, tracked = [], []
    for side, diff in (("WerkPages", wp - rm), ("RateMyManagers", rm - wp)):
        bad, trk = exc.filter("frontend_files", diff)
        tracked.extend(trk)
        if bad:
            problems.append("corpus documents only in %s: %s" % (side, ", ".join(bad)))
    notes = ["%d / %d corpus files" % (len(wp), len(rm))]
    return (FAIL, problems, tracked) if problems else (PASS, notes, tracked)


def check_openapi(r, exc, _):
    """The API contract. An endpoint in one product and not the other is the drift that hides longest."""
    a = r["wp_backend"] / "RestApi/src/main/resources/openapi.yaml"
    b = r["rmm_backend"] / "RestApi/src/main/resources/openapi.yaml"
    missing = need(a, b)
    if missing:
        return SKIP, [missing], []
    wp_doc, rm_doc = yaml.safe_load(read(a)), yaml.safe_load(read(b))

    def ops(doc):
        found = {}
        for path, item in (doc.get("paths") or {}).items():
            for method, op in (item or {}).items():
                if isinstance(op, dict) and op.get("operationId"):
                    found[op["operationId"]] = "%s %s" % (method.upper(), path)
        return found

    wp, rm = ops(wp_doc), ops(rm_doc)
    problems, tracked = [], []
    for side, diff, table in (("WerkPages", set(wp) - set(rm), wp),
                              ("RateMyManagers", set(rm) - set(wp), rm)):
        # Excused by the operation id OR by the path it is mounted at.
        candidates = {o for o in diff if not exc.excused("openapi_paths", table[o])}
        bad, trk = exc.filter("openapi_operations", candidates)
        tracked.extend(trk)
        if bad:
            problems.append("operations only in %s:" % side)
            problems.extend("    %s  (%s)" % (o, table[o]) for o in bad)
    notes = ["%d / %d operations" % (len(wp), len(rm))]
    return (FAIL, problems, tracked) if problems else (PASS, notes, tracked)


def check_java_surface(r, exc, _):
    """Shared service and repository behaviour, compared by public method name."""
    pairs = []
    for kind in ("service", "repository"):
        a = r["wp_backend"] / "Api/src/main/java/org/werkpages" / kind
        b = r["rmm_backend"] / "Api/src/main/java/org/ratemymanager" / kind
        missing = need(a, b)
        if missing:
            return SKIP, [missing], []
        pairs.append((kind, a, b))

    problems, notes, tracked = [], [], []
    for kind, a, b in pairs:
        wp = {f.name for f in a.glob("*.java")}
        rm = {f.name for f in b.glob("*.java")}
        for side, diff in (("WerkPages", wp - rm), ("RateMyManagers", rm - wp)):
            cls = {n[:-5] for n in diff}                       # drop ".java"
            bad, trk = exc.filter("java_classes", cls)
            tracked.extend(trk)
            if bad:
                problems.append("%s classes only in %s: %s" % (kind, side, ", ".join(bad)))
        notes.append("%s: %d / %d classes" % (kind, len(wp), len(rm)))

        for name in sorted(set(wp) & set(rm)):
            if exc.excused("java_classes", name):
                continue
            cls = name[:-5]
            ma, mb = java_public_methods(read(a / name)), java_public_methods(read(b / name))
            for side, diff in (("WerkPages", ma - mb), ("RateMyManagers", mb - ma)):
                qualified = {cls + "." + m for m in diff
                             if not exc.excused("java_classes", m)
                             and not exc.excused("openapi_operations", m)}
                bad, trk = exc.filter("java_methods", qualified)
                tracked.extend(trk)
                if bad:
                    problems.append("%s public methods only in %s: %s"
                                    % (name, side, ", ".join(q.split(".", 1)[1] for q in bad)))
    return (FAIL, problems, tracked) if problems else (PASS, notes, tracked)


CHECKS = [
    ("migration-ownership", "WerkPages owns every migration; RMM's folder is frozen",
     check_rmm_migrations_frozen),
    ("single-controller", "one executor for shared scheduled maintenance", check_single_scheduler),
    ("ci-workflows", "the two pipelines are one pipeline", check_ci_workflows),
    ("frontend-surface", "shared components, libs, hooks, contexts and their exports",
     check_frontend_components),
    ("openapi", "shared endpoints and operation ids", check_openapi),
    ("java-surface", "shared service and repository public methods", check_java_surface),
    ("specs", "shared behaviour is proven in both", check_specs),
    ("corpus", "shared platform documentation", check_corpus),
]


def main():
    ap = argparse.ArgumentParser(description="WerkPages / RateMyManagers platform parity")
    ap.add_argument("--list", action="store_true", help="print the checks and exit")
    ap.add_argument("--require-all", action="store_true",
                    help="treat a check that cannot run as a failure")
    ap.add_argument("--allow-tracked-drift", action="store_true",
                    help="do not fail on differences tools/parity/exceptions.yaml already "
                         "admits to under tracked_drift. New differences still fail.")
    ap.add_argument("--only", action="append", default=[], help="run only these checks")
    args = ap.parse_args()

    if args.list:
        for name, what, _ in CHECKS:
            print("%-22s %s" % (name, what))
        return 0

    exc = Exceptions(EXCEPTIONS)
    r = roots()
    print("Platform parity: WerkPages (canonical) vs RateMyManagers")
    print("exceptions reviewed %s\n" % exc.doc["meta"]["last_reviewed"])

    failed, skipped, all_tracked = [], [], []
    for name, what, fn in CHECKS:
        if args.only and name not in args.only:
            continue
        try:
            status, messages, tracked = fn(r, exc, args)
        except Exception as e:                        # a broken check is not a passing check
            status, messages, tracked = FAIL, ["the check itself raised: %r" % (e,)], []
        all_tracked.extend(tracked)
        if status == PASS and tracked:
            status = DRIFT
        print("[%s] %-22s %s" % (status, name, what))
        for m in messages:
            print("        " + m)
        for item, tid in tracked:
            print("        tracked drift [%s]: %s" % (tid, item))
        if status == FAIL:
            failed.append(name)
        elif status == SKIP:
            skipped.append(name)
        print()

    overdue = False
    if all_tracked and exc.tracked_review_by:
        import datetime
        try:
            due = datetime.date.fromisoformat(str(exc.tracked_review_by))
            if datetime.date.today() > due:
                overdue = True
        except ValueError:
            pass

    if failed:
        print("PARITY VIOLATIONS in: %s" % ", ".join(failed))
        print("Fix the code in BOTH products. Do NOT add an exception to make this pass: an entry")
        print("in exceptions.yaml makes a difference permanent and is a product decision. If it is")
        print("drift nobody has decided to keep, it belongs under tracked_drift, with a date.")
        return 1

    if overdue:
        print("TRACKED DRIFT IS OVERDUE. review_by was %s and these are still here:"
              % exc.tracked_review_by)
        for item, tid in sorted(set(all_tracked)):
            print("    [%s] %s" % (tid, item))
        print("The deadline is enforced on purpose. Port the functionality, or make it an")
        print("exception with a reason - but the date cannot simply pass.")
        return 1

    if all_tracked and not args.allow_tracked_drift:
        print("%d tracked difference(s) present, review_by %s."
              % (len(set(all_tracked)), exc.tracked_review_by))
        print("These are known and inventoried, not approved. Pass --allow-tracked-drift to")
        print("treat them as non-blocking, which is what CI does.")
        return 1

    if skipped:
        print("NOT A PASS. These checks had no data and did not run: %s" % ", ".join(skipped))
        print("See tools/parity/README.md for making the other product's tree available.")
        return 2

    if all_tracked:
        print("All parity checks passed, with %d tracked difference(s) outstanding (review_by %s)."
              % (len(set(all_tracked)), exc.tracked_review_by))
        return 0

    print("All parity checks passed, with no tracked differences outstanding.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
