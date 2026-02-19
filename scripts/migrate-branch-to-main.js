/**
 * Step 2b: Copy data from BRANCH to MAIN and reset sequences.
 *
 * - Branch credentials: from .env.local (source).
 * - Main credentials: from .env (target). Ensure .env has main SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * - This script loads .env first (main), then .env.local (branch) so it has both.
 *
 * Usage:
 *   node scripts/migrate-branch-to-main.js              # run migration
 *   node scripts/migrate-branch-to-main.js --dry-run    # only read branch, print counts, no writes
 *   node scripts/migrate-branch-to-main.js --truncate-first   # truncate main tables then copy (requires MAIN_SUPABASE_DB_URL)
 *   node scripts/migrate-branch-to-main.js --upsert          # upsert by id (overwrite existing rows on main)
 *
 * Prerequisites:
 *   - Step 1 done (branch verified). Step 2a done (migrations applied on main).
 *   - Main tables empty or you're ok with replacing data (IDs preserved).
 */

const path = require('path');
const fs = require('fs');

// Load .env first (main), then .env.local (branch) so we can use both
const projectRoot = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(projectRoot, '.env') });
const mainUrl = process.env.SUPABASE_URL;
const mainServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
require('dotenv').config({ path: path.join(projectRoot, '.env.local'), override: true });
const branchUrl = process.env.SUPABASE_URL;
const branchServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const { createClient } = require('@supabase/supabase-js');
const BRANCH_REF = 'uklvgcrzhhtpqtiwrbfw';
const MAIN_REF = 'hyjuxclsksbyaimvzulq';

const TABLE_ORDER = [
  'tenants',
  'tenant_project_counters',
  'users',
  'projects',
  'workpackages',
  'tasks',
  'wp1_data',
  'proctor_data',
  'density_reports',
  'rebar_reports',
  'notifications',
  'task_history',
  'app_settings',
  'password_reset_tokens',
];

const TABLES_WITH_SEQUENCE = [
  'tenants',
  'users',
  'projects',
  'workpackages',
  'tasks',
  'wp1_data',
  'proctor_data',
  'density_reports',
  'rebar_reports',
  'notifications',
  'task_history',
  'app_settings',
  'password_reset_tokens',
];

const BATCH_SIZE = 100;
const PAGE_SIZE = 1000;

function log(msg) {
  console.log(msg);
}

function createSupabaseClient(url, key) {
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchAllFromBranch(supabaseBranch, table) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabaseBranch
      .from(table)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(table + ': ' + error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

// Proactively strip columns that were added in later migrations (main may not have them).
const OPTIONAL_COLUMNS = {
  tenants: ['company_contact_name', 'api_base_url', 'pe_firm_reg', 'license_holder_name', 'license_holder_title'],
  projects: ['drawings', 'customer_details', 'cc_emails', 'bcc_emails'],
};

const COLUMN_NOT_FOUND_RE = /Could not find the '([^']+)' column/;

function stripColumns(rows, columnsToStrip) {
  if (!columnsToStrip.length || rows.length === 0) return rows;
  return rows.map((r) => {
    const out = { ...r };
    columnsToStrip.forEach((c) => delete out[c]);
    return out;
  });
}

function stripOptionalColumns(table, rows) {
  const cols = OPTIONAL_COLUMNS[table];
  return cols ? stripColumns(rows, cols) : rows;
}

function getUpsertConflict(table) {
  if (table === 'tenant_project_counters') return 'tenant_id,year';
  return 'id';
}

