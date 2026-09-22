import { ANDROID_AUTH_CALLBACK, ANDROID_AUTH_CALLBACK_FALLBACK, googleOAuthOptions, parseOAuthCallback } from "./authFlow";

test("Google vuelve al mismo origen sin abrir un flujo OAuth separado", () => {
  expect(googleOAuthOptions("https://rutaflow-app.vercel.app")).toEqual({
    redirectTo: "https://rutaflow-app.vercel.app/?oauth_return=google",
  });
});

test("conserva el dominio exacto donde se instaló la PWA", () => {
  expect(googleOAuthOptions("https://instalada.example").redirectTo).toBe(
    "https://instalada.example/?oauth_return=google",
  );
});

test("Android abre OAuth manualmente y vuelve por el esquema propio de la app", () => {
  expect(googleOAuthOptions("https://localhost", true)).toEqual({
    redirectTo: "mx.rutaflow.app://auth/callback",
    skipBrowserRedirect: true,
  });
  expect(ANDROID_AUTH_CALLBACK).toBe("mx.rutaflow.app://auth/callback");
});

test("lee los tokens de una devolución OAuth móvil", () => {
  expect(parseOAuthCallback(`${ANDROID_AUTH_CALLBACK}#access_token=a&refresh_token=r`)).toMatchObject({
    accessToken: "a",
    refreshToken: "r",
    code: null,
    error: null,
  });
});

test("también acepta callbacks PKCE", () => {
  expect(parseOAuthCallback(`${ANDROID_AUTH_CALLBACK}?code=abc`).code).toBe("abc");
});

test("acepta el retorno explícito desde Chrome hacia la app Android", () => {
  expect(parseOAuthCallback("mx.rutaflow.app://auth/callback?access_token=a&refresh_token=r")).toMatchObject({
    accessToken: "a",
    refreshToken: "r",
  });
});

test("el App Link https sigue siendo un callback válido de respaldo", () => {
  expect(parseOAuthCallback(`${ANDROID_AUTH_CALLBACK_FALLBACK}?code=abc`).code).toBe("abc");
});
