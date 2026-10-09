// Run with: npm run test:unit
// Reproduces the "edit, log out immediately, log back in, edit is gone" bug against a fake in-memory server,
// including slow networks, failing networks and version conflicts.
import { test } from "vitest";
import assert from "node:assert/strict";

const saver = await import("../../src/services/draftSaver.js");

// Fake cloud: same optimistic-concurrency rule as PUT /api/school/draft.
function makeServer({ latencyMs = 0, failTimes = 0 } = {}) {
  const server = {
    version: 0,
    payload: null,
    inFlight: 0,
    maxInFlight: 0,
    attempts: 0,
    failTimes,
  };
  server.send = async (_year, payload, baseVersion) => {
    server.attempts += 1;
    server.inFlight += 1;
    server.maxInFlight = Math.max(server.maxInFlight, server.inFlight);
    try {
      await new Promise((r) => setTimeout(r, latencyMs));
      if (server.failTimes > 0) {
        server.failTimes -= 1;
        throw new TypeError("Failed to fetch");
      }
      if (baseVersion !== null && baseVersion !== server.version)
        return { conflict: true, currentVersion: server.version };
      server.version += 1;
      server.payload = payload; // committed before we answer
      return { success: true, version: server.version };
    } finally {
      server.inFlight -= 1;
    }
  };
  return server;
}

function freshSession(server) {
  globalThis.localStorage.clear();
  saver.__resetForTests();
  saver.configureDraftSaver({ send: server.send });
  // The "screen": whatever the user has typed, plus the local persistence step.
  const screen = { text: "" };
  saver.registerSnapshotProvider(async () => ({
    schoolId: "302261",
    schoolYear: "SY 26-27",
    payload: { text: screen.text },
  }));
  const edit = (text) => {
    screen.text = text;
    saver.markDraftDirty();
  };
  return { screen, edit };
}

test("edit then immediate logout: flush saves the newest edit before logout completes", async () => {
  const server = makeServer();
  const { edit } = freshSession(server);
  edit("my important edit"); // the 3.5s auto-save debounce has NOT fired yet
  await saver.flushDrafts(); // what the logout button now awaits
  // "log back in": read from the server
  assert.equal(server.payload.text, "my important edit");
  assert.equal(saver.getDraftSaveState().status, "saved");
});

test("slow network: saves never overlap and the newest state wins", async () => {
  const server = makeServer({ latencyMs: 60 });
  const { edit, screen } = freshSession(server);
  edit("v1");
  const p1 = saver.saveDraft("302261", "SY 26-27", { text: screen.text });
  edit("v2");
  const p2 = saver.saveDraft("302261", "SY 26-27", { text: screen.text });
  edit("v3");
  const p3 = saver.saveDraft("302261", "SY 26-27", { text: screen.text });
  await Promise.all([p1, p2, p3]);
  assert.equal(server.maxInFlight, 1, "only one save may be in flight");
  assert.equal(server.payload.text, "v3");
});

test("failing network: logout is blocked (flush rejects), nothing is lost, retry succeeds", async () => {
  const server = makeServer({ failTimes: 2 });
  const { edit } = freshSession(server);
  edit("unsaved while offline");
  await assert.rejects(saver.flushDrafts(), /Failed to fetch/);
  assert.equal(saver.getDraftSaveState().status, "failed");
  assert.equal(
    server.payload,
    null,
    "server has nothing yet, so logout must stay blocked",
  );
  await assert.rejects(saver.flushDrafts(), /Failed to fetch/);
  await saver.flushDrafts(); // network is back
  assert.equal(server.payload.text, "unsaved while offline");
  assert.equal(saver.getDraftSaveState().status, "saved");
});

test("conflict: a newer server copy is never overwritten silently", async () => {
  const server = makeServer();
  const { edit } = freshSession(server);
  edit("first");
  await saver.flushDrafts();
  // another browser saves a newer version
  server.version += 1;
  server.payload = { text: "edit from another device" };
  edit("second, from this device");
  await assert.rejects(saver.flushDrafts(), /changed by another session/);
  assert.equal(saver.getDraftSaveState().status, "conflict");
  assert.equal(
    server.payload.text,
    "edit from another device",
    "server copy must be untouched",
  );
  // user chooses to keep their screen: accept server version, then the pending save goes through
  saver.acceptServerVersion("302261", "SY 26-27", server.version);
  await saver.retryNow();
  assert.equal(server.payload.text, "second, from this device");
});

