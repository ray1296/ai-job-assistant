import {
  getQuestion,
  listQuestions,
  questionCount,
} from "./learning-catalog.mjs";
const fail = (status, message) => Object.assign(Error(message), { status });
export function createLearning(db) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS learning_states(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,question_id TEXT NOT NULL CHECK(length(question_id)=24 AND question_id NOT GLOB '*[^a-f0-9]*'),favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN(0,1)),status TEXT NOT NULL DEFAULT 'unseen' CHECK(status IN('unseen','review','mastered')),attempts INTEGER NOT NULL DEFAULT 0 CHECK(typeof(attempts)='integer' AND attempts>=0),revision INTEGER NOT NULL DEFAULT 1 CHECK(typeof(revision)='integer' AND revision>0),updated_at INTEGER NOT NULL,PRIMARY KEY(user_id,question_id));CREATE INDEX IF NOT EXISTS learning_states_owner ON learning_states(user_id,status,favorite);",
  );
  const one = db.prepare(
    "SELECT favorite,status,attempts,revision,updated_at FROM learning_states WHERE user_id=? AND question_id=?",
  );
  const all = db.prepare(
    "SELECT question_id,favorite,status,attempts,revision,updated_at FROM learning_states WHERE user_id=?",
  );
  const insert = db.prepare(
    "INSERT INTO learning_states(user_id,question_id,favorite,status,attempts,revision,updated_at) VALUES(?,?,?,?,?,1,?) ON CONFLICT(user_id,question_id) DO NOTHING",
  );
  const update = db.prepare(
    "UPDATE learning_states SET favorite=?,status=?,attempts=attempts+?,revision=revision+1,updated_at=? WHERE user_id=? AND question_id=? AND revision=?",
  );
  const normalize = (row) =>
    row
      ? {
          favorite: !!row.favorite,
          status: row.status,
          attempts: row.attempts,
          revision: row.revision,
          updatedAt: new Date(row.updated_at).toISOString(),
        }
      : {
          favorite: false,
          status: "unseen",
          attempts: 0,
          revision: 0,
          updatedAt: null,
        };
  const state = (user, id) => normalize(one.get(user, id));
  const states = (user) =>
    new Map(
      all
        .all(user)
        .filter((r) => getQuestion(r.question_id))
        .map((r) => [r.question_id, normalize(r)]),
    );
  function detail(user, id) {
    const q = getQuestion(id);
    if (!q) throw fail(404, "题目不存在");
    return { question: { ...q, state: state(user, id) } };
  }
  return {
    detail,
    list(user, input) {
      const map = states(user);
      const result = listQuestions(input, map);
      result.questions = result.questions.map((q) => ({
        ...q,
        state: map.get(q.id) || normalize(),
      }));
      return result;
    },
    summary(user) {
      const result = {
        total: questionCount,
        favorites: 0,
        unseen: questionCount,
        review: 0,
        mastered: 0,
        attempts: 0,
      };
      for (const s of states(user).values()) {
        if (s.favorite) result.favorites++;
        if (s.status !== "unseen") {
          result.unseen--;
          result[s.status]++;
        }
        result.attempts += s.attempts;
      }
      return result;
    },
    save(user, id, input) {
      if (!getQuestion(id)) throw fail(404, "题目不存在");
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.keys(input).some(
          (k) => !["favorite", "status", "revision"].includes(k),
        )
      )
        throw fail(400, "学习状态格式无效");
      const hasFavorite = Object.hasOwn(input, "favorite"),
        hasStatus = Object.hasOwn(input, "status");
      if (!hasFavorite && !hasStatus) throw fail(400, "请提供收藏或自评状态");
      if (hasFavorite && typeof input.favorite !== "boolean")
        throw fail(400, "收藏状态必须是布尔值");
      if (hasStatus && !["unseen", "review", "mastered"].includes(input.status))
        throw fail(400, "自评状态无效");
      if (
        !Number.isSafeInteger(input.revision) ||
        input.revision < 0 ||
        input.revision >= Number.MAX_SAFE_INTEGER
      )
        throw fail(400, "请提供有效版本号");
      db.exec("BEGIN IMMEDIATE");
      try {
        const old = state(user, id);
        if (old.revision !== input.revision)
          throw Object.assign(fail(409, "学习状态已更新，请重新加载后重试"), {
            state: old,
          });
        const favorite = hasFavorite ? input.favorite : old.favorite,
          status = hasStatus ? input.status : old.status;
        const result =
          input.revision === 0
            ? insert.run(user, id, +favorite, status, +hasStatus, Date.now())
            : update.run(
                +favorite,
                status,
                +hasStatus,
                Date.now(),
                user,
                id,
                input.revision,
              );
        if (!result.changes)
          throw Object.assign(fail(409, "学习状态已更新，请重新加载后重试"), {
            state: state(user, id),
          });
        const resultDetail = detail(user, id);
        db.exec("COMMIT");
        return resultDetail;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
