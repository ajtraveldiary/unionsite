import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` turns src/db/schema.ts into SQL files in migrations/;
// `npm run db:migrate` applies them to the local D1 (wrangler keeps it in .wrangler/).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
});
