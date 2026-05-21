import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Check,
  Edit3,
  MonitorX,
  PlugZap,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Server,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  type AuthMethod,
  api,
  type Connection,
  type Group,
  type SshConfig,
} from "@/shared/api/tauri";
import AppTerminal from "@/shared/components/terminal";
import {
  type TerminalTab,
  useSshTerminals,
} from "@/shared/provider/ssh-terminals";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

type ConnectionDraft = {
  id: string;
  name: string;
  description: string;
  host: string;
  port: string;
  username: string;
  authMethod: AuthMethod;
  password: string;
  privateKey: string;
  privateKeyPath: string;
  passphrase: string;
  groupId: string;
  tags: string;
  timeoutSecs: string;
  keepaliveInterval: string;
};

type Toast = { kind: "ok" | "error"; message: string };

function emptyDraft(): ConnectionDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    host: "localhost",
    port: "22",
    username: "root",
    authMethod: "Password",
    password: "",
    privateKey: "",
    privateKeyPath: "",
    passphrase: "",
    groupId: "",
    tags: "",
    timeoutSecs: "10",
    keepaliveInterval: "30",
  };
}

function toConfig(draft: ConnectionDraft): SshConfig {
  return {
    host: draft.host.trim(),
    port: Number(draft.port) || 22,
    credential: {
      username: draft.username.trim(),
      auth_method: draft.authMethod,
      password: draft.authMethod === "Password" ? draft.password : null,
      private_key: draft.authMethod === "PubKey" ? draft.privateKey || null : null,
      private_key_path:
        draft.authMethod === "PubKey" ? draft.privateKeyPath || null : null,
      passphrase:
        draft.authMethod === "PubKey" ? draft.passphrase || null : null,
    },
    jump_host: null,
    timeout_secs: Number(draft.timeoutSecs) || 10,
    keepalive_interval: draft.keepaliveInterval
      ? Number(draft.keepaliveInterval)
      : null,
  };
}

