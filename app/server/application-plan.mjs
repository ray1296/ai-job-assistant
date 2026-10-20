const fail = (status, message) => Object.assign(new Error(message), { status });
export const MAX_DRAFT_LENGTH = 8000;
export function validateDraftText(text) {
  if (
    typeof text !== "string" ||
    text.length > MAX_DRAFT_LENGTH ||
    text.includes("\0")
  )
    throw fail(400, "话术必须是最多8000字符的纯文本");
  return text;
}
export function createApplicationPlan(db, getJob) {
  db.exec(`CREATE TABLE IF NOT EXISTS application_drafts(
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL, text TEXT NOT NULL, revision INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,job_id));`);
  const ids = db.prepare(
    "SELECT job_id FROM job_intents WHERE user_id=? ORDER BY created_at DESC,job_id",
  );
  const draft = db.prepare(
    "SELECT text,revision,updated_at FROM application_drafts WHERE user_id=? AND job_id=?",
  );
  const selected = db.prepare(
    "SELECT 1 FROM job_intents WHERE user_id=? AND job_id=?",
  );
  const jobIds = (user) => ids.all(user).map((r) => r.job_id);
  const requireJob = (id) => {
    const job = typeof id === "string" && getJob(id);
    if (!job) throw fail(404, "岗位不存在");
    return job;
  };
  function detail(user, id) {
    const job = requireJob(id),
      row = draft.get(user, id);
    return {
      job,
      draft: row?.text ?? "",
      revision: row?.revision ?? 0,
      updatedAt: row?.updated_at ?? null,
      selected: !!selected.get(user, id),
    };
  }
  function transaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return {
    detail,
    jobIds,
    list: (user) => ({
      items: jobIds(user)
        .filter((id) => getJob(id))
        .map((id) => detail(user, id)),
      maxTextLength: MAX_DRAFT_LENGTH,
    }),
    save(user, id, input) {
      requireJob(id);
      const text = validateDraftText(input.text),
        revision = input.revision;
      if (!Number.isSafeInteger(revision) || revision < 0)
        throw fail(400, "请提供有效的话术版本号");
      const now = Date.now();
      const result =
        revision === 0
          ? db
              .prepare(
                "INSERT INTO application_drafts(user_id,job_id,text,revision,updated_at) VALUES(?,?,?,1,?) ON CONFLICT(user_id,job_id) DO NOTHING",
              )
              .run(user, id, text, now)
          : db
              .prepare(
                "UPDATE application_drafts SET text=?,revision=revision+1,updated_at=? WHERE user_id=? AND job_id=? AND revision=?",
              )
              .run(text, now, user, id, revision);
      if (!result.changes)
        throw fail(
          409,
          "话术已在其他页面更新，请重新加载并核对；当前草稿未覆盖",
        );
      return detail(user, id);
    },
    mutateIntent(user, id, add) {
      requireJob(id);
      if (add)
        db.prepare(
          "INSERT INTO job_intents(user_id,job_id,created_at) VALUES(?,?,?) ON CONFLICT(user_id,job_id) DO NOTHING",
        ).run(user, id, Date.now());
      else
        db.prepare("DELETE FROM job_intents WHERE user_id=? AND job_id=?").run(
          user,
          id,
        );
      return { jobIds: jobIds(user) };
    },
    replaceIntents(user, values) {
      if (
        !Array.isArray(values) ||
        values.length > 107 ||
        values.some((id) => typeof id !== "string" || !getJob(id))
      )
        throw fail(400, "投递意向格式错误或包含不存在的岗位");
      const unique = [...new Set(values)];
      return transaction(() => {
        db.prepare("DELETE FROM job_intents WHERE user_id=?").run(user);
        const insert = db.prepare(
          "INSERT INTO job_intents(user_id,job_id,created_at) VALUES(?,?,?)",
        );
        for (const id of unique) insert.run(user, id, Date.now());
        return { jobIds: jobIds(user) };
      });
    },
  };
}
