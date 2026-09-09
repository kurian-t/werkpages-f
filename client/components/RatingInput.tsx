import { useState } from "react";
import { Star } from "lucide-react";

/**
 * Five stars you can click. The input, not the display.
 *
 * Named RatingInput rather than Stars because components/Stars.tsx is the *display* - read-only,
 * takes a number, renders it. Two components called Stars, one interactive and one not, is how a
 * form ends up rendering a picture of a rating nobody can change.
 *
 * Extracted from AddInterview so the company rating form reuses it instead of becoming a second
 * copy that drifts.
 */
export function RatingInput({
  value,
  onChange,
  ariaLabelPrefix,
  size = 28,
}: {
  value: number | null;
  onChange: (value: number) => void;
  ariaLabelPrefix: string;
  size?: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= (hovered ?? value ?? 0);
        return (
          <button
            key={star}
            type="button"
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onChange(star)}
            aria-label={`${ariaLabelPrefix}: ${star} star${star === 1 ? "" : "s"}`}
            className="rounded transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Star
              size={size}
              aria-hidden="true"
              className={`transition-colors ${filled ? "fill-amber-400 text-amber-400" : "text-border"}`}
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * A labelled form row.
 *
 * The required marker lives here so "this field is mandatory" is stated once. Both rating forms
 * gate submission on every field, and a form that enforces something it never marks is a form
 * people fill in twice.
 */
export function FormField({
  label,
  children,
  error,
  hint,
  required,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
  /** Id of the control this labels. Without it the label is decoration, not a label. */
  htmlFor?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
