import type { Express, Request, Response } from "express";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { deleteGoogleCalendarConnection, deleteLawyerGoogleConnection, getGoogleCalendarConnectionSecret, getLawyerById, getLawyerGoogleConnectionSecret, getLawyerGoogleInviteByTokenHash, markLawyerGoogleInviteError, markLawyerGoogleInviteUsed, saveGoogleCalendarConnection, saveLawyerGoogleConnection } from "./db";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";

const STATE_COOKIE = "villela-google-calendar-state";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.events openid email";
const STATE_TTL_MS = 10 * 60 * 1000;
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

type GoogleState = { userId?: number; lawyerId?: number; inviteId?: number; inviteTokenHash?: string; returnPath: string; nonce: string; issuedAt: number };
type GoogleTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string };

type GoogleUserInfo = { email?: string; email_verified?: boolean };

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}
export function hashInviteToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function createLawyerInviteToken() {
  return randomBytes(32).toString("base64url");
}
export function lawyerInviteExpiresAt() {
  return new Date(Date.now() + INVITE_TTL_MS);
}
function signState(payload: GoogleState) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", ENV.cookieSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function verifyState(value: string | undefined): GoogleState | null {
  if (!value || !ENV.cookieSecret) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", ENV.cookieSecret).update(encoded).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as GoogleState;
    const validOwner = Number.isInteger(state.userId) || (Number.isInteger(state.lawyerId) && Number.isInteger(state.inviteId));
    return state.issuedAt > Date.now() - STATE_TTL_MS && validOwner ? state : null;
  } catch {
    return null;
  }
}
function encryptionKey() {
  if (!ENV.cookieSecret || !ENV.googleClientSecret) throw new Error("Google OAuth encryption is not configured");
  return createHash("sha256").update(`${ENV.cookieSecret}:${ENV.googleClientSecret}:villela-google-calendar`).digest();
}
export function encryptGoogleToken(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(base64url).join(".");
}
export function decryptGoogleToken(value: string) {
  const [ivEncoded, tagEncoded, ciphertextEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("Invalid encrypted Google token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]).toString("utf8");
}
function redirectUri(req: Request) {
  const configured = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.get("host"));
  return `${protocol}://${host}/api/google-calendar/callback`;
}
function redirectWithResult(res: Response, result: string, returnPath = "/perfil") {
  res.redirect(302, `${returnPath}?google=${encodeURIComponent(result)}`);
}
function inviteResult(res: Response, status: "connected" | "cancelled" | "expired" | "used" | "wrong_account" | "error") {
  res.redirect(302, `/api/google-calendar/invite-result?status=${encodeURIComponent(status)}`);
}
function publicOrigin(req: Request) {
  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.get("host"));
  return `${protocol}://${host}`;
}
function inviteResultPage(status: string) {
  const content: Record<string, { title: string; message: string; tone: string }> = {
    connected: { title: "Google Calendar conectado", message: "A autorização foi concluída. O administrador já pode cadastrar reuniões na sua agenda.", tone: "#188866" },
    wrong_account: { title: "Conta Google incorreta", message: "A conta Google utilizada não corresponde ao e-mail cadastrado para este advogado. Volte ao convite e utilize a conta correta.", tone: "#b06000" },
    expired: { title: "Convite expirado", message: "Este convite não é mais válido. Solicite ao administrador que envie um novo convite.", tone: "#b06000" },
    used: { title: "Convite já utilizado", message: "Este convite já foi utilizado. Se precisar reconectar, solicite um novo convite ao administrador.", tone: "#b06000" },
    cancelled: { title: "Autorização cancelada", message: "A autorização não foi concluída. Solicite ao administrador que reenvie o convite.", tone: "#b06000" },
    error: { title: "Não foi possível conectar", message: "Ocorreu um problema ao concluir a conexão. Solicite ao administrador um novo convite.", tone: "#b03030" },
  };
  const result = content[status] || content.error;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${result.title} · Villela SDR</title><style>body{margin:0;background:#f4f7fb;color:#172033;font-family:Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px}.card{max-width:560px;background:#fff;border:1px solid #dce4ef;border-radius:18px;padding:36px;box-shadow:0 16px 40px rgba(28,51,84,.1)}.mark{font-size:12px;letter-spacing:2px;font-weight:700;color:#2667d8}.status{font-size:52px;margin:22px 0 8px;color:${result.tone}}h1{margin:0 0 14px;font-size:26px}p{line-height:1.6;color:#5c6b80}</style></head><body><main class="card"><div class="mark">VILLELA SDR</div><div class="status">${status === "connected" ? "✓" : "!"}</div><h1>${result.title}</h1><p>${result.message}</p></main></body></html>`;
}
function clearStateCookie(res: Response) {
  res.clearCookie(STATE_COOKIE, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
}
async function exchangeCode(code: string, uri: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: ENV.googleClientId, client_secret: ENV.googleClientSecret, code, grant_type: "authorization_code", redirect_uri: uri }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`);
  return response.json() as Promise<GoogleTokenResponse>;
}
async function getGoogleUserInfo(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google userinfo failed (${response.status})`);
  return response.json() as Promise<GoogleUserInfo>;
}

