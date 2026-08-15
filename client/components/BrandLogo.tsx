import { Link } from "react-router-dom";

interface BrandLogoProps {
  iconClassName?: string;
}

export function BrandLogo({ iconClassName = "h-9" }: BrandLogoProps) {
  return (
    <Link to="/" className="flex items-center gap-2">
      <img src="/logo-icon.png" alt="" className={`${iconClassName} w-auto`} />
      <span className="text-[18px] font-bold tracking-tight text-foreground">
        RateMy<span style={{ color: "#6B21E8" }}>Managers</span>
      </span>
    </Link>
  );
}
