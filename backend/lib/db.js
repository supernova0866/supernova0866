function baseUrl(env) {
  if (!env.TURSO_URL) throw new Error('TURSO_URL is not set');
  return env.TURSO_URL.replace(/^libsql:\/\//, 'https://').replace(/\/+$/, '');
}

function encodeArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: v };
  }
  return { type: 'text', value: String(v) };
}

function decodeVal(c) {
  switch (c.type) {
    case 'null': return null;
    case 'integer':
    case 'float': return Number(c.value);
    default: return c.value;
  }
}

const encodeStmt = (s) => ({ sql: s.sql, args: (s.args || []).map(encodeArg) });

function shape(result) {
  const cols = result.cols.map((c) => c.name);
  return {
    rows: result.rows.map((row) => Object.fromEntries(row.map((c, i) => [cols[i], decodeVal(c)]))),
    affected: result.affected_row_count ?? 0,
    lastId: result.last_insert_rowid != null ? Number(result.last_insert_rowid) : null,
  };
}

async function send(env, requests) {
  const res = await fetch(baseUrl(env) + '/v2/pipeline', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.TURSO_AUTH_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [...requests, { type: 'close' }] }),
  });
  if (!res.ok) throw new Error(`Turso HTTP ${res.status}`);
  return (await res.json()).results;
}

async function pipeline(env, stmts) {
  const results = await send(env, stmts.map((s) => ({ type: 'execute', stmt: encodeStmt(s) })));
  return results.slice(0, stmts.length).map((r) => {
    if (r.type === 'error') throw new Error(r.error?.message || 'Turso error');
    return shape(r.response.result);
  });
}

export async function q(env, sql, args = []) {
  return (await pipeline(env, [{ sql, args }]))[0].rows;
}

export async function exec(env, sql, args = []) {
  const r = (await pipeline(env, [{ sql, args }]))[0];
  return { affected: r.affected, lastId: r.lastId };
}

export function batch(env, stmts) {
  return pipeline(env, stmts);
}

// a plain BEGIN..COMMIT pipeline keeps running after a failed statement and would commit half the work
export async function tx(env, stmts) {
  if (!stmts.length) return [];
  const n = stmts.length;
  const steps = [{ stmt: { sql: 'BEGIN' } }];
  stmts.forEach((s, i) => steps.push({ stmt: encodeStmt(s), condition: { type: 'ok', step: i } }));
  steps.push({ stmt: { sql: 'COMMIT' }, condition: { type: 'ok', step: n } });
  steps.push({ stmt: { sql: 'ROLLBACK' }, condition: { type: 'not', cond: { type: 'ok', step: n + 1 } } });

  const [r] = await send(env, [{ type: 'batch', batch: { steps } }]);
  if (r.type === 'error') throw new Error(r.error?.message || 'Turso error');
  const { step_results, step_errors } = r.response.result;
  const failed = step_errors.slice(0, n + 2).find(Boolean);
  if (failed) throw new Error(failed.message || 'transaction failed and was rolled back');
  return step_results.slice(1, n + 1).map(shape);
}
