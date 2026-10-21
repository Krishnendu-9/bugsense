/*
 * Re-keys stored bugs from the v1 fingerprint to v2 (docs/fingerprint-eval-v2.md,
 * section 8.3, and Amendment 1).
 *
 *   npm run migrate:fingerprints            dry run: prints the plan, changes nothing
 *   npm run migrate:fingerprints -- --apply performs it
 *
 * Stop telemetry ingest first: --apply refuses if SDK activity is seen during
 * the run, and an aborted run is completed by running it again.
 *
 * Exit codes: 0 done (or dry run), 1 refused, 2 applied but the unique-key
 * check failed, 3 error.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyMigration, formatPlan, MigrationRefused, planMigration } from '../services/fingerprintMigration.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
  const apply = process.argv.includes('--apply');
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/bugsense';

  // P30: no index building and no collection creation, so a dry run only reads.
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  const { host, name } = mongoose.connection;
  console.log(`Fingerprint v2 migration: ${apply ? 'APPLY' : 'DRY RUN (nothing will be changed)'}`);
  console.log(`Database: ${name} on ${host}\n`);

  try {
    const plan = await planMigration();
    console.log(formatPlan(plan));

    if (!apply) {
      console.log('\nDry run: nothing was changed. Run with --apply to perform this plan.');
      return 0;
    }

    const result = await applyMigration(plan);
    console.log(`\nApplied: ${result.rekeyed} re-keyed, ${result.merged} merge(s).`);
    if (result.violations.length) {
      console.error(`Unique-key check FAILED: ${result.violations.length} key(s) held by more than one SDK bug:`);
      for (const v of result.violations) console.error(`  ${v._id}: ${v.bugs.join(', ')}`);
      return 2;
    }
    console.log('Unique-key check passed.');
    return 0;
  } catch (err) {
    if (err instanceof MigrationRefused) {
      console.error(`\nRefused: ${err.message}`);
      return 1;
    }
    throw err;
  }
};

run()
  .then(async (code) => {
    await mongoose.disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(3);
  });
