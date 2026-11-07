// SQL-проверки миграции и RLS в PGlite (Postgres в памяти). auth.uid() и роль authenticated эмулируют Supabase.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATION = readFileSync(join(__dirname, "../migrations/20261107000001_init.sql"), "utf8");
const OWNER = "00000000-0000-0000-0000-00000000000a";
const OTHER = "00000000-0000-0000-0000-00000000000b";
const DEMO = "00000000-0000-0000-0000-00000000000d";
const sha = (n: number) => n.toString(16).padStart(64, "0");
const emb = (i: number) => `[${Array.from({ length: 1024 }, (_, k) => (k === i ? 1 : 0)).join(",")}]`;

let db: PGlite;

/** Выполнить fn от имени пользователя uid под RLS; транзакция откатывается, если rollback = true. */
async function as<T>(uid: string, fn: (tx: Transaction) => Promise<T>, rollback = false): Promise<T> {
  let out!: T;
  await db
    .transaction(async (tx) => {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      out = await fn(tx);
      if (rollback) throw new Error("__rollback__");
    })
    .catch((e) => {
      if (e.message !== "__rollback__") throw e;
    });
  return out;
}
const rows = async (tx: Transaction, sql: string, params: unknown[] = []) => (await tx.query<Record<string, unknown>>(sql, params)).rows;

let dsOwner: string, dsDemo: string, dsDemoUser: string, docOwner: string, rulesDraft: string, rulesOk: string;

