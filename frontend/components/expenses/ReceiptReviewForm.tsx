"use client";

import { useState } from "react";
import { todayISO } from "@/lib/dates";
import { api, Expense, ExpenseCreate, ReceiptScanResult, User } from "@/lib/api";
import FormField from "@/components/shared/FormField";
import AttributionPicker from "@/components/expenses/AttributionPicker";

const CATEGORIES = [
  "Groceries", "Eating Out", "Transport", "Entertainment", "Health",
  "Utilities", "Shopping", "Subscriptions", "Travel", "Coffee",
  "Household", "Rent", "Car", "Investments", "Insurance", "Gifts", "Education", "Loan", "Other",
];

export default function ReceiptReviewForm({
  cards, scanResult, onSubmit, onCancel, currentUser, allUsers,
}: {
  cards: string[];
  scanResult: ReceiptScanResult;
  onSubmit: (data: ExpenseCreate) => void;
  onCancel: () => void;
  currentUser: User;
  allUsers: User[];
}) {
  const today = todayISO();
  const [date, setDate] = useState(scanResult.date || today);
  const [merchant, setMerchant] = useState(scanResult.merchant || "");
  const [total, setTotal] = useState(scanResult.total != null ? Math.abs(scanResult.total).toString() : "");
  const [category, setCategory] = useState(scanResult.category || "Other");
  const [card, setCard] = useState(cards[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [isShared, setIsShared] = useState(true);
  const [attributedUserId, setAttributedUserId] = useState(currentUser.id);
  const [sharedWith, setSharedWith] = useState<number[]>(() => {
    const ids = allUsers.filter(u => ["christa", "craig"].includes(u.username.toLowerCase())).map(u => u.id);
    return ids.length > 0 ? ids : allUsers.map(u => u.id);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!total || parseFloat(total) <= 0) return;
    setSaving(true);
    try {
      const payload: ExpenseCreate = {
        date: date || today,
        merchant: merchant || undefined,
        items: scanResult.items || undefined,
        total: parseFloat(total),
        currency: "EUR",
        category,
        card,
        note: note || undefined,
        receipt_photo_path: scanResult.receipt_path || undefined,
        ai_extracted: true,
        ai_cost: scanResult.ai_cost ?? undefined,
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
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="bg-snap-100 rounded-xl p-3 text-xs text-skin-primary">
        <p className="font-semibold mb-1">Extracted from receipt:</p>
        {scanResult.items && scanResult.items.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {scanResult.items.slice(0, 8).map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>{item.qty && item.qty > 1 ? `${item.qty}x ${item.name}` : item.name}</span>
                <span>
                  {item.qty && item.qty > 1 && item.unit_price
                    ? `${item.unit_price.toFixed(2)} = ${item.amount.toFixed(2)}`
                    : item.amount.toFixed(2)}
                </span>
              </div>
            ))}
            {scanResult.items.length > 8 && (
              <p className="text-skin-secondary">...and {scanResult.items.length - 8} more items</p>
            )}
          </div>
        )}
      </div>
      <FormField label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="form-input" />
      </FormField>
      <FormField label="Shop / Merchant">
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Shop name" className="form-input" />
      </FormField>
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
          {saving ? "Saving..." : "Confirm & Save"}
        </button>
      </div>
    </form>
  );
}
