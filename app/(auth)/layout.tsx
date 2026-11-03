export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-mat-50 px-4 py-10">
      <div className="tatame-pattern pointer-events-none absolute inset-0 opacity-40" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-base font-black text-primary-foreground shadow-lg">
            JJ
          </span>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Jiu-Jitsu App</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Planejamento, agenda e técnicas em um só lugar.
          </p>
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Feito para professores particulares de Jiu-Jitsu.
        </p>
      </div>
    </div>
  );
}
