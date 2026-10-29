import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump, load } from 'js-yaml'

export async function writeUpdatePolicy(releaseRoot, expectedVersion, policy) {
  if (typeof policy?.forceUpdate !== `boolean`) throw new Error(`Update policy requires a boolean forceUpdate`)
  const path = resolve(releaseRoot, `latest.yml`)
  const metadata = load(await readFile(path, `utf8`))
  if (metadata?.version !== expectedVersion) throw new Error(`Update policy version does not match the installer`)
  await writeFile(path, dump({ ...metadata, forceUpdate: policy.forceUpdate }))
}

async function main() {
  const root = fileURLToPath(new URL(`../..`, import.meta.url))
  const { version } = JSON.parse(await readFile(resolve(root, `productVersion.json`), `utf8`))
  const policy = JSON.parse(await readFile(resolve(root, `updatePolicy.json`), `utf8`))
  await writeUpdatePolicy(resolve(root, `release`), version, policy)
  console.log(`Wrote ${policy.forceUpdate ? `forced` : `lazy`} update policy for SpellBook ${version}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
