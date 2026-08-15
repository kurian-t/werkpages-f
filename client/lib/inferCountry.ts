const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  // Canada
  "America/Toronto": "Canada",
  "America/Vancouver": "Canada",
  "America/Edmonton": "Canada",
  "America/Winnipeg": "Canada",
  "America/Halifax": "Canada",
  "America/St_Johns": "Canada",
  "America/Regina": "Canada",
  // United States
  "America/New_York": "United States",
  "America/Chicago": "United States",
  "America/Denver": "United States",
  "America/Los_Angeles": "United States",
  "America/Phoenix": "United States",
  "America/Anchorage": "United States",
  "Pacific/Honolulu": "United States",
  "America/Detroit": "United States",
  "America/Indiana/Indianapolis": "United States",
  // United Kingdom
  "Europe/London": "United Kingdom",
  // Australia
  "Australia/Sydney": "Australia",
  "Australia/Melbourne": "Australia",
  "Australia/Brisbane": "Australia",
  "Australia/Perth": "Australia",
  "Australia/Adelaide": "Australia",
  "Australia/Darwin": "Australia",
  // New Zealand
  "Pacific/Auckland": "New Zealand",
  // Ireland
  "Europe/Dublin": "Ireland",
  // Germany
  "Europe/Berlin": "Germany",
  // France
  "Europe/Paris": "France",
  // Netherlands
  "Europe/Amsterdam": "Netherlands",
  // Switzerland
  "Europe/Zurich": "Switzerland",
  // Sweden
  "Europe/Stockholm": "Sweden",
  // Norway
  "Europe/Oslo": "Norway",
  // Denmark
  "Europe/Copenhagen": "Denmark",
  // Finland
  "Europe/Helsinki": "Finland",
  // Spain
  "Europe/Madrid": "Spain",
  // Italy
  "Europe/Rome": "Italy",
  // Poland
  "Europe/Warsaw": "Poland",
  // India
  "Asia/Kolkata": "India",
  // Japan
  "Asia/Tokyo": "Japan",
  // South Korea
  "Asia/Seoul": "South Korea",
  // China
  "Asia/Shanghai": "China",
  "Asia/Hong_Kong": "China",
  // Singapore
  "Asia/Singapore": "Singapore",
  // Brazil
  "America/Sao_Paulo": "Brazil",
  "America/Manaus": "Brazil",
  // Mexico
  "America/Mexico_City": "Mexico",
  // South Africa
  "Africa/Johannesburg": "South Africa",
};

export function inferCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_TO_COUNTRY[tz] ?? "Other";
  } catch {
    return "Other";
  }
}
