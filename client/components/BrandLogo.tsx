import { Link } from "react-router-dom";

interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = "h-9" }: BrandLogoProps) {
  return (
    <Link to="/" className="flex items-center">
      <img src="/logo.webp" alt="Werkpages" width="310" height="72"
           className={`${className} w-auto`} fetchPriority="high" decoding="async" />
    </Link>
  );
}
