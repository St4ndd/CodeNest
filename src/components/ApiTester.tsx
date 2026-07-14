import { useEffect, useState } from "react";
import type { ApiEndpoint, ApiHeader, ApiRequest, ApiResponse, AppData, HttpMethod } from "../types";
import { checkPort, httpRequest, scanApiEndpoints } from "../backend";
import Menu from "./Menu";
import { IconPlus, IconSend, IconTrash, PresetIcon } from "../icons";

interface ApiTesterProps {
  data: AppData;
  onSave: (request: ApiRequest) => void;
  onDelete: (id: string) => void;
  toast: (msg: string) => void;
}

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const METHOD_CLASS: Record<HttpMethod, string> = {
  GET: "method-get",
  POST: "method-post",
  PUT: "method-put",
  PATCH: "method-patch",
  DELETE: "method-delete",
};

function blankRequest(): ApiRequest {
  return {
    id: crypto.randomUUID(),
    name: "Untitled request",
    method: "GET",
    url: "",
    // No default headers: the backend auto-attaches Content-Type: application/json
    // only when a body is actually present, so a bare Content-Type header here
    // would have sent it on every GET/DELETE too and confused strict parsers.
    headers: [],
    body: "",
    projectId: null,
    createdAt: new Date().toISOString(),
  };
}

/** The actual response plus proof of exactly what was sent and when, so it's
 * never ambiguous whether "Send" triggered a fresh request or the panel is
 * just showing an old result. */
interface SentResponse extends ApiResponse {
  requestedAt: Date;
  requestedMethod: HttpMethod;
  requestedUrl: string;
}

