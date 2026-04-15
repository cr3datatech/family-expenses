"use client";

import { useState } from "react";
import { User } from "@/lib/api";
import Modal from "@/components/Modal";
import CreateUserModal from "@/components/admin/CreateUserModal";
import EditUserModal from "@/components/admin/EditUserModal";

export default function UserAdminPanel({
  users,
  currentId,
  onRefresh,
}: {
  users: User[];
  currentId: number;
  onRefresh: () => void;
}) {
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const handleSaved = () => {
    setEditingUser(null);
    setShowCreate(false);
    onRefresh();
  };

  return (
    <div className="space-y-3 max-h-[70vh] overflow-y-auto">
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New user">
        <CreateUserModal onCreated={handleSaved} onClose={() => setShowCreate(false)} />
      </Modal>
      <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title="Edit user">
        {editingUser && (
          <EditUserModal user={editingUser} currentId={currentId} onSaved={handleSaved} onClose={() => setEditingUser(null)} />
        )}
      </Modal>

      <div className="space-y-1.5">
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setEditingUser(u)}
            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl border border-snap-100 hover:bg-snap-50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-snap-800 truncate">{u.username}</p>
              {u.email && <p className="text-xs text-skin-secondary truncate">{u.email}</p>}
            </div>
            {u.is_superuser && (
              <span className="text-[10px] uppercase font-bold text-snap-500 shrink-0">admin</span>
            )}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowCreate(true)}
        className="w-full py-2 rounded-xl bg-snap-500 text-white text-sm font-semibold"
      >
        + New user
      </button>
    </div>
  );
}
