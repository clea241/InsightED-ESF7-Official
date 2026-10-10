// Fake client used only to test the scanner. All names and values are invented.
let draftTimer: ReturnType<typeof setTimeout> | undefined;

function debounce(fn: () => void, ms: number) {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(fn, ms);
}

export function autosaveDraft(form: { title: string; body: unknown }) {
  debounce(
    () => localStorage.setItem("draft:report", JSON.stringify(form)),
    800,
  );
}

export async function submitReport(
  submissionId: string,
  title: string,
  body: unknown,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tenant-id": "demo-tenant",
      },
      body: JSON.stringify({ submissionId, title, body }),
    });
    if (res.ok) {
      localStorage.removeItem("draft:report");
      return res.json();
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw new Error("submit failed");
}

window.addEventListener("beforeunload", () => {
  // warn if a draft exists
});