function toConnection(draft: ConnectionDraft): Connection {
  return {
    id: draft.id,
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    config: toConfig(draft),
    group_id: draft.groupId || null,
    created_at: new Date().toISOString(),
    last_used_at: null,
    tags: draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

function fromConnection(connection: Connection): ConnectionDraft {
  return {
    id: connection.id,
    name: connection.name,
    description: connection.description ?? "",
    host: connection.config.host,
    port: String(connection.config.port),
    username: connection.config.credential.username,
    authMethod: connection.config.credential.auth_method,
    password: connection.config.credential.password ?? "",
    privateKey: connection.config.credential.private_key ?? "",
    privateKeyPath: connection.config.credential.private_key_path ?? "",
    passphrase: connection.config.credential.passphrase ?? "",
    groupId: connection.group_id ?? "",
    tags: connection.tags.join(", "),
    timeoutSecs: String(connection.config.timeout_secs),
    keepaliveInterval: connection.config.keepalive_interval
      ? String(connection.config.keepalive_interval)
      : "",
  };
}

function RouteComponent() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const {
    activeTerminal,
    activeTerminalId,
    clearTerminalError,
    closeSession: closeSshSession,
    openSession: openSshSession,
    resizeTerminal,
    sendTerminalData,
    setActiveTerminalId,
    terminalError,
    terminalTabs,
  } = useSshTerminals();

  const selectedConnection = useMemo(
    () =>
      connections.find((connection) => connection.id === selectedId) ?? null,
    [connections, selectedId],
  );

  const filteredConnections = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return connections;
    return connections.filter((connection) => {
      const value = `${connection.name} ${connection.description ?? ""} ${connection.config.host} ${connection.config.credential.username}`;
      return value.toLowerCase().includes(normalized);
    });
  }, [connections, query]);

  const showOk = useCallback((message: string) => {
    setToast({ kind: "ok", message });
  }, []);

  const showError = useCallback((error: unknown) => {
    setToast({
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [nextConnections, nextGroups] = await Promise.all([
        api.getAllConnections(),
        api.getAllGroups(),
      ]);
      setConnections(nextConnections);
      setGroups(nextGroups);
      if (!selectedId && nextConnections[0]) {
        setSelectedId(nextConnections[0].id);
      }
    } catch (error) {
      showError(error);
    }
  }, [selectedId, showError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!terminalError) return;
    showError(terminalError);
    clearTerminalError();
  }, [clearTerminalError, showError, terminalError]);

  const withBusy = useCallback(
    async (task: () => Promise<void>) => {
      setBusy(true);
      setToast(null);
      try {
        await task();
      } catch (error) {
        showError(error);
      } finally {
        setBusy(false);
      }
    },
    [showError],
  );

  const openNewDrawer = () => {
    setDraft(emptyDraft());
    setDrawerOpen(true);
  };

  const openEditDrawer = (connection: Connection) => {
    setSelectedId(connection.id);
    setDraft(fromConnection(connection));
    setDrawerOpen(true);
  };

  const saveConnection = (event: FormEvent) => {
    event.preventDefault();
    void withBusy(async () => {
      const connection = toConnection(draft);
      if (connections.some((item) => item.id === connection.id)) {
        await api.updateConnection(connection);
      } else {
        await api.saveConnection(connection);
      }
      setSelectedId(connection.id);
      setDrawerOpen(false);
      await loadData();
      showOk("SSH server saved");
    });
  };

  const deleteConnection = () => {
    if (!selectedConnection) return;
    void withBusy(async () => {
      await api.deleteConnection(selectedConnection.id);
      setSelectedId("");
      setDrawerOpen(false);
      await loadData();
      showOk("SSH server deleted");
    });
  };

  const testDraftConnection = () => {
    void withBusy(async () => {
      await api.sshTestConnection(toConfig(draft));
      showOk("Connection test succeeded");
    });
  };

  const createGroup = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    void withBusy(async () => {
      const group: Group = {
        id: crypto.randomUUID(),
        name: trimmedName,
        parent_id: null,
        color: null,
        icon: null,
      };
      await api.saveGroup(group);
      setGroups((items) =>
        [...items, group].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setDraft((current) => ({ ...current, groupId: group.id }));
      showOk("Group saved");
    });
  };

  const openSession = (connection = selectedConnection) => {
    if (!connection) return;
    void withBusy(async () => {
      setSelectedId(connection.id);
      await openSshSession(connection);
      showOk("Connected");
    });
  };

  const closeSession = useCallback(
    (id: string) => {
      void withBusy(async () => {
        await closeSshSession(id);
        showOk("Disconnected");
      });
    },
    [closeSshSession, showOk, withBusy],
  );

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground">
      <header className="grid min-h-12 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b px-3 py-1">
        <button
          className={`flex h-9 items-center gap-2 rounded-md px-2 text-left text-sm transition ${
            activeTerminalId
              ? "text-muted-foreground hover:bg-muted hover:text-foreground"
              : "bg-muted text-foreground"
          }`}
          onClick={() => setActiveTerminalId(null)}
          type="button"
        >
          <Server className="size-4" />
          <span className="hidden sm:inline">Servers</span>
        </button>

        <TerminalTabs
          activeId={activeTerminalId}
          tabs={terminalTabs}
          onClose={closeSession}
          onSelect={setActiveTerminalId}
        />

        <div className="flex items-center gap-2">
          {toast && (
            <Badge
              className={
                toast.kind === "ok"
                  ? "border-primary/40 bg-primary/10"
                  : "border-destructive/40 bg-destructive/10 text-destructive"
              }
            >
              {toast.message}
            </Badge>
          )}
          <Link to="/port-forward">
            <Button variant="outline">
              <PlugZap />
              Port Forward
            </Button>
          </Link>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => void loadData()}
          >
            <RefreshCcw />
          </Button>
        </div>
      </header>

      <main className="relative min-h-0">
        {terminalTabs.length > 0 && (
          <section
            className={`absolute inset-0 grid min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[#0f172a] ${
              activeTerminal ? "visible" : "invisible pointer-events-none"
            }`}
          >
            <div className="flex h-10 items-center gap-2 border-b border-white/10 px-3 text-slate-200">
              <TerminalSquare className="size-4" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">
                  {activeTerminal?.title}
                </div>
                <div className="truncate text-[0.68rem] text-slate-400">
                  {activeTerminal?.info
                    ? `${activeTerminal.info.metadata.username}@${activeTerminal.info.metadata.host}:${activeTerminal.info.metadata.port}`
                    : activeTerminal?.subtitle}
                </div>
              </div>
              <Button
                disabled={busy || !activeTerminal}
                size="sm"
                variant="destructive"
                onClick={() =>
                  activeTerminal && closeSession(activeTerminal.id)
                }
              >
                <MonitorX />
                Close
              </Button>
            </div>
            <div className="relative min-h-0">
              {terminalTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={`absolute inset-0 ${
                    tab.id === activeTerminal?.id
                      ? "visible"
                      : "invisible pointer-events-none"
                  }`}
                >
                  <AppTerminal
                    active={tab.id === activeTerminal?.id}
                    chunks={tab.chunks}
                    connected={tab.info?.active ?? true}
                    onData={(data) => sendTerminalData(tab.id, data)}
                    onResize={(cols, rows) =>
                      resizeTerminal(tab.id, cols, rows)
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <div
          className={`absolute inset-0 ${
            activeTerminal ? "invisible pointer-events-none" : "visible"
          }`}
        >
          <ServerList
            busy={busy}
            connections={filteredConnections}
            query={query}
            selectedId={selectedId}
            onAdd={openNewDrawer}
            onConnect={openSession}
            onEdit={openEditDrawer}
            onQueryChange={setQuery}
            onSelect={setSelectedId}
          />
        </div>
      </main>

      {drawerOpen && (
        <ConnectionDrawer
          busy={busy}
          draft={draft}
          groups={groups}
          hasExisting={connections.some(
            (connection) => connection.id === draft.id,
          )}
          onClose={() => setDrawerOpen(false)}
          onCreateGroup={createGroup}
          onDelete={deleteConnection}
          onSubmit={saveConnection}
          onTest={testDraftConnection}
          setDraft={setDraft}
        />
      )}
    </div>
  );
}

function TerminalTabs({
  activeId,
  tabs,
  onClose,
  onSelect,
}: {
  activeId: string | null;
  tabs: TerminalTab[];
  onClose: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  if (tabs.length === 0) {
    return (
      <div className="min-w-0 truncate text-xs text-muted-foreground">
        No active SSH terminal
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex h-9 min-w-36 max-w-56 items-center rounded-md border transition ${
            activeId === tab.id
              ? "border-primary bg-primary/10"
              : "border-transparent bg-muted/40 hover:bg-muted"
          }`}
        >
          <button
            className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left"
            onClick={() => onSelect(tab.id)}
            type="button"
          >
            <TerminalSquare className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">
                {tab.title}
              </span>
              {/*<span className="block truncate text-[0.65rem] text-muted-foreground">
                {tab.subtitle}
              </span>*/}
            </span>
          </button>
          <button
            className="mr-1 flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-background hover:text-foreground"
            onClick={() => onClose(tab.id)}
            type="button"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ServerList({
  busy,
  connections,
  query,
  selectedId,
  onAdd,
  onConnect,
  onEdit,
  onQueryChange,
  onSelect,
}: {
  busy: boolean;
  connections: Connection[];
  query: string;
  selectedId: string;
  onAdd: () => void;
  onConnect: (connection: Connection) => void;
  onEdit: (connection: Connection) => void;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex items-center gap-2 border-b p-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-7"
            placeholder="Search by name, host, username"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
        <Button onClick={onAdd}>
          <Plus />
          Add SSH
        </Button>
      </div>

      <div className="min-h-0 overflow-auto p-4">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
          <button
            className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card text-card-foreground transition hover:border-primary hover:bg-primary/5"
            onClick={onAdd}
            type="button"
          >
            <div className="flex size-10 items-center justify-center rounded-full border bg-background">
              <Plus className="size-5" />
            </div>
            <div className="text-sm font-medium">Add SSH Server</div>
            <div className="text-xs text-muted-foreground">
              Create a new saved connection
            </div>
          </button>

          {connections.map((connection) => (
            <Card
              key={connection.id}
              className={`transition relative ${
                selectedId === connection.id
                  ? "border-primary shadow-sm"
                  : "hover:border-primary/50"
              } `}
            >
              <CardHeader className="h-6">
                <div className="min-w-0 flex truncate text-xs font-semibold">
                  <Server className="size-4 mr-2" />
                  {connection.name}
                </div>
                <Badge className="absolute top-1 right-1 " variant="secondary">
                  {connection.config.credential.auth_method}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <button
                  className="block w-full text-left"
                  onClick={() => onSelect(connection.id)}
                  type="button"
                >
                  <div className="truncate text-xs text-muted-foreground">
                    {connection.config.credential.username}@
                    {connection.config.host}:{connection.config.port}
                  </div>
                  {connection.description ? (
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {connection.description}
                    </div>
                  ) : (
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      -
                    </div>
                  )}
                </button>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={busy}
                    size="sm"
                    onClick={() => onConnect(connection)}
                  >
                    <TerminalSquare />
                    Connect
                  </Button>
                  <Button
                    disabled={busy}
                    size="icon-sm"
                    variant="outline"
                    onClick={() => onEdit(connection)}
                  >
                    <Edit3 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function ConnectionDrawer({
  busy,
  draft,
  groups,
  hasExisting,
  onClose,
  onCreateGroup,
  onDelete,
  onSubmit,
  onTest,
  setDraft,
}: {
  busy: boolean;
  draft: ConnectionDraft;
  groups: Group[];
  hasExisting: boolean;
  onClose: () => void;
  onCreateGroup: (name: string) => void;
  onDelete: () => void;
  onSubmit: (event: FormEvent) => void;
  onTest: () => void;
  setDraft: (draft: ConnectionDraft) => void;
}) {
  const [newGroupName, setNewGroupName] = useState("");

  const submitGroup = () => {
    if (!newGroupName.trim()) return;
    onCreateGroup(newGroupName);
    setNewGroupName("");
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/30">
      <aside className="ml-auto grid h-full w-105 max-w-[calc(100vw-24px)] grid-rows-[auto_minmax(0,1fr)] border-l bg-background shadow-xl">
        <header className="flex h-12 items-center gap-2 border-b px-3">
          <Server className="size-4" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {hasExisting ? "Edit SSH Server" : "Add SSH Server"}
            </div>
            <div className="truncate text-[0.68rem] text-muted-foreground">
              Saved servers appear on the main page
            </div>
          </div>
          <Button size="icon-sm" variant="ghost" onClick={onClose}>
            <X />
          </Button>
        </header>

        <form
          className="min-h-0 space-y-3 overflow-auto p-3"
          onSubmit={onSubmit}
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
          <div className="grid grid-cols-[minmax(0,1fr)_80px] gap-2">
            <Field label="Host">
              <Input
                required
                value={draft.host}
                onChange={(event) =>
                  setDraft({ ...draft, host: event.target.value })
                }
              />
            </Field>
            <Field label="Port">
              <Input
                inputMode="numeric"
                value={draft.port}
                onChange={(event) =>
                  setDraft({ ...draft, port: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Username">
            <Input
              required
              value={draft.username}
              onChange={(event) =>
                setDraft({ ...draft, username: event.target.value })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={draft.authMethod === "Password" ? "default" : "outline"}
              onClick={() => setDraft({ ...draft, authMethod: "Password" })}
            >
              Password
            </Button>
            <Button
              type="button"
              variant={draft.authMethod === "PubKey" ? "default" : "outline"}
              onClick={() => setDraft({ ...draft, authMethod: "PubKey" })}
            >
              Private key
            </Button>
          </div>
          {draft.authMethod === "Password" ? (
            <Field label="Password">
              <Input
                type="password"
                value={draft.password}
                onChange={(event) =>
                  setDraft({ ...draft, password: event.target.value })
                }
              />
            </Field>
          ) : (
            <>
              <Field label="Private Key">
                <Textarea
                  className="min-h-32 font-mono text-xs"
                  placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                  value={draft.privateKey}
                  onChange={(event) =>
                    setDraft({ ...draft, privateKey: event.target.value })
                  }
                />
              </Field>
              <Field label="Private Key Path">
                <Input
                  placeholder="Optional fallback path"
                  value={draft.privateKeyPath}
                  onChange={(event) =>
                    setDraft({ ...draft, privateKeyPath: event.target.value })
                  }
                />
              </Field>
              <Field label="Passphrase">
                <Input
                  type="password"
                  value={draft.passphrase}
                  onChange={(event) =>
                    setDraft({ ...draft, passphrase: event.target.value })
                  }
                />
              </Field>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Timeout">
              <Input
                inputMode="numeric"
                value={draft.timeoutSecs}
                onChange={(event) =>
                  setDraft({ ...draft, timeoutSecs: event.target.value })
                }
              />
            </Field>
            <Field label="Keepalive">
              <Input
                inputMode="numeric"
                value={draft.keepaliveInterval}
                onChange={(event) =>
                  setDraft({ ...draft, keepaliveInterval: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Group">
            <NativeSelect
              value={draft.groupId}
              onChange={(event) =>
                setDraft({ ...draft, groupId: event.target.value })
              }
              className="w-full"
            >
              <NativeSelectOption value="">None</NativeSelectOption>
              {groups.map((group) => (
                <NativeSelectOption key={group.id} value={group.id}>
                  {group.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                placeholder="New group name"
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
              />
              <Button
                disabled={busy || !newGroupName.trim()}
                type="button"
                variant="outline"
                onClick={submitGroup}
              >
                <Plus />
                Add
              </Button>
            </div>
          </Field>
          <Field label="Tags">
            <Input
              value={draft.tags}
              onChange={(event) =>
                setDraft({ ...draft, tags: event.target.value })
              }
            />
          </Field>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" disabled={busy} type="submit">
              <Save />
              Save
            </Button>
            <Button
              disabled={busy}
              type="button"
              variant="outline"
              onClick={onTest}
            >
              <Check />
              Test
            </Button>
            <Button
              disabled={busy || !hasExisting}
              type="button"
              variant="destructive"
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </div>
        </form>
      </aside>
    </div>
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
