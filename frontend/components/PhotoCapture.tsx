"use client";

import { useRef } from "react";

interface PhotoCaptureProps {
  onCapture: (file: File) => void;
  label?: string;
}

export default function PhotoCapture({ onCapture, label }: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onCapture(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full py-3.5 rounded-[14px] border-2 border-dashed border-snap-300 bg-snap-50 text-snap-600 text-[13px] font-semibold text-center active:bg-snap-100 transition-colors"
      >
        {label || "Scan a receipt"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        className="hidden"
      />
    </>
  );
}
