"use client";

import { useState, useEffect } from "react";
import { api, ScannedImage } from "@/lib/api";

export default function ScannedImagePickerModal({ currentPaths, onAdd, onClose }: {
  currentPaths: string[];
  onAdd: (path: string) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<ScannedImage[] | null>(null);

  useEffect(() => {
    api.scanned().then(setImages).catch(() => setImages([]));
  }, []);

  const available = (images ?? []).filter(img => !currentPaths.includes(img.path));

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end justify-center">
      <div className="w-full max-w-lg bg-white rounded-t-2xl max-h-[80vh] flex flex-col">
        <div className="px-4 pt-4 pb-3 flex items-center gap-3 border-b border-snap-100">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-snap-600 shrink-0">Cancel</button>
          <h2 className="text-sm font-bold text-snap-800 flex-1">Add image</h2>
          {images && <span className="text-xs text-skin-secondary">{available.length} available</span>}
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-3">
          {images === null && <p className="text-sm text-skin-secondary text-center py-4">Loading…</p>}
          {images !== null && available.length === 0 && (
            <p className="text-sm text-skin-secondary text-center py-4">No available images.</p>
          )}
          {available.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {available.map(img => (
                <button key={img.path} type="button" onClick={() => onAdd(img.path)} className="block rounded-xl overflow-hidden border-2 border-transparent hover:border-snap-400 transition-colors">
                  <img src={`/${img.path}`} alt={img.filename} className="w-full h-24 object-cover" />
                  <div className="px-1 py-1 bg-snap-50">
                    <p className="text-[9px] text-skin-secondary truncate">{img.expense ? (img.expense.merchant || img.expense.category) : "Orphaned"}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
