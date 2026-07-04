"use client";

import { useState, type ReactNode } from "react";
import { Copy, Check } from "lucide-react";

// Minimal markdown renderer for the docs: headings, paragraphs, lists,
// fenced code with copy buttons, bold, inline code, links, and method badges
// written as **GET** / **POST** at line start inside headings.

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-3">
      <button
        type="button"
        className="absolute right-2 top-2 z-10 cursor-pointer rounded-md border border-panelborder bg-elevated p-1.5 text-label opacity-0 transition-opacity hover:text-title group-hover:opacity-100"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy code"
      >
        {copied ? <Check size={13} className="text-verified" /> : <Copy size={13} />}
      </button>
      <pre className="overflow-x-auto rounded-xl border border-panelborder bg-[#070a1c] p-4 text-[12px] leading-relaxed text-body">
        <code data-lang={lang}>{code}</code>
      </pre>
    </div>
  );
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: code, bold, links.
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      out.push(
        <code key={`${keyBase}-${i}`} className="rounded bg-[rgba(34,211,238,0.1)] px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      const inner = token.slice(2, -2);
      const badge = /^(GET|POST|PUT|DELETE|PATCH)$/.exec(inner);
      if (badge) {
        const colors: Record<string, string> = {
          GET: "bg-[rgba(34,197,94,0.15)] text-verified border-[rgba(34,197,94,0.4)]",
          POST: "bg-[rgba(96,165,250,0.15)] text-info border-[rgba(96,165,250,0.4)]",
          DELETE: "bg-[rgba(239,68,68,0.15)] text-danger border-[rgba(239,68,68,0.4)]",
          PUT: "bg-[rgba(245,158,11,0.15)] text-warning border-[rgba(245,158,11,0.4)]",
          PATCH: "bg-[rgba(167,139,250,0.15)] text-queued border-[rgba(167,139,250,0.4)]",
        };
        out.push(
          <span key={`${keyBase}-${i}`} className={`mr-1 inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${colors[inner]}`}>
            {inner}
          </span>
        );
      } else {
        out.push(<strong key={`${keyBase}-${i}`} className="font-semibold text-title">{inner}</strong>);
      }
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        out.push(
          <a key={`${keyBase}-${i}`} href={link[2]} className="text-accent underline decoration-[rgba(34,211,238,0.4)] hover:decoration-[var(--cyan)]">
            {link[1]}
          </a>
        );
      }
    }
    last = match.index + token.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push(<CodeBlock key={key++} code={code.join("\n")} lang={lang} />);
      continue;
    }

    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines
        .filter((l) => !/^\|[\s-|]+\|$/.test(l))
        .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
      if (rows.length > 0) {
        blocks.push(
          <div key={key++} className="my-3 overflow-x-auto rounded-xl border border-panelborder">
            <div className="min-w-[480px]">
              <div className="flex border-b border-panelborder bg-[rgba(11,14,35,0.5)]">
                {rows[0].map((cell, ci) => (
                  <div key={ci} className="df-label flex-1 px-3 py-2">{cell}</div>
                ))}
              </div>
              {rows.slice(1).map((row, ri) => (
                <div key={ri} className="flex border-b border-[rgba(38,43,77,0.4)] last:border-0">
                  {row.map((cell, ci) => (
                    <div key={ci} className="flex-1 px-3 py-1.5 text-xs text-body">{renderInline(cell, `t${ri}${ci}`)}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      }
      continue;
    }

    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-body">
          {items.map((item, ii) => <li key={ii}>{renderInline(item, `li${ii}`)}</li>)}
        </ul>
      );
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push(<h3 key={key++} className="mb-1.5 mt-6 text-base font-bold text-title">{renderInline(line.slice(4), `h3-${key}`)}</h3>);
    } else if (line.startsWith("## ")) {
      blocks.push(<h2 key={key++} className="mb-2 mt-8 border-b border-panelborder pb-1.5 text-lg font-bold text-title">{renderInline(line.slice(3), `h2-${key}`)}</h2>);
    } else if (line.startsWith("# ")) {
      blocks.push(<h1 key={key++} className="mb-3 text-2xl font-bold text-title">{renderInline(line.slice(2), `h1-${key}`)}</h1>);
    } else if (line.trim() === "") {
      // skip
    } else {
      blocks.push(<p key={key++} className="my-2 text-sm leading-relaxed text-body">{renderInline(line, `p-${key}`)}</p>);
    }
    i++;
  }

  return <div>{blocks}</div>;
}
