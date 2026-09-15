const { PGlite } = require('@electric-sql/pglite');
const { vector } = require('@electric-sql/pglite/vector');

(async () => {
  const db = new PGlite({ extensions: { vector } });
  await db.query('CREATE EXTENSION IF NOT EXISTS vector;');
  await db.query('CREATE TABLE test_vec (id text, v vector(3));');
  await db.query("INSERT INTO test_vec VALUES ('1', '[1,2,3]'), ('2', '[4,5,6]');");
  const res = await db.query("SELECT id, (1 - (v <=> '[1,2,3]')) as sim FROM test_vec ORDER BY v <=> '[1,2,3]';");
  console.log('REAL PGVECTOR COSINE SEARCH RESULT:', res.rows);
})();
