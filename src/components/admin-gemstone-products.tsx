"use client";

import { FormEvent, useState } from "react";
import { Check, Copy, Edit3, Gem, ImagePlus, Plus, Trash2, X } from "lucide-react";
import type { GemstoneCategory } from "@/lib/gemstones";

export type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  categoryId: string;
  categoryName: string;
  active: boolean;
  featured: boolean;
  trending: boolean;
  bestseller: boolean;
  totalStock: number;
  variantCount: number;
  startingPrice: number;
  currency: string;
};

type VariantForm = { id?: string; label: string; weightCarat: string; weightRatti: string; certificationLevel: string; price: string; compareAtPrice: string; stockQuantity: string; sku: string; active: boolean };
type ImageForm = { id?: string; url: string; alt: string; isPrimary: boolean };

type FormState = {
  categoryId: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string;
  description: string;
  benefits: string;
  whoShouldWear: string;
  recommendedZodiac: string;
  recommendedPlanets: string;
  origin: string;
  color: string;
  treatment: string;
  certification: string;
  metaTitle: string;
  metaDescription: string;
  featured: boolean;
  trending: boolean;
  bestseller: boolean;
  active: boolean;
  images: ImageForm[];
  variants: VariantForm[];
};

const emptyVariant: VariantForm = { label: "", weightCarat: "", weightRatti: "", certificationLevel: "", price: "", compareAtPrice: "", stockQuantity: "10", sku: "", active: true };
const emptyImage: ImageForm = { url: "", alt: "", isPrimary: false };

function emptyForm(defaultCategoryId: string): FormState {
  return {
    categoryId: defaultCategoryId, name: "", slug: "", sku: "",
    shortDescription: "", description: "", benefits: "", whoShouldWear: "",
    recommendedZodiac: "", recommendedPlanets: "", origin: "", color: "", treatment: "", certification: "",
    metaTitle: "", metaDescription: "",
    featured: false, trending: false, bestseller: false, active: true,
    images: [{ ...emptyImage, isPrimary: true }],
    variants: [{ ...emptyVariant }],
  };
}

