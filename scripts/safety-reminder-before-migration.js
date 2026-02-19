/**
 * Step 4 (Safety): Reminder before touching main database.
 * Run this before applying migrations or copying data to main.
 */
console.log('');
console.log('=== Step 4: Safety ===');
console.log('  • Backup MAIN database: Supabase Dashboard → MAIN project → Database → Backups');
console.log('  • Optional: backup BRANCH (export or dump) for comparison');
console.log('  • Run migration when app traffic to main is minimal (or keep app on branch until verified)');
console.log('  • No live traffic to main during copy');
console.log('');
console.log('Proceeding with Step 2 (schema) and Step 3 (data copy) next.');
console.log('');
