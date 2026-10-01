// Prefijos móviles. México primero y por defecto; el resto, Latinoamérica y
// los países desde donde más nos escriben conductores.
export const COUNTRIES = [
  { iso: "MX", name: "México", dial: "52", flag: "🇲🇽", min: 10, max: 10 },
  { iso: "US", name: "Estados Unidos", dial: "1", flag: "🇺🇸", min: 10, max: 10 },
  { iso: "CA", name: "Canadá", dial: "1", flag: "🇨🇦", min: 10, max: 10 },
  { iso: "GT", name: "Guatemala", dial: "502", flag: "🇬🇹", min: 8, max: 8 },
  { iso: "SV", name: "El Salvador", dial: "503", flag: "🇸🇻", min: 8, max: 8 },
  { iso: "HN", name: "Honduras", dial: "504", flag: "🇭🇳", min: 8, max: 8 },
  { iso: "NI", name: "Nicaragua", dial: "505", flag: "🇳🇮", min: 8, max: 8 },
  { iso: "CR", name: "Costa Rica", dial: "506", flag: "🇨🇷", min: 8, max: 8 },
  { iso: "PA", name: "Panamá", dial: "507", flag: "🇵🇦", min: 8, max: 8 },
  { iso: "CU", name: "Cuba", dial: "53", flag: "🇨🇺", min: 8, max: 8 },
  { iso: "DO", name: "República Dominicana", dial: "1", flag: "🇩🇴", min: 10, max: 10 },
  { iso: "PR", name: "Puerto Rico", dial: "1", flag: "🇵🇷", min: 10, max: 10 },
  { iso: "CO", name: "Colombia", dial: "57", flag: "🇨🇴", min: 10, max: 10 },
  { iso: "VE", name: "Venezuela", dial: "58", flag: "🇻🇪", min: 10, max: 10 },
  { iso: "EC", name: "Ecuador", dial: "593", flag: "🇪🇨", min: 9, max: 9 },
  { iso: "PE", name: "Perú", dial: "51", flag: "🇵🇪", min: 9, max: 9 },
  { iso: "BO", name: "Bolivia", dial: "591", flag: "🇧🇴", min: 8, max: 8 },
  { iso: "CL", name: "Chile", dial: "56", flag: "🇨🇱", min: 9, max: 9 },
  { iso: "AR", name: "Argentina", dial: "54", flag: "🇦🇷", min: 10, max: 11 },
  { iso: "UY", name: "Uruguay", dial: "598", flag: "🇺🇾", min: 8, max: 8 },
  { iso: "PY", name: "Paraguay", dial: "595", flag: "🇵🇾", min: 9, max: 9 },
  { iso: "BR", name: "Brasil", dial: "55", flag: "🇧🇷", min: 10, max: 11 },
  { iso: "ES", name: "España", dial: "34", flag: "🇪🇸", min: 9, max: 9 },
];

export const DEFAULT_COUNTRY = "MX";

export const countryByIso = iso => COUNTRIES.find(c => c.iso === iso) || COUNTRIES[0];

export const phoneDigits = value => String(value || "").replace(/\D/g, "");

// Devuelve el número en E.164 (+5215512345678 → +525512345678) o lanza un
// error con un mensaje listo para mostrar.
export function normalizePhone(iso, local) {
  const country = countryByIso(iso);
  let digits = phoneDigits(local);
  // Si pegan el número con lada internacional, la quitamos.
  if (digits.length > country.max && digits.startsWith(country.dial)) digits = digits.slice(country.dial.length);
  // México: el "1" de celular y el 044/045 ya no se marcan.
  if (country.iso === "MX" && digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (country.iso === "MX" && digits.length === 13 && /^04[45]/.test(digits)) digits = digits.slice(3);
  if (!digits) throw new Error("Escribe tu número de celular.");
  if (digits.length < country.min || digits.length > country.max) {
    const expected = country.min === country.max ? `${country.min}` : `${country.min} a ${country.max}`;
    throw new Error(`El número de ${country.name} debe tener ${expected} dígitos.`);
  }
  if (/^(\d)\1+$/.test(digits)) throw new Error("Ese número no parece válido.");
  return `+${country.dial}${digits}`;
}

export function splitPhone(e164, iso) {
  const digits = phoneDigits(e164);
  const preferred = iso ? countryByIso(iso) : null;
  const country = preferred && digits.startsWith(preferred.dial)
    ? preferred
    : [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length).find(c => digits.startsWith(c.dial)) || COUNTRIES[0];
  return { iso: country.iso, local: digits.startsWith(country.dial) ? digits.slice(country.dial.length) : digits };
}

export const formatPhone = e164 => {
  const { iso, local } = splitPhone(e164);
  const country = countryByIso(iso);
  const pretty = local.length === 10 ? `${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}` : local;
  return `+${country.dial} ${pretty}`;
};
