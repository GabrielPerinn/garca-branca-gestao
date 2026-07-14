import { AlertCircle, CheckCircle2, Info } from "lucide-react";

type FeedbackKind = "error" | "success" | "info";

interface InlineFeedbackProps {
  kind?: FeedbackKind;
  message?: string | null;
  className?: string;
}

const styles: Record<FeedbackKind, string> = {
  error: "border-red-700/25 bg-red-50 text-red-800",
  success: "border-primary/25 bg-primary/5 text-primary",
  info: "border-border bg-muted/40 text-foreground",
};

const icons = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

export function InlineFeedback({ kind = "info", message, className = "" }: InlineFeedbackProps) {
  if (!message) return null;

  const Icon = icons[kind];
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${styles[kind]} ${className}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "error" ? "assertive" : "polite"}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
    </div>
  );
}
