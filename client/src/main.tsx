import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          const sectorId = localStorage.getItem("villela-active-sector");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}`, ...(sectorId ? { "X-Villela-Sector-Id": sectorId } : {}) };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        const sectorId = localStorage.getItem("villela-active-sector");
        return sectorId ? { "X-Villela-Sector-Id": sectorId } : {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("[VILLELA SDR] Erro de renderização", error, info); }
  render() {
    if (this.state.hasError) return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#08111f", color: "#eef4ff", fontFamily: "Inter,ui-sans-serif,system-ui,sans-serif" }}><section style={{ textAlign: "center", padding: 32 }}><strong style={{ display: "block", letterSpacing: ".16em", fontSize: 12, color: "#ff9d9d" }}>VILLELA SDR</strong><h1 style={{ fontSize: 24, margin: "12px 0 8px" }}>Não foi possível carregar a operação</h1><p style={{ color: "#91a4bd", margin: 0 }}>Recarregue a página para tentar novamente.</p><button style={{ marginTop: 20, padding: "10px 16px", border: "1px solid #29415e", borderRadius: 8, background: "#12243a", color: "#eef4ff", cursor: "pointer" }} onClick={() => window.location.reload()}>Recarregar página</button></section></main>;
    return this.props.children;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("VILLELA SDR: elemento raiz não encontrado.");
try {
  createRoot(rootElement).render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary><App /></AppErrorBoundary>
      </QueryClientProvider>
    </trpc.Provider>
  );
} catch (error) {
  console.error("[VILLELA SDR] Falha ao iniciar a aplicação", error);
  rootElement.innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;background:#08111f;color:#eef4ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif"><section style="text-align:center;padding:32px"><strong style="display:block;letter-spacing:.16em;font-size:12px;color:#ff9d9d">VILLELA SDR</strong><h1 style="font-size:24px;margin:12px 0 8px">Não foi possível carregar a operação</h1><p style="color:#91a4bd;margin:0">Recarregue a página para tentar novamente.</p><button style="margin-top:20px;padding:10px 16px;border:1px solid #29415e;border-radius:8px;background:#12243a;color:#eef4ff;cursor:pointer" onclick="location.reload()">Recarregar página</button></section></main>`;
}
