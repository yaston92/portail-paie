import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Autorise le tunnel Cloudflare en dev (liens mails depuis le téléphone)
  allowedDevOrigins: [
    "packing-competitors-hygiene-ski.trycloudflare.com",
    "*.trycloudflare.com",
  ],
  // pdfjs-dist doit rester external (fonts + legacy ESM Node)
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  // Uploads embauche (PDF / photos) : défaut proxy = 10 Mo → corps tronqué → FormData cassé
  experimental: {
    proxyClientMaxBodySize: "50mb",
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
};

export default nextConfig;
