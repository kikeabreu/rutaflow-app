import { C, getThemeMode } from '../theme';

// Marca Ruleto Drive: el camino siempre es menta, pero la línea punteada de
// adentro cambia con el tema, igual que el resto del logotipo real — blanca
// junto al texto blanco (modo oscuro), verde oscuro junto al texto oscuro
// (modo claro) — para que nunca se vea una línea oscura sobre fondo oscuro.
export function Logo({ size = 20, iconSize, stacked = false, tagline = true, s }) {
  const icon = iconSize || Math.round(size * 1.6);
  const mark = getThemeMode() === "light" ? "/icons/mark-dark-dashes.png" : "/icons/mark-light-dashes.png";
  const wordmark = (
    <div style={{ display: "flex", alignItems: "baseline", gap: Math.round(size * 0.3), justifyContent: stacked ? "center" : "flex-start" }}>
      <span className="B" style={{ fontSize: size, fontWeight: 800, color: C.text, letterSpacing: 0.2 }}>
        ruleto<span style={{ color: C.accent }}>.</span>
      </span>
      {tagline && <span className="B" style={{ fontSize: Math.round(size * 0.62), fontWeight: 700, color: C.accent }}>Drive</span>}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: stacked ? "column" : "row", alignItems: "center", gap: Math.round(size * 0.4), ...s }}>
      <img src={mark} width={icon} height={icon} alt="Ruleto Drive" style={{ flexShrink: 0 }} />
      {wordmark}
    </div>
  );
}
