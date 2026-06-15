/**
 * Adversarial tests for QBO tenant isolation and column-level encryption.
 *
 * Run with: node --test tests/qbo-tenant-isolation.test.js
 * (requires Node 18+ for node:test)
 *
 * These tests do NOT need a live database or QuickBooks credentials.
 * They exercise:
 *   1. AES-256-GCM column encryption — correct key decrypts; wrong key throws
 *   2. OAuth state CSRF protection — forged state is rejected
 *   3. Cross-tenant decryption — a tenant who obtains another tenant's DB row
 *      cannot recover the token without the server-side encryption key
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// ─── Setup: inject required env vars before loading the service module ────────
const VALID_KEY = crypto.randomBytes(32).toString('hex');
process.env.QBO_TOKEN_ENCRYPTION_KEY = VALID_KEY;
process.env.JWT_SECRET               = 'test-jwt-secret-for-isolation-tests';
// Prevent the service from failing on missing QBO credentials during import
process.env.QBO_CLIENT_ID            = 'test-client-id';
process.env.QBO_CLIENT_SECRET        = 'test-client-secret';
process.env.QBO_REDIRECT_URI         = 'https://example.com/quickbooks/callback';
process.env.QBO_ENVIRONMENT          = 'sandbox';

// Load only the crypto utilities — they have no DB side-effects
const { encrypt, decrypt, encodeOAuthState, decodeOAuthState } =
  require('../server/services/quickbooks');

// ─── 1. Column-level encryption ───────────────────────────────────────────────

describe('Column-level AES-256-GCM encryption', () => {
  test('correct key round-trips the plaintext', () => {
    process.env.QBO_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const token       = 'eyJhbGciOiJSUzI1NiJ9.genuine-access-token.signature';
    const ciphertext  = encrypt(token);

    // Ciphertext must NOT contain the plaintext
    assert.ok(!ciphertext.includes(token),     'ciphertext must not embed plaintext');
    assert.ok(!ciphertext.includes('eyJ'),     'ciphertext must not embed JWT header');

    // Decryption with the same key must recover original
    assert.strictEqual(decrypt(ciphertext), token);
  });

  test('each encryption produces a different ciphertext (random IV)', () => {
    process.env.QBO_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const token = 'same-token-encrypted-twice';
    assert.notStrictEqual(encrypt(token), encrypt(token));
  });

  test('wrong key causes GCM authentication failure', () => {
    process.env.QBO_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const ciphertext = encrypt('tenant-a-access-token');

    // Adversary switches to a different key
    process.env.QBO_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

    assert.throws(
      () => decrypt(ciphertext),
      // AES-GCM auth tag verification fails — Node crypto throws here
      (err) => {
        assert.ok(err instanceof Error, 'must throw an Error');
        return true;
      },
      'Decryption under a different key must throw',
    );

    // Restore and confirm the original key still works
    process.env.QBO_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    assert.strictEqual(decrypt(ciphertext), 'tenant-a-access-token');
  });

  test('truncated ciphertext is rejected', () => {
    process.env.QBO_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    const full = encrypt('some-token');
    // Strip the auth tag segment
    const truncated = full.split(':').slice(0, 2).join(':');
    assert.throws(() => decrypt(truncated));
  });
});

// ─── 2. Cross-tenant decryption attempt ───────────────────────────────────────

describe('Cross-tenant adversarial scenario', () => {
  test(
    'tenant B cannot decrypt tenant A\'s token even with the raw DB ciphertext',
    () => {
      // Scenario: tenant A's access_token_enc is stored in the DB.
      // Somehow tenant B (or a rogue admin) retrieves that row.
      // Without QBO_TOKEN_ENCRYPTION_KEY they cannot decrypt the token.

      const serverKey = crypto.randomBytes(32).toString('hex');
      process.env.QBO_TOKEN_ENCRYPTION_KEY = serverKey;

      const tenantAToken   = 'eyJhbGciOiJSUzI1NiJ9.tenantA.private';
      const storedInDB     = encrypt(tenantAToken);       // what's actually in the DB

      // --- Tenant B's attack surface ---

      // Attack 1: use a guessed random key
      process.env.QBO_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
      assert.throws(() => decrypt(storedInDB), 'random key must fail');

      // Attack 2: use an all-zero key
      process.env.QBO_TOKEN_ENCRYPTION_KEY = '0'.repeat(64);
      assert.throws(() => decrypt(storedInDB), 'zero key must fail');

      // Attack 3: reuse ciphertext from a different tenant's token they do know
      const tenantBKey   = crypto.randomBytes(32).toString('hex');
      process.env.QBO_TOKEN_ENCRYPTION_KEY = tenantBKey;
      const tenantBToken = 'eyJhbGciOiJSUzI1NiJ9.tenantB.private';
      const tenantBEnc   = encrypt(tenantBToken);

      // Tenant B tries to decrypt tenant A's ciphertext under tenant B's "key"
      // (in the DB-dump scenario, all rows share the same server key, but the
      //  test confirms the auth-tag check still catches cross-ciphertext misuse)
      process.env.QBO_TOKEN_ENCRYPTION_KEY = serverKey;  // back to server key
      assert.strictEqual(decrypt(storedInDB), tenantAToken, 'server key still works for A');

      process.env.QBO_TOKEN_ENCRYPTION_KEY = tenantBKey;
      assert.throws(() => decrypt(storedInDB), 'tenant B key must not decrypt tenant A ciphertext');

      // Confirm tenant B's own token still works under tenant B key
      assert.strictEqual(decrypt(tenantBEnc), tenantBToken);

      // Restore
      process.env.QBO_TOKEN_ENCRYPTION_KEY = VALID_KEY;
    }
  );
});

// ─── 3. OAuth state CSRF protection ───────────────────────────────────────────

describe('OAuth state CSRF protection', () => {
  test('encodes tenant ID and can be decoded correctly', () => {
    const state1 = encodeOAuthState(1);
    const state2 = encodeOAuthState(2);
    assert.strictEqual(decodeOAuthState(state1), 1);
    assert.strictEqual(decodeOAuthState(state2), 2);
    assert.notStrictEqual(state1, state2);
  });

  test('different tenant IDs produce different states', () => {
    assert.notStrictEqual(encodeOAuthState(10), encodeOAuthState(11));
  });

  test('state is opaque — tenant ID is not directly readable', () => {
    const state = encodeOAuthState(42);
    assert.ok(!state.includes('42'), 'raw tenant ID must not appear in state');
  });

  test('forged state (valid tenant, wrong signature) is rejected', () => {
    // Take the real state for tenant 1 and swap in tenant 2's ID
    const tenant1State  = encodeOAuthState(1);
    const decoded       = Buffer.from(tenant1State, 'base64url').toString('utf8');
    const [, realSig]   = decoded.split(':');
    // Attacker keeps the real sig but changes the tenant ID
    const forged = Buffer.from(`999:${realSig}`).toString('base64url');
    assert.throws(() => decodeOAuthState(forged), /Invalid state signature/);
  });

  test('empty or garbage state is rejected', () => {
    assert.throws(() => decodeOAuthState(''));
    assert.throws(() => decodeOAuthState('notbase64!!!'));
    assert.throws(() => decodeOAuthState('aGVsbG8='));  // valid base64 but no colon
  });

  test('state from one JWT_SECRET is rejected when secret changes', () => {
    process.env.JWT_SECRET = 'original-secret';
    const state = encodeOAuthState(7);

    process.env.JWT_SECRET = 'attacker-changed-the-secret';
    assert.throws(() => decodeOAuthState(state), /Invalid state signature/);

    // Restore
    process.env.JWT_SECRET = 'test-jwt-secret-for-isolation-tests';
  });
});
