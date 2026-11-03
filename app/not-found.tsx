import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-mat-50 px-4">
      <div className="surface max-w-md p-8 text-center">
        <p className="text-sm font-medium text-mat-600">Erro 404</p>
        <h1 className="mt-2 text-2xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço acessado não existe ou você não tem permissão para visualizá-lo.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
