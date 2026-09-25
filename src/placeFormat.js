// src/placeFormat.js
//
// Cómo se nombra un punto del GPS cuando se le enseña a alguien: al conductor
// en pantalla y, sobre todo, a la IA en su contexto.
//
// La colonia sola no basta. "Centro" no distingue Mérida de Cancún, y dos
// colonias con el mismo nombre en ciudades distintas se le mezclarían a la IA
// en el mismo consejo: le diría al conductor que una zona le deja bien cuando
// los viajes buenos fueron en otra ciudad.

const coord = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** Las coordenadas crudas, como último recurso cuando no hay nombre. */
export function coordsLabel(point) {
  const lat = coord(point?.latitude ?? point?.lat);
  const lon = coord(point?.longitude ?? point?.lon);
  if (lat === null || lon === null) return "";
  return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

/** "Colonia, Ciudad" siempre que las dos existan y no sean la misma. */
export function placeLabel(point) {
  if (!point) return "";
  const colonia = point.neighborhood || point.zone || "";
  const ciudad = point.city || point.municipality || "";
  if (colonia && ciudad && colonia !== ciudad) return `${colonia}, ${ciudad}`;
  return colonia || ciudad || coordsLabel(point);
}
