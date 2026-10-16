import type { Express, Request, Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { decryptGoogleToken, encryptGoogleToken } from "./google-calendar";
import { deleteGmailSenderConnection, getGmailSenderConnectionSecret, saveGmailSenderConnection, updateGmailSenderConnection } from "./db";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send openid email";
const GMAIL_STATE_COOKIE = "villela-gmail-state";
const GMAIL_STATE_TTL_MS = 10 * 60 * 1000;

type GmailState = { userId: number; issuedAt: number; nonce: string };
type GmailTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
type GmailUserInfo = { email?: string };

function base64url(value: Buffer | string) { return Buffer.from(value).toString("base64url"); }
function signState(payload: GmailState) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", ENV.cookieSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function verifyState(value: string | undefined) {
  if (!value || !ENV.cookieSecret) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = createHmac("sha256", ENV.cookieSecret).update(encoded).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const state = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as GmailState;
    return Number.isInteger(state.userId) && state.issuedAt > Date.now() - GMAIL_STATE_TTL_MS ? state : null;
  } catch { return null; }
}
function gmailRedirectUri() { return ENV.googleGmailRedirectUri || "https://villelasdr-7hhhsqg7.manus.space/api/gmail/callback"; }
function redirectResult(res: Response, status: string) { res.redirect(302, `/configuracoes?gmail=${encodeURIComponent(status)}`); }
async function requireMaster(req: Request) {
  const user = await sdk.authenticateRequest(req);
  if (user.role !== "master") throw new Error("Apenas o MASTER pode conectar o Gmail remetente.");
  return user;
}
async function exchangeCode(code: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: ENV.googleClientId, client_secret: ENV.googleClientSecret, code, grant_type: "authorization_code", redirect_uri: gmailRedirectUri() }),
  });
  if (!response.ok) throw new Error(`Google Gmail token exchange failed (${response.status})`);
  return response.json() as Promise<GmailTokenResponse>;
}
async function getGoogleUserInfo(accessToken: string) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Google userinfo failed (${response.status})`);
  return response.json() as Promise<GmailUserInfo>;
}
async function refreshGmailAccessToken(connection: any) {
  const valid = connection.accessTokenCiphertext && connection.accessTokenExpiresAt && new Date(connection.accessTokenExpiresAt).getTime() > Date.now() + 60_000;
  if (valid) return decryptGoogleToken(connection.accessTokenCiphertext);
  const refreshToken = decryptGoogleToken(connection.refreshTokenCiphertext);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: ENV.googleClientId, client_secret: ENV.googleClientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  if (!response.ok) throw new Error(`Gmail token refresh failed (${response.status})`);
  const token = await response.json() as GmailTokenResponse;
  if (!token.access_token) throw new Error("Google não retornou um access token Gmail válido.");
  await updateGmailSenderConnection({ accessTokenCiphertext: encryptGoogleToken(token.access_token), accessTokenExpiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null, status: "CONNECTED", lastError: null });
  return token.access_token;
}
function escapeHtml(value: string) { return value.replace(/[&<>'\"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;" })[character] || character); }
function mimeMessage(input: { to: string; lawyerName: string; inviteUrl: string; expiresAt: Date; fromEmail: string }) {
  const name = escapeHtml(input.lawyerName);
  const expires = input.expiresAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
  const html = `<div style="background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#172033"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dce4ef;border-radius:16px;padding:32px"><div style="font-size:12px;letter-spacing:2px;font-weight:700;color:#2667d8">VILLELA SDR</div><h1 style="font-size:24px;margin:20px 0 12px">Conecte seu Google Calendar</h1><p style="font-size:16px;line-height:1.6">Olá, <strong>${name}</strong>.</p><p style="font-size:16px;line-height:1.6">Você foi convidado a conectar seu Google Calendar ao sistema Villela SDR. Clique no botão abaixo para autorizar a integração usando a sua própria conta Google.</p><p style="text-align:center;margin:28px 0"><a href="${escapeHtml(input.inviteUrl)}" style="display:inline-block;background:#2667d8;color:#fff;text-decoration:none;border-radius:8px;padding:14px 22px;font-weight:700">CONECTAR MEU GOOGLE CALENDAR</a></p><p style="font-size:13px;line-height:1.5;color:#5c6b80">Este link é individual, temporário e expira em ${expires}. A Villela SDR nunca solicita sua senha do Google.</p></div></div>`;
  const text = `Olá, ${input.lawyerName}. Conecte seu Google Calendar pelo link: ${input.inviteUrl}. Este convite expira em ${expires}.`;
  const boundary = `=_Villela_${randomBytes(12).toString("hex")}`;
  const raw = [`From: Villela SDR <${input.fromEmail}>`, `To: ${input.to}`, "Subject: Convite para conectar seu Google Calendar · Villela SDR", "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", text, `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: 8bit", "", html, `--${boundary}--`, ""].join("\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}
export async function sendLawyerGoogleInviteEmail(input: { to: string; lawyerName: string; inviteUrl: string; expiresAt: Date }) {
  const connection = await getGmailSenderConnectionSecret();
  if (!connection || connection.status !== "CONNECTED") throw new Error("Conecte primeiro o Gmail para envio dos convites.");
  try {
    const token = await refreshGmailAccessToken(connection);
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw: mimeMessage({ ...input, fromEmail: connection.googleAccountEmail }) }) });
    if (!response.ok) { const payload = await response.json().catch(() => ({})) as { error?: { message?: string } }; throw new Error(`Gmail API ${response.status}: ${payload.error?.message || "não foi possível enviar o convite"}`); }
    return await response.json().catch(() => ({}));
  } catch (error) {
    await updateGmailSenderConnection({ status: "ERROR", lastError: error instanceof Error ? error.message : "Falha no envio pelo Gmail." });
    throw error;
  }
}
export function registerGmailRoutes(app: Express) {
  app.get("/api/gmail/connect", async (req, res) => {
    try {
      const user = await requireMaster(req);
      if (!ENV.googleClientId || !ENV.googleClientSecret || !ENV.cookieSecret) throw new Error("Google OAuth não configurado.");
      const state = signState({ userId: user.id, nonce: randomBytes(16).toString("hex"), issuedAt: Date.now() });
      res.cookie(GMAIL_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: GMAIL_STATE_TTL_MS });
      const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorization.searchParams.set("client_id", ENV.googleClientId); authorization.searchParams.set("redirect_uri", gmailRedirectUri()); authorization.searchParams.set("response_type", "code"); authorization.searchParams.set("scope", GMAIL_SCOPE); authorization.searchParams.set("access_type", "offline"); authorization.searchParams.set("prompt", "consent"); authorization.searchParams.set("login_hint", user.email || ""); authorization.searchParams.set("state", state);
      res.redirect(302, authorization.toString());
    } catch (error) { console.error("[Gmail] connect failed", error); redirectResult(res, "error"); }
  });
  app.get("/api/gmail/callback", async (req, res) => {
    const state = verifyState(req.cookies?.[GMAIL_STATE_COOKIE] || String(req.headers.cookie || "").split(`${GMAIL_STATE_COOKIE}=`)[1]?.split(";")[0]);
    res.clearCookie(GMAIL_STATE_COOKIE, { httpOnly: true, sameSite: "lax", secure: true, path: "/" });
    if (!state || typeof req.query.code !== "string") return redirectResult(res, req.query.error === "access_denied" ? "cancelled" : "error");
    try {
      const user = await requireMaster(req);
      if (user.id !== state.userId) throw new Error("Sessão MASTER inválida.");
      const tokens = await exchangeCode(req.query.code);
      if (!tokens.access_token) throw new Error("Google não retornou access token Gmail.");
      const account = await getGoogleUserInfo(tokens.access_token);
      if (!account.email) throw new Error("Google não retornou o e-mail da conta Gmail.");
      const previous = await getGmailSenderConnectionSecret();
      const refreshToken = tokens.refresh_token ? encryptGoogleToken(tokens.refresh_token) : previous?.refreshTokenCiphertext;
      if (!refreshToken) throw new Error("Google não retornou refresh token. Tente conectar novamente com consentimento.");
      await saveGmailSenderConnection({ googleAccountEmail: account.email, refreshTokenCiphertext: refreshToken, accessTokenCiphertext: encryptGoogleToken(tokens.access_token), accessTokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null, scope: tokens.scope || GMAIL_SCOPE });
      return redirectResult(res, "connected");
    } catch (error) { console.error("[Gmail] callback failed", error); return redirectResult(res, "error"); }
  });
  app.post("/api/gmail/disconnect", async (req, res) => {
    try { await requireMaster(req); await deleteGmailSenderConnection(); res.status(204).end(); } catch { res.status(403).json({ error: "Apenas o MASTER pode desconectar o Gmail remetente." }); }
  });
}