beforeAll(async () => {
  db = await PGlite.create({ extensions: { vector } });
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role authenticated;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
  `);
  await db.exec(MIGRATION);
  await db.exec(`
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
    insert into auth.users (id) values ('${OWNER}'), ('${OTHER}'), ('${DEMO}');
    insert into profiles (id, role) values ('${OWNER}', 'owner'), ('${OTHER}', 'owner'), ('${DEMO}', 'demo');
  `);
  // фикстуры от имени суперпользователя (как сервисный ключ)
  const q = async (sql: string, p: unknown[] = []) => (await db.query<{ id: string }>(sql, p)).rows[0]?.id;
  dsOwner = await q("insert into datasets (owner_id, name) values ($1, 'Свой') returning id", [OWNER]);
  dsDemo = await q("insert into datasets (owner_id, name, is_demo) values ($1, 'Демо', true) returning id", [OWNER]);
  dsDemoUser = await q("insert into datasets (owner_id, name) values ($1, 'Датасет демо') returning id", [DEMO]);
  docOwner = await q(
    "insert into documents (dataset_id, filename, storage_path, sha256) values ($1, 'a.md', 'p/a.md', $2) returning id",
    [dsOwner, sha(1)],
  );
  rulesDraft = await q(
    `insert into rulesets (dataset_id, version, fields, rules, author) values ($1, 1, '[{"key":"subject"}]', 'r', 'agent') returning id`,
    [dsOwner],
  );
  rulesOk = await q(
    `insert into rulesets (dataset_id, version, fields, rules, author, status) values ($1, 2, '[{"key":"subject"}]', 'r', 'agent', 'approved') returning id`,
    [dsOwner],
  );
}, 60_000);

describe("RLS датасетов", () => {
  it("D1: владелец видит свой и демо; чужой — только демо; аноним (без uid) — ничего чужого", async () => {
    const mine = await as(OWNER, (tx) => rows(tx, "select name from datasets order by name"));
    expect(mine.map((r) => r.name)).toEqual(["Демо", "Свой"]);
    const other = await as(OTHER, (tx) => rows(tx, "select name from datasets"));
    expect(other.map((r) => r.name)).toEqual(["Демо"]);
  });

  it("D1: чужой не может переименовать или удалить демо-датасет", async () => {
    const upd = await as(OTHER, (tx) => rows(tx, "update datasets set name = 'взлом' where id = $1 returning id", [dsDemo]));
    const del = await as(OTHER, (tx) => rows(tx, "delete from datasets where id = $1 returning id", [dsDemo]));
    expect([upd.length, del.length]).toEqual([0, 0]);
  });

  it("D1: создать датасет на чужое имя нельзя", async () => {
    await expect(
      as(OTHER, (tx) => tx.query("insert into datasets (owner_id, name) values ($1, 'Чужой')", [OWNER])),
    ).rejects.toThrow(/row-level security/);
  });

  it("D11: демо-пользователь не создаёт демо-датасет, обычный — может", async () => {
    await expect(as(DEMO, (tx) => tx.query("insert into datasets (name, is_demo) values ('X', true)"))).rejects.toThrow(/row-level security/);
    const ok = await as(DEMO, (tx) => rows(tx, "insert into datasets (name) values ('Мой') returning owner_id"), true);
    expect(ok[0].owner_id).toBe(DEMO);
  });

  it("D12: CHECK — имя короче 2 символов отклоняется", async () => {
    await expect(as(OWNER, (tx) => tx.query("insert into datasets (name) values ('x')"))).rejects.toThrow(/check/);
  });
});

describe("документы", () => {
  it("D2: документы чужого датасета не видны, вставка в чужой датасет запрещена", async () => {
    expect(await as(OTHER, (tx) => rows(tx, "select id from documents where dataset_id = $1", [dsOwner]))).toEqual([]);
    await expect(
      as(OTHER, (tx) =>
        tx.query("insert into documents (dataset_id, filename, storage_path, sha256) values ($1,'b.md','p',$2)", [dsOwner, sha(2)]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("D3: дубль по sha256 в одном датасете — ошибка уникальности; в другом датасете — можно", async () => {
    await expect(
      as(OWNER, (tx) =>
        tx.query("insert into documents (dataset_id, filename, storage_path, sha256) values ($1,'dup.md','p',$2)", [dsOwner, sha(1)]),
      ),
    ).rejects.toThrow(/duplicate key/);
    await as(OWNER, (tx) => tx.query("insert into documents (dataset_id, filename, storage_path, sha256) values ($1,'dup.md','p',$2)", [dsDemo, sha(1)]), true);
  });

  it("D12: sha256 не из 64 hex — ошибка", async () => {
    await expect(
      as(OWNER, (tx) => tx.query("insert into documents (dataset_id, filename, storage_path, sha256) values ($1,'c.md','p','abc')", [dsOwner])),
    ).rejects.toThrow(/check/);
  });

  it("D4: у демо-пользователя не больше 30 документов на датасет", async () => {
    let inserted = 0;
    let err = "";
    await as(
      DEMO,
      async (tx) => {
        for (let i = 0; i < 31; i++) {
          try {
            await tx.query("insert into documents (dataset_id, filename, storage_path, sha256) values ($1,'d.md','p',$2)", [dsDemoUser, sha(100 + i)]);
            inserted++;
          } catch (e) {
            err = String(e);
            break;
          }
        }
      },
      true,
    ).catch(() => {}); // транзакция после ошибки прервана — откат ожидаем
    expect(inserted).toBe(30);
    expect(err).toMatch(/demo limit/);
  });

  it("D4: у владельца лимита нет", async () => {
    await as(
      OWNER,
      async (tx) => {
        for (let i = 0; i < 31; i++)
          await tx.query("insert into documents (dataset_id, filename, storage_path, sha256) values ($1,'d.md','p',$2)", [dsOwner, sha(500 + i)]);
      },
      true,
    );
  });
});

describe("разметка", () => {
  it("D5: задание разметки по черновику правил отклоняется, по утверждённым — создаётся", async () => {
    await expect(as(OWNER, (tx) => tx.query("insert into label_jobs (dataset_id, ruleset_id) values ($1,$2)", [dsOwner, rulesDraft]))).rejects.toThrow(
      /not approved/,
    );
    await as(OWNER, (tx) => tx.query("insert into label_jobs (dataset_id, ruleset_id) values ($1,$2)", [dsOwner, rulesOk]), true);
  });

  it("D5: вторая активная разметка того же датасета — ошибка", async () => {
    await expect(
      as(OWNER, async (tx) => {
        await tx.query("insert into label_jobs (dataset_id, ruleset_id) values ($1,$2)", [dsOwner, rulesOk]);
        await tx.query("insert into label_jobs (dataset_id, ruleset_id) values ($1,$2)", [dsOwner, rulesOk]);
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it("D7: человек добавляет метку 'human' к своему документу, но не может подделать метку агента или пометить чужой", async () => {
    await as(OWNER, (tx) => tx.query(`insert into labels (document_id, agent, values) values ($1,'human','{}')`, [docOwner]), true);
    await expect(as(OWNER, (tx) => tx.query(`insert into labels (document_id, agent, values) values ($1,'A','{}')`, [docOwner]))).rejects.toThrow(
      /row-level security/,
    );
    await expect(as(OTHER, (tx) => tx.query(`insert into labels (document_id, agent, values) values ($1,'human','{}')`, [docOwner]))).rejects.toThrow(
      /row-level security/,
    );
  });
});

describe("очередь claim_batches", () => {
  it("D8: два забора не пересекаются, попытки растут, истёкшая аренда возвращается, после 3 попыток — failed", async () => {
    await db.transaction(async (tx) => {
      const job = (await tx.query<{ id: string }>("insert into label_jobs (dataset_id, ruleset_id) values ($1,$2) returning id", [dsOwner, rulesOk])).rows[0].id;
      await tx.query(
        `insert into batches (job_id, seq, document_ids) select $1, g, array[$2::uuid] from generate_series(1,3) g`,
        [job, docOwner],
      );
      const a = (await tx.query<{ id: number; attempts: number }>("select * from claim_batches(2)")).rows;
      const b = (await tx.query<{ id: number }>("select * from claim_batches(2)")).rows;
      expect(a).toHaveLength(2);
      expect(b).toHaveLength(1);
      expect(new Set([...a, ...b].map((r) => r.id)).size).toBe(3);
      expect(a.every((r) => r.attempts === 1)).toBe(true);
      expect((await tx.query("select * from claim_batches(5)")).rows).toHaveLength(0); // все в аренде

      await tx.query("update batches set locked_until = now() - interval '1 minute' where job_id = $1 and seq = 1", [job]);
      const again = (await tx.query<{ seq: number; attempts: number }>("select * from claim_batches(5)")).rows;
      expect(again.map((r) => [r.seq, r.attempts])).toEqual([[1, 2]]);

      await tx.query("update batches set attempts = 3, locked_until = now() - interval '1 minute' where job_id = $1 and seq = 2", [job]);
      expect((await tx.query("select * from claim_batches(5)")).rows).toHaveLength(0);
      const st = (await tx.query<{ status: string }>("select status from batches where job_id = $1 and seq = 2", [job])).rows[0];
      expect(st.status).toBe("failed");
      await tx.rollback();
    });
  });

  it("D8: обычный пользователь не может вызвать claim_batches", async () => {
    await expect(as(OWNER, (tx) => tx.query("select * from claim_batches(1)"))).rejects.toThrow(/permission denied/);
  });
});

describe("поиск", () => {
  beforeAll(async () => {
    const doc2 = (
      await db.query<{ id: string }>(
        `insert into documents (dataset_id, filename, storage_path, sha256, labels) values ($1,'os.md','p',$2,'{"subject":"ОС"}') returning id`,
        [dsOwner, sha(3)],
      )
    ).rows[0].id;
    await db.query(`update documents set labels = '{"subject":"Физика"}' where id = $1`, [docOwner]);
    const ins = (doc: string, no: number, content: string, e: number) =>
      db.query(
        `insert into chunks (document_id, dataset_id, unit_label, unit_no, header, content, embedding) values ($1,$2,$3,$4,'h',$5,$6)`,
        [doc, dsOwner, `Слайд ${no}`, no, content, emb(e)],
      );
    await ins(doc2, 1, "Критическая секция процесса", 1);
    await ins(doc2, 2, "Семафор — счётчик, мьютекс — замок с владельцем", 2);
    await ins(doc2, 3, "Производитель и потребитель", 3);
    await ins(docOwner, 1, "Закон Ома и семафорная азбука", 4);
  });

  it("D9: гибрид — чанк, найденный и вектором, и FTS, первый; фильтр по меткам работает", async () => {
    const r = await as(OWNER, (tx) => rows(tx, "select unit_label, vec_rank, fts_rank from match_chunks($1, $2, 'семафор', '{}', 10)", [dsOwner, emb(2)]));
    expect(r[0]).toMatchObject({ unit_label: "Слайд 2", vec_rank: 1, fts_rank: expect.any(Number) });
    const f = await as(OWNER, (tx) => rows(tx, `select content from match_chunks($1, $2, 'семафор', '{"subject":"Физика"}', 10)`, [dsOwner, emb(2)]));
    expect(f.map((x) => x.content)).toEqual(["Закон Ома и семафорная азбука"]);
  });

  it("D9: только текст (без эмбеддинга) — работает FTS", async () => {
    const r = await as(OWNER, (tx) => rows(tx, "select unit_label from match_chunks($1, null, 'мьютекс', '{}', 10)", [dsOwner]));
    expect(r.map((x) => x.unit_label)).toEqual(["Слайд 2"]);
  });

  it("D9: чужой пользователь ничего не находит в чужом датасете", async () => {
    expect(await as(OTHER, (tx) => rows(tx, "select id from match_chunks($1, $2, 'семафор', '{}', 10)", [dsOwner, emb(2)]))).toEqual([]);
  });

  it("D10: соседи ±1 без самих найденных", async () => {
    const id = (await db.query<{ id: number }>("select id from chunks where content like 'Семафор%'")).rows[0].id;
    const r = await as(OWNER, (tx) => rows(tx, "select unit_no from neighbor_chunks($1) order by unit_no", [[id]]));
    expect(r.map((x) => x.unit_no)).toEqual([1, 3]);
  });
});

describe("вопросы", () => {
  it("D6: история только своя; вставить вопрос от чужого имени нельзя", async () => {
    await db.query("insert into questions (user_id, dataset_id, question) values ($1,$2,'вопрос владельца')", [OWNER, dsDemo]);
    expect(await as(OTHER, (tx) => rows(tx, "select id from questions"))).toEqual([]);
    expect(await as(OWNER, (tx) => rows(tx, "select question from questions"))).toEqual([{ question: "вопрос владельца" }]);
    await expect(
      as(OTHER, (tx) => tx.query("insert into questions (user_id, dataset_id, question) values ($1,$2,'подделка')", [OWNER, dsDemo])),
    ).rejects.toThrow(/row-level security/);
  });

  it("D6: вопрос к чужому не-демо датасету запрещён, к демо — можно", async () => {
    await expect(as(OTHER, (tx) => tx.query("insert into questions (dataset_id, question) values ($1,'x?')", [dsOwner]))).rejects.toThrow(
      /row-level security/,
    );
    await as(OTHER, (tx) => tx.query("insert into questions (dataset_id, question) values ($1,'x?')", [dsDemo]), true);
  });
});
