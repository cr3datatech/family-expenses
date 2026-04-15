"use client";

import { useState, useRef } from "react";
import { api, Expense, ExpenseCreate, User } from "@/lib/api";
import FormField from "@/components/shared/FormField";
import AttributionPicker from "@/components/expenses/AttributionPicker";
import ScannedImagePickerModal from "@/components/scanning/ScannedImagePickerModal";

const CATEGORIES = [
  "Groceries", "Eating Out", "Transport", "Entertainment", "Health",
  "Utilities", "Shopping", "Subscriptions", "Travel", "Coffee",
  "Household", "Rent", "Car", "Investments", "Insurance", "Gifts", "Education", "Loan", "Other",
];

export default function EditExpenseForm({
  cards, expense, onSubmit, onCancel, onDelete, currentUser, allUsers,
}: {
  cards: string[];
  expense: Expense;
  onSubmit: (data: ExpenseCreate & { user_id?: number }) => void;
  onCancel: () => void;
  onDelete: () => void;
  currentUser: User;
  allUsers: User[];
}) {
  const [date, setDate] = useState(expense.date);
  const [merchant, setMerchant] = useState(expense.merchant || "");
  const [total, setTotal] = useState(expense.total.toString());
  const [category, setCategory] = useState(expense.category || "Other");
  const [card, setCard] = useState(expense.card || cards[0]);
  const [note, setNote] = useState(expense.note || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isShared, setIsShared] = useState(expense.is_shared);
  const [attributedUserId, setAttributedUserId] = useState(expense.user_id);
  const [sharedWith, setSharedWith] = useState<number[]>(
    expense.shared_with?.length ? expense.shared_with : allUsers.map(u => u.id)
  );
  const [receiptPaths, setReceiptPaths] = useState<string[]>(expense.receipt_paths ?? []);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const handleScanCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const updated = await api.scanAndAttach(expense.id, file);
      setReceiptPaths(updated.receipt_paths);
    } catch {
      // silently ignore — user can retry
    } finally {
      setScanning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!total || parseFloat(total) <= 0) return;
    setSaving(true);
    try {
      const payload: ExpenseCreate & { user_id?: number } = {
        date,
        merchant: merchant || undefined,
        total: parseFloat(total),
        currency: expense.currency || "EUR",
        category,
        card,
        note: note || undefined,
        receipt_paths: receiptPaths,
        is_shared: isShared,
        shared_with: isShared ? sharedWith : undefined,
      };
      if (!isShared && currentUser.is_superuser) {
        payload.user_id = attributedUserId;
      }
      onSubmit(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {showImagePicker && (
        <ScannedImagePickerModal
          currentPaths={receiptPaths}
          onAdd={(path) => {
            const newPaths = [...receiptPaths, path];
            setReceiptPaths(newPaths);
            api.setExpenseImages(expense.id, newPaths).catch(() => {});
            setShowImagePicker(false);
          }}
          onClose={() => setShowImagePicker(false)}
        />
      )}
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">Images</label>
          <div className="flex items-center gap-2">
            {/* Scan button: mobile only */}
            <button
              type="button"
              onClick={() => scanInputRef.current?.click()}
              disabled={scanning}
              className="sm:hidden text-[11px] font-semibold text-snap-600 active:text-snap-800 disabled:opacity-50"
            >
              {scanning ? "Saving…" : "📷 Scan"}
            </button>
            <button type="button" onClick={() => setShowImagePicker(true)} className="text-[11px] font-semibold text-snap-600 active:text-snap-800">+ Add</button>
          </div>
        </div>
        <input
          ref={scanInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleScanCapture}
          className="hidden"
        />
        {receiptPaths.length > 0 ? (
          <div className="grid grid-cols-3 gap-1.5">
            {receiptPaths.map(path => (
              <div key={path} className="relative rounded-lg overflow-hidden border border-snap-200">
                <a href={`/${path}`} target="_blank" rel="noopener noreferrer">
                  <img src={`/${path}`} alt={path.split("/").pop()} className="w-full h-20 object-cover" />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const newPaths = receiptPaths.filter(p => p !== path);
                    setReceiptPaths(newPaths);
                    api.setExpenseImages(expense.id, newPaths).catch(() => {});
                  }}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center leading-none hover:bg-black/70"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-skin-secondary">No images attached.</p>
        )}
      </div>
      <FormField label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="form-input" />
      </FormField>
      <FormField label="Shop / Merchant">
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Shop name" className="form-input" />
      </FormField>
      {expense.items && expense.items.length > 0 && (
        <div className="bg-snap-100 rounded-xl p-3 text-xs text-skin-primary">
          <p className="font-semibold mb-1">Line items</p>
          <div className="mt-1 space-y-0.5 max-h-[40vh] overflow-y-auto">
            {expense.items.map((item, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="min-w-0 break-words">
                  {item.qty && item.qty > 1 ? `${item.qty}× ${item.name}` : item.name}
                </span>
                <span className="shrink-0">
                  {item.qty && item.qty > 1 && item.unit_price != null
                    ? `${item.unit_price.toFixed(2)} → ${item.amount.toFixed(2)}`
                    : item.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <FormField label="Total">
        <input type="number" step="0.01" value={total} onChange={(e) => { const v = parseFloat(e.target.value); setTotal(isNaN(v) ? e.target.value : Math.abs(v).toString()); }} placeholder="Amount" required className="form-input" />
      </FormField>
      <FormField label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <FormField label="Payment Type">
        <select value={card} onChange={(e) => setCard(e.target.value)} className="form-input">
          {cards.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <FormField label="Note (optional)">
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." className="form-input" />
      </FormField>
      <AttributionPicker
        currentUser={currentUser}
        allUsers={allUsers}
        isShared={isShared}
        attributedUserId={attributedUserId}
        sharedWith={sharedWith}
        onChange={(shared, uid, sw) => { setIsShared(shared); setAttributedUserId(uid); setSharedWith(sw); }}
      />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-snap-200 text-skin-secondary text-sm font-semibold">Cancel</button>
        <button type="submit" disabled={saving || !total} className="flex-1 py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold active:bg-snap-600 transition-colors disabled:opacity-50">
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {currentUser.is_superuser && !confirmDelete ? (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="w-full py-2 rounded-xl text-xs font-semibold text-red-500 hover:bg-red-50 transition-colors"
        >
          Delete expense
        </button>
      ) : currentUser.is_superuser ? (
        <div className="px-3 py-2.5 rounded-xl border border-red-200 bg-red-50 space-y-2 text-xs">
          <p className="font-semibold text-red-700">Sure you want to delete this expense?</p>
          {receiptPaths.length > 0 && (
            <p className="text-red-600">Images will be kept and can be found in Scanned.</p>
          )}
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => onDelete()}
              className="flex-1 py-1.5 rounded-lg bg-red-600 text-white font-semibold"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-1.5 rounded-lg border border-snap-200 text-skin-secondary font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </form>
    </>
  );
}
