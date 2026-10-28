import "./styles.css";
import type {
  Agency,
  ApiRequest,
  ApiResponse,
  Candidate,
  ExtractionResult,
} from "../shared/types";
import { mergeAgency, supportsProfile, unique } from "../shared/normalization";
import { validateAgency } from "../shared/validation";
import { isCommittedResult } from "../shared/result";
import { callApi } from "../services/extensionApi";
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const form = el<HTMLFormElement>("company");
let candidates: Candidate[] = [],
  proposed: Agency;
let requestId = crypto.randomUUID();
let busy = false;
let tab: chrome.tabs.Tab;
type State =
  | "IDLE"
  | "SCANNING"
  | "PREVIEW"
  | "CHECKING_DUPLICATES"
  | "DUPLICATE_FOUND"
  | "SAVING"
  | "SUCCESS"
  | "ERROR";
function state(s: State, message: string) {
  el("status").textContent = message;
  document.body.dataset.state = s;
  busy = ["SCANNING", "CHECKING_DUPLICATES", "SAVING"].includes(s);
  for (const b of document.querySelectorAll<HTMLButtonElement>("button"))
    b.disabled = busy;
  for (const input of form.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >("input,textarea"))
    input.readOnly = busy;
  el<HTMLSelectElement>("candidate").disabled = busy;
  if (tab && !supportsProfile(tab.url ?? ""))
    el<HTMLButtonElement>("scan").disabled = true;
}
function read(): Agency {
  const f = new FormData(form);
  const list = (k: string) => unique(String(f.get(k) ?? "").split(","));
  return {
    name: String(f.get("name") ?? "").trim(),
    website: String(f.get("website") ?? "").trim(),
    clutchUrl: String(f.get("clutchUrl") ?? "").trim(),
    programmingLanguages: list("programmingLanguages"),
    frameworksAndTechnologies: list("frameworksAndTechnologies"),
    notes: String(f.get("notes") ?? ""),
  };
}
function fill(a: Agency) {
  for (const [key, value] of Object.entries(a)) {
    const input = form.elements.namedItem(key) as HTMLInputElement | null;
    if (input)
      input.value = Array.isArray(value)
        ? value.join(", ")
        : String(value ?? "");
  }
  el("preview").hidden = false;
}
async function persist() {
  await chrome.storage.local.set({
    draft: {
      agency: read(),
      url: tab.url,
      requestId,
      candidates,
      diagnostics: el<HTMLTextAreaElement>("diagnostics").value,
      warnings: el("warnings").textContent,
    },
  });
}
async function api(
  operation: ApiRequest["operation"],
  extra: Partial<ApiRequest> = {},
): Promise<ApiResponse> {
  return callApi({ operation, requestId, ...extra });
}
function selectCandidate() {
  const c = candidates[Number(el<HTMLSelectElement>("candidate").value)];
  el("existing").textContent = JSON.stringify(c.agency, null, 2);
  fill(mergeAgency(c.agency, proposed));
  void persist();
}
async function outcome(r: ApiResponse) {
  if (r.status === "DUPLICATE_FOUND") {
    proposed = read();
    candidates = r.data!.candidates!;
    const select = el<HTMLSelectElement>("candidate");
    select.replaceChildren(
      ...candidates.map((c, i) => {
        const o = document.createElement("option");
        o.value = String(i);
        o.textContent = `${c.agency.name} (${c.reason})`;
        return o;
      }),
    );
    el("duplicates").hidden = false;
    el("skip").hidden = false;
    el("save").textContent = "Confirm update";
    selectCandidate();
    state(
      "DUPLICATE_FOUND",
      "Review existing and proposed values, then confirm the update.",
    );
  } else if (r.success) {
    state(
      "SUCCESS",
      r.status === "ADDED"
        ? "Company added."
        : r.status === "UPDATED"
          ? "Company updated."
          : "Skipped. Existing row unchanged.",
    );
    await chrome.storage.local.remove("draft");
    el("preview").hidden = true;
  } else state("ERROR", r.error?.message ?? r.status);
}
el("save").onclick = async () => {
  if (busy) return;
  const agency = read(),
    errors = validateAgency(agency);
  if (errors.length) {
    state("ERROR", errors.join("\n"));
    return;
  }
  await persist();
  try {
    if (candidates.length) {
      state("SAVING", "Saving update…");
      const c = candidates[Number(el<HTMLSelectElement>("candidate").value)];
      await outcome(
        await api("updateCompany", { agency, id: c.agency.id, token: c.token }),
      );
    } else {
      state("CHECKING_DUPLICATES", "Checking duplicates…");
      const check = await api("checkDuplicate", { agency });
      if (!check.success || check.status === "DUPLICATE_FOUND") {
        await outcome(check);
        return;
      }
      state("SAVING", "Saving company…");
      await outcome(await api("createCompany", { agency }));
    }
  } catch (e) {
    state("ERROR", (e as Error).message);
  }
};
el("skip").onclick = async () => {
  state("SAVING", "Skipping…");
  try {
    await outcome(await api("skip"));
  } catch (e) {
    state("ERROR", (e as Error).message);
  }
};
el("cancel").onclick = async () => {
  await chrome.storage.local.remove("draft");
  candidates = [];
  el("preview").hidden = true;
  el("duplicates").hidden = true;
  el("skip").hidden = true;
  el("save").textContent = "Confirm saving";
  state("IDLE", "Cancelled.");
};
el("settings").onclick = () => void chrome.runtime.openOptionsPage();
el("candidate").onchange = selectCandidate;
form.oninput = () => void persist();
el("scan").onclick = async () => {
  state("SCANNING", "Reading the loaded page…");
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      files: ["content.js"],
      world: "ISOLATED",
    });
    const response = (await chrome.tabs.sendMessage(tab.id!, {
      type: "EXTRACT",
    })) as { result?: ExtractionResult; error?: string };
    if (!response.result)
      throw Error(response.error ?? "Extraction failed. Reload the page.");
    requestId = crypto.randomUUID();
    candidates = [];
    el("duplicates").hidden = true;
    el("skip").hidden = true;
    el("save").textContent = "Confirm saving";
    fill(response.result.agency);
    el("warnings").textContent = response.result.warnings.join(" ");
    el<HTMLTextAreaElement>("diagnostics").value =
      response.result.diagnostics ??
      "No diagnostic report available. Scan again.";
    await persist();
    state("PREVIEW", "Review every field before saving.");
  } catch (e) {
    state("ERROR", (e as Error).message);
  }
};
async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  el("url").textContent = tab?.url ?? "No active page";
  const { endpoint, draft, lastResult } = await chrome.storage.local.get([
    "endpoint",
    "draft",
    "lastResult",
  ]);
  const { secret } = await chrome.storage.session.get("secret");
  el("connection").textContent =
    endpoint && secret
      ? "Connection configured · test in Settings"
      : "Connection needs setup in Settings";
  state(
    "IDLE",
    supportsProfile(tab?.url ?? "")
      ? "Ready to scan."
      : "Unsupported page. Open a Clutch agency profile.",
  );
  el<HTMLButtonElement>("scan").disabled = !supportsProfile(tab?.url ?? "");
  if (draft?.url === tab?.url) {
    requestId = draft.requestId;
    fill(draft.agency);
    el<HTMLTextAreaElement>("diagnostics").value =
      draft.diagnostics ?? "Scan again to generate a diagnostic report.";
    el("warnings").textContent = draft.warnings ?? "";
    if (isCommittedResult(lastResult, requestId)) {
      await outcome(lastResult.result);
    } else if (draft.candidates?.length) {
      await outcome({
        success: true,
        status: "DUPLICATE_FOUND",
        data: { candidates: draft.candidates },
      });
      fill(draft.agency);
      await persist();
    } else state("PREVIEW", "Unsaved draft restored.");
  }
}
void init().catch((e) => state("ERROR", (e as Error).message));
