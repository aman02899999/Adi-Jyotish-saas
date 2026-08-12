"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Copy, ExternalLink, GripVertical, Plus, Trash2, X } from "lucide-react";
import type { BlockType, CustomPage, PageBlock } from "@/lib/custom-pages";

const BLOCK_LABELS: Record<BlockType, string> = {
  hero: "Hero banner",
  richtext: "Text section",
  imagetext: "Image + text",
  cta: "Call to action",
  faq: "FAQ list",
  stats: "Stat row",
  spacer: "Spacer",
};

function newBlock(type: BlockType): PageBlock {
  const id = `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const defaults: Record<BlockType, Record<string, string | string[]>> = {
    hero: { eyebrow: "", heading: "New heading", subheading: "" },
    richtext: { heading: "", body: "Write your copy here." },
    imagetext: { imageUrl: "", heading: "New heading", body: "Write your copy here." },
    cta: { heading: "Ready to begin?", body: "", buttonLabel: "Get started", buttonHref: "/" },
    faq: { heading: "Frequently asked questions", questions: ["Question here::Answer here"] },
    stats: { items: ["100::Label"] },
    spacer: { height: "40" },
  };
  return { id, type, data: defaults[type] };
}

export function AdminPageBuilder({ page }: { page: CustomPage }) {
  const [title, setTitle] = useState(page.title);
  const [metaDescription, setMetaDescription] = useState(page.metaDescription);
  const [published, setPublished] = useState(page.published);
  const [blocks, setBlocks] = useState<PageBlock[]>(page.blocks);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  function updateBlockData(index: number, key: string, value: string | string[]) {
    setBlocks((current) => current.map((block, i) => i === index ? { ...block, data: { ...block.data, [key]: value } } : block));
  }

  function addBlock(type: BlockType) {
    setBlocks((current) => [...current, newBlock(type)]);
  }

  function removeBlock(index: number) {
    setBlocks((current) => current.filter((_, i) => i !== index));
  }

  function duplicateBlock(index: number) {
    setBlocks((current) => {
      const source = current[index];
      const copy: PageBlock = { ...source, id: `${source.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, data: { ...source.data } };
      return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    });
  }

  function move(index: number, direction: -1 | 1) {
    setBlocks((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function onDrop(index: number) {
    if (dragIndex === null || dragIndex === index) { setDragIndex(null); return; }
    setBlocks((current) => {
      const next = [...current];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  async function save() {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch(`/api/admin/custom-pages/${page.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, metaDescription, blocks, published }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save page.");
      setNotice("Page saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-builder">
      <section className="settings-card" style={{ marginBottom: 20 }}>
        <header><div><p>Page settings</p><h2>{title || "Untitled page"}</h2></div>{published && <a href={`/p/${page.slug}`} target="_blank" rel="noreferrer" className="button button--ghost button--small"><ExternalLink size={14} /> View live</a>}</header>
        <div className="settings-fields" style={{ padding: "18px 19px" }}>
          <label><span>Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label><span>URL</span><input disabled value={`/p/${page.slug}`} /></label>
          <label className="field--full"><span>Meta description</span><textarea rows={2} maxLength={300} value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} /></label>
          <label className="field--full" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" className={`switch ${published ? "on" : ""}`} onClick={() => setPublished(!published)}><i /></button>
            <span><strong>Published</strong> — visible at /p/{page.slug}</span>
          </label>
        </div>
      </section>

      <section className="settings-card" style={{ marginBottom: 20 }}>
        <header><div><p>Blocks</p><h2>Page content</h2></div></header>
        <div style={{ padding: "18px 19px", display: "flex", flexDirection: "column", gap: 14 }}>
          {blocks.map((block, index) => (
            <div
              key={block.id}
              className="page-builder__block"
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(index)}
            >
              <div className="page-builder__block-head">
                <GripVertical size={16} className="page-builder__grip" />
                <strong>{BLOCK_LABELS[block.type]}</strong>
                <div className="page-builder__block-actions">
                  <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up"><ChevronUp size={15} /></button>
                  <button type="button" onClick={() => move(index, 1)} disabled={index === blocks.length - 1} aria-label="Move down"><ChevronDown size={15} /></button>
                  <button type="button" onClick={() => duplicateBlock(index)} aria-label="Duplicate"><Copy size={15} /></button>
                  <button type="button" onClick={() => removeBlock(index)} aria-label="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
              <BlockFields block={block} onChange={(key, value) => updateBlockData(index, key, value)} />
            </div>
          ))}
          {blocks.length === 0 && <div className="empty-state"><Plus size={22} /><h3>No blocks yet</h3><p>Add your first block below.</p></div>}

          <div className="page-builder__add">
            {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
              <button type="button" key={type} className="button button--ghost button--small" onClick={() => addBlock(type)}><Plus size={13} /> {BLOCK_LABELS[type]}</button>
            ))}
          </div>
        </div>
      </section>

      <div className="settings-save">
        <Link href="/admin/website" className="button button--ghost">Back to pages</Link>
        <button className="button" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save page"}</button>
      </div>
      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}
    </div>
  );
}

function BlockFields({ block, onChange }: { block: PageBlock; onChange: (key: string, value: string | string[]) => void }) {
  const data = block.data;
  const str = (key: string) => (typeof data[key] === "string" ? data[key] as string : "");
  const list = (key: string) => (Array.isArray(data[key]) ? data[key] as string[] : []);

  switch (block.type) {
    case "hero":
      return (
        <div className="page-builder__fields">
          <label><span>Eyebrow</span><input value={str("eyebrow")} onChange={(event) => onChange("eyebrow", event.target.value)} /></label>
          <label><span>Heading</span><input value={str("heading")} onChange={(event) => onChange("heading", event.target.value)} /></label>
          <label className="field--full"><span>Subheading</span><textarea rows={2} value={str("subheading")} onChange={(event) => onChange("subheading", event.target.value)} /></label>
        </div>
      );
    case "richtext":
      return (
        <div className="page-builder__fields">
          <label className="field--full"><span>Heading (optional)</span><input value={str("heading")} onChange={(event) => onChange("heading", event.target.value)} /></label>
          <label className="field--full"><span>Body (blank line = new paragraph)</span><textarea rows={5} value={str("body")} onChange={(event) => onChange("body", event.target.value)} /></label>
        </div>
      );
    case "imagetext":
      return (
        <div className="page-builder__fields">
          <label className="field--full"><span>Image URL</span><input value={str("imageUrl")} onChange={(event) => onChange("imageUrl", event.target.value)} placeholder="https://…" /></label>
          <label><span>Heading</span><input value={str("heading")} onChange={(event) => onChange("heading", event.target.value)} /></label>
          <label className="field--full"><span>Body</span><textarea rows={4} value={str("body")} onChange={(event) => onChange("body", event.target.value)} /></label>
        </div>
      );
    case "cta":
      return (
        <div className="page-builder__fields">
          <label><span>Heading</span><input value={str("heading")} onChange={(event) => onChange("heading", event.target.value)} /></label>
          <label><span>Body</span><input value={str("body")} onChange={(event) => onChange("body", event.target.value)} /></label>
          <label><span>Button label</span><input value={str("buttonLabel")} onChange={(event) => onChange("buttonLabel", event.target.value)} /></label>
          <label><span>Button link</span><input value={str("buttonHref")} onChange={(event) => onChange("buttonHref", event.target.value)} placeholder="/pricing" /></label>
        </div>
      );
    case "faq":
      return (
        <div className="page-builder__fields">
          <label className="field--full"><span>Heading</span><input value={str("heading")} onChange={(event) => onChange("heading", event.target.value)} /></label>
          <label className="field--full">
            <span>Questions (one per line, as Question::Answer)</span>
            <textarea rows={5} value={list("questions").join("\n")} onChange={(event) => onChange("questions", event.target.value.split("\n"))} placeholder={"What is this?::It's a thing.\nHow much?::It's free."} />
          </label>
        </div>
      );
    case "stats":
      return (
        <div className="page-builder__fields">
          <label className="field--full">
            <span>Stats (one per line, as Value::Label)</span>
            <textarea rows={4} value={list("items").join("\n")} onChange={(event) => onChange("items", event.target.value.split("\n"))} placeholder={"5000+::Happy clients\n15+::Years of experience"} />
          </label>
        </div>
      );
    case "spacer":
      return (
        <div className="page-builder__fields">
          <label><span>Height (px)</span><input type="number" min="8" max="200" value={str("height")} onChange={(event) => onChange("height", event.target.value)} /></label>
        </div>
      );
    default:
      return null;
  }
}
