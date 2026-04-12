"use client";

import { useRef } from "react";

interface PhotoCaptureProps {
  onCapture: (file: File) => void;
}

export default function PhotoCapture({ onCapture }: PhotoCaptureProps) {
  const scanInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
    e.target.value = "";
  };

  return (
    <>
      {/* Desktop: single full-width upload button */}
      <button
        onClick={() => uploadInputRef.current?.click()}
        className="hidden sm:block w-full py-3.5 rounded-[14px] border-2 border-dashed border-snap-300 bg-snap-50 text-snap-600 text-[13px] font-semibold text-center active:bg-snap-100 transition-colors"
      >
        Upload receipt
      </button>

      {/* Mobile: two 50% buttons side by side */}
      <div className="flex gap-2 sm:hidden">
        <button
          onClick={() => scanInputRef.current?.click()}
          className="flex-1 py-3.5 rounded-[14px] border-2 border-dashed border-snap-300 bg-snap-50 text-snap-600 text-[13px] font-semibold text-center active:bg-snap-100 transition-colors"
        >
          Scan
        </button>
        <button
          onClick={() => uploadInputRef.current?.click()}
          className="flex-1 py-3.5 rounded-[14px] border-2 border-dashed border-snap-300 bg-snap-50 text-snap-600 text-[13px] font-semibold text-center active:bg-snap-100 transition-colors"
        >
          Upload
        </button>
      </div>

      {/* Camera input (mobile Scan) */}
      <input
        ref={scanInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />
      {/* File picker input (desktop Upload + mobile Upload) */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />
    </>
  );
}
