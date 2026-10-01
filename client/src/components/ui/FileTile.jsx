import { useState } from "react";
import { FileText, FileAudio, FileImage, File as FileIcon, Trash2 } from "lucide-react";
import { StatusFlag } from "./StatusFlag";
import { Progress } from "./Progress";
import { IconButton } from "./Button";
import { ImagePlaceholder } from "./Illustrations";
import { formatBytes, formatRelative, formatDateTime } from "../../lib/format";
import { cn } from "../../lib/cn";

const KIND_ICON = { image: FileImage, pdf: FileText, audio: FileAudio, doc: FileText };

/**
 * FileTile (§7): thumbnail or type icon, name, size, upload time, verification flag; click opens viewer.
 * Optional `progress` (0–100) shows an upload bar; `onRemove` shows a delete button.
 */
export function FileTile({ name, size, uploadedAt, kind = "doc", thumb, blur, flag, progress, onOpen, onRemove, className }) {
  const [imgOk, setImgOk] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const Icon = KIND_ICON[kind] ?? FileIcon;
  const uploading = progress != null && progress < 100;

  return (
    <div className={cn("group relative flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-sm transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-md", className)}>
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen || uploading}
        className="relative block aspect-[4/3] w-full overflow-hidden bg-bg-muted text-left disabled:cursor-default"
        aria-label={`Open ${name}`}
      >
        {thumb && imgOk ? (
          <>
            {blur && (
              <img src={blur} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover blur-md" />
            )}
            <img
              src={thumb}
              alt={name}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => setImgOk(false)}
              className={cn("absolute inset-0 h-full w-full object-cover transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
            />
          </>
        ) : kind === "image" ? (
          <ImagePlaceholder className="absolute inset-0 h-full w-full" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-subtle">
            <Icon size={24} aria-hidden="true" />
          </span>
        )}
        {flag && (
          <span className="absolute top-2 left-2">
            <StatusFlag size="sm" level={flag.level} label={flag.label} className="shadow-sm" />
          </span>
        )}
      </button>
      <div className="flex items-start gap-2 p-3">
        <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-subtle" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text" title={name}>
            {name}
          </p>
          {uploading ? (
            <Progress value={progress} size="sm" className="mt-2" label={`Uploading ${name}`} />
          ) : (
            <p className="num text-caption text-subtle" title={uploadedAt ? formatDateTime(uploadedAt) : undefined}>
              {formatBytes(size)}
              {uploadedAt && ` · ${formatRelative(uploadedAt)}`}
            </p>
          )}
        </div>
        {onRemove && <IconButton icon={Trash2} label={`Remove ${name}`} size="sm" iconSize={16} onClick={onRemove} />}
      </div>
    </div>
  );
}
