import { useEffect, useRef, useState } from "react";
import type { ConsoleLine } from "../types";
import { sendInput } from "../backend";

// Strips all ANSI CSI sequences (colors, cursor movement, …), not just SGR color codes.
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]/g;
// Matches a trailing interactive yes/no prompt, e.g. "(Y/n)", "[y/N]", "(yes/no):".
const PROMPT_RE = /[([]\s*(y(?:es)?)\s*\/\s*(n(?:o)?)\s*[)\]]\s*:?\s*$/i;
// Many CLIs (uvicorn, npm warn, webpack, …) write plain informational lines to
// stderr, so coloring purely by OS stream marks normal output red. Only flag
// a line as an error when it actually looks like one.
const ERROR_LINE_RE = /\b(error|exception|traceback|fatal|panic(?:ked)?)\b/i;

function lineClass(l: ConsoleLine): string {
  if (l.stream === "info") return "console-info";
  return ERROR_LINE_RE.test(l.line) ? "console-stderr" : "console-stdout";
}

interface ConsoleProps {
  lines: ConsoleLine[];
  /** When set, the last line is checked for an interactive Y/n prompt and,
   * while the process is still running, answer buttons are shown that write
   * the choice to the process's stdin. */
  procId?: string;
  running?: boolean;
}

export default function Console({ lines, procId, running }: ConsoleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [answered, setAnswered] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  useEffect(() => {
    setAnswered(null);
  }, [procId, lines.length]);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  const clean = (s: string) => s.replace(ANSI_RE, "");

  const lastLine = lines.length > 0 ? clean(lines[lines.length - 1].line).trim() : "";
  const promptMatch = running && procId && !answered ? lastLine.match(PROMPT_RE) : null;

  async function answer(text: string) {
    if (!procId) return;
    setAnswered(text);
    try {
      await sendInput(procId, `${text}\n`);
    } catch {
      setAnswered(null);
    }
  }

  return (
    <div className="console-wrap">
      <div className="console" ref={ref} onScroll={onScroll}>
        {lines.length === 0 && (
          <div className="console-line console-info">Waiting for output…</div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={`console-line ${lineClass(l)}`}>
            {clean(l.line)}
          </div>
        ))}
      </div>
      {promptMatch && (
        <div className="console-prompt">
          <span className="console-prompt-label">Waiting for input:</span>
          <button className="btn btn-sm btn-primary" onClick={() => answer(promptMatch[1])}>
            {promptMatch[1][0].toUpperCase() + promptMatch[1].slice(1)}
          </button>
          <button className="btn btn-sm" onClick={() => answer(promptMatch[2])}>
            {promptMatch[2][0].toUpperCase() + promptMatch[2].slice(1)}
          </button>
        </div>
      )}
    </div>
  );
}
