import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, type Connection, type SessionInfo } from "@/shared/api/tauri";

export type TerminalTab = {
  id: string;
  connectionId: string;
  title: string;
  subtitle: string;
  chunks: string[];
  size: { cols: number; rows: number };
  info: SessionInfo | null;
};

type SshTerminalContextValue = {
  activeTerminal: TerminalTab | null;
  activeTerminalId: string | null;
  terminalError: unknown;
  terminalTabs: TerminalTab[];
  clearTerminalError: () => void;
  closeSession: (id: string) => Promise<void>;
  openSession: (connection: Connection) => Promise<void>;
  resizeTerminal: (sessionId: string, cols: number, rows: number) => void;
  sendTerminalData: (sessionId: string, data: string) => void;
  setActiveTerminalId: (id: string | null) => void;
};

const SshTerminalContext = createContext<SshTerminalContextValue | null>(null);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function SshTerminalProvider({ children }: { children: ReactNode }) {
  const [terminalTabs, setTerminalTabs] = useState<TerminalTab[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [terminalError, setTerminalError] = useState<unknown>(null);
  const readInFlightRef = useRef<Record<string, boolean>>({});
  const terminalTabsRef = useRef<TerminalTab[]>([]);

  useEffect(() => {
    terminalTabsRef.current = terminalTabs;
  }, [terminalTabs]);

  const activeTerminal = useMemo(
    () => terminalTabs.find((tab) => tab.id === activeTerminalId) ?? null,
    [activeTerminalId, terminalTabs],
  );

  const removeTerminalTab = useCallback((id: string) => {
    delete readInFlightRef.current[id];
    setTerminalTabs((tabs) => tabs.filter((tab) => tab.id !== id));
    setActiveTerminalId((current) => {
      if (current !== id) return current;
      const remaining = terminalTabsRef.current.filter((tab) => tab.id !== id);
      return remaining[remaining.length - 1]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      for (const tab of terminalTabsRef.current) {
        if (readInFlightRef.current[tab.id]) continue;
        readInFlightRef.current[tab.id] = true;
        try {
          const bytes = await api.sshReadData(tab.id, 8192);
          if (bytes.length > 0) {
            const chunk = decoder.decode(new Uint8Array(bytes));
            setTerminalTabs((tabs) =>
              tabs.map((item) =>
                item.id === tab.id
                  ? { ...item, chunks: [...item.chunks, chunk] }
                  : item,
              ),
            );
          }
        } catch (error) {
          setTerminalError(error);
          removeTerminalTab(tab.id);
        } finally {
          readInFlightRef.current[tab.id] = false;
        }
      }
    }, 50);
    return () => window.clearInterval(interval);
  }, [removeTerminalTab]);

  const openSession = useCallback(
    async (connection: Connection) => {
      const id = await api.sshOpenSession(connection.config);
      const size = activeTerminal?.size ?? { cols: 80, rows: 24 };
      await api.sshResize(id, size.cols, size.rows);
      const info = await api.sshSessionInfo(id);
      setTerminalTabs((tabs) => [
        ...tabs,
        {
          id,
          connectionId: connection.id,
          title: connection.name,
          subtitle: `${connection.config.credential.username}@${connection.config.host}:${connection.config.port}`,
          chunks: [],
          size,
          info,
        },
      ]);
      setActiveTerminalId(id);
    },
    [activeTerminal?.size],
  );

  const closeSession = useCallback(
    async (id: string) => {
      await api.sshCloseSession(id).catch(() => undefined);
      removeTerminalTab(id);
    },
    [removeTerminalTab],
  );

  const sendTerminalData = useCallback(
    (sessionId: string, data: string) => {
      void api
        .sshSendData(sessionId, Array.from(encoder.encode(data)))
        .catch((error) => {
          setTerminalError(error);
          removeTerminalTab(sessionId);
        });
    },
    [removeTerminalTab],
  );

  const resizeTerminal = useCallback(
    (sessionId: string, cols: number, rows: number) => {
      setTerminalTabs((tabs) =>
        tabs.map((tab) =>
          tab.id === sessionId ? { ...tab, size: { cols, rows } } : tab,
        ),
      );
      void api.sshResize(sessionId, cols, rows).catch((error) => {
        setTerminalError(error);
        removeTerminalTab(sessionId);
      });
    },
    [removeTerminalTab],
  );

  const value = useMemo<SshTerminalContextValue>(
    () => ({
      activeTerminal,
      activeTerminalId,
      terminalError,
      terminalTabs,
      clearTerminalError: () => setTerminalError(null),
      closeSession,
      openSession,
      resizeTerminal,
      sendTerminalData,
      setActiveTerminalId,
    }),
    [
      activeTerminal,
      activeTerminalId,
      closeSession,
      openSession,
      resizeTerminal,
      sendTerminalData,
      terminalError,
      terminalTabs,
    ],
  );

  return (
    <SshTerminalContext.Provider value={value}>
      {children}
    </SshTerminalContext.Provider>
  );
}

export function useSshTerminals() {
  const context = useContext(SshTerminalContext);
  if (!context) {
    throw new Error("useSshTerminals must be used within SshTerminalProvider");
  }
  return context;
}
