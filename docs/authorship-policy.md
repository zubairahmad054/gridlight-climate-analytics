# Owner-controlled Git authorship

## Publishing as a separate new repository

Changing the GitHub remote does NOT reset authorship: old commits travel with it.
To publish the current source snapshot without old history, run this from the
original project in PowerShell, choosing a new destination folder:

```powershell
.\scripts\new-owner-repository.ps1 -Destination 'D:\claude\projects\carbon-intensity-fresh'
```

The script exports current nonignored source (including uncommitted changes),
preserves licensing, excludes old `.git` history and private environment files,
initializes a fresh repository and activates Zubair Ahmad's identity and author
checks. The source repository is untouched. There is no initial commit, GitHub
remote or push until the owner explicitly requests those actions. Inspect all
copied content before publishing. Existing contribution/author mentions inside
documentation are not commit authorship and are not silently stripped.

If you initialize a fresh repository yourself, copy `.githooks` too, then run
`.\scripts\configure-owner.ps1` in the new copy before committing. Local Git config
is NOT transferred merely by copying source files. Node.js is required. A fresh
first commit made with this setup is authored by Zubair Ahmad without co-authors.

GitHub associates the author with an account by email; keep the configured email
associated with your own GitHub account. This setup cannot prevent someone from
changing settings or authoring their own fork.

Owner: Zubair Ahmad. This checkout uses repository-local author/committer settings,
not global settings for unrelated projects. Approved author emails are the existing
personal address and the existing GitHub noreply address found in this repository.

`core.hooksPath=.githooks` enables these local safeguards (Node.js required):

- Pre-commit and prepare-commit-msg reject another effective author or committer.
- Commit-msg rejects Co-authored-by trailers, including AI credits; it never silently
  rewrites a message or falsely attributes an outside contribution to the owner.
- Pre-push checks introduced commit authors and co-author trailers, catching normal
  pushes of commits created through other routes. For new refs, commits already
  reachable from local remote-tracking refs are excluded. This is not a history audit.
- AGENTS.md instructs coding agents to honour the policy and not bypass it.

These are safeguards against accidental attribution, **not tamper-proof access
controls**. Users with local access can change config/hooks or use Git bypasses.
Git author strings can be impersonated. Fresh clones do not automatically activate
hooks; they must set core.hooksPath and ensure hook files are executable on Unix.
GitHub web commits and other computers do not run these local hooks.
See [Git's hook documentation](https://git-scm.com/docs/githooks).

GitHub-side access restrictions and protected-branch/ruleset enforcement must be
configured separately to control who can update the hosted repository. No GitHub
permissions or rules were changed by this local setup. This public MIT project
cannot prevent others from authoring commits in their own forks.

The existing history includes Claude-authored work. It has not been removed or
relabelled. Configuration affects future local actions, not existing GitHub author
or contributor listings. Rewriting published history is a separate decision and
must not misrepresent genuine human contributions.

No existing commits, branches, remote URLs or worktree changes were rewritten.