test('"saved" is only reported after the server confirms', async () => {
  const server = makeServer({ latencyMs: 80 });
  const { edit, screen } = freshSession(server);
  edit("x");
  const p = saver.saveDraft("302261", "SY 26-27", { text: screen.text });
  assert.equal(saver.getDraftSaveState().status, "saving");
  assert.equal(server.payload, null);
  await p;
  assert.equal(saver.getDraftSaveState().status, "saved");
  assert.equal(server.payload.text, "x");
});

test("a superseded save is never cancelled, and the newest state is always the last one committed", async () => {
  const server = makeServer({ latencyMs: 40 });
  const { edit, screen } = freshSession(server);
  const order = [];
  const original = server.send;
  saver.configureDraftSaver({
    send: async (y, p, b) => {
      const r = await original(y, p, b);
      order.push(p.text);
      return r;
    },
  });
  edit("first");
  const p1 = saver.saveDraft("302261", "SY 26-27", { text: screen.text });
  await new Promise((r) => setTimeout(r, 10)); // first request is now in flight
  edit("second");
  const p2 = saver.saveDraft("302261", "SY 26-27", { text: screen.text });
  edit("third");
  const p3 = saver.saveDraft("302261", "SY 26-27", { text: screen.text });
  await Promise.all([p1, p2, p3]);
  assert.equal(
    order[0],
    "first",
    "the in-flight save must complete, not be aborted",
  );
  assert.equal(
    order[order.length - 1],
    "third",
    "the newest state is committed last",
  );
  assert.equal(server.payload.text, "third");
  assert.ok(
    !order.includes("second"),
    "intermediate snapshot is superseded, not sent",
  );
});

// ---- session expiry (401): keep the work, send nothing, replay after login ----
const unauthorized = () =>
  Object.assign(new Error("Invalid or expired token"), {
    name: "ApiError",
    status: 401,
  });

test("401: the save stays queued, nothing is retried against the dead session, and login replays it", async () => {
  const server = makeServer();
  let tokenValid = false;
  const realSend = server.send;
  server.send = async (...args) => {
    if (!tokenValid) {
      server.attempts += 1;
      throw unauthorized();
    }
    return realSend(...args);
  };
  const { edit } = freshSession(server);
  saver.configureDraftSaver({ send: server.send });
  edit("typed just before the token died");
  await assertRejects(
    saver.saveDraft("302261", "SY 26-27", {
      text: "typed just before the token died",
    }),
  );
  assert.equal(saver.getDraftSaveState().status, "failed");
  const attemptsAtExpiry = server.attempts;

  await saver.pauseForAuth(); // what the session-expiry handler does before sending the user to login
  await saver.flushDrafts(); // nothing is sent while the session is dead, and it does not hang
  assert.equal(server.attempts, attemptsAtExpiry);

  tokenValid = true; // user logs in again
  await saver.resumeAfterLogin("302261");
  assert.equal(server.payload?.text, "typed just before the token died"); // replayed, committed
  assert.equal(saver.getDraftSaveState().status, "saved");
});

test("401 then login as a DIFFERENT school: the old snapshot is not sent to the new account", async () => {
  const server = makeServer();
  let tokenValid = false;
  const realSend = server.send;
  server.send = async (...a) => {
    if (!tokenValid) throw unauthorized();
    return realSend(...a);
  };
  freshSession(server);
  saver.configureDraftSaver({ send: server.send });
  await assertRejects(
    saver.saveDraft("302261", "SY 26-27", { text: "school A work" }),
  );
  await saver.pauseForAuth();
  tokenValid = true;
  await saver.resumeAfterLogin("999999");
  assert.equal(server.payload, null); // not sent; it remains in the device's local draft
});

async function assertRejects(p) {
  try {
    await p;
  } catch {
    return;
  }
  assert.fail("expected rejection");
}
