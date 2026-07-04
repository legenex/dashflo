import fs from "node:fs";
import path from "node:path";
import { Markdown } from "@/components/docs/Markdown";

export default function DocsIndex() {
  const source = fs.readFileSync(path.join(process.cwd(), "docs-content", "getting-started.md"), "utf8");
  return <Markdown source={source} />;
}
