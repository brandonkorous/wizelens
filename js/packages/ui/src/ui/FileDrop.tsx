import { type DragEvent, type ReactNode, useState } from "react";
import { FileText, Upload } from "lucide-react";

export interface FileDropProps {
  /** File types the picker offers, as for an input's `accept`. */
  accept: string;
  /** The chosen file's name, or null before one is chosen. */
  fileName: string | null;
  /** Under the box's text before a file is chosen: what files it takes. */
  hint: ReactNode;
  /** Under the file's name once one is chosen: what was read from it. */
  status?: ReactNode;
  onFile: (file: File) => void;
}

/** A box to drop a file on, or to click (or press Enter on) to choose one. */
export function FileDrop({ accept, fileName, hint, status, onFile }: FileDropProps) {
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };
  const Icon = fileName ? FileText : Upload;
  return (
    <label className={`wl-drop${over ? " wl-drop-over" : ""}`} onDragOver={(e) => (e.preventDefault(), setOver(true))} onDragLeave={() => setOver(false)} onDrop={drop}>
      <input
        type="file"
        accept={accept}
        className="wl-drop-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <Icon aria-hidden="true" />
      <strong>{fileName ?? "Drop a file here, or click to choose one"}</strong>
      <small className="wl-muted">{fileName ? status : hint}</small>
    </label>
  );
}
