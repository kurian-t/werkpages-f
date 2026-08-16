import { Link } from "react-router-dom";

interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = "h-9" }: BrandLogoProps) {
  return (
    <Link to="/" className="flex items-center">
      <img src="/logo.png" alt="Werkpages" className={`${className} w-auto`} />
    </Link>
  );
}
