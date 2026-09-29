/**
 * Health check para o monitor de uptime (ver skill `seguranca`, seção Monitoramento).
 * Não expõe versão, dependências nem dados internos.
 * A partir da etapa 1, incluir um ping leve no banco.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