async function insertBatch(supabaseMain, table, batch, useUpsert) {
  const useUpsertThis = useUpsert && table !== 'tenant_project_counters';
  if (useUpsertThis) {
    const conflict = getUpsertConflict(table);
    const { error } = await supabaseMain.from(table).upsert(batch, { onConflict: conflict });
    if (error) throw new Error(table + ' upsert: ' + error.message);
  } else {
    const { error } = await supabaseMain.from(table).insert(batch);
    if (error) throw new Error(table + ' insert: ' + error.message);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const truncateFirst = process.argv.includes('--truncate-first');
  const useUpsert = process.argv.includes('--upsert');

  if (!branchUrl || !branchServiceKey) {
    log('Missing branch credentials. Ensure .env.local has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  if (!mainUrl || !mainServiceKey) {
    log('Missing main credentials. Ensure .env has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for main).');
    process.exit(1);
  }
  if (!branchUrl.includes(BRANCH_REF)) {
    log('Expected branch URL to contain ' + BRANCH_REF + '. Current: ' + branchUrl);
    process.exit(1);
  }
  if (!mainUrl.includes(MAIN_REF)) {
    log('Expected main URL to contain ' + MAIN_REF + '. Current: ' + mainUrl);
    process.exit(1);
  }

  const supabaseBranch = createSupabaseClient(branchUrl, branchServiceKey);
  const supabaseMain = createSupabaseClient(mainUrl, mainServiceKey);

  log('');
  log('Branch (source): ' + branchUrl);
  log('Main (target):  ' + mainUrl);
  if (dryRun) log('Mode: DRY RUN (no writes to main)');
  if (truncateFirst) log('Mode: TRUNCATE main tables first (then copy)');
  if (useUpsert) log('Mode: UPSERT by id (overwrite existing on main)');
  log('');

  if (!dryRun && truncateFirst) {
    const dbUrl = process.env.MAIN_SUPABASE_DB_URL;
    if (!dbUrl || !dbUrl.startsWith('postgres')) {
      log('--truncate-first requires MAIN_SUPABASE_DB_URL in .env (Postgres connection string for main).');
      process.exit(1);
    }
    const { Client } = require('pg');
    const client = new Client({ connectionString: dbUrl });
    try {
      await client.connect();
      log('Truncating main tables (reverse order, CASCADE)...');
      const reverseOrder = [...TABLE_ORDER].reverse();
      for (const table of reverseOrder) {
        try {
          await client.query('TRUNCATE "' + table + '" CASCADE');
          log('  Truncated ' + table);
        } catch (e) {
          if (e.message.includes('does not exist')) continue;
          throw e;
        }
      }
      await client.end();
      log('');
    } catch (err) {
      log('Truncate failed: ' + err.message);
      process.exit(1);
    }
  }

  for (const table of TABLE_ORDER) {
    let rows = [];
    try {
      rows = await fetchAllFromBranch(supabaseBranch, table);
    } catch (e) {
      if (e.message.includes('does not exist') || e.message.includes('relation')) {
        log('Skip ' + table + ' (table not in branch)');
        continue;
      }
      throw e;
    }

    log(table + ': ' + rows.length + ' row(s) from branch');

    if (dryRun) continue;
    if (rows.length === 0) continue;

    rows = stripOptionalColumns(table, rows);

    let retries = 10;
    let skipped = false;
    while (retries--) {
      try {
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          await insertBatch(supabaseMain, table, batch, useUpsert);
        }
        break;
      } catch (e) {
        const match = e.message.match(COLUMN_NOT_FOUND_RE);
        if (match) {
          const col = match[1];
          log('  Main missing column "' + col + '", stripping and retrying...');
          rows = stripColumns(rows, [col]);
          continue;
        }
        if (e.message.includes('does not exist')) {
          log('  Table ' + table + ' does not exist on main. Apply migrations first (apply-migrations-to-main.js).');
          process.exit(1);
        }
        if (e.message.includes('schema cache')) {
          log('  Skipping ' + table + ' (not in main schema cache / RLS?). Apply migrations or fix main schema.');
          skipped = true;
          break;
        }
        if (e.message.includes('duplicate key') && e.message.includes('unique constraint')) {
          log('  Main has conflicting rows or old unique constraint. Run all 10 migrations on main, then use --truncate-first and re-run.');
          process.exit(1);
        }
        throw e;
      }
    }
    if (!skipped) log('  -> copied to main');
  }

  if (dryRun) {
    log('');
    log('Dry run done. Run without --dry-run to copy data.');
    log('');
    return;
  }

  // Sequence reset on main
  const dbUrl = process.env.MAIN_SUPABASE_DB_URL;
  if (dbUrl && dbUrl.startsWith('postgres')) {
    const { Client } = require('pg');
    const client = new Client({ connectionString: dbUrl });
    try {
      await client.connect();
      for (const table of TABLES_WITH_SEQUENCE) {
        try {
          await client.query(
            `SELECT setval(pg_get_serial_sequence('${table}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "${table}"))`
          );
          log('Sequence reset: ' + table);
        } catch (e) {
          if (e.message.includes('does not exist')) continue;
          log('Sequence reset warning ' + table + ': ' + e.message);
        }
      }
      await client.end();
      log('');
      log('Sequences reset on main.');
    } catch (err) {
      log('Could not reset sequences via pg: ' + err.message);
      log('Run the following SQL in Main project → SQL Editor:');
      log('');
      TABLES_WITH_SEQUENCE.forEach((t) => {
        log("SELECT setval(pg_get_serial_sequence('" + t + "', 'id'), (SELECT COALESCE(MAX(id), 1) FROM " + t + ");");
      });
      log('');
    }
  } else {
    log('');
    log('MAIN_SUPABASE_DB_URL not set. Reset sequences manually in Main → SQL Editor:');
    log('');
    TABLES_WITH_SEQUENCE.forEach((t) => {
      log("SELECT setval(pg_get_serial_sequence('" + t + "', 'id'), (SELECT COALESCE(MAX(id), 1) FROM " + t + ");");
    });
    log('');
  }

  log('Data migration done. Verify row counts (see BRANCH_TO_MAIN_MIGRATION_PLAN.md §5), then switch app to main.');
  log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
