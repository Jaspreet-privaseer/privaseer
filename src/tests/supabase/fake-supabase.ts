// Small in-memory stand-in for the parts of the Supabase query builder the verification code uses
export type Row = Record<string, any>;

export class FakeSupabase {
  rows: Row[] = [];
  failNext: string | null = null;
  beforeUpdate: (() => void) | null = null;
  private nextId = 1;

  from(_table: string) {
    return new FakeQuery(this);
  }

  seed(row: Row): Row {
    const full = {
      id: `row-${this.nextId++}`,
      code_hash: null,
      code_expires_at: null,
      attempts: 0,
      send_count: 0,
      send_window_start: null,
      last_sent_at: null,
      verified_at: null,
      ...row,
    };
    this.rows.push(full);
    return full;
  }
}

class FakeQuery implements PromiseLike<any> {
  private op: 'select' | 'insert' | 'update' = 'select';
  private values: Row = {};
  private filters: Array<(r: Row) => boolean> = [];
  private head = false;
  private single = false;
  private returning = false;

  constructor(private db: FakeSupabase) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === 'update') {
      this.returning = true;
    }
    this.head = !!opts?.head;
    return this;
  }
  insert(values: Row) {
    this.op = 'insert';
    this.values = values;
    return this;
  }
  update(values: Row) {
    this.op = 'update';
    this.values = values;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  gte(col: string, val: string) {
    this.filters.push((r) => r[col] != null && r[col] >= val);
    return this;
  }
  is(col: string, val: null) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private run() {
    if (this.db.failNext === this.op) {
      this.db.failNext = null;
      return { data: null, count: null, error: { message: 'db down' } };
    }
    if (this.op === 'update' && this.db.beforeUpdate) {
      const hook = this.db.beforeUpdate;
      this.db.beforeUpdate = null;
      hook();
    }
    const matches = this.db.rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.op === 'insert') {
      this.db.seed(this.values);
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      matches.forEach((r) => Object.assign(r, this.values));
      return { data: this.returning ? matches.map((r) => ({ id: r.id })) : null, error: null };
    }
    if (this.head) {
      return { data: null, count: matches.length, error: null };
    }
    const copies = matches.map((r) => ({ ...r }));
    return { data: this.single ? (copies[0] ?? null) : copies, error: null };
  }

  then<T1 = any, T2 = never>(
    onfulfilled?: ((value: any) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}
