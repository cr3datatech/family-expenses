"use client";

import { useState, useEffect, useRef } from "react";
import { api, Expense, ExpenseCreate, ScannedImage, User } from "@/lib/api";
import Modal from "@/components/Modal";
import EditExpenseForm from "@/components/expenses/EditExpenseForm";
import ExpensePickerModal from "@/components/expenses/ExpensePickerModal";

export default function ScannedPanel({ onClose, cards, currentUser, allUsers }: {
  onClose: () => void;
  cards: string[];
  currentUser: User;
  allUsers: User[];
}) {
  const [images, setImages] = useState<ScannedImage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const [attachingImage, setAttachingImage] = useState<ScannedImage | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  const handleUploadCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      await api.uploadOrphanedImage(file);
      load();
    } finally {
      setUploading(false);
    }
  };

  const load = () => {
    setLoading(true);
    api.scanned()
      .then(setImages)
      .catch(() => setImages([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Lock body scroll while panel is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleDeleteOrphan = async (img: ScannedImage) => {
    setDeletingPath(img.path);
    // Optimistic: remove from list immediately
    setImages(prev => prev ? prev.filter(i => i.path !== img.path) : prev);
    try {
      if (img.location === "tmp") {
        await api.deleteTmpFile(img.filename);
      } else {
        await api.deleteArchiveFile(img.filename);
      }
      load();
    } catch {
      load(); // revert on error
    } finally {
      setDeletingPath(null);
    }
  };

  const handleAttach = async (img: ScannedImage, targetExpense: Expense) => {
    const newPaths = [...(targetExpense.receipt_paths ?? [])];
    if (!newPaths.includes(img.path)) newPaths.push(img.path);
    // Optimistic: update image to show new expense, and remove it from any prior expense
    setImages(prev => prev ? prev.map(i => {
      if (i.path === img.path) return { ...i, expense: { ...targetExpense, receipt_paths: newPaths } };
      // remove from old expense if it had this path
      if (i.expense && i.expense.id === targetExpense.id) return { ...i, expense: { ...i.expense, receipt_paths: newPaths } };
      // remove path from old owner if it was reassigned
      if (img.expense && i.expense && i.expense.id === img.expense.id && i.path !== img.path) {
        const updatedPaths = (i.expense.receipt_paths ?? []).filter(p => p !== img.path);
        return { ...i, expense: { ...i.expense, receipt_paths: updatedPaths } };
      }
      return i;
    }) : prev);
    setAttachingImage(null);
    try {
      await api.setExpenseImages(targetExpense.id, newPaths);
      load();
    } catch {
      load();
    }
  };

  const handleDetach = async (img: ScannedImage) => {
    if (!img.expense) return;
    const newPaths = (img.expense.receipt_paths ?? []).filter(p => p !== img.path);
    // Optimistic: mark image as orphaned immediately
    setImages(prev => prev ? prev.map(i =>
      i.path === img.path ? { ...i, expense: null } : i
    ) : prev);
    try {
      await api.setExpenseImages(img.expense.id, newPaths);
      load();
    } catch {
      load();
    }
  };

  const handleEditSave = async (data: ExpenseCreate) => {
    if (!editingExpense) return;
    await api.update(editingExpense.id, data);
    setEditingExpense(null);
    load();
  };

  const handleDelete = async (id: number) => {
    await api.delete(id, false);
    setEditingExpense(null);
    load();
  };

  const formatMonthHeader = (ym: string) => {
    if (ym === "unknown") return "Unknown date";
    const [year, month] = ym.split("-");
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const attached = (images ?? []).filter(i => i.expense !== null)
    .sort((a, b) => (b.expense!.date ?? "").localeCompare(a.expense!.date ?? ""));
  const orphaned = (images ?? []).filter(i => i.expense === null)
    .sort((a, b) => b.filename.localeCompare(a.filename));

  const groupByMonth = (imgs: ScannedImage[]) =>
    imgs.reduce<Record<string, ScannedImage[]>>((acc, img) => {
      if (!acc[img.month]) acc[img.month] = [];
      acc[img.month].push(img);
      return acc;
    }, {});

  const sortedMonthKeys = (grouped: Record<string, ScannedImage[]>) =>
    Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const attachedGrouped = groupByMonth(attached);
  const orphanedGrouped = groupByMonth(orphaned);

  const renderCard = (img: ScannedImage) => (
    <div key={img.path} className="rounded-xl overflow-hidden bg-white border border-snap-200">
      <a href={`/${img.path}`} target="_blank" rel="noopener noreferrer" className="block">
        <img src={`/${img.path}`} alt={img.filename} className="w-full h-32 object-cover" />
      </a>
      <div className="px-2 py-1.5 space-y-1">
        {img.expense ? (
          <button
            type="button"
            onClick={() => setEditingExpense(img.expense)}
            className="w-full text-left px-2 py-1 rounded-lg bg-gray-500 hover:bg-gray-600 active:bg-gray-700 transition-colors"
          >
            <p className="text-[11px] font-semibold text-white truncate">{img.expense.merchant || img.expense.category}</p>
            <p className="text-[10px] text-gray-200">{img.expense.date} · €{img.expense.total.toFixed(2)}</p>
          </button>
        ) : (
          <p className="text-[10px] text-skin-secondary italic">Orphaned</p>
        )}
        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setAttachingImage(img)}
            className="flex-1 py-1 rounded-lg bg-snap-100 text-snap-700 text-[10px] font-semibold hover:bg-snap-200 transition-colors"
          >
            {img.expense ? "Reassign" : "Attach"}
          </button>
          {img.expense ? (
            <button
              type="button"
              onClick={() => handleDetach(img)}
              className="px-2 py-1 rounded-lg bg-red-50 text-red-500 text-[10px] font-semibold hover:bg-red-100 transition-colors"
            >
              Detach
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleDeleteOrphan(img)}
              disabled={deletingPath === img.path}
              className="px-2 py-1 rounded-lg bg-red-50 text-red-500 text-[10px] font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
            >
              {deletingPath === img.path ? "…" : "Delete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderSection = (
    label: string,
    grouped: Record<string, ScannedImage[]>,
    count: number,
  ) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold text-snap-800">{label}</h2>
        <span className="text-xs text-skin-secondary">{count}</span>
      </div>
      {sortedMonthKeys(grouped).map(ym => (
        <div key={ym} className="space-y-2">
          <p className="text-[11px] font-bold text-snap-600 uppercase tracking-wide">{formatMonthHeader(ym)}</p>
          <div className="grid grid-cols-2 gap-2">
            {grouped[ym].map(renderCard)}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      {attachingImage && (
        <ExpensePickerModal
          title={attachingImage.expense ? `Reassign from ${attachingImage.expense.merchant || attachingImage.expense.category}` : "Attach to expense"}
          onSelect={(exp) => handleAttach(attachingImage, exp)}
          onClose={() => setAttachingImage(null)}
        />
      )}
      <Modal open={!!editingExpense} onClose={() => setEditingExpense(null)} title="Edit Expense">
        {editingExpense && (
          <EditExpenseForm
            cards={cards}
            expense={editingExpense}
            onSubmit={handleEditSave}
            onCancel={() => setEditingExpense(null)}
            onDelete={() => handleDelete(editingExpense.id)}
            currentUser={currentUser}
            allUsers={allUsers}
          />
        )}
      </Modal>
      <div className="fixed inset-0 z-50 bg-snap-50 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-snap-50/90 backdrop-blur-sm border-b border-snap-100">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <button type="button" onClick={onClose} className="text-sm font-semibold text-snap-600">← Back</button>
            <h1 className="text-base font-bold text-snap-800 flex-1">Scanned</h1>
            {images && (
              <span className="text-xs text-skin-secondary">{images.length} image{images.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="max-w-5xl mx-auto px-4 pb-3 flex gap-2">
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              disabled={uploading}
              className="flex-1 py-2 rounded-xl bg-white border border-snap-200 text-snap-700 text-sm font-semibold hover:bg-snap-50 transition-colors disabled:opacity-50"
            >
              {uploading ? "Saving…" : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => scanRef.current?.click()}
              disabled={uploading}
              className="sm:hidden flex-1 py-2 rounded-xl bg-white border border-snap-200 text-snap-700 text-sm font-semibold hover:bg-snap-50 transition-colors disabled:opacity-50"
            >
              Scan
            </button>
          </div>
          {/* Upload: file picker */}
          <input ref={uploadRef} type="file" accept="image/*" onChange={handleUploadCapture} className="hidden" />
          {/* Scan: camera (mobile) */}
          <input ref={scanRef} type="file" accept="image/*" capture="environment" onChange={handleUploadCapture} className="hidden" />
        </div>

        <div className="max-w-5xl mx-auto px-4 py-4 space-y-6">
          {loading && (
            <p className="text-sm text-skin-secondary text-center py-8">Loading…</p>
          )}

          {!loading && images !== null && (
            <>
              {attached.length > 0
                ? renderSection("Attached", attachedGrouped, attached.length)
                : <p className="text-sm text-skin-secondary text-center py-4">No attached images.</p>
              }

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-snap-800">Orphaned</h2>
                  <span className="text-xs text-skin-secondary">{orphaned.length}</span>
                </div>
                {orphaned.length === 0 ? (
                  <p className="text-sm text-skin-secondary">No orphaned images.</p>
                ) : (
                  sortedMonthKeys(orphanedGrouped).map(ym => (
                    <div key={ym} className="space-y-2">
                      <p className="text-[11px] font-bold text-snap-600 uppercase tracking-wide">{formatMonthHeader(ym)}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {orphanedGrouped[ym].map(renderCard)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
