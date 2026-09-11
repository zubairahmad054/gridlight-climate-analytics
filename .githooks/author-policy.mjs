import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const owner = 'Zubair Ahmad'
const emails = new Set(['m.zubairahmad054@gmail.com', '69352816+zubairahmad054@users.noreply.github.com'])
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

function checkIdentity(identity) {
  const match = identity.match(/^(.*?) <([^>]+)>/)
  if (!match || match[1] !== owner || !emails.has(match[2])) {
    throw new Error(`Only ${owner}'s approved Git identity is allowed. Found: ${identity}`)
  }
}

function checkMessage(message) {
  if (/^\s*co-authored-by\s*:/im.test(message)) {
    throw new Error('Co-authored-by credits are disabled by the repository owner. Remove the trailer explicitly before committing.')
  }
}

try {
  const [mode, messagePath] = process.argv.slice(2)
  if (mode === 'identity' || mode === 'message') {
    checkIdentity(git('var', 'GIT_AUTHOR_IDENT'))
    checkIdentity(git('var', 'GIT_COMMITTER_IDENT'))
    if (mode === 'message') checkMessage(readFileSync(messagePath, 'utf8'))
  } else if (mode === 'push') {
    const seen = new Set()
    for (const line of readFileSync(0, 'utf8').split('\n').filter(Boolean)) {
      const [, local, , remote] = line.trim().split(/\s+/)
      if (/^0+$/.test(local)) continue // Branch deletion introduces no commits.
      const revisions = /^0+$/.test(remote)
        ? git('rev-list', local, '--not', '--remotes')
        : git('rev-list', local, `^${remote}`)
      for (const commit of revisions.split('\n').filter(Boolean)) {
        if (seen.has(commit)) continue
        seen.add(commit)
        checkIdentity(git('show', '-s', '--format=%an <%ae>', commit))
        checkMessage(git('show', '-s', '--format=%B', commit))
      }
    }
  } else {
    throw new Error(`Unknown author-policy mode: ${mode}`)
  }
} catch (error) {
  console.error(`Author policy: ${error.message}`)
  process.exitCode = 1
}
