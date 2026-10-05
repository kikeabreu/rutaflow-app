import { C, getThemeMode } from '../theme';

// Marca Ruleto Drive inline para que el login no dependa de una imagen pública
// antes de que el host o el service worker hayan estabilizado sus rutas.
function RuletoMark({ size }) {
  const dash = getThemeMode() === "light" ? C.text : "#fff";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Ruleto Drive" style={{ flexShrink: 0, display: "block" }}>
      <path d="M18 47V26c0-6.1 4.9-11 11-11h19v10H30c-1.1 0-2 .9-2 2v20H18z" fill={C.accent} />
      <path d="M25 44V29c0-4 3-7 7-7h12" fill="none" stroke={dash} strokeWidth="3" strokeLinecap="round" strokeDasharray="6 5" />
      <circle cx="48" cy="47" r="6" fill={C.accent} />
    </svg>
  );
}

export function Logo({ size = 20, iconSize, stacked = false, tagline = true, s }) {
  const icon = iconSize || Math.round(size * 1.6);
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
      <RuletoMark size={icon} />
      {wordmark}
    </div>
  );
}
