import { startSpeechRecognition } from "./speechClient";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
}));

jest.mock("@capacitor-community/speech-recognition", () => ({
  SpeechRecognition: {
    checkPermissions: jest.fn(),
    requestPermissions: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  },
}));

const settle = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  SpeechRecognition.checkPermissions.mockResolvedValue({ speechRecognition: "granted" });
  // The installed native plugin does not resolve this call.
  SpeechRecognition.stop.mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test("joins final Android utterances across pauses until the driver stops", async () => {
  SpeechRecognition.start
    .mockResolvedValueOnce({ matches: ["Cargué gasolina"] })
    .mockResolvedValueOnce({ matches: ["quinientos pesos"] });
  const results = [];
  const end = jest.fn();
  const rec = startSpeechRecognition({ lang: "es-MX", continuous: true }, value => results.push(value), jest.fn(), end);
  await settle();
  expect(results).toEqual(["Cargué gasolina"]);
  jest.advanceTimersByTime(200);
  await settle();
  expect(results).toEqual(["Cargué gasolina", "Cargué gasolina quinientos pesos"]);
  await rec.stop();
  expect(end).toHaveBeenCalledTimes(1);
  expect(SpeechRecognition.start).toHaveBeenCalledWith(expect.objectContaining({ partialResults: false, maxResults: 3 }));
});

test("manual stop accepts the final text without waiting for native stop to resolve", async () => {
  let resolveStart;
  SpeechRecognition.start.mockImplementationOnce(() => new Promise(resolve => { resolveStart = resolve; }));
  const results = [];
  const end = jest.fn();
  const rec = startSpeechRecognition({ continuous: false }, value => results.push(value), jest.fn(), end);
  await settle();
  await rec.stop();
  expect(SpeechRecognition.stop).toHaveBeenCalledTimes(1);
  resolveStart({ matches: ["Viaje de ciento veinte pesos"] });
  await settle();
  expect(results).toEqual(["Viaje de ciento veinte pesos"]);
  expect(end).toHaveBeenCalledTimes(1);
});

test("denied permission reports an actionable error and ends once", async () => {
  SpeechRecognition.checkPermissions.mockResolvedValue({ speechRecognition: "denied" });
  SpeechRecognition.requestPermissions.mockResolvedValue({ speechRecognition: "denied" });
  const error = jest.fn();
  const end = jest.fn();
  startSpeechRecognition({}, jest.fn(), error, end);
  await settle();
  expect(error).toHaveBeenCalledWith(expect.objectContaining({ error: "not-allowed" }));
  expect(end).toHaveBeenCalledTimes(1);
  expect(SpeechRecognition.start).not.toHaveBeenCalled();
});
