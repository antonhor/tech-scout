import "../popup/styles.css";
import { validEndpoint } from "../services/appsScriptClient";
import { callApi } from "../services/extensionApi";
document.body.style.width = "min(640px, 100%)";
const endpoint = document.getElementById("endpoint") as HTMLInputElement,
  secret = document.getElementById("secret") as HTMLInputElement,
  status = document.getElementById("status")!;
void chrome.storage.local.get("endpoint").then((v) => {
  endpoint.value = v.endpoint ?? "";
});
document.getElementById("settings")!.onsubmit = async (e) => {
  e.preventDefault();
  if (!validEndpoint(endpoint.value.trim())) {
    status.textContent = "Use an HTTPS Apps Script deployment /exec URL.";
    return;
  }
  if (secret.value && secret.value.length < 32) {
    status.textContent = "Key must contain at least 32 characters.";
    return;
  }
  await chrome.storage.local.set({ endpoint: endpoint.value.trim() });
  if (secret.value) {
    await chrome.storage.session.set({ secret: secret.value });
    secret.value = "";
  }
  status.textContent = "Configuration saved. Test the connection.";
};
document.getElementById("test")!.onclick = async () => {
  status.textContent = "Testing…";
  try {
    const r = await callApi({
      operation: "healthCheck",
      requestId: crypto.randomUUID(),
    });
    status.textContent = r.success
      ? "Connected to Companies sheet."
      : (r.error?.message ?? r.status);
  } catch (e) {
    status.textContent = (e as Error).message;
  }
};
document.getElementById("reset")!.onclick = async () => {
  await chrome.storage.local.remove(["draft", "lastResult"]);
  status.textContent = "Drafts and cached results cleared.";
};
document.getElementById("lock")!.onclick = async () => {
  await chrome.storage.session.remove("secret");
  status.textContent = "Session key forgotten.";
};
