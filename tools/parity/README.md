# Platform parity

WerkPages and RateMyManagers are **one shared platform with two brands**, not two
independently evolving products. WerkPages is the canonical implementation and the
authoritative owner of shared platform functionality.

Run the checker from either frontend repository:

```bash
python3 tools/parity/parity_check.py            # check everything it can reach
python3 tools/parity/parity_check.py --list     # what each check looks at
python3 tools/parity/parity_check.py --only openapi
```

## Why it exists

Every item below was found months after it was introduced, and every one of them looked
locally correct at the time:

* a pending-company moderation queue only one brand's admin could reach, while **both**
  products created the rows
* a workplace score on the company tile in one product and not the other
* a component copied by hand instead of shared, which then drifted
* the daily maintenance sweep scheduled **twice** against one shared database, including
  its metered logo-provider calls

None of those is findable by reading one repository. That is the whole point.

## What it checks

| Check | Compares | Needs |
|---|---|---|
| `migration-ownership` | RMM's migration folder is frozen; WerkPages owns the one stream | RMM backend |
| `single-controller` | exactly one executor for shared scheduled maintenance | both backends |
| `ci-workflows` | the two pipelines are one pipeline | both frontends |
| `frontend-surface` | shared components, libs, hooks, contexts and their exports | both frontends |
| `openapi` | shared endpoints and operation ids | both backends |
| `java-surface` | shared service and repository public methods | both backends |
| `specs` | shared behaviour is proven in both | both frontends |
| `corpus` | shared platform documentation | both corpora |

Brand names, package paths, domains and local ports are normalised away before anything is
compared, so what survives is a real difference rather than the two products' identities.

## Three categories, and they are not the same thing

**Exceptions** (`exceptions.yaml`, sections 1-5) are differences that are *allowed to exist
permanently*, each with its reason: the three WerkPages-only features (industries, interview
ratings, resume builder), the deliberate search-page difference, branding, and legitimate
infrastructure differences. Adding an entry here is a **product decision**.

> **Do not add an exception to make CI green.** If something differs and should not, fix the
> code in both products.

**Tracked drift** (`exceptions.yaml`, section 6) is the opposite: differences the checker
*found* and nobody has decided to keep. An entry is an admission with a deadline. The checker
reports each one by name under `[DRIFT]`, CI passes `--allow-tracked-drift` so the pipeline is
not permanently red, and **an item still listed after `review_by` fails the build** - the date
is enforced, not aspirational. Clearing an item means porting the functionality, not deleting
the line.

**Anything else that differs fails immediately.**

## No data is not a pass

Exit codes: `0` passed, `1` a violation, `2` a check could not run.

In GitHub Actions only one repository is checked out, and the two **backend** repositories have
no remote at all, so `openapi`, `java-surface`, `migration-ownership` and `single-controller`
cannot run there. They report the missing path by name, the job summary says so, and the exit
code is 2. Do not "fix" that by deleting the check.

To make the other frontend available in CI, set these repository variables and secret:

| Name | Kind | Value in `ratemymanager-f` | Value in `werkpages-f` |
|---|---|---|---|
| `PARITY_SIBLING_REPO` | variable | `<owner>/werkpages-f` | `<owner>/ratemymanager-f` |
| `PARITY_SIBLING_TOKEN` | secret | a token that can read the other repo | the same |
| `PARITY_RMM_FRONTEND` | variable | `self/ratemymanager` | `sibling/ratemymanager` |
| `PARITY_WP_FRONTEND` | variable | `sibling` | `self` |
| `PARITY_RMM_CORPUS` | variable | `self/ratemymanager-c/.ai-corpus` | `sibling/ratemymanager-c/.ai-corpus` |
| `PARITY_WP_CORPUS` | variable | *(unset - outside the repo)* | *(unset - outside the repo)* |

Each location is overridable by `PARITY_<NAME>` because the layouts differ: RateMyManagers keeps
its app in a `ratemymanager/` subdirectory, WerkPages keeps it at the repository root, and the
corpora sit beside the apps rather than inside them. Defaults match a local checkout.

## This file and `exceptions.yaml` are identical in both repositories

Change them in both, in one sitting. The `ci-workflows` check will tell you if you forget the
pipeline; nothing will tell you if you forget this.
