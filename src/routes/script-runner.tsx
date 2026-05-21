import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Edit3,
  Play,
  Plus,
  RefreshCcw,
  Save,
  ScrollText,
  Search,
  Server,
  Square,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast as sonnerToast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  api,
  type Connection,
  type SavedScript,
  type ScriptRunInfo,
} from "@/shared/api/tauri";
import { CodeEditor } from "@/shared/components/code-editor";

export const Route = createFileRoute("/script-runner")({
  component: ScriptRunnerRoute,
});

type ScriptDraft = {
  id: string;
  name: string;
  description: string;
  connectionId: string;
  script: string;
};

function emptyDraft(connectionId = ""): ScriptDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    connectionId,
    script: "#!/usr/bin/env bash\nset -e\n\n",
  };
}

function draftFromScript(script: SavedScript): ScriptDraft {
  return {
    id: script.id,
    name: script.name,
    description: script.description ?? "",
    connectionId: script.connection_id,
    script: script.script,
  };
}

function runCompletionMessage(run: ScriptRunInfo) {
  if (run.status === "Running") return "";
  const exitCode =
    run.exit_code === null || run.exit_code === undefined
      ? "unknown"
      : String(run.exit_code);
  return `\n[${run.status.toLowerCase()}] exit code: ${exitCode}\n`;
}

