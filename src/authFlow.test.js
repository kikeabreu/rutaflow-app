import { ANDROID_AUTH_CALLBACK, ANDROID_AUTH_CALLBACK_FALLBACK, googleOAuthOptions, parseOAuthCallback, passwordRecoveryRedirect } from "./authFlow";

test("Google vuelve al mismo origen sin abrir un flujo OAuth separado", () => {
  expect(googleOAuthOptions("https://app.ruleto.mx")).toEqual({
    redirectTo: "https://app.ruleto.mx/?oauth_return=google",
  });
});

test("Google vuelve al dominio único de la PWA incluso desde el enlace antiguo", () => {
  expect(googleOAuthOptions("https://rutaflow-app.vercel.app").redirectTo).toBe(
    "https://app.ruleto.mx/?oauth_return=google",
  );
});

test("el desarrollo local conserva su propio callback", () => {
  expect(googleOAuthOptions("http://localhost:3000").redirectTo).toBe(
    "http://localhost:3000/?oauth_return=google",
  );
});

test("Android abre OAuth manualmente y vuelve por el esquema propio de la app", () => {
  expect(googleOAuthOptions("https://localhost", true)).toEqual({
    redirectTo: "mx.ruleto.drive://auth/callback",
    skipBrowserRedirect: true,
  });
  expect(ANDROID_AUTH_CALLBACK).toBe("mx.ruleto.drive://auth/callback");
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
  expect(parseOAuthCallback("mx.ruleto.drive://auth/callback?access_token=a&refresh_token=r")).toMatchObject({
    accessToken: "a",
    refreshToken: "r",
  });
});

test("el App Link https sigue siendo un callback válido de respaldo", () => {
  expect(parseOAuthCallback(`${ANDROID_AUTH_CALLBACK_FALLBACK}?code=abc`).code).toBe("abc");
});

test("la recuperacion de contraseña vuelve al dominio unico de la PWA", () => {
  expect(passwordRecoveryRedirect()).toBe("https://app.ruleto.mx/auth/restablecer");
});
