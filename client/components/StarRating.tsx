import { Star } from "lucide-react";
import { useState } from "react";

interface StarRatingProps {
  value: number;
  onChange: (value: number) => void;
  required?: boolean;
}

export function StarRating({ value, onChange, required = false }: StarRatingProps) {
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);

  return (
    <div className="flex items-start gap-4 w-full sm:w-auto">
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, index) => {
          const starNumber = index + 1;
          const isFilled = starNumber <= (hoveredStar !== null ? hoveredStar : value);

          return (
            <button
              key={starNumber}
              type="button"
              onMouseEnter={() => setHoveredStar(starNumber)}
              onMouseLeave={() => setHoveredStar(null)}
              onClick={() => onChange(starNumber)}
              className="transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary rounded"
              aria-label={`Rate ${starNumber} stars`}
            >
              <Star
                size={32}
                aria-hidden="true"
                className={`transition-colors ${
                  isFilled ? "fill-amber-400 text-amber-400" : "text-border"
                }`}
              />
            </button>
          );
        })}
      </div>
      {value > 0 ? (
        <span className="text-sm font-semibold text-foreground self-start">{value}/5</span>
      ) : required ? (
        <span className="text-xs text-destructive self-start">Required</span>
      ) : null}
    </div>
  );
}
