import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ctxSrc = read("../../../client/src/context/AppContext.jsx");

// Run the REAL beginSaveFlow / runSaveFlow from AppContext with React's hooks replaced by plain objects.
const start = ctxSrc.indexOf("const saveFlowLockRef = useRef(false);");
const end = ctxSrc.indexOf("const saveSchoolSubjects = async");
const body = ctxSrc.slice(start, end);

let modal;
let make;
beforeEach(() => {
  modal = null;
  make = new Function(
    "useRef",
    "setCustomModal",
    `${body}; return { beginSaveFlow, runSaveFlow };`,
  )(
    (v) => ({ current: v }),
    (updater) => {
      modal = typeof updater === "function" ? updater(modal) : updater;
    },
  );
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("shared saving modal (beginSaveFlow / runSaveFlow)", () => {
  it("opens in a loading state before the write finishes, success only after it resolves", async () => {
    let finish;
    const pending = make.runSaveFlow(
      { title: "Saving Designations", successMessage: "Saved!" },
      () => new Promise((resolve) => (finish = () => resolve({ ok: true }))),
    );
    await tick();
    expect(modal).toMatchObject({ type: "saving", status: "loading" });
    expect(modal.title).toBe("Saving Designations");
    finish();
    const res = await pending;
    expect(res.ok).toBe(true);
    expect(modal).toMatchObject({ status: "success", message: "Saved!" });
  });

  it("never reports success when the write fails; shows the real message with Retry", async () => {
    let attempts = 0;
    const pending = make.runSaveFlow({ successMessage: "Saved!" }, async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("statement timeout");
      return { ok: true };
    });
    await tick();
    expect(modal).toMatchObject({
      status: "error",
      message: "statement timeout",
      canRetry: true,
    });
    modal.onRetry();
    const res = await pending;
    expect(attempts).toBe(2);
    expect(res.ok).toBe(true);
    expect(modal.status).toBe("success");
  });

  it("Close after an error resolves { ok:false } and clears the modal", async () => {
    const pending = make.runSaveFlow({}, async () => {
      throw new Error("boom");
    });
    await tick();
    modal.onClose();
    const res = await pending;
    expect(res.ok).toBe(false);
    expect(res.error.message).toBe("boom");
    expect(modal).toBeNull();
  });

  it("a task result of { ok:false } is treated as a failure, not a success", async () => {
    const pending = make.runSaveFlow({}, async () => ({
      ok: false,
      title: "School Head Required",
      message: "Designate a School Head.",
    }));
    await tick();
    expect(modal).toMatchObject({
      status: "error",
      title: "School Head Required",
      message: "Designate a School Head.",
    });
    modal.onClose();
    expect((await pending).ok).toBe(false);
  });

  it("blocks a second save while one is running (double submit)", async () => {
    let release;
    const first = make.runSaveFlow(
      {},
      () => new Promise((resolve) => (release = () => resolve({ ok: true }))),
    );
    await tick();
    let secondRan = false;
    const second = await make.runSaveFlow({}, async () => {
      secondRan = true;
    });
    expect(second).toEqual({ ok: false, busy: true });
    expect(secondRan).toBe(false);
    release();
    await first;
  });

  it("a save that already succeeded can be followed by the next step of the same action", async () => {
    await make.runSaveFlow({}, async () => ({ ok: true }));
    expect(modal.status).toBe("success");
    let ran = false;
    const next = await make.runSaveFlow({}, async () => {
      ran = true;
      return { ok: true };
    });
    expect(ran).toBe(true);
    expect(next.ok).toBe(true);
  });

  it("an offline result is announced as saved on this device, not as saved to the database", async () => {
    await make.runSaveFlow(
      { successMessage: "Saved to database." },
      async () => ({
        ok: true,
        offline: true,
      }),
    );
    expect(modal.title).toBe("Saved offline");
    expect(modal.message).not.toMatch(/saved to database/i);
  });

  it("does not close on a timer: the success modal stays until OK", async () => {
    await make.runSaveFlow({}, async () => ({ ok: true }));
    await new Promise((r) => setTimeout(r, 30));
    expect(modal.status).toBe("success");
    modal.onClose();
    expect(modal).toBeNull();
  });
});

describe("App renders the shared modal as a blocking overlay", () => {
  const app = read("../../../client/src/App.jsx");
  it("loading state swallows Esc / Tab and warns before the page is left", () => {
    expect(app).toMatch(/renderSavingModal/);
    expect(app).toMatch(/m\.status === "loading" && \(e\.key === "Escape"/);
    expect(app).toMatch(/beforeunload/);
    expect(app).toMatch(/aria-busy/);
  });
  it("has no backdrop click handler (cannot be dismissed by clicking outside)", () => {
    const i = app.indexOf("const renderSavingModal");
    const body = app.slice(i, i + 1200);
    expect(body).not.toMatch(/onClick=\{/);
  });
});

describe("save results are no longer announced by toasts", () => {
  const files = {
    designations: read("../../../client/src/pages/Designations.jsx"),
    profile: read("../../../client/src/pages/PersonnelProfile.jsx"),
    workload: read("../../../client/src/pages/Workload.jsx"),
    classes: read("../../../client/src/pages/OrganizedClasses.jsx"),
    school: read("../../../client/src/pages/SchoolProfile.jsx"),
    deployment: read("../../../client/src/pages/Deployment.jsx"),
    roster: read("../../../client/src/pages/Roster.jsx"),
  };
  it("the old success toasts are gone", () => {
    expect(files.designations).not.toMatch(
      /showToast\(\s*"Designations saved to database/,
    );
    expect(files.profile).not.toMatch(
      /showToast\(\s*"Personnel profile changes saved/,
    );
    expect(files.workload).not.toMatch(
      /showToast\(\s*"Workload (schedule|changes) saved/,
    );
    expect(files.classes).not.toMatch(
      /showToast\(\s*"Organized classes and section setup saved/,
    );
    expect(files.school).not.toMatch(
      /showToast\(\s*"School Profile configuration saved/,
    );
    expect(files.deployment).not.toMatch(
      /showToast\(\s*"Deployment changes saved/,
    );
    expect(files.roster).not.toMatch(/Roster saved to database\./);
  });
  it("each page's Save runs inside runSaveFlow", () => {
    for (const [name, src] of Object.entries(files)) {
      expect(src, name).toMatch(/runSaveFlow\(/);
    }
  });
  it("the earlier SweetAlert helper is gone (one modal, not two)", () => {
    for (const src of Object.values(files)) {
      expect(src).not.toMatch(/openSavingAlert|services\/saveAlert/);
    }
  });
});
