// Vercel no publica archivos dentro de carpetas que empiezan con punto, así que
// `/.well-known/assetlinks.json` caía en el fallback de la SPA y devolvía HTML.
// Sin este JSON, Android nunca verifica el App Link de rutaflow-app.vercel.app y
// el regreso de Google se queda atrapado en Chrome.
const ASSET_LINKS = [
  {
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "mx.rutaflow.app",
      sha256_cert_fingerprints: [
        "08:49:1F:A5:E0:49:80:C3:42:92:AB:48:68:3D:81:8B:AF:04:B5:78:AF:1B:13:64:D1:66:48:F9:E8:14:2F:AC",
      ],
    },
  },
];

module.exports = (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(JSON.stringify(ASSET_LINKS));
};