export function AdminGemstoneProducts({ initialProducts, categories }: { initialProducts: AdminProductRow[]; categories: GemstoneCategory[] }) {
  const [items, setItems] = useState(initialProducts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm(String(categories[0]?.id ?? "")));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [notice, setNotice] = useState("");

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm(String(categories[0]?.id ?? "")));
    setOpen(true);
  }

  async function startEdit(row: AdminProductRow) {
    setEditingId(row.id);
    setOpen(true);
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/admin/gemstones/products/${row.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const p = data.product;
      setForm({
        categoryId: String(p.categoryId), name: p.name, slug: p.slug, sku: p.sku,
        shortDescription: p.shortDescription, description: p.description, benefits: p.benefits, whoShouldWear: p.whoShouldWear,
        recommendedZodiac: p.recommendedZodiac, recommendedPlanets: p.recommendedPlanets, origin: p.origin, color: p.color, treatment: p.treatment, certification: p.certification,
        metaTitle: p.metaTitle, metaDescription: p.metaDescription,
        featured: p.featured, trending: p.trending, bestseller: p.bestseller, active: p.active,
        images: data.images.length ? data.images.map((i: { id: string; url: string; alt: string; isPrimary: boolean }) => ({ id: i.id, url: i.url, alt: i.alt, isPrimary: i.isPrimary })) : [{ ...emptyImage, isPrimary: true }],
        variants: data.variants.map((v: { id: string; label: string; weightCarat: string; weightRatti: string; certificationLevel: string; price: number; compareAtPrice: number | null; stockQuantity: number; sku: string; active: boolean }) => ({ id: v.id, label: v.label, weightCarat: v.weightCarat, weightRatti: v.weightRatti, certificationLevel: v.certificationLevel, price: String(v.price), compareAtPrice: v.compareAtPrice != null ? String(v.compareAtPrice) : "", stockQuantity: String(v.stockQuantity), sku: v.sku, active: v.active })),
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load product.");
      setOpen(false);
    } finally {
      setLoadingDetail(false);
    }
  }

  function updateVariant(index: number, patch: Partial<VariantForm>) {
    setForm((current) => ({ ...current, variants: current.variants.map((v, i) => i === index ? { ...v, ...patch } : v) }));
  }
  function addVariant() { setForm((current) => ({ ...current, variants: [...current.variants, { ...emptyVariant }] })); }
  function removeVariant(index: number) { setForm((current) => ({ ...current, variants: current.variants.filter((_, i) => i !== index) })); }

  function updateImage(index: number, patch: Partial<ImageForm>) {
    setForm((current) => ({ ...current, images: current.images.map((img, i) => i === index ? { ...img, ...patch } : img) }));
  }
  function addImage() { setForm((current) => ({ ...current, images: [...current.images, { ...emptyImage }] })); }
  function removeImage(index: number) { setForm((current) => ({ ...current, images: current.images.filter((_, i) => i !== index) })); }
  function makePrimary(index: number) { setForm((current) => ({ ...current, images: current.images.map((img, i) => ({ ...img, isPrimary: i === index })) })); }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    const payload = {
      ...form,
      categoryId: form.categoryId,
      images: form.images.filter((image) => image.url.trim()),
      variants: form.variants.filter((variant) => variant.label.trim() && variant.sku.trim()).map((variant) => ({
        ...variant,
        price: Number(variant.price) || 0,
        compareAtPrice: variant.compareAtPrice.trim() ? Number(variant.compareAtPrice) : null,
        stockQuantity: Number(variant.stockQuantity) || 0,
      })),
    };
    try {
      const response = await fetch(editingId ? `/api/admin/gemstones/products/${editingId}` : "/api/admin/gemstones/products", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save product.");
      setOpen(false);
      setNotice(editingId ? "Product updated." : "Product created.");
      window.location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleFlag(row: AdminProductRow, field: "active" | "featured" | "trending" | "bestseller") {
    const response = await fetch(`/api/admin/gemstones/products/${row.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: !row[field] }) });
    if (response.ok) {
      const data = await response.json();
      setItems((current) => current.map((item) => item.id === row.id ? { ...item, [field]: data[field] } : item));
    }
  }

  async function duplicate(row: AdminProductRow) {
    const response = await fetch(`/api/admin/gemstones/products/${row.id}/duplicate`, { method: "POST" });
    if (response.ok) { setNotice("Product duplicated as a draft."); window.location.reload(); }
    else setNotice("Could not duplicate product.");
  }

  async function remove(row: AdminProductRow) {
    if (!window.confirm(`Delete "${row.name}"? This only works if it has no orders.`)) return;
    const response = await fetch(`/api/admin/gemstones/products/${row.id}`, { method: "DELETE" });
    const data = await response.json();
    if (response.ok) { setItems((current) => current.filter((item) => item.id !== row.id)); setNotice("Product deleted."); }
    else setNotice(data.error || "Could not delete product.");
  }

  return (
    <>
      <section className="admin-table-card">
        <div className="admin-table-header">
          <div><h2>Gemstone products</h2><p>Full catalog with weight/price variants and images.</p></div>
          <button className="button button--small" onClick={startCreate}><Plus size={16} /> Add product</button>
        </div>
        <div className="service-table gem-product-table" role="table" aria-label="Gemstone products">
          <div className="service-table__head" role="row"><span>Product</span><span>Category</span><span>From</span><span>Stock</span><span>Flags</span><span>Actions</span></div>
          {items.map((row) => (
            <div className="service-table__row" role="row" key={row.id}>
              <div className="table-service"><span className="table-service__icon"><Gem size={17} /></span><div><strong>{row.name}</strong><small>{row.sku} · {row.variantCount} variant{row.variantCount === 1 ? "" : "s"}</small></div></div>
              <span>{row.categoryName}</span>
              <strong>{row.currency} {row.startingPrice}</strong>
              <span style={{ color: row.totalStock === 0 ? "#a5473b" : undefined }}>{row.totalStock}</span>
              <div className="gem-flag-toggles">
                <button className={row.active ? "on" : ""} onClick={() => toggleFlag(row, "active")} title="Active">A</button>
                <button className={row.featured ? "on" : ""} onClick={() => toggleFlag(row, "featured")} title="Featured">F</button>
                <button className={row.trending ? "on" : ""} onClick={() => toggleFlag(row, "trending")} title="Trending">T</button>
                <button className={row.bestseller ? "on" : ""} onClick={() => toggleFlag(row, "bestseller")} title="Bestseller">B</button>
              </div>
              <div className="row-actions">
                <button onClick={() => startEdit(row)} aria-label={`Edit ${row.name}`}><Edit3 size={16} /></button>
                <button onClick={() => duplicate(row)} aria-label={`Duplicate ${row.name}`}><Copy size={16} /></button>
                <button className="danger" onClick={() => remove(row)} aria-label={`Delete ${row.name}`}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          {!items.length && <div className="empty-state"><Gem size={24} /><h3>No products yet</h3><p>Add your first gemstone listing.</p></div>}
        </div>
      </section>

      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14} /></button></div>}

      {open && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="admin-modal gem-product-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><p>{editingId ? "Update listing" : "Create a new listing"}</p><h2 id="product-form-title">{editingId ? "Edit product" : "Add product"}</h2></div><button onClick={() => setOpen(false)} aria-label="Close"><X size={20} /></button></div>
            {loadingDetail ? <p style={{ padding: 24 }}>Loading…</p> : (
              <form onSubmit={save}>
                <label className="field field--full"><span>Product name</span><input required maxLength={160} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Natural Ceylon Blue Sapphire" /></label>
                <label className="field"><span>Category</span><select required value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                <label className="field"><span>SKU</span><input required maxLength={60} value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="e.g. BS-001" /></label>
                <label className="field"><span>Slug (optional)</span><input maxLength={180} value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} placeholder="auto-generated from name" /></label>
                <label className="field"><span>Origin</span><input value={form.origin} onChange={(event) => setForm({ ...form, origin: event.target.value })} placeholder="e.g. Ceylon, Sri Lanka" /></label>
                <label className="field"><span>Color</span><input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} placeholder="e.g. Cornflower blue" /></label>
                <label className="field"><span>Treatment</span><input value={form.treatment} onChange={(event) => setForm({ ...form, treatment: event.target.value })} placeholder="e.g. Natural / Untreated" /></label>
                <label className="field"><span>Certification</span><input value={form.certification} onChange={(event) => setForm({ ...form, certification: event.target.value })} placeholder="e.g. GRS Certified" /></label>
                <label className="field"><span>Recommended zodiac signs</span><input value={form.recommendedZodiac} onChange={(event) => setForm({ ...form, recommendedZodiac: event.target.value })} placeholder="Taurus, Libra" /></label>
                <label className="field"><span>Recommended planets</span><input value={form.recommendedPlanets} onChange={(event) => setForm({ ...form, recommendedPlanets: event.target.value })} placeholder="Saturn, Venus" /></label>
                <label className="field field--full"><span>Short description</span><input maxLength={300} value={form.shortDescription} onChange={(event) => setForm({ ...form, shortDescription: event.target.value })} placeholder="Shown on product cards" /></label>
                <label className="field field--full"><span>Full description</span><textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
                <label className="field field--full"><span>Benefits</span><textarea rows={2} value={form.benefits} onChange={(event) => setForm({ ...form, benefits: event.target.value })} /></label>
                <label className="field field--full"><span>Who should wear it</span><textarea rows={2} value={form.whoShouldWear} onChange={(event) => setForm({ ...form, whoShouldWear: event.target.value })} /></label>

                <div className="field--full gem-subsection">
                  <div className="gem-subsection__head"><span>Images</span><button type="button" className="button button--ghost button--small" onClick={addImage}><ImagePlus size={14} /> Add image</button></div>
                  {form.images.map((image, index) => (
                    <div className="gem-image-row" key={index}>
                      <input type="text" required value={image.url} onChange={(event) => updateImage(index, { url: event.target.value })} placeholder="https://…" />
                      <input value={image.alt} onChange={(event) => updateImage(index, { alt: event.target.value })} placeholder="Alt text" />
                      <button type="button" className={image.isPrimary ? "on" : ""} onClick={() => makePrimary(index)}>Primary</button>
                      <button type="button" className="danger" onClick={() => removeImage(index)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>

                <div className="field--full gem-subsection">
                  <div className="gem-subsection__head"><span>Weight / price variants</span><button type="button" className="button button--ghost button--small" onClick={addVariant}><Plus size={14} /> Add variant</button></div>
                  {form.variants.map((variant, index) => (
                    <div className="gem-variant-row" key={index}>
                      <input required value={variant.label} onChange={(event) => updateVariant(index, { label: event.target.value })} placeholder="Label e.g. 3.25 Ratti" />
                      <input value={variant.weightRatti} onChange={(event) => updateVariant(index, { weightRatti: event.target.value })} placeholder="Ratti" />
                      <input value={variant.weightCarat} onChange={(event) => updateVariant(index, { weightCarat: event.target.value })} placeholder="Carat" />
                      <input required type="number" min="0" value={variant.price} onChange={(event) => updateVariant(index, { price: event.target.value })} placeholder="Price ₹" />
                      <input type="number" min="0" value={variant.compareAtPrice} onChange={(event) => updateVariant(index, { compareAtPrice: event.target.value })} placeholder="Compare-at ₹" />
                      <input required type="number" min="0" value={variant.stockQuantity} onChange={(event) => updateVariant(index, { stockQuantity: event.target.value })} placeholder="Stock" />
                      <input required value={variant.sku} onChange={(event) => updateVariant(index, { sku: event.target.value })} placeholder="Variant SKU" />
                      <button type="button" className="danger" onClick={() => removeVariant(index)}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>

                <div className="form-options field--full">
                  <label><button type="button" className={`switch ${form.active ? "on" : ""}`} onClick={() => setForm({ ...form, active: !form.active })}><i /></button><span><strong>Published</strong><small>Visible on the storefront</small></span></label>
                  <label><button type="button" className={`switch ${form.featured ? "on" : ""}`} onClick={() => setForm({ ...form, featured: !form.featured })}><i /></button><span><strong>Featured</strong><small>Shown in featured rail</small></span></label>
                  <label><button type="button" className={`switch ${form.trending ? "on" : ""}`} onClick={() => setForm({ ...form, trending: !form.trending })}><i /></button><span><strong>Trending</strong><small>Shown in trending rail</small></span></label>
                  <label><button type="button" className={`switch ${form.bestseller ? "on" : ""}`} onClick={() => setForm({ ...form, bestseller: !form.bestseller })}><i /></button><span><strong>Bestseller</strong><small>Shown in bestseller rail</small></span></label>
                </div>

                <div className="modal-actions field--full"><button type="button" className="button button--ghost" onClick={() => setOpen(false)}>Cancel</button><button className="button" disabled={saving}>{saving ? "Saving…" : editingId ? "Save changes" : "Create product"}</button></div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
