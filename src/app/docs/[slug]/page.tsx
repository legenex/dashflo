import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/docs/Markdown";
import { findDoc } from "../registry";

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = findDoc(slug);
  if (!entry) notFound();
  const filePath = path.join(process.cwd(), "docs-content", entry.file);
  if (!fs.existsSync(filePath)) notFound();
  const source = fs.readFileSync(filePath, "utf8");
  return <Markdown source={source} />;
}
