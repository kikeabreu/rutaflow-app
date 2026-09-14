import { useCallback, useEffect, useRef, useState } from "react";

export function textForSpeech(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*+] |\d+[.)]\s+)/gm, "")
    .replace(/\$\s*([\d.,]+)\s*(?:MXN)?/gi, "$1 pesos")
    .replace(/\bMXN\b/gi, "pesos mexicanos")
    .replace(/km\s*\/\s*l\b/gi, "kilómetros por litro")
    .replace(/\/\s*hr\b/gi, " por hora")
    .replace(/km\b/gi, "kilómetros")
    .replace(/\bmin\b/gi, "minutos")
    .replace(/([\d.,]+)\s*%/g, "$1 por ciento")
    .replace(/[|*_>~]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

export function splitSpeechText(value, maxLength = 220) {
  const text = textForSpeech(value);
  if (!text) return [];
  const words = text.split(/\s+/);
  const chunks = [];
  let current = "";
  words.forEach(word => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      chunks.push(current);
      current = word;
    } else current = next;
  });
  if (current) chunks.push(current);
  return chunks;
}

function findSpanishVoice(voices) {
  const language = voice => String(voice.lang || "").toLowerCase().replace("_", "-");
  return voices.find(voice => language(voice) === "es-mx")
    || voices.find(voice => language(voice).startsWith("es-mx"))
    || voices.find(voice => language(voice).startsWith("es-"))
    || null;
}

export function useSpanishSpeech() {
  const supported = typeof window !== "undefined"
    && "speechSynthesis" in window
    && "SpeechSynthesisUtterance" in window;
  const [speakingId, setSpeakingId] = useState(null);
  const [speechError, setSpeechError] = useState("");
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current += 1;
    if (supported) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [supported]);

  const speak = useCallback((value, id = "speech") => {
    if (!supported) {
      setSpeechError("La lectura en voz alta no está disponible en este dispositivo.");
      return false;
    }
    if (speakingId === id) {
      stop();
      return true;
    }

    const chunks = splitSpeechText(value);
    if (!chunks.length) return false;

    const synth = window.speechSynthesis;
    const run = runRef.current + 1;
    runRef.current = run;
    synth.cancel();
    setSpeechError("");
    setSpeakingId(id);

    const voice = findSpanishVoice(synth.getVoices());
    chunks.forEach((chunk, index) => {
      const utterance = new window.SpeechSynthesisUtterance(chunk);
      utterance.lang = voice?.lang || "es-MX";
      utterance.voice = voice;
      utterance.rate = 0.96;
      utterance.pitch = 1;
      if (index === chunks.length - 1) {
        utterance.onend = () => {
          if (runRef.current === run) setSpeakingId(null);
        };
      }
      utterance.onerror = event => {
        if (runRef.current !== run || ["canceled", "interrupted"].includes(event.error)) return;
        runRef.current += 1;
        synth.cancel();
        setSpeakingId(null);
        setSpeechError("No pude reproducir la voz. Revisa el volumen e inténtalo de nuevo.");
      };
      synth.speak(utterance);
    });
    return true;
  }, [speakingId, stop, supported]);

  useEffect(() => () => {
    runRef.current += 1;
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speakingId, speechError, speak, stop };
}
