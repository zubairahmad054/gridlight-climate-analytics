import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const hooks = fileURLToPath(new URL('../.githooks', import.meta.url))
const cwd = mkdtempSync(path.join(tmpdir(), 'carbon-author-policy-'))
const env = { ...process.env }
for (const key of Object.keys(env)) {
  if (key.startsWith('GIT_')) delete env[key]
}
const run = (args, extra = {}) => spawnSync('git', args, { cwd, env, encoding: 'utf8', ...extra })
function ok(args) {
  const result = run(args)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
ok(['init'])
ok(['config', 'user.name', 'Zubair Ahmad'])
ok(['config', 'user.email', 'm.zubairahmad054@gmail.com'])
ok(['config', 'commit.gpgsign', 'false'])
ok(['config', 'core.hooksPath', hooks])
if (process.platform !== 'win32') {
  for (const name of ['pre-commit', 'prepare-commit-msg', 'commit-msg', 'pre-push']) chmodSync(path.join(hooks, name), 0o755)
}

test('owner commit succeeds in an isolated temporary repository', () => {
  ok(['commit', '--allow-empty', '-m', 'Owner commit'])
  assert.equal(ok(['log', '-1', '--format=%an']), 'Zubair Ahmad')
})

test('explicit foreign author is rejected without creating a commit', () => {
  const before = ok(['rev-parse', 'HEAD'])
  const result = run(['commit', '--allow-empty', '--author=Codex <codex@example.com>', '-m', 'Rejected'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Author policy/)
  assert.equal(ok(['rev-parse', 'HEAD']), before)
})

test('foreign author is still rejected when commit --no-verify is used', () => {
  const result = run(['commit', '--no-verify', '--allow-empty', '--author=Other <other@example.com>', '-m', 'Rejected'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Author policy/)
})

test('co-author credit is rejected', () => {
  const result = run(['commit', '--allow-empty', '-m', 'Test\n\nCo-authored-by: Codex <codex@example.com>'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Co-authored-by/)
})

test('environment committer override is rejected', () => {
  const result = run(['commit', '--allow-empty', '-m', 'Rejected'], {
    env: { ...env, GIT_COMMITTER_NAME: 'Other', GIT_COMMITTER_EMAIL: 'other@example.com' },
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Author policy/)
})

test('pre-push catches foreign-author commits made with hooks disabled', () => {
  const remote = path.join(cwd, 'test-remote.git')
  ok(['init', '--bare', remote])
  ok(['remote', 'add', 'test-local', remote])
  ok(['push', 'test-local', 'HEAD:refs/heads/main'])
  ok(['-c', 'core.hooksPath=', 'commit', '--allow-empty', '--author=Other <other@example.com>', '-m', 'Outside commit'])
  const result = run(['push', 'test-local', 'HEAD:refs/heads/main'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Author policy/)
})

console.log(`Isolated test repository retained at ${cwd}; project history untouched.`)
