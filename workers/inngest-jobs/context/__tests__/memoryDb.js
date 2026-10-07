/**
 * A small in-memory database for tests: select, update, remove, insert,
 * insertIgnore and insertQuiet on PostgREST style paths, with eq, neq, in, is,
 * the comparisons, not and or filters. Like PostgREST, a bulk insert whose rows
 * do not all have the same keys is refused. Not a test itself (jest runs only
 * *.test.js).
 */
export function memoryDb(tables) {
  const parse = (path) => {
    const [table, q = ''] = path.split('?');
    const filters = q
      .split('&')
      .filter((p) => p && !/^(select|order|limit|offset)=/.test(p))
      .map((p) => {
        const col = p.slice(0, p.indexOf('='));
        const rest = p.slice(p.indexOf('=') + 1);
        // or=(a.eq.x,b.eq.y)
        if (col === 'or') {
          const parts = decodeURIComponent(rest)
            .replace(/^\(|\)$/g, '')
            .split(',')
            .map((x) => {
              const [c, o, ...v] = x.split('.');
              return { col: c, op: o, val: v.join('.') };
            });
          return { col, op: 'or', val: parts };
        }
        const op = rest.slice(0, rest.indexOf('.'));
        const val = decodeURIComponent(rest.slice(rest.indexOf('.') + 1));
        return { col, op, val };
      });
    const test = (row, col, op, val) => {
      if (op === 'eq') return String(row[col]) === val;
      if (op === 'neq') return String(row[col]) !== val;
      if (op === 'in')
        return val
          .replace(/^\(|\)$/g, '')
          .split(',')
          .includes(String(row[col]));
      if (op === 'is') return val === 'null' ? row[col] == null : String(row[col]) === val;
      if (op === 'gte') return row[col] != null && String(row[col]) >= val;
      if (op === 'gt') return row[col] != null && String(row[col]) > val;
      if (op === 'lte') return row[col] != null && String(row[col]) <= val;
      if (op === 'lt') return row[col] != null && String(row[col]) < val;
      // a filter it does not know fails the test, rather than matching every row
      throw new Error(`memoryDb: no filter ${op} on ${col}`);
    };
    const match = (row) =>
      filters.every(({ col, op, val }) => {
        if (op === 'or') return val.some((x) => test(row, x.col, x.op, x.val));
        // not.<op>.<value>
        if (op === 'not') {
          const inner = val.slice(0, val.indexOf('.'));
          return !test(row, col, inner, val.slice(val.indexOf('.') + 1));
        }
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
