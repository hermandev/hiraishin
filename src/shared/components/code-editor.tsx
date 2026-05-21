import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { searchKeymap } from "@codemirror/search";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { useEffect, useRef } from "react";
import { tags } from "@lezer/highlight";
import { useTheme } from "@/shared/provider/theme";

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
    fontSize: "12px",
  },
  ".cm-scroller": {
    fontFamily:
      "var(--font-mono), 'JetBrains Mono Variable', 'JetBrains Mono', monospace",
  },
});

const lightTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--card)",
      color: "var(--foreground)",
    },
    ".cm-content": {
      caretColor: "var(--foreground)",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--foreground)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--muted)",
      color: "var(--muted-foreground)",
      borderRightColor: "var(--border)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--muted)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--muted)",
      color: "var(--foreground)",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in oklch, var(--primary) 25%, transparent)",
    },
  },
  { dark: false },
);

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "oklch(0.45 0.15 260)" },
  { tag: tags.string, color: "oklch(0.43 0.12 145)" },
  { tag: tags.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: tags.number, color: "oklch(0.5 0.13 45)" },
  { tag: tags.variableName, color: "oklch(0.37 0.08 230)" },
  { tag: tags.operator, color: "var(--foreground)" },
]);

export function CodeEditor({ value, onChange }: CodeEditorProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const themeCompartmentRef = useRef(new Compartment());

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          StreamLanguage.define(shell),
          themeCompartmentRef.current.of(
            theme === "dark"
              ? oneDark
              : [lightTheme, syntaxHighlighting(lightHighlightStyle)],
          ),
          editorTheme,
          keymap.of([
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
          ]),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure(
        theme === "dark"
          ? oneDark
          : [lightTheme, syntaxHighlighting(lightHighlightStyle)],
      ),
    });
  }, [theme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  return <div className="h-full min-h-0" ref={containerRef} />;
}
