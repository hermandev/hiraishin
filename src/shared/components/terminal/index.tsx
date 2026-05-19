import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

type AppTerminalProps = {
  active?: boolean;
  chunks: string[];
  connected: boolean;
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
};

export default function AppTerminal({
  active = true,
  chunks,
  connected,
  onData,
  onResize,
}: AppTerminalProps) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const writtenChunksRef = useRef(0);
  const activeRef = useRef(active);
  const connectedRef = useRef(connected);
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);

  useEffect(() => {
    activeRef.current = active;
    if (active && connected) {
      terminalInstanceRef.current?.focus();
    }
  }, [active, connected]);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    const terminalElement = terminalRef.current;
    if (!terminalElement) return;

    const terminal = new Terminal({
      allowProposedApi: true,
      convertEol: true,
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"JetBrains Mono Variable", monospace',
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalElement);
    terminalInstanceRef.current = terminal;

    let animationFrame = 0;
    const fitTerminal = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        fitAddon.fit();
        onResizeRef.current(terminal.cols, terminal.rows);
      });
    };

    fitTerminal();

    const dataDisposable = terminal.onData((data) => {
      if (connectedRef.current) {
        onDataRef.current(data);
      }
    });

    const resizeObserver = new ResizeObserver(fitTerminal);
    resizeObserver.observe(terminalElement);

    const handleResize = () => fitTerminal();
    const handleMouseDown = () => terminal.focus();
    window.addEventListener("resize", handleResize);
    terminalElement.addEventListener("mousedown", handleMouseDown);

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
      terminalElement.removeEventListener("mousedown", handleMouseDown);
      dataDisposable.dispose();
      terminalInstanceRef.current = null;
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    const terminal = terminalInstanceRef.current;
    if (!terminal) return;

    if (chunks.length < writtenChunksRef.current) {
      writtenChunksRef.current = 0;
      terminal.clear();
    }

    for (const chunk of chunks.slice(writtenChunksRef.current)) {
      terminal.write(chunk);
    }
    writtenChunksRef.current = chunks.length;
  }, [chunks]);

  useEffect(() => {
    const terminal = terminalInstanceRef.current;
    if (!terminal) return;

    if (connected && activeRef.current) {
      terminal.focus();
    }
  }, [connected]);

  return (
    <div
      ref={terminalRef}
      className="h-full min-h-0 w-full min-w-0 overflow-hidden bg-[#0f172a]"
    />
  );
}
