import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  PlugZap,
  Plus,
  RefreshCcw,
  Server,
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
import { api, type Connection, type PortForwardInfo } from "@/shared/api/tauri";
import { IconPlugConnectedX } from "@tabler/icons-react";

export const Route = createFileRoute("/port-forward")({
  component: PortForwardRoute,
});

type Toast = { kind: "ok" | "error"; message: string };

function PortForwardRoute() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [forwards, setForwards] = useState<PortForwardInfo[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [localAddr, setLocalAddr] = useState("127.0.0.1:9000");
  const [remoteAddr, setRemoteAddr] = useState("127.0.0.1:80");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const selectedConnection = useMemo(
    () =>
      connections.find((connection) => connection.id === connectionId) ?? null,
    [connectionId, connections],
  );

  const forwardsByConnection = useMemo(() => {
    return forwards.reduce<Record<string, PortForwardInfo[]>>(
      (groups, forward) => {
        groups[forward.connection_id] = groups[forward.connection_id] ?? [];
        groups[forward.connection_id].push(forward);
        return groups;
      },
      {},
    );
  }, [forwards]);

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
      const [nextConnections, nextForwards] = await Promise.all([
        api.getAllConnections(),
        api.sshListLocalPortForwards(),
      ]);
      setConnections(nextConnections);
      setForwards(nextForwards);
      if (!connectionId && nextConnections[0]) {
        setConnectionId(nextConnections[0].id);
      }
    } catch (error) {
      showError(error);
    }
  }, [connectionId, showError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const startForward = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedConnection) return;

    setBusy(true);
    setToast(null);
    api
      .sshStartLocalPortForward(selectedConnection, localAddr, remoteAddr)
      .then((forward) => {
        setForwards((items) => [...items, forward]);
        showOk(`Forwarding ${forward.local_addr} to ${forward.remote_addr}`);
      })
      .catch(showError)
      .finally(() => setBusy(false));
  };

  const stopForward = (forward: PortForwardInfo) => {
    setBusy(true);
    setToast(null);
    api
      .sshStopLocalPortForward(forward.id)
      .then(() => {
        setForwards((items) => items.filter((item) => item.id !== forward.id));
        showOk(`Stopped ${forward.local_addr}`);
      })
      .catch(showError)
      .finally(() => setBusy(false));
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-background text-foreground">
      <header className="flex h-12 items-center gap-2 border-b px-3">
        <Link to="/">
          <Button size="icon-sm" variant="ghost">
            <ArrowLeft />
          </Button>
        </Link>
        <PlugZap className="size-4" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">Port Forward</div>
          <div className="truncate text-[0.68rem] text-muted-foreground">
            Manage multiple SSH local forwards per server
          </div>
        </div>
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
        <Button size="icon-sm" variant="ghost" onClick={() => void loadData()}>
          <RefreshCcw />
        </Button>
      </header>

      <main className="grid min-h-0 grid-cols-[300px_minmax(0,1fr)]">
        <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-r">
          <div className="border-b p-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <Server className="size-4" />
              Servers
            </div>
          </div>
          <div className="min-h-0 space-y-2 overflow-auto p-3">
            {connections.map((connection) => {
              const activeCount =
                forwardsByConnection[connection.id]?.length ?? 0;
              return (
                <button
                  key={connection.id}
                  className={`w-full rounded-md border p-3 text-left transition ${
                    connection.id === connectionId
                      ? "border-primary bg-primary/10"
                      : "bg-card hover:border-primary/50"
                  }`}
                  onClick={() => setConnectionId(connection.id)}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <Server className="size-4" />
                    <div className="min-w-0 flex-1 truncate text-sm font-medium">
                      {connection.name}
                    </div>
                    {activeCount > 0 && (
                      <Badge className="bg-muted/60">{activeCount}</Badge>
                    )}
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

        <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div className="border-b p-4">
            <form
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-3"
              onSubmit={startForward}
            >
              <Field label="Local Address">
                <Input
                  required
                  value={localAddr}
                  onChange={(event) => setLocalAddr(event.target.value)}
                />
              </Field>
              <Field label="Remote Address">
                <Input
                  required
                  value={remoteAddr}
                  onChange={(event) => setRemoteAddr(event.target.value)}
                />
              </Field>
              <Button disabled={busy || !selectedConnection} type="submit">
                <Plus />
                Add Forward
              </Button>
            </form>
          </div>

          <div className="min-h-0 overflow-auto p-4">
            {selectedConnection ? (
              <ServerForwardList
                busy={busy}
                connection={selectedConnection}
                forwards={forwardsByConnection[selectedConnection.id] ?? []}
                onStop={stopForward}
              />
            ) : (
              <div className="text-sm text-muted-foreground">
                No server selected
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function ServerForwardList({
  busy,
  connection,
  forwards,
  onStop,
}: {
  busy: boolean;
  connection: Connection;
  forwards: PortForwardInfo[];
  onStop: (forward: PortForwardInfo) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Server className="size-4" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {connection.name}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {connection.config.credential.username}@{connection.config.host}:
            {connection.config.port}
          </div>
        </div>
        <Badge className="bg-muted/60">{forwards.length} active</Badge>
      </div>

      {forwards.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No active port forward for this server.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {forwards.map((forward) => (
            <Card key={forward.id}>
              <CardHeader className="h-11 relative">
                <div className="min-w-0 flex truncate text-xs font-semibold">
                  <PlugZap className="size-4 mr-2" />
                  {forward.local_addr}
                </div>
                <Badge className="border-primary/40 bg-primary/10 absolute top-0 right-2">
                  Active
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border bg-muted/40 p-2 text-xs">
                  <div className="text-muted-foreground">Local</div>
                  <div className="truncate font-medium">
                    {forward.local_addr}
                  </div>
                  <div className="mt-2 text-muted-foreground">Remote</div>
                  <div className="truncate font-medium">
                    {forward.remote_addr}
                  </div>
                </div>
                <Button
                  className="w-full"
                  disabled={busy}
                  size="sm"
                  variant="destructive"
                  onClick={() => onStop(forward)}
                >
                  <IconPlugConnectedX />
                  Disconnect
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
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
