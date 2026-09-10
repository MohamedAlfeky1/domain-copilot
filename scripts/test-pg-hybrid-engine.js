const { PGlite } = require('@electric-sql/pglite');
const { vector } = require('@electric-sql/pglite/vector');

async function testEngine() {
  const pg = new PGlite({ extensions: { vector } });

  await pg.exec(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      version INT NOT NULL,
      is_active BOOLEAN NOT NULL
    );
    CREATE TABLE chunks (
      id TEXT PRIMARY KEY,
      document_version_id TEXT NOT NULL,
      chunk_index INT NOT NULL,
      section TEXT,
      page INT,
      clause TEXT,
      text TEXT NOT NULL,
      token_count INT NOT NULL,
      metadata JSONB NOT NULL
    );
    CREATE TABLE chunk_embeddings (
      id TEXT PRIMARY KEY,
      chunk_id TEXT NOT NULL,
      model TEXT NOT NULL,
      dimension INT NOT NULL,
      vector vector(3) NOT NULL
    );
  `);

  // Insert test data
  await pg.query("INSERT INTO documents VALUES ('doc-1', 'protocol_a.pdf', 'Protocol A', 'INDEXED');");
  await pg.query("INSERT INTO document_versions VALUES ('ver-1', 'doc-1', 1, false), ('ver-2', 'doc-1', 2, true);");
  await pg.query("INSERT INTO chunks VALUES ('chk-1', 'ver-1', 0, 'Dosage', 1, 'Clause 1', 'Old dosage is 50mg daily.', 10, '{\"documentName\": \"Protocol A\", \"version\": 1}');");
  await pg.query("INSERT INTO chunks VALUES ('chk-2', 'ver-2', 0, 'Dosage', 1, 'Clause 1', 'Updated dosage is 100mg daily.', 10, '{\"documentName\": \"Protocol A\", \"version\": 2}');");
  await pg.query("INSERT INTO chunk_embeddings VALUES ('emb-1', 'chk-1', 'test-model', 3, '[0.1, 0.2, 0.3]');");
  await pg.query("INSERT INTO chunk_embeddings VALUES ('emb-2', 'chk-2', 'test-model', 3, '[0.9, 0.8, 0.7]');");

  // 1. Test Dense Search with active version filter
  const queryVec = '[0.9, 0.8, 0.7]';
  const denseSql = `
    SELECT c.id, c.text, dv.version, (1 - (ce.vector <=> $1::vector)) AS similarity
    FROM chunks c
    JOIN chunk_embeddings ce ON c.id = ce.chunk_id
    JOIN document_versions dv ON c.document_version_id = dv.id
    JOIN documents d ON dv.document_id = d.id
    WHERE dv.is_active = TRUE
    ORDER BY ce.vector <=> $1::vector ASC
    LIMIT 5;
  `;
  const denseRes = await pg.query(denseSql, [queryVec]);
  console.log("Dense Search (active versions only):", denseRes.rows);

  // 2. Test Keyword FTS
  const ftsSql = `
    SELECT c.id, c.text, dv.version, ts_rank_cd(to_tsvector('english', c.text), plainto_tsquery('english', $1)) AS rank_score
    FROM chunks c
    JOIN document_versions dv ON c.document_version_id = dv.id
    JOIN documents d ON dv.document_id = d.id
    WHERE dv.is_active = TRUE
      AND to_tsvector('english', c.text) @@ plainto_tsquery('english', $1)
    ORDER BY rank_score DESC
    LIMIT 5;
  `;
  const ftsRes = await pg.query(ftsSql, ['dosage']);
  console.log("FTS Keyword Search (active versions only):", ftsRes.rows);
}

testEngine().catch(console.error);
