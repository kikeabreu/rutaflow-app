import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

export async function checkSpeechPermissions() {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const status = await SpeechRecognition.checkPermissions();
    if (status.speechRecognition === 'granted') return true;
    const req = await SpeechRecognition.requestPermissions();
    return req.speechRecognition === 'granted';
  } catch (e) {
    return false;
  }
}

// On Android, a short pause ends one utterance. A continuous dictation session
// joins final utterances and restarts until the user stops it explicitly.
function startNativeRecognition(options, onResult, onError, onEnd) {
  let stopped = false;
  let stopRequested = false;
  let ended = false;
  let starting = false;
  let utterance = 0;
  let committed = "";
  let restartTimer = null;
  let stopTimer = null;

  const finish = () => {
    if (ended) return;
    stopped = true;
    utterance += 1;
    if (restartTimer) clearTimeout(restartTimer);
    if (stopTimer) clearTimeout(stopTimer);
    ended = true;
    onEnd();
  };

  const stop = () => {
    if (stopped || stopRequested) return Promise.resolve();
    stopRequested = true;
    if (restartTimer) clearTimeout(restartTimer);
    if (!starting) {
      finish();
      return Promise.resolve();
    }
    // Version 7.0.1 posts the native stop action but leaves its PluginCall open.
    // Do not await that unresolved promise in the UI.
    try { Promise.resolve(SpeechRecognition.stop()).catch(() => {}); } catch {}
    // Give Android time to deliver the final result after the user presses stop.
    stopTimer = setTimeout(finish, 1500);
    return Promise.resolve();
  };

  const abort = () => {
    if (!stopped && starting) {
      try { Promise.resolve(SpeechRecognition.stop()).catch(() => {}); } catch {}
    }
    finish();
    return Promise.resolve();
  };

  const listen = async () => {
    if (stopped || starting) return;
    starting = true;
    const current = ++utterance;
    try {
      const result = await SpeechRecognition.start({
        language: options.lang || "es-MX",
        partialResults: false,
        popup: false,
        maxResults: 3,
      });
      if (stopped || current !== utterance) return;
      const heard = String(result?.matches?.[0] || "").trim();
      if (heard) {
        committed = `${committed}${committed ? " " : ""}${heard}`;
        onResult(committed);
      }
      if (!options.continuous || stopRequested) {
        finish();
        return;
      }
    } catch (error) {
      if (stopped || current !== utterance) return;
      if (stopRequested) {
        finish();
        return;
      }
      const message = String(error?.message || error || "");
      const lower = message.toLowerCase();
      const permission = lower.includes("permission") || lower.includes("permiso");
      const silence = lower.includes("no match") || lower.includes("no speech") || lower.includes("no_speech") || lower.includes("speech timeout");
      if (!options.continuous || !silence) {
        onError({ error: permission ? "not-allowed" : "plugin-error", message: permission ? "Activa el permiso del micrófono." : message || "Error al iniciar el dictado por voz." });
        finish();
        return;
      }
    } finally {
      starting = false;
    }
    if (!stopped && !stopRequested && options.continuous) restartTimer = setTimeout(listen, 200);
  };

  checkSpeechPermissions().then(granted => {
    if (stopped) return;
    if (!granted) {
      onError({ error: "not-allowed", message: "Activa el permiso del micrófono." });
      finish();
      return;
    }
    listen();
  });

  return { stop, abort };
}

export function startSpeechRecognition(options, onResult, onError, onEnd) {
  if (Capacitor.isNativePlatform()) return startNativeRecognition(options, onResult, onError, onEnd);

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    onError({ error: "not-supported", message: "Dictado no soportado en este navegador." });
    onEnd();
    return { stop: () => {}, abort: () => {} };
  }
  const rec = new Recognition();
  rec.lang = options.lang || "es-MX";
  rec.interimResults = true;
  rec.continuous = Boolean(options.continuous);
  rec.maxAlternatives = 3;
  rec.onend = onEnd;
  rec.onerror = onError;
  rec.onresult = event => {
    let heard = "";
    for (let index = 0; index < event.results.length; index++) heard += `${event.results[index][0].transcript} `;
    onResult(heard.trim());
  };
  rec.start();
  return { stop: () => rec.stop(), abort: () => rec.abort() };
}
