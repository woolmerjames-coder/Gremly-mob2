/**
 * A small in-memory database for tests: select, update, remove, insert,
 * insertIgnore and insertQuiet on PostgREST style paths, with eq, neq, in, is,
 * the comparisons, ov (arrays that share a value), not and or filters. Like PostgREST, a bulk insert whose rows
 * do not all have the same keys is refused. Not a test itself (jest runs only
 * *.test.js).
 */
// a list split at its own commas, never inside brackets: a.in.(x,y),b.is.null
function topLevel(list) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(' || ch === '{') depth++;
    if (ch === ')' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// a column, or a field inside a json column: views->>quiet
const valueOf = (row, col) => {
  if (!col.includes('->>')) return row[col];
  const [c, k] = col.split('->>');
  const v = row[c]?.[k];
  return v == null ? v : String(v);
};

export function memoryDb(tables) {
  const parse = (path) => {
    const [table, q = ''] = path.split('?');
    const filters = q
      .split('&')
      .filter((p) => p && !/^(select|order|limit|offset)=/.test(p))
      .map((p) => {
        const col = p.slice(0, p.indexOf('='));
        const rest = p.slice(p.indexOf('=') + 1);
        // or=(a.eq.x,b.not.in.(y,z))
        if (col === 'or') {
          const parts = topLevel(decodeURIComponent(rest).replace(/^\(|\)$/g, '')).map((x) => {
            const [c, o, ...v] = x.split('.');
            // a value in double quotes, as PostgREST takes one with reserved characters
            return { col: c, op: o, val: v.join('.').replace(/^"(.*)"$/, '$1') };
          });
          return { col, op: 'or', val: parts };
        }
        const op = rest.slice(0, rest.indexOf('.'));
        const val = decodeURIComponent(rest.slice(rest.indexOf('.') + 1));
        return { col, op, val };
      });
    const test = (row, col, op, val) => {
      const v = valueOf(row, col);
      if (op === 'not') {
        const inner = val.slice(0, val.indexOf('.'));
        return !test(row, col, inner, val.slice(val.indexOf('.') + 1));
      }
      if (op === 'eq') return String(v) === val;
      if (op === 'neq') return String(v) !== val;
      if (op === 'in') return topLevel(val.replace(/^\(|\)$/g, '')).includes(String(v));
      if (op === 'is') return val === 'null' ? v == null : String(v) === val;
      if (op === 'gte') return v != null && String(v) >= val;
      if (op === 'gt') return v != null && String(v) > val;
      if (op === 'lte') return v != null && String(v) <= val;
      if (op === 'lt') return v != null && String(v) < val;
      // an array column sharing any value with the list: fact_ids.ov.{a,b}
      if (op === 'ov') {
        const want = topLevel(val.replace(/^\{|\}$/g, ''));
        return Array.isArray(v) && v.some((x) => want.includes(String(x)));
      }
      // a filter it does not know fails the test, rather than matching every row
      throw new Error(`memoryDb: no filter ${op} on ${col}`);
    };
    const match = (row) =>
      filters.every(({ col, op, val }) => {
        if (op === 'or') return val.some((x) => test(row, x.col, x.op, x.val));
        return test(row, col, op, val);
      });
    return { table, match };
  };
  // PostgREST refuses a bulk insert whose rows have different keys
  const sameKeys = (table, rows) => {
    const key = (r) => Object.keys(r).sort().join(',');
    if (rows.some((r) => key(r) !== key(rows[0])))
      throw new Error(`insert into ${table}: All object keys must match`);
  };
  return {
    tables,
    select: async (path) => {
      const { table, match } = parse(path);
      return (tables[table] || []).filter(match).map((r) => ({ ...r }));
    },
    update: async (path, patch) => {
      const { table, match } = parse(path);
      const rows = (tables[table] || []).filter(match);
      rows.forEach((r) => Object.assign(r, patch));
      return rows;
    },
    remove: async (path) => {
      const { table, match } = parse(path);
      const gone = (tables[table] || []).filter(match);
      tables[table] = (tables[table] || []).filter((r) => !match(r));
      return gone;
    },
    insert: async (table, rows) => {
      sameKeys(table, rows);
      tables[table] = tables[table] || [];
      const made = rows.map((r) => ({ id: r.id || `${table}-${tables[table].length + 1}`, ...r }));
      tables[table].push(...made);
      return made.map((r) => ({ ...r }));
    },
    insertQuiet: async (table, rows) => {
      sameKeys(table, rows);
      tables[table] = tables[table] || [];
      tables[table].push(...rows.map((r) => ({ ...r })));
    },
    // rows merged into the one that shares their keys, as PostgREST's merge-duplicates does
    upsert: async (table, rows, on) => {
      const keys = on.split(',');
      tables[table] = tables[table] || [];
      const out = [];
      for (const r of rows) {
        const hit = tables[table].find((x) => keys.every((k) => x[k] === r[k]));
        if (hit) Object.assign(hit, r);
        else tables[table].push({ ...r });
        out.push({ ...(hit || r) });
      }
      return out;
    },
    insertIgnore: async (table, rows, on) => {
      sameKeys(table, rows);
      const keys = on.split(',');
      tables[table] = tables[table] || [];
      for (const r of rows)
        if (!tables[table].some((x) => keys.every((k) => x[k] === r[k])))
          tables[table].push({ ...r });
    },
  };
}
