const testDatabaseUrl =
  process.env.KEEL_TEST_DATABASE_URL ??
  'postgresql://keel:keel@127.0.0.1:5432/keel_test?schema=public'

process.env.DATABASE_URL = testDatabaseUrl
process.env.DIRECT_URL = testDatabaseUrl
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  process.env.SESSION_SECRET = 'keel-dev-session-secret-change-me'
}
