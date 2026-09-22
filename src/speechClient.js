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

export function startSpeechRecognition(options, onResult, onError, onEnd) {
  if (Capacitor.isNativePlatform()) {
    let partialListener = null;
    let stateListener = null;
    let isStopped = false;
    let hasEnded = false;

    const endOnce = () => {
      if (!hasEnded) {
        hasEnded = true;
        onEnd();
      }
    };

    const stop = async () => {
      if (isStopped) {
        endOnce();
        return;
      }
      isStopped = true;
      try {
        if (partialListener) {
          const handle = await partialListener;
          if (handle && handle.remove) handle.remove();
          partialListener = null;
        }
        if (stateListener) {
          const handle = await stateListener;
          if (handle && handle.remove) handle.remove();
          stateListener = null;
        }
        await SpeechRecognition.stop();
      } catch (e) {}
      endOnce();
    };

    checkSpeechPermissions().then(async (granted) => {
      if (!granted) {
        onError({ error: 'not-allowed', message: "Activa el permiso del micrófono." });
        endOnce();
        return;
      }

      try {
        partialListener = SpeechRecognition.addListener('partialResults', (data) => {
          if (data && data.matches && data.matches.length > 0) {
            onResult(data.matches[0]);
          }
        });

        stateListener = SpeechRecognition.addListener('listeningState', (data) => {
          if (data && data.status === 'stopped') {
            stop();
          }
        });

        const startRes = await SpeechRecognition.start({
          language: options.lang || "es-MX",
          partialResults: true,
          popup: false,
          maxResults: 1
        });

        if (startRes && startRes.matches && startRes.matches.length > 0) {
          onResult(startRes.matches[0]);
        }
      } catch (err) {
        const msg = String(err?.message || err || "");
        if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("permiso")) {
          onError({ error: 'not-allowed', message: "Activa el permiso del micrófono." });
        } else {
          onError({ error: 'plugin-error', message: msg || "Error al iniciar el dictado por voz." });
        }
        stop();
      }
    });

    return { stop };
  } else {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      onError({ error: 'not-supported', message: "Dictado no soportado en este navegador." });
      onEnd();
      return { stop: () => {} };
    }
    const rec = new Recognition();
    rec.lang = options.lang || "es-MX";
    rec.interimResults = true;
    rec.continuous = options.continuous || false;
    rec.maxAlternatives = 1;
    
    rec.onend = onEnd;
    rec.onerror = onError;
    rec.onresult = e => {
      let heard = "";
      for (let i = 0; i < e.results.length; i++) heard += `${e.results[i][0].transcript} `;
      onResult(heard.trim());
    };
    rec.start();
    return { stop: () => rec.stop() };
  }
}

