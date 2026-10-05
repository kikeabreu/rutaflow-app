import { getThemeMode } from '../theme';

// Logotipo oficial de Ruleto: versión oscura para fondos claros y versión
// clara para fondos oscuros. Se sirve desde /brand para que sea el mismo
// archivo que usa la landing.
export function Logo({ size = 20, iconSize, stacked = false, s }) {
  const height = Math.round((iconSize || size * 1.6) * 0.85);
  const src = getThemeMode() === "light" ? "/brand/ruleto-logo-dark.png" : "/brand/ruleto-logo-light.png";
  return (
    <div style={{ display: "flex", justifyContent: stacked ? "center" : "flex-start", alignItems: "center", ...s }}>
      <img src={src} alt="Ruleto" style={{ height, width: "auto", display: "block", flexShrink: 0 }} />
    </div>
  );
}
