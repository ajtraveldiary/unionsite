// For the scripts that load the real database and bucket on Cloudflare (seed-d1.mjs and
// copy-media.mjs with --remote): a throwaway wrangler config whose D1 binding, and R2 binding if
// asked, are marked remote, so wrangler.jsonc keeps dev local. Pass `options` to getPlatformProxy.
// Needs `npx wrangler login`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { unstable_readConfig } from 'wrangler';

export function remoteProxyOptions({ media = false } = {}) {
  const config = unstable_readConfig({ config: 'wrangler.jsonc' });
  const remoteConfig = {
    name: config.name,
    compatibility_date: config.compatibility_date,
    d1_databases: config.d1_databases.filter((d) => d.binding === 'DB').map(({ binding, database_name, database_id }) => ({ binding, database_name, database_id, remote: true })),
    ...(media && { r2_buckets: config.r2_buckets.filter((b) => b.binding === 'MEDIA').map(({ binding, bucket_name }) => ({ binding, bucket_name, remote: true })) }),
  };
  const dir = new URL('./.cache/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const configPath = new URL('wrangler.remote.json', dir);
  writeFileSync(configPath, JSON.stringify(remoteConfig, null, 2));
  return {
    options: { configPath: fileURLToPath(configPath), persist: false },
    names: { db: remoteConfig.d1_databases[0].database_name, bucket: remoteConfig.r2_buckets?.[0]?.bucket_name },
  };
}
