// En Android el regreso se hace por esquema propio: Chrome entrega el intent a la
// app sin depender de la verificación de App Links (que falla en silencio si el
// dominio no sirve /.well-known/assetlinks.json y deja al usuario atrapado en el
// navegador). El App Link https sigue aceptado como respaldo.
export const ANDROID_AUTH_CALLBACK = "mx.ruleto.drive://auth/callback";
export const ANDROID_AUTH_CALLBACK_FALLBACK = "https://rutaflow-app.vercel.app/";

export function googleOAuthOptions(origin, native = false) {
  if (native) {
    return { redirectTo: ANDROID_AUTH_CALLBACK, skipBrowserRedirect: true };
  }
  const redirect = new URL("/", origin);
  redirect.searchParams.set("oauth_return", "google");
  return { redirectTo: redirect.toString() };
}

export function parseOAuthCallback(url) {
  const parsed = new URL(url);
  const query = parsed.searchParams;
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  const value = key => hash.get(key) || query.get(key);
  return {
    accessToken: value("access_token"),
    refreshToken: value("refresh_token"),
    code: value("code"),
    error: value("error_description") || value("error"),
  };
}

export async function restoreOAuthSession(client, url) {
  const callback = parseOAuthCallback(url);
  if (callback.error) throw new Error(callback.error);
  if (callback.accessToken && callback.refreshToken) {
    const { data, error } = await client.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });
    if (error) throw error;
    return data.session;
  }
  if (callback.code) {
    const { data, error } = await client.auth.exchangeCodeForSession(callback.code);
    if (error) throw error;
    return data.session;
  }
  return null;
}