export function registerGoogleCalendarRoutes(app: Express) {
  app.get("/api/google-calendar/lawyer-invite/:token", async (req, res) => {
    const token = String(req.params.token || "");
    const invite = token ? await getLawyerGoogleInviteByTokenHash(hashInviteToken(token)) : null;
    if (!invite || !invite.lawyer.active) return inviteResult(res, invite?.invite.status === "USED" ? "used" : "expired");
    if (invite.invite.status !== "PENDING") return inviteResult(res, invite.invite.status === "USED" ? "used" : invite.invite.status === "EXPIRED" ? "expired" : "error");
    res.redirect(302, `/api/google-calendar/connect?invite=${encodeURIComponent(token)}`);
  });
  app.get("/api/google-calendar/invite-result", (req, res) => {
    res.status(200).type("html").send(inviteResultPage(String(req.query.status || "error")));
  });
  app.get("/api/google-calendar/connect", async (req, res) => {
    try {
      if (!ENV.googleClientId || !ENV.googleClientSecret || !ENV.cookieSecret) return redirectWithResult(res, "not_configured");
      const inviteToken = typeof req.query.invite === "string" ? req.query.invite : "";
      const invite = inviteToken ? await getLawyerGoogleInviteByTokenHash(hashInviteToken(inviteToken)) : null;
      const isInviteFlow = Boolean(inviteToken);
      const user = isInviteFlow ? null : await sdk.authenticateRequest(req);
      const lawyerId = req.query.lawyerId ? Number(req.query.lawyerId) : invite?.lawyer.id;
      const returnPath = lawyerId ? "/advogados" : "/perfil";
      if (isInviteFlow && (!invite || !invite.lawyer.active || invite.invite.status !== "PENDING")) return inviteResult(res, invite?.invite.status === "USED" ? "used" : "expired");
      if (lawyerId && (!Number.isInteger(lawyerId) || !(await getLawyerById(lawyerId)))) return isInviteFlow ? inviteResult(res, "expired") : redirectWithResult(res, "error", returnPath);
      if (lawyerId && !isInviteFlow && user?.role !== "master") return redirectWithResult(res, "error", returnPath);
      const state = signState({ userId: user?.id, lawyerId, inviteId: invite?.invite.id, inviteTokenHash: invite?.invite.tokenHash, returnPath, nonce: randomBytes(16).toString("hex"), issuedAt: Date.now() });
      res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: STATE_TTL_MS });
      const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorization.searchParams.set("client_id", ENV.googleClientId);
      authorization.searchParams.set("redirect_uri", redirectUri(req));
      authorization.searchParams.set("response_type", "code");
      authorization.searchParams.set("scope", GOOGLE_SCOPE);
      authorization.searchParams.set("access_type", "offline");
      authorization.searchParams.set("prompt", "consent");
      authorization.searchParams.set("include_granted_scopes", "true");
      if (isInviteFlow && invite?.lawyer.email) authorization.searchParams.set("login_hint", invite.lawyer.email);
      else if (user?.email) authorization.searchParams.set("login_hint", user.email);
      authorization.searchParams.set("state", state);
      res.redirect(302, authorization.toString());
    } catch (error) {
      console.error("[Google Calendar] connect failed", error);
      if (typeof req.query.invite === "string") return inviteResult(res, "error");
      redirectWithResult(res, "error");
    }
  });

  app.get("/api/google-calendar/callback", async (req, res) => {
    const state = verifyState(parseCookieHeader(req.headers.cookie || "")[STATE_COOKIE]);
    clearStateCookie(res);
    const isInviteFlow = Boolean(state?.lawyerId && state.inviteId);
    if (!state || typeof req.query.code !== "string") {
      if (isInviteFlow && state?.inviteId) await markLawyerGoogleInviteError(state.inviteId, req.query.error === "access_denied" ? "Autorização cancelada pelo advogado." : "O Google não retornou um código de autorização.");
      return isInviteFlow ? inviteResult(res, req.query.error === "access_denied" ? "cancelled" : "error") : redirectWithResult(res, req.query.error === "access_denied" ? "cancelled" : "error", state?.returnPath);
    }
    try {
      const user = state.userId ? await sdk.authenticateRequest(req) : null;
      if (user && user.id !== state.userId) return redirectWithResult(res, "error");
      const tokens = await exchangeCode(req.query.code, redirectUri(req));
      if (!tokens.access_token) throw new Error("Google did not return an access token");
      const googleUser = await getGoogleUserInfo(tokens.access_token);
      if (!googleUser.email) throw new Error("Google did not return the account email");
      if (isInviteFlow && state.lawyerId && state.inviteId) {
        const lawyer = await getLawyerById(state.lawyerId);
        const invite = state.inviteTokenHash ? await getLawyerGoogleInviteByTokenHash(state.inviteTokenHash) : null;
        if (!lawyer || !invite || invite.invite.id !== state.inviteId || invite.invite.status !== "PENDING") return inviteResult(res, invite?.invite.status === "USED" ? "used" : "expired");
        if (googleUser.email.trim().toLowerCase() !== lawyer.email.trim().toLowerCase()) {
          await markLawyerGoogleInviteError(state.inviteId, "A conta Google autorizada não corresponde ao e-mail cadastrado.");
          return inviteResult(res, "wrong_account");
        }
        const previous = await getLawyerGoogleConnectionSecret(state.lawyerId);
        const refreshToken = tokens.refresh_token ? encryptGoogleToken(tokens.refresh_token) : previous?.refreshTokenCiphertext;
        if (!refreshToken) throw new Error("Google did not return a refresh token");
        const claimed = await markLawyerGoogleInviteUsed(state.inviteId);
        if (!claimed) return inviteResult(res, "used");
        await saveLawyerGoogleConnection({ lawyerId: state.lawyerId, googleAccountEmail: googleUser.email, refreshTokenCiphertext: refreshToken, accessTokenCiphertext: encryptGoogleToken(tokens.access_token), accessTokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null, scope: tokens.scope || GOOGLE_SCOPE });
        return inviteResult(res, "connected");
      }
      if (!user) return redirectWithResult(res, "error");
      const previous = await getGoogleCalendarConnectionSecret(user.id);
      const refreshToken = tokens.refresh_token ? encryptGoogleToken(tokens.refresh_token) : previous?.refreshTokenCiphertext;
      if (!refreshToken) throw new Error("Google did not return a refresh token");
      const payload = { googleAccountEmail: googleUser.email, refreshTokenCiphertext: refreshToken, accessTokenCiphertext: encryptGoogleToken(tokens.access_token), accessTokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null, scope: tokens.scope || GOOGLE_SCOPE };
      await saveGoogleCalendarConnection({ userId: user.id, ...payload });
      return redirectWithResult(res, "connected", state.returnPath);
    } catch (error) {
      console.error("[Google Calendar] callback failed", error);
      if (isInviteFlow && state?.inviteId) await markLawyerGoogleInviteError(state.inviteId, error instanceof Error ? error.message : "Falha na autorização Google.");
      return isInviteFlow ? inviteResult(res, "error") : redirectWithResult(res, "error", state?.returnPath);
    }
  });

  app.post("/api/google-calendar/disconnect", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      const connection = await getGoogleCalendarConnectionSecret(user.id);
      if (connection) {
        try {
          const token = decryptGoogleToken(connection.refreshTokenCiphertext);
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        } catch (error) {
          console.warn("[Google Calendar] token revoke failed; removing local connection", error);
        }
        await deleteGoogleCalendarConnection(user.id);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[Google Calendar] disconnect failed", error);
      res.status(401).json({ error: "Não foi possível desconectar a Google Agenda." });
    }
  });
  app.post("/api/google-calendar/lawyer-disconnect", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role !== "master") return res.status(403).json({ error: "Apenas o MASTER pode desconectar calendários de advogados." });
      const lawyerId = Number(req.body?.lawyerId);
      if (!Number.isInteger(lawyerId)) return res.status(400).json({ error: "Advogado inválido." });
      const connection = await getLawyerGoogleConnectionSecret(lawyerId);
      if (connection) {
        try { const token = decryptGoogleToken(connection.refreshTokenCiphertext); await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }); } catch (error) { console.warn("[Google Calendar] lawyer token revoke failed", error); }
        await deleteLawyerGoogleConnection(lawyerId);
      }
      res.json({ success: true });
    } catch (error) { console.error("[Google Calendar] lawyer disconnect failed", error); res.status(401).json({ error: "Não foi possível desconectar a Google Agenda do advogado." }); }
  });
}
