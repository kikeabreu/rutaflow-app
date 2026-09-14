import { splitSpeechText, textForSpeech } from "./voiceClient";

test("prepara Markdown y unidades para una voz en español", () => {
  expect(textForSpeech("## Decisión\n\n- **Tómalo**: $245 MXN, 18 km y 30 min (25%)."))
    .toBe("Decisión Tómalo: 245 pesos, 18 kilómetros y 30 minutos (25 por ciento).");
});

test("divide respuestas largas sin perder palabras", () => {
  const original = "uno dos tres cuatro cinco seis siete ocho nueve diez";
  const chunks = splitSpeechText(original, 18);
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.join(" ")).toBe(original);
  expect(chunks.every(chunk => chunk.length <= 18)).toBe(true);
});
