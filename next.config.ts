import type { NextConfig } from "next";

/**
 * Headers de segurança aplicados a todas as rotas.
 * CSP com nonce fica no src/proxy.ts (etapa 12) — ver skill `seguranca`.
 */
const securityHeaders = [
  // Força HTTPS por 2 anos, incluindo subdomínios dos tenants.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Câmera liberada só para o próprio site (foto da redação).
    value: "camera=(self), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
