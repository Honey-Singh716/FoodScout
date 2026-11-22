import test from "node:test";
import assert from "node:assert/strict";
import {
  clearAuthSession,
  loadAuthSession,
  saveAuthSession
} from "./authStorage.js";

test("clearing the auth session removes the restored login", () => {
  const values = new Map();
  global.window = {
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    }
  };

  const session = { token: "token", user: { id: "1", name: "Test", email: "test@example.com" } };
  saveAuthSession(session);
  assert.deepEqual(loadAuthSession(), session);

  clearAuthSession();
  assert.equal(loadAuthSession(), null);
});
