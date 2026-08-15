export const COUNTRIES = [
  { value: "Canada", flag: "🇨🇦" },
  { value: "United States", flag: "🇺🇸" },
  { value: "United Kingdom", flag: "🇬🇧" },
  { value: "Australia", flag: "🇦🇺" },
  { value: "New Zealand", flag: "🇳🇿" },
  { value: "Ireland", flag: "🇮🇪" },
  { value: "Germany", flag: "🇩🇪" },
  { value: "France", flag: "🇫🇷" },
  { value: "Netherlands", flag: "🇳🇱" },
  { value: "Switzerland", flag: "🇨🇭" },
  { value: "Sweden", flag: "🇸🇪" },
  { value: "Norway", flag: "🇳🇴" },
  { value: "Denmark", flag: "🇩🇰" },
  { value: "Finland", flag: "🇫🇮" },
  { value: "Spain", flag: "🇪🇸" },
  { value: "Italy", flag: "🇮🇹" },
  { value: "Poland", flag: "🇵🇱" },
  { value: "India", flag: "🇮🇳" },
  { value: "Japan", flag: "🇯🇵" },
  { value: "South Korea", flag: "🇰🇷" },
  { value: "China", flag: "🇨🇳" },
  { value: "Singapore", flag: "🇸🇬" },
  { value: "Brazil", flag: "🇧🇷" },
  { value: "Mexico", flag: "🇲🇽" },
  { value: "South Africa", flag: "🇿🇦" },
  { value: "Other", flag: "🌍" },
] as const;

export function getCountryFlag(country: string | null | undefined): string {
  if (!country) return "";
  return COUNTRIES.find(c => c.value === country)?.flag ?? "🌍";
}
