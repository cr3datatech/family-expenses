"use client";

import { User } from "@/lib/api";

export default function AttributionPicker({
  currentUser,
  allUsers,
  isShared,
  attributedUserId,
  sharedWith,
  onChange,
}: {
  currentUser: User;
  allUsers: User[];
  isShared: boolean;
  attributedUserId: number;
  sharedWith: number[];
  onChange: (isShared: boolean, userId: number, sharedWith: number[]) => void;
}) {
  const personalOptions: { label: string; userId: number }[] = currentUser.is_superuser
    ? allUsers.map((u) => ({ label: u.username, userId: u.id }))
    : [{ label: "Mine", userId: currentUser.id }];

  const toggleSharedWith = (uid: number) => {
    const next = sharedWith.includes(uid) ? sharedWith.filter((id) => id !== uid) : [...sharedWith, uid];
    onChange(true, attributedUserId, next);
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide">For</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange(true, attributedUserId, sharedWith.length ? sharedWith : allUsers.map(u => u.id))}
          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
            isShared ? "bg-snap-500 text-white border-snap-500" : "bg-white text-snap-600 border-snap-200 hover:border-snap-400"
          }`}
        >
          Shared
        </button>
        {personalOptions.map((opt) => {
          const active = !isShared && attributedUserId === opt.userId;
          return (
            <button
              key={opt.userId}
              type="button"
              onClick={() => onChange(false, opt.userId, sharedWith)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                active ? "bg-snap-500 text-white border-snap-500" : "bg-white text-snap-600 border-snap-200 hover:border-snap-400"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {isShared && allUsers.length > 0 && (
        <div>
          <p className="text-[11px] font-bold text-skin-secondary uppercase tracking-wide mb-1.5">Shared among</p>
          <div className="flex flex-wrap gap-1.5">
            {allUsers.map((u) => {
              const active = sharedWith.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleSharedWith(u.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                    active ? "bg-snap-300 text-snap-900 border-snap-300" : "bg-white text-snap-400 border-snap-200 hover:border-snap-400"
                  }`}
                >
                  {u.username}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
