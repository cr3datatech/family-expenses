"use client";

import { useState } from "react";
import { todayISO } from "@/lib/dates";
import { api, Expense, ExpenseCreate, User } from "@/lib/api";
import FormField from "@/components/shared/FormField";
import AttributionPicker from "@/components/expenses/AttributionPicker";

const CATEGORIES = [
  "Groceries", "Eating Out", "Transport", "Entertainment", "Health",
  "Utilities", "Shopping", "Subscriptions", "Travel", "Coffee",
  "Household", "Rent", "Car", "Investments", "Insurance", "Gifts", "Education", "Loan", "Other",
];

interface ManualItem {
  name: string;
  qty: string;
  unit_price: string;
  amount: string;
}

export default function ManualEntryForm({
  cards, onSubmit, currentUser, allUsers, prefill,
}: {
  cards: string[];
  onSubmit: (data: ExpenseCreate) => void;
  currentUser: User;
  allUsers: User[];
  prefill?: Expense;
}) {
  const today = todayISO();
  const [date, setDate] = useState(prefill?.date ?? today);
  const [merchant, setMerchant] = useState(prefill?.merchant ?? "");
  const [category, setCategory] = useState(prefill?.category ?? "Other");
  const [items, setItems] = useState<ManualItem[]>(
    prefill?.items.map(i => ({
      name: i.name,
      qty: (i.qty ?? 1).toString(),
      unit_price: i.unit_price?.toString() ?? "",
      amount: i.amount.toString(),
    })) ?? []
  );
  const [total, setTotal] = useState(prefill ? prefill.total.toFixed(2) : "");
  const defaultCard = cards.includes("Payment") ? "Payment" : cards[0];
  const defaultSharedWith = (() => {
    const ids = allUsers
      .filter(u => ["christa", "craig"].includes(u.username.toLowerCase()))
      .map(u => u.id);
    return ids.length > 0 ? ids : allUsers.map(u => u.id);
  })();
  const [card, setCard] = useState(prefill?.card ?? defaultCard);
  const [note, setNote] = useState(prefill?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [isShared, setIsShared] = useState(prefill?.is_shared ?? true);
  const [attributedUserId, setAttributedUserId] = useState(prefill && !prefill.is_shared ? prefill.user_id : currentUser.id);
  const [sharedWith, setSharedWith] = useState<number[]>(prefill?.shared_with ?? defaultSharedWith);

  const handleMerchantBlur = async () => {
    if (!merchant) return;
    try {
      const result = await api.categorize(merchant);
      setCategory(result.category);
    } catch { /* keep current */ }
  };

  const recalcTotal = (updated: ManualItem[]) => {
    const sum = updated.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0);
    if (sum > 0) setTotal(sum.toFixed(2));
  };

  const updateItem = (idx: number, field: keyof ManualItem, value: string) => {
    const updated = items.map((item, i) => {
      if (i !== idx) return item;
      const next = { ...item, [field]: value };
      if (field === "qty" || field === "unit_price") {
        const qty = parseFloat(field === "qty" ? value : next.qty) || 1;
        const up = parseFloat(field === "unit_price" ? value : next.unit_price);
        if (!isNaN(up)) next.amount = (qty * up).toFixed(2);
      }
      return next;
    });
    setItems(updated);
    recalcTotal(updated);
  };

  const addItem = () => setItems([...items, { name: "", qty: "1", unit_price: "", amount: "" }]);

  const removeItem = (idx: number) => {
    const updated = items.filter((_, i) => i !== idx);
    setItems(updated);
    recalcTotal(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!total || parseFloat(total) <= 0) return;
    setSaving(true);
    try {
      const validItems = items
        .filter((it) => it.name && it.amount)
        .map((it) => ({
          name: it.name,
          qty: parseInt(it.qty) || 1,
          unit_price: parseFloat(it.unit_price) || undefined,
          amount: parseFloat(it.amount),
        }));
      const payload: ExpenseCreate = {
        date,
        merchant: merchant || undefined,
        items: validItems.length > 0 ? validItems : undefined,
        total: parseFloat(total),
        currency: "EUR",
        category,
        card,
        note: note || undefined,
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
      <FormField label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="form-input" />
      </FormField>
      <FormField label="Shop / Merchant">
        <input type="text" value={merchant} onChange={(e) => setMerchant(e.target.value)} onBlur={handleMerchantBlur} placeholder="Shop name" className="form-input" />
      </FormField>
      <FormField label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-input">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">Items (optional)</label>
          <button type="button" onClick={addItem} className="text-[11px] font-semibold text-snap-600 active:text-snap-800">+ Add item</button>
        </div>
        {items.length > 0 && (
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <input type="text" value={item.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Item name" className="form-input flex-1 min-w-0" />
                <input type="number" value={item.qty} onChange={(e) => updateItem(i, "qty", e.target.value)} placeholder="1" min="1" className="form-input !w-16 text-center shrink-0" />
                <input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(i, "unit_price", e.target.value)} placeholder="€" className="form-input !w-20 text-right shrink-0" />
                <button type="button" onClick={() => removeItem(i)} className="text-skin-secondary active:text-red-500 text-lg leading-none px-1">×</button>
              </div>
            ))}
          </div>
        )}
      </div>
      <FormField label="Total">
        <input type="number" step="0.01" value={total} onChange={(e) => { const v = parseFloat(e.target.value); setTotal(isNaN(v) ? e.target.value : Math.abs(v).toString()); }} placeholder="Amount (€)" required className="form-input" />
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
      <button type="submit" disabled={saving || !total} className="w-full py-2.5 rounded-xl bg-snap-500 text-white text-sm font-semibold active:bg-snap-600 transition-colors disabled:opacity-50">
        {saving ? "Saving..." : "Save Expense"}
      </button>
    </form>
  );
}