function ScriptRunnerRoute() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [selectedScriptId, setSelectedScriptId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ScriptDraft>(() => emptyDraft());
  const [editing, setEditing] = useState(false);
  const [runsByScriptId, setRunsByScriptId] = useState<
    Record<string, ScriptRunInfo>
  >({});
  const [outputsByRunId, setOutputsByRunId] = useState<Record<string, string>>(
    {},
  );
  const [actionScriptId, setActionScriptId] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedConnection = useMemo(
    () =>
      connections.find((connection) => connection.id === selectedConnectionId) ??
      null,
    [connections, selectedConnectionId],
  );

  const selectedScript = useMemo(
    () => scripts.find((script) => script.id === selectedScriptId) ?? null,
    [scripts, selectedScriptId],
  );

  const scriptsByConnection = useMemo(() => {
    return scripts.reduce<Record<string, SavedScript[]>>((groups, script) => {
      groups[script.connection_id] = groups[script.connection_id] ?? [];
      groups[script.connection_id].push(script);
      return groups;
    }, {});
  }, [scripts]);

  const filteredScripts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return scripts
      .filter((script) => script.connection_id === selectedConnectionId)
      .filter((script) =>
        normalized ? script.name.toLowerCase().includes(normalized) : true,
      );
  }, [query, scripts, selectedConnectionId]);

  const selectedRun = useMemo(
    () =>
      Object.values(runsByScriptId).find((item) => item.id === selectedRunId) ??
      null,
    [runsByScriptId, selectedRunId],
  );

  const selectedOutput = selectedRunId ? outputsByRunId[selectedRunId] : "";
  const draftRunning = runsByScriptId[draft.id]?.status === "Running";
  const runList = useMemo(
    () =>
      Object.values(runsByScriptId).sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
      ),
    [runsByScriptId],
  );

  const showOk = useCallback((message: string) => {
    sonnerToast.success(message);
  }, []);

  const showError = useCallback((error: unknown) => {
    sonnerToast.error(error instanceof Error ? error.message : String(error));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [nextConnections, nextScripts] = await Promise.all([
        api.getAllConnections(),
        api.scriptList(),
      ]);
      setConnections(nextConnections);
      setScripts(nextScripts);
      setSelectedConnectionId((current) => current || nextConnections[0]?.id || "");
      setDraft((current) =>
        current.connectionId
          ? current
          : { ...current, connectionId: nextConnections[0]?.id || "" },
      );
    } catch (error) {
      showError(error);
    }
  }, [showError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const runningRuns = Object.values(runsByScriptId).filter(
      (item) => item.status === "Running",
    );
    if (runningRuns.length === 0) return;
    const interval = window.setInterval(() => {
      for (const runningRun of runningRuns) {
        void api
          .scriptReadRun(runningRun.id, 8192)
          .then((read) => {
            const completion = runCompletionMessage(read.info);
            if (read.output || completion) {
              setOutputsByRunId((current) => ({
                ...current,
                [read.info.id]:
                  (current[read.info.id] ?? "") + read.output + completion,
              }));
            }
            setRunsByScriptId((current) => ({
              ...current,
              [read.info.script_id]: read.info,
            }));
          })
          .catch(showError);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [runsByScriptId, showError]);

  const openNewScript = () => {
    const connectionId = selectedConnectionId || connections[0]?.id || "";
    setSelectedScriptId("");
    setSelectedRunId("");
    setDraft(emptyDraft(connectionId));
    setEditing(true);
  };

  const editScript = (script: SavedScript) => {
    setSelectedScriptId(script.id);
    setSelectedConnectionId(script.connection_id);
    setSelectedRunId("");
    setDraft(draftFromScript(script));
    setEditing(true);
  };

  const saveScript = (event?: FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    api
      .scriptSave({
        id: scripts.some((script) => script.id === draft.id) ? draft.id : null,
        name: draft.name,
        description: draft.description || null,
        connection_id: draft.connectionId,
        script: draft.script,
      })
      .then((script) => {
        setSelectedScriptId(script.id);
        setSelectedConnectionId(script.connection_id);
        setDraft(draftFromScript(script));
        setScripts((items) =>
          [script, ...items.filter((item) => item.id !== script.id)].sort(
            (a, b) => a.name.localeCompare(b.name),
          ),
        );
        setEditing(false);
        showOk("Script saved");
      })
      .catch(showError)
      .finally(() => setBusy(false));
  };

  const deleteScript = (script = selectedScript) => {
    if (!script) return;
    setActionScriptId(script.id);
    api
      .scriptDelete(script.id)
      .then(() => {
        setScripts((items) => items.filter((item) => item.id !== script.id));
        if (selectedScriptId === script.id) {
          setSelectedScriptId("");
          const deletedRun = runsByScriptId[script.id];
          if (deletedRun && selectedRunId === deletedRun.id) {
            setSelectedRunId("");
          }
          setEditing(false);
          setDraft(emptyDraft(selectedConnectionId));
        }
        showOk("Script deleted");
      })
      .catch(showError)
      .finally(() => setActionScriptId(""));
  };

  const runSavedScript = async (script: SavedScript) => {
    setActionScriptId(script.id);
    try {
      setSelectedScriptId(script.id);
      setSelectedConnectionId(script.connection_id);
      const nextRun = await api.scriptStart(script.id);
      setRunsByScriptId((current) => ({
        ...current,
        [script.id]: nextRun,
      }));
      setOutputsByRunId((current) => ({
        ...current,
        [nextRun.id]: `Running "${script.name}" on ${script.connection_name}...\n`,
      }));
      setEditing(false);
      showOk("Script started");
      await loadData();
    } catch (error) {
      showError(error);
    } finally {
      setActionScriptId("");
    }
  };

  const stopRun = (runToStop: ScriptRunInfo | null = selectedRun) => {
    const run = runToStop;
    if (!run) return;
    setActionScriptId(run.script_id);
    api
      .scriptStopRun(run.id)
      .then(() => {
        const stoppedRun: ScriptRunInfo = {
          ...run,
          status: "Failed",
          finished_at: new Date().toISOString(),
        };
        setRunsByScriptId((current) => ({
          ...current,
          [run.script_id]: stoppedRun,
        }));
        setOutputsByRunId((current) => ({
          ...current,
          [run.id]: `${current[run.id] ?? ""}\n[stopped] exit code: unknown\n`,
        }));
        showOk("Script stopped");
      })
      .catch(showError)
      .finally(() => setActionScriptId(""));
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground">
      <header className="flex h-12 items-center gap-2 border-b px-3">
        <Link to="/">
          <Button size="icon-sm" variant="ghost">
            <ArrowLeft />
          </Button>
        </Link>
        <ScrollText className="size-4" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">Script Runner</div>
          <div className="truncate text-[0.68rem] text-muted-foreground">
            Run saved bash scripts on selected SSH servers
          </div>
        </div>
        <Button size="icon-sm" variant="ghost" onClick={() => void loadData()}>
          <RefreshCcw />
        </Button>
      </header>

      <main className="grid min-h-0 grid-cols-[300px_minmax(360px,1fr)_420px]">
        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r">
          <div className="border-b p-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Server className="size-4" />
              Servers
            </div>
          </div>
          <div className="min-h-0 space-y-2 overflow-auto p-3">
            {connections.map((connection) => {
              const scriptCount =
                scriptsByConnection[connection.id]?.length ?? 0;
              return (
                <button
                  key={connection.id}
                  className={`w-full rounded-md border p-3 text-left transition ${
                    connection.id === selectedConnectionId
                      ? "border-primary bg-primary/10"
                      : "bg-card hover:border-primary/50"
                  }`}
                  onClick={() => {
                    setSelectedConnectionId(connection.id);
                    setSelectedScriptId("");
                    setSelectedRunId("");
                    setEditing(false);
                    setDraft(emptyDraft(connection.id));
                  }}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <Server className="size-4" />
                    <div className="min-w-0 flex-1 truncate text-sm font-medium">
                      {connection.name}
                    </div>
                    <Badge className="bg-muted/60">{scriptCount}</Badge>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {connection.config.credential.username}@
                    {connection.config.host}:{connection.config.port}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-7"
                placeholder="Search script by name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Button disabled={busy || !selectedConnection} onClick={openNewScript}>
              <Plus />
              New Script
            </Button>
          </div>

          <div className="min-h-0 overflow-auto p-4">
            <div className="mb-3 flex items-center gap-2">
              <ScrollText className="size-4" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {selectedConnection?.name ?? "No server selected"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {filteredScripts.length} script runner
                </div>
              </div>
            </div>

            {filteredScripts.length === 0 ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                No script runner for this server.
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
                {filteredScripts.map((script) => {
                  const scriptRun = runsByScriptId[script.id] ?? null;
                  const isRunning = scriptRun?.status === "Running";
                  const isPending = actionScriptId === script.id;
                  return (
                    <div
                      key={script.id}
                      className={`rounded-md border bg-card p-3 ${
                        script.id === selectedScriptId
                          ? "border-primary"
                          : "hover:border-primary/50"
                      }`}
                      onClick={() => {
                        setSelectedScriptId(script.id);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <ScrollText className="size-4" />
                        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {script.name}
                        </div>
                        {isRunning && (
                          <Badge className="border-primary/40 bg-primary/10">
                            Running
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 line-clamp-2 min-h-8 text-xs text-muted-foreground">
                        {script.description || "-"}
                      </div>
                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
                        {isRunning ? (
                          <Button
                            disabled={isPending}
                            size="sm"
                            variant="destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              stopRun(scriptRun);
                            }}
                          >
                            <Square />
                            Stop
                          </Button>
                        ) : (
                          <Button
                            disabled={isPending || isRunning}
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              void runSavedScript(script);
                            }}
                          >
                            <Play />
                            Run
                          </Button>
                        )}
                        <Button
                          disabled={isPending || isRunning}
                          size="icon-sm"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation();
                            editScript(script);
                          }}
                        >
                          <Edit3 />
                        </Button>
                        <Button
                          disabled={isPending || isRunning}
                          size="icon-sm"
                          variant="ghost"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteScript(script);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div className="flex h-12 items-center gap-2 border-b px-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold">
                {editing ? "Editor" : "Runner / Trace"}
              </div>
              <div className="truncate text-[0.68rem] text-muted-foreground">
                {editing
                  ? draft.name || "New script"
                  : selectedRun
                    ? `${selectedRun.script_name} on ${selectedRun.connection_name}`
                    : "-"}
              </div>
            </div>
            {!editing && selectedRun && <RunBadge run={selectedRun} />}
          </div>

          {editing ? (
            <form
              className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 p-3"
              onSubmit={saveScript}
            >
              <Field label="Name">
                <Input
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </Field>
              <Field label="Description">
                <Input
                  value={draft.description}
                  onChange={(event) =>
                    setDraft({ ...draft, description: event.target.value })
                  }
                />
              </Field>
              <div className="flex min-h-0 flex-col gap-1">
                <Label>Script</Label>
                <CodeEditor
                  value={draft.script}
                  onChange={(script) => setDraft({ ...draft, script })}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={
                    busy || draftRunning || !draft.name || !draft.connectionId
                  }
                  type="submit"
                >
                  <Save />
                  Save
                </Button>
                <Button
                  disabled={busy}
                  type="button"
                  variant="ghost"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
              <div className="max-h-56 overflow-auto border-b p-3">
                {runList.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No runner executed yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {runList.map((item) => (
                      <div
                        className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border p-2 ${
                          item.id === selectedRunId
                            ? "border-primary bg-primary/10"
                            : "bg-card"
                        }`}
                        key={item.id}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold">
                            {item.script_name}
                          </div>
                          <div className="truncate text-[0.68rem] text-muted-foreground">
                            {item.connection_name}
                          </div>
                        </div>
                        <RunBadge run={item} />
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() => setSelectedRunId(item.id)}
                        >
                          <TerminalSquare />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <pre className="min-h-0 overflow-auto bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground dark:bg-[#0f172a] dark:text-slate-100">
                {selectedRun
                  ? selectedOutput || "No output yet."
                  : "Click a terminal icon to view output trace."}
              </pre>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

function RunBadge({ run }: { run: ScriptRunInfo }) {
  const isOk = run.status === "Success";
  const isRunning = run.status === "Running";
  return (
    <Badge
      className={
        isRunning
          ? "border-primary/40 bg-primary/10"
          : isOk
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : "border-destructive/40 bg-destructive/10 text-destructive"
      }
    >
      {run.status}
      {run.exit_code !== null && run.exit_code !== undefined
        ? ` (${run.exit_code})`
        : ""}
    </Badge>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
