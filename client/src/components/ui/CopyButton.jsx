import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Tooltip } from "./Tooltip";
import { cn } from "../../lib/cn";

/** Copies `value` to the clipboard; icon morphs to a check for 1.5 s. */
export function CopyButton({ value, label = "Copy", className }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to clipboard");
    }
  };

  return (
    <Tooltip content={copied ? "Copied" : label}>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : label}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-sm text-subtle transition-colors duration-150 hover:bg-bg-muted hover:text-text",
          className,
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={copied ? "check" : "copy"}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.15 }}
            className={cn("inline-flex", copied && "text-success")}
          >
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          </motion.span>
        </AnimatePresence>
      </button>
    </Tooltip>
  );
}
