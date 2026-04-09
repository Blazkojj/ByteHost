import { MoonStar, SunMedium } from "lucide-react";

export function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  const Icon = isDark ? SunMedium : MoonStar;
  const label = isDark ? "Jasny motyw" : "Ciemny motyw";

  return (
    <button className="ghost-button theme-toggle" type="button" onClick={onToggle}>
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}
