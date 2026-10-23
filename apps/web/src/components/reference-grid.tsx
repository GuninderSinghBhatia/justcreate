"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReferenceView } from "@/lib/references";
import { uploadImages } from "@/lib/upload";
import { ReferenceCard } from "./reference-card";
import { ReferenceDrawer, type BoardOption } from "./reference-drawer";

/**
 * Masonry grid with a detail drawer. Dropping or pasting image files uploads them
 * (onto `boardId` when given, otherwise into the inbox).
 */
export function ReferenceGrid({
  references,
  boardId,
  boards,
  empty,
}: {
  references: ReferenceView[];
  boardId?: string;
  boards?: BoardOption[];
  empty?: React.ReactNode;
}) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const open = references.find((r) => r.id === openId) ?? null;

  const upload = useCallback(
    async (files: File[]) => {
      if (!files.some((f) => f.type.startsWith("image/"))) return;
      setUploading("Uploading…");
      try {
        const saved = await uploadImages(files, boardId);
        setUploading(`Added ${saved.length} image${saved.length === 1 ? "" : "s"}`);
        router.refresh();
      } catch (err) {
        setUploading(err instanceof Error ? err.message : "Upload failed");
      }
      window.setTimeout(() => setUploading(null), 3000);
    },
    [boardId, router],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        void upload(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false);
        if (e.dataTransfer.files.length) {
          e.preventDefault();
          void upload([...e.dataTransfer.files]);
        }
      }}
      className={`relative flex flex-1 flex-col rounded-lg ${dragging ? "outline-2 outline-dashed outline-foreground/40" : ""}`}
    >
      {uploading && (
        <p role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-3 py-2 text-sm text-background">
          {uploading}
        </p>
      )}
      {references.length === 0 ? (
        (empty ?? null)
      ) : (
        <ul className="columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5">
          {references.map((r) => (
            <li key={r.id} className="mb-4 break-inside-avoid">
              <ReferenceCard reference={r} onOpen={(ref) => setOpenId(ref.id)} selected={r.id === openId} />
            </li>
          ))}
        </ul>
      )}
      {open && (
        <ReferenceDrawer reference={open} onClose={() => setOpenId(null)} boardId={boardId} boards={boards} />
      )}
    </div>
  );
}
