export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Plataforma de Redação
      </h1>
      <p className="text-muted-foreground">
        Etapa 0 concluída. O próximo passo é a etapa 1 (tenants e resolução por
        subdomínio), descrita em <code>docs/fase-1-nucleo.md</code>.
      </p>
    </main>
  );
}