export default function ApiTester({ data, onSave, onDelete, toast }: ApiTesterProps) {
  const requests = [...data.apiRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [current, setCurrent] = useState<ApiRequest>(blankRequest());
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<SentResponse | null>(null);
  const [responseTab, setResponseTab] = useState<"body" | "headers">("body");
  const [discovered, setDiscovered] = useState<{
    project: string;
    endpoints: ApiEndpoint[];
    port: number | null;
    online: boolean | null;
  } | null>(null);
  const [checkingPort, setCheckingPort] = useState(false);
  const [urlOnline, setUrlOnline] = useState<boolean | null>(null);
  const [checkingUrl, setCheckingUrl] = useState(false);

  const isSaved = data.apiRequests.some((r) => r.id === current.id);

  const urlHostPort = (() => {
    try {
      const u = new URL(current.url);
      return { host: u.hostname, port: Number(u.port) || (u.protocol === "https:" ? 443 : 80) };
    } catch {
      return null;
    }
  })();

  async function checkCurrentUrl() {
    if (!urlHostPort) {
      setUrlOnline(null);
      return;
    }
    setCheckingUrl(true);
    const online = await checkPort(urlHostPort.host, urlHostPort.port);
    setCheckingUrl(false);
    setUrlOnline(online);
  }

  // Re-check reachability automatically whenever the URL settles (debounced).
  useEffect(() => {
    if (!current.url.trim()) {
      setUrlOnline(null);
      return;
    }
    const t = setTimeout(checkCurrentUrl, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.url]);

  function loadRequest(r: ApiRequest) {
    setCurrent({ ...r, headers: r.headers.map((h) => ({ ...h })) });
    setResponse(null);
  }

  function newRequest() {
    setCurrent(blankRequest());
    setResponse(null);
  }

  function updateHeader(i: number, field: "key" | "value", value: string) {
    setCurrent((c) => ({
      ...c,
      headers: c.headers.map((h, idx) => (idx === i ? { ...h, [field]: value } : h)),
    }));
  }

  function addHeader() {
    setCurrent((c) => ({ ...c, headers: [...c.headers, { key: "", value: "" }] }));
  }

  function removeHeader(i: number) {
    setCurrent((c) => ({ ...c, headers: c.headers.filter((_, idx) => idx !== i) }));
  }

  async function send() {
    if (!current.url.trim()) return;
    setSending(true);
    setResponse(null);
    const method = current.method;
    const url = current.url.trim();
    // A body typed earlier stays in state even after switching methods (the
    // body field is just hidden, not cleared) — only GET has no field for it
    // at all, so only GET should ever have it silently stripped here.
    const bodyApplies = method !== "GET";
    const body = bodyApplies ? current.body : "";
    const sentAt = new Date();
    try {
      const headers: ApiHeader[] = current.headers.filter((h) => h.key.trim());
      const res = await httpRequest(method, url, headers, body);
      setResponse({ ...res, requestedAt: sentAt, requestedMethod: method, requestedUrl: url });
      if (res.error) toast(`Request failed: ${res.error}`);
    } catch (e: any) {
      toast(String(e));
    } finally {
      setSending(false);
    }
  }

  function save() {
    onSave({ ...current, name: current.name.trim() || "Untitled request" });
    toast(`Saved "${current.name.trim() || "Untitled request"}"`);
  }

  function deleteCurrent() {
    onDelete(current.id);
    newRequest();
  }

  async function scanProject(path: string, name: string) {
    toast(`Scanning ${name} for API endpoints…`);
    try {
      const { endpoints, guessed_port } = await scanApiEndpoints(path);
      setDiscovered({ project: name, endpoints, port: guessed_port, online: null });
      if (endpoints.length === 0) toast(`No endpoints found in ${name}.`);
      if (guessed_port) {
        setCheckingPort(true);
        const online = await checkPort("127.0.0.1", guessed_port);
        setCheckingPort(false);
        setDiscovered((d) => (d ? { ...d, online } : d));
      }
    } catch (e: any) {
      toast(String(e));
    }
  }

  async function recheckPort() {
    if (!discovered?.port) return;
    setCheckingPort(true);
    const online = await checkPort("127.0.0.1", discovered.port);
    setCheckingPort(false);
    setDiscovered((d) => (d ? { ...d, online } : d));
  }

  function useEndpoint(ep: ApiEndpoint) {
    const port = discovered?.port ?? 3000;
    setCurrent((c) => ({
      ...c,
      method: (METHODS.includes(ep.method as HttpMethod) ? ep.method : "GET") as HttpMethod,
      url: `http://localhost:${port}${ep.path}`,
      name: ep.path,
    }));
    setResponse(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="preset-line">
            <IconSend size={20} /> API Tester
          </h1>
          <p className="muted">Send requests and inspect responses — no separate tool needed.</p>
        </div>
      </div>

      <div className="todos-layout api-layout">
        <div className="todos-sidebar">
          <button className="btn btn-sm notes-new-btn" onClick={newRequest}>
            <IconPlus size={13} /> New request
          </button>

          <Menu
            trigger={
              <button className="btn btn-sm notes-new-btn api-scan-btn">Scan project for endpoints</button>
            }
            items={data.projects.map((p) => ({
              label: p.name,
              icon: <PresetIcon presetId={p.presetId} size={13} />,
              onClick: () => scanProject(p.path, p.name),
            }))}
          />

          {discovered && (
            <div className="api-discovered">
              <span className="note-tags-label">Found in {discovered.project}</span>
              {discovered.port && (
                <button className="api-port-status" onClick={recheckPort} title="Re-check">
                  {checkingPort ? (
                    <span className="spinner spinner-sm" />
                  ) : (
                    <span className={`dot ${discovered.online ? "dot-on" : "dot-off"}`} />
                  )}
                  Port {discovered.port} —{" "}
                  {checkingPort ? "checking…" : discovered.online ? "running" : "not reachable"}
                </button>
              )}
              {discovered.endpoints.length === 0 ? (
                <p className="muted notes-empty-hint">No endpoints detected.</p>
              ) : (
                discovered.endpoints.map((ep, i) => (
                  <button
                    key={i}
                    className="api-endpoint-row"
                    onClick={() => useEndpoint(ep)}
                    title={`http://localhost:${discovered.port ?? 3000}${ep.path} — from ${ep.file} (click to load, then verify the URL before sending)`}
                  >
                    <span className={`api-method-badge ${METHOD_CLASS[ep.method as HttpMethod] ?? ""}`}>
                      {ep.method}
                    </span>
                    <span className="api-endpoint-path">{ep.path}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {requests.length > 0 && (
            <>
              <span className="note-tags-label api-saved-label">Saved</span>
              {requests.map((r) => (
                <button
                  key={r.id}
                  className={`todos-project-row ${current.id === r.id ? "todos-project-active" : ""}`}
                  onClick={() => loadRequest(r)}
                >
                  <span className={`api-method-badge ${METHOD_CLASS[r.method]}`}>{r.method}</span>
                  <span className="todos-project-name">{r.name}</span>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="todos-main api-main">
          <div className="api-request-header">
            <input
              className="note-title-input api-name-input"
              value={current.name}
              placeholder="Request name…"
              onChange={(e) => setCurrent((c) => ({ ...c, name: e.target.value }))}
            />
            <button className="btn btn-sm" onClick={save}>
              {isSaved ? "Update" : "Save"}
            </button>
            {isSaved && (
              <button className="icon-btn" title="Delete request" onClick={deleteCurrent}>
                <IconTrash size={15} />
              </button>
            )}
          </div>

          <div className="api-url-row">
            <select
              className={`api-method-select ${METHOD_CLASS[current.method]}`}
              value={current.method}
              onChange={(e) => setCurrent((c) => ({ ...c, method: e.target.value as HttpMethod }))}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              className="api-url-input"
              placeholder="http://localhost:3000/api/..."
              value={current.url}
              onChange={(e) => setCurrent((c) => ({ ...c, url: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && send()}
            />
            <button className="btn btn-primary" onClick={send} disabled={sending || !current.url.trim()}>
              {sending ? <span className="spinner spinner-sm" /> : <IconSend size={13} />}
              Send
            </button>
          </div>

          {current.url.trim() && (
            <button className="api-port-status api-url-status" onClick={checkCurrentUrl} title="Re-check">
              {checkingUrl ? (
                <span className="spinner spinner-sm" />
              ) : (
                <span className={`dot ${urlOnline ? "dot-on" : "dot-off"}`} />
              )}
              {checkingUrl
                ? "Checking server…"
                : urlOnline === null
                ? "Server status unknown"
                : urlOnline
                ? `Server reachable on ${urlHostPort?.host}:${urlHostPort?.port}`
                : `Server not reachable on ${urlHostPort?.host}:${urlHostPort?.port}`}
            </button>
          )}

          <div className="api-headers-section">
            <span className="note-tags-label">Headers</span>
            <div className="run-config-list">
              {current.headers.map((h, i) => (
                <div key={i} className="run-config-row api-header-row">
                  <input
                    placeholder="Header"
                    value={h.key}
                    onChange={(e) => updateHeader(i, "key", e.target.value)}
                  />
                  <input
                    placeholder="Value"
                    value={h.value}
                    onChange={(e) => updateHeader(i, "value", e.target.value)}
                  />
                  <button className="icon-btn" onClick={() => removeHeader(i)}>
                    <IconTrash size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button className="btn btn-sm" onClick={addHeader}>
              <IconPlus size={12} /> Add header
            </button>
          </div>

          {current.method !== "GET" && (
            <div className="api-body-section">
              <span className="note-tags-label">Body</span>
              <textarea
                className="note-body-area api-body-area"
                placeholder='{ "key": "value" }'
                value={current.body}
                onChange={(e) => setCurrent((c) => ({ ...c, body: e.target.value }))}
              />
            </div>
          )}

          {response && (
            <div className="api-response">
              <div className="api-response-sent-line">
                Sent <strong>{response.requestedMethod}</strong> {response.requestedUrl} at{" "}
                {response.requestedAt.toLocaleTimeString()}
              </div>
              <div className="api-response-header">
                {response.error ? (
                  <span className="api-status api-status-error">
                    {extractErrorCode(response.error) ?? "Connection Error"}
                  </span>
                ) : (
                  <span
                    className={`api-status ${response.status < 300 ? "api-status-ok" : response.status < 400 ? "api-status-redirect" : "api-status-error"}`}
                  >
                    {response.status} {response.statusText}
                  </span>
                )}
                <span className="muted">{response.durationMs} ms</span>
                <div className="tab-switch api-response-tabs">
                  <button
                    className={`tab-switch-btn ${responseTab === "body" ? "tab-switch-active" : ""}`}
                    onClick={() => setResponseTab("body")}
                  >
                    Body
                  </button>
                  <button
                    className={`tab-switch-btn ${responseTab === "headers" ? "tab-switch-active" : ""}`}
                    onClick={() => setResponseTab("headers")}
                  >
                    Headers
                  </button>
                </div>
              </div>
              {response.error ? (
                <div className="api-response-body">{response.error}</div>
              ) : responseTab === "body" ? (
                <pre className="api-response-body">{formatBody(response.body)}</pre>
              ) : (
                <div className="api-response-body">
                  {response.headers.map((h, i) => (
                    <div key={i} className="api-response-header-row">
                      <span className="api-response-header-key">{h.key}</span>: {h.value}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatBody(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

/** Pulls a Windows OS error code (e.g. "os error 10061" for connection
 * refused) out of a reqwest error message, so failures always show a code
 * instead of just a generic "Connection Error" label. */
function extractErrorCode(message: string): string | null {
  const m = message.match(/os error (\d+)/i);
  return m ? `Error ${m[1]}` : null;
}
