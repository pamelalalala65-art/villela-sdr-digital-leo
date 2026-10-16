import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { TooltipProvider } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc";
import { startLogin } from "./const";
import { ThemeProvider } from "./contexts/ThemeContext";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Download,
  FileBarChart,
  Filter,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Minimize2,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trophy,
  Upload,
  UserCog,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Route, Switch, Link, useLocation } from "wouter";

const statusLabels: Record<string, string> = {
  AGENDADA: "Agendada",
  REALIZADA: "Realizada",
  NO_SHOW: "No-show",
  CANCELADA: "Cancelada",
};
const statusClasses: Record<string, string> = {
  AGENDADA: "status-scheduled",
  REALIZADA: "status-done",
  NO_SHOW: "status-noshow",
  CANCELADA: "status-cancelled",
};
const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/reunioes", label: "Reuniões", icon: CalendarDays },
  { href: "/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/sdrs", label: "SDRs", icon: Users },
  { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
  { href: "/bonificacoes", label: "Bonificações", icon: Target, projurisOnly: true },
  { href: "/ranking", label: "🏆 Ranking", icon: Trophy, rankingBySector: true },
  { href: "/perfil", label: "Meu perfil", icon: UserCog },
  { href: "/advogados", label: "Advogados", icon: BriefcaseBusiness, masterOnly: true },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

function saoPauloNowKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function isoToday() { return saoPauloNowKey().slice(0, 10); }
function normalizeFormDate(value: unknown) {
  const text = String(value ?? "").trim();
  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (brazilian) return `${brazilian[3]}-${brazilian[2]}-${brazilian[1]}`;
  return text.slice(0, 10);
}
function normalizeFormTime(value: unknown) {
  return String(value ?? "").trim().slice(0, 5);
}
function cleanMeetingForm(value: any) {
  const trafficReasons = ["Fora do perfil de cliente", "Sem necessidade do serviço", "Contato inválido", "Empresa não localizada", "Sem interesse", "Dados insuficientes", "Outro"];
  return { ...value, date: normalizeFormDate(value.date), contactDate: value.contactDate ? normalizeFormDate(value.contactDate) : null, nextContactDate: value.nextContactDate ? normalizeFormDate(value.nextContactDate) : null, email: value.email || "", lawyerEmail: value.lawyerEmail || "", calendarOwner: value.calendarOwner === "LAWYER" ? "LAWYER" : "SDR", notes: value.notes || null, result: value.result || null, nextStep: value.nextStep || null, contractValue: value.contractValue || null, proposalValue: value.proposalValue || null, contractInstallments: value.contractInstallments === "" || value.contractInstallments == null ? null : Number(value.contractInstallments), noShowReason: value.noShowReason || null, cancelReason: value.cancelReason || null, disqualificationReason: trafficReasons.includes(value.disqualificationReason) ? value.disqualificationReason : null };
}
function friendlyMeetingError(error: any) {
  const labels: Record<string, string> = {
    companyName: "Nome da empresa",
    cnpj: "CNPJ/CPF",
    contactName: "Nome do sócio",
    phone: "Telefone",
    contactDate: "Data da ligação/contato",
    date: "Data do agendamento",
    time: "Horário",
    closer: "Closer da reunião",
    lawyerEmail: "E-mail do closer",
    calendarOwner: "Onde criar reunião",
    contractInstallments: "Quantidade de parcelas",
    contractLawyer: "Advogado responsável pelo contrato",
    closedContractValue: "Valor do contrato fechado",
    result: "Resultado da reunião",
    noShowReason: "Motivo do no-show",
    cancelReason: "Motivo do cancelamento",
    campaignName: "Nome da campanha",
    disqualificationReason: "Motivo da desqualificação",
    disqualificationOther: "Descrição do outro motivo",
  };
  const raw = String(error?.message || "");
  let issues: any[] = [];
  try {
    const parsed = JSON.parse(raw);
    issues = Array.isArray(parsed) ? parsed : parsed?.issues || [];
  } catch { /* mensagem simples do backend */ }
  if (!issues.length) return raw || "Não foi possível salvar a reunião. Revise os campos preenchidos.";
  const messages = issues.map(issue => {
    const path = Array.isArray(issue?.path) ? issue.path.filter(Boolean) : [];
    const field = labels[path[path.length - 1]] || (path.length ? path.join(" / ") : "Informações da reunião");
    const message = String(issue?.message || "Verifique este campo.")
      .replace(/^Invalid input: expected number, received string$/i, "Informe um número válido.")
      .replace(/^Invalid option: expected one of .*$/i, "Selecione uma opção válida.");
    return `${field}: ${message}`;
  });
  return `Não foi possível salvar a reunião. Corrija os campos abaixo:\n• ${Array.from(new Set(messages)).join("\n• ")}`;
}
function meetingDraftKey(user: any) {
  return `villela-new-meeting-draft:${user?.id || "anonymous"}:${user?.activeSectorId || "default"}`;
}
function hasMeetingDraft(user: any) {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem(meetingDraftKey(user)));
}
function clearMeetingDraft(user: any) {
  if (typeof window !== "undefined") window.localStorage.removeItem(meetingDraftKey(user));
}
function brasilGreeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}
function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(value);
}
function formatShortDate(value?: string | Date | null) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}` : String(value);
}
function initials(name?: string | null) {
  return (name || "U").split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
}
function userAvatar(user: any) {
  const text = `${user?.id || ""} ${user?.name || ""} ${user?.email || ""}`.toLowerCase();
  const first = text.split(/\s+/)[1] || "";
  const femaleNames = ["ana", "alice", "amanda", "andressa", "beatriz", "bruna", "carla", "daniela", "fernanda", "juliana", "luana", "mariana", "patricia", "rafaela", "sabrina", "vanessa"];
  const female = femaleNames.includes(first) || /a$/.test(first);
  const pool = female ? ["👩🏻‍💼", "👩🏽‍💻", "👩🏼‍🚀", "👩🏾‍🔬", "👩🏻‍🎨"] : ["👨🏻‍💼", "👨🏽‍💻", "👨🏼‍🚀", "👨🏾‍🔬", "👨🏻‍🎨"];
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return pool[hash % pool.length];
}
function UserAvatar({ user, className = "" }: { user: any; className?: string }) {
  return user?.avatarUrl ? <img className={`profile-avatar ${className}`} src={user.avatarUrl} alt={`Foto de ${user.name || "usuário"}`} /> : <span className={`avatar avatar-emoji ${className}`}>{userAvatar(user)}</span>;
}
function isManagement(role?: string | null) { return role === "admin" || role === "gestao" || role === "master"; }
function isMaster(role?: string | null) { return role === "master"; }
function getRange(preset: string) {
  const today = new Date();
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const start = new Date(today);
  const end = new Date(today);
  if (preset === "yesterday") { start.setDate(today.getDate() - 1); end.setDate(today.getDate() - 1); }
  else if (preset === "week") { const day = today.getDay() || 7; start.setDate(today.getDate() - day + 1); end.setDate(start.getDate() + 6); }
  else if (preset === "month") { start.setDate(1); end.setMonth(today.getMonth() + 1, 0); }
  else if (preset === "previous") { start.setFullYear(today.getFullYear(), today.getMonth() - 1, 1); end.setFullYear(today.getFullYear(), today.getMonth(), 0); }
  return { from: iso(start), to: iso(end) };
}
function displayRole(role?: string | null, sectorName?: string | null) {
  if (role === "master") return "MASTER";
  if (role === "admin") return "ADMINISTRADOR";
  const normalizedSector = sectorName?.toUpperCase().includes("CONCILIE") ? "CONCILIE" : sectorName?.toUpperCase().includes("PROJURIS") ? "PROJURIS" : sectorName?.toUpperCase().includes("TRÁFEGO") ? "TRÁFEGO PAGO" : "";
  const sector = normalizedSector ? ` ${normalizedSector}` : "";
  if (role === "gestao") return `GESTÃO${sector}`;
  return `SDR${sector}`;
}

function StatusBadge({ status, pending = false }: { status: string; pending?: boolean }) {
  if (pending) return <span className="status-badge status-pending"><span className="status-dot" />Resultado pendente</span>;
  return <span className={`status-badge ${statusClasses[status] || ""}`}><span className="status-dot" />{statusLabels[status] || status}</span>;
}

function BrasilClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(now);
  return <div className="brasil-clock" aria-label={`Horário de Brasília: ${date} ${time}`}><Clock3 size={15} /><div><strong>{time}</strong><span>{date} · Brasília</span></div></div>;
}

function LoginScreen() {
  return <main className="login-screen">
    <div className="login-art"><div className="login-grid" /><div className="login-orbit orbit-one" /><div className="login-orbit orbit-two" /><div className="login-signal"><img src="/villela-mark.png" alt="VILLELA SDR" /></div></div>
    <section className="login-card">
      <div className="brand-lockup"><img src="/villela-mark.png" alt="" /><div><strong>VILLELA</strong><span>SDR / OPERAÇÃO</span></div></div>
      <div className="login-copy"><p className="eyebrow">CENTRAL DE OPERAÇÃO</p><h1>Reuniões sob controle.</h1><p>Acompanhe a agenda, registre resultados e transforme cada reunião em próximo passo.</p></div>
      <button className="button button-primary button-large" onClick={() => startLogin()}><ShieldCheck size={18} /> Entrar com minha conta</button>
      <p className="login-footnote">Acesso protegido por autenticação corporativa.</p>
    </section>
  </main>;
}

function AppShell({ user }: { user: any }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => { window.location.href = "/"; } });
  const current = navItems.find(item => item.href === location) || navItems[0];
  const activeSector = user?.sectors?.find((sector: any) => sector.id === user?.activeSectorId);
  const visibleNav = navItems.filter(item => (!item.masterOnly || isMaster(user?.role)) && (item.href !== "/configuracoes" || isMaster(user?.role)) && (!item.projurisOnly || activeSector?.code === "PROJURIS_2") && (!item.rankingBySector || activeSector?.code === "PROJURIS_2" || activeSector?.code === "CONCILIE"));
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><img src="/villela-mark.png" alt="" /><div><strong>VILLELA</strong><span>SDR / OPERAÇÃO</span></div><button className="icon-button mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="sidebar-section-label">MENU PRINCIPAL</div>
      <nav className="sidebar-nav">{visibleNav.map(item => { const Icon = item.icon; const active = item.href === location || (item.href === "/" && location === "/"); return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`nav-link ${active ? "nav-link-active" : ""}`}><Icon size={18} /><span>{item.label}</span></Link>; })}</nav>
      <div className="sidebar-bottom"><BrasilClock /><div className="sidebar-status"><span className="live-dot" /><div><strong>Dados sincronizados</strong><span>Atualização automática ativa</span></div></div><button className="nav-link nav-logout" onClick={() => logout.mutate()}><LogOut size={18} /> <span>Sair</span></button></div>
    </aside>
    {mobileOpen && <button className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}
    <div className="main-column">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}><Menu size={20} /></button><div className="topbar-context"><span className="topbar-kicker">{current.label.toUpperCase()}</span><span className="topbar-date">{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span></div><div className="topbar-actions">{user?.sectors?.length > 1 ? <select className="sector-switch" value={user.activeSectorId || ""} onChange={event => { localStorage.setItem("villela-active-sector", event.target.value); window.location.reload(); }}>{user.sectors.map((sector: any) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select> : <span className="sector-context">VILLELA SDR · {activeSector?.name || user?.sectors?.[0]?.name || "PROJURIS 2.0"}</span>}<div className="user-chip"><UserAvatar user={user} /><div><strong>{user?.name || "Usuário"}</strong><span>{displayRole(user?.role, activeSector?.name)}</span></div><ChevronRight size={14} className="user-chevron" /></div></div></header>
      <main className="page-content"><Switch><Route path="/" component={() => <DashboardPage user={user} />} /><Route path="/reunioes" component={() => <MeetingsPage user={user} />} /><Route path="/calendario" component={() => <CalendarPage user={user} />} /><Route path="/sdrs" component={() => <SdrsPage user={user} />} /><Route path="/relatorios" component={() => <ReportsPage user={user} />} /><Route path="/bonificacoes" component={() => <BonusesPage user={user} />} /><Route path="/ranking" component={() => <RankingPage user={user} />} /><Route path="/perfil" component={() => <ProfilePage user={user} />} /><Route path="/advogados" component={() => <LawyersPage user={user} />} /><Route path="/configuracoes" component={() => <SettingsPage user={user} />} /><Route component={() => <NotFoundPage />} /></Switch></main>
    </div>
  </div>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="page-description">{description}</p>}</div>{action}</div>;
}

function QuickRange({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const options = [["today", "Hoje"], ["yesterday", "Ontem"], ["week", "Esta semana"], ["month", "Este mês"], ["previous", "Mês anterior"], ["custom", "Personalizado"]];
  return <div className="quick-range">{options.map(([key, label]) => <button key={key} className={value === key ? "quick-range-active" : ""} onClick={() => onChange(key)}>{label}</button>)}</div>;
}

function FilterBar({ filters, setFilters, users, showSearch = false, showTrafficFilters = false }: { filters: any; setFilters: (value: any) => void; users: any[]; showSearch?: boolean; showTrafficFilters?: boolean }) {
  const range = filters.preset === "custom" ? { from: filters.from, to: filters.to } : getRange(filters.preset || "today");
  return <div className="filter-panel"><div className="filter-top"><div className="filter-label"><SlidersHorizontal size={16} /> Filtros rápidos</div><QuickRange value={filters.preset || "today"} onChange={preset => setFilters({ ...filters, preset, ...getRange(preset) })} /><button className="filter-clear" onClick={() => setFilters({ preset: "today", ...getRange("today"), search: "", sdrId: undefined, responsibleId: undefined, status: undefined, leadChannel: undefined, campaignName: undefined })}>Limpar</button></div><div className="filter-fields">{showSearch && <label className="field search-field"><Search size={16} /><input value={filters.search || ""} onChange={e => setFilters({ ...filters, search: e.target.value })} placeholder="Buscar empresa, CNPJ ou contato" /></label>}<label className="field"><span>SDR</span><select value={filters.sdrId || ""} onChange={e => setFilters({ ...filters, sdrId: e.target.value ? Number(e.target.value) : undefined })}><option value="">Todos os SDRs</option>{users.filter(user => user.active !== false).map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</select></label><label className="field"><span>Responsável</span><select value={filters.responsibleId || ""} onChange={e => setFilters({ ...filters, responsibleId: e.target.value ? Number(e.target.value) : undefined })}><option value="">Todos</option>{users.filter(user => user.active !== false).map(user => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}</select></label><label className="field"><span>Status</span><select value={filters.status || ""} onChange={e => setFilters({ ...filters, status: e.target.value || undefined })}><option value="">Todos os status</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{showTrafficFilters && <><label className="field"><span>Canal de origem</span><select value={filters.leadChannel || ""} onChange={e => setFilters({ ...filters, leadChannel: e.target.value || undefined })}><option value="">Todos os canais</option><option>Instagram</option><option>Facebook</option><option>Google</option><option>TikTok</option><option>LinkedIn</option><option>YouTube</option><option>WhatsApp</option><option>Site / busca orgânica</option><option>Indicação</option><option>Outro</option><option>Não identificado</option></select></label><label className="field"><span>Campanha</span><input value={filters.campaignName || ""} onChange={e => setFilters({ ...filters, campaignName: e.target.value || undefined })} placeholder="Nome da campanha" /></label></>}{filters.preset === "custom" && <><label className="field"><span>De</span><input type="date" value={filters.from || range.from} onChange={e => setFilters({ ...filters, from: e.target.value })} /></label><label className="field"><span>Até</span><input type="date" value={filters.to || range.to} onChange={e => setFilters({ ...filters, to: e.target.value })} /></label></>}</div></div>;
}

function KpiCard({ label, value, icon: Icon, tone, helper }: { label: string; value: string | number; icon: any; tone: string; helper?: string }) {
  return <div className={`kpi-card kpi-${tone}`}><div className="kpi-icon"><Icon size={18} /></div><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div>{helper && <div className="kpi-helper">{helper}</div>}</div>;
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) { return <div className="section-header"><h2>{title}</h2>{action}</div>; }
function EmptyState({ title, description, icon: Icon = CalendarDays }: { title: string; description: string; icon?: any }) { return <div className="empty-state"><div className="empty-icon"><Icon size={22} /></div><strong>{title}</strong><span>{description}</span></div>; }

function ExportPeriodModal({ from, to, setFrom, setTo, onClose, onExport, busy }: { from: string; to: string; setFrom: (value: string) => void; setTo: (value: string) => void; onClose: () => void; onExport: () => void; busy: boolean }) {
  return <div className="modal-backdrop"><section className="modal-card export-period-modal"><div className="modal-header"><div><p className="eyebrow">EXPORTAÇÃO</p><h2>Exportar relatório Excel</h2></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="export-period-body"><p>Escolha o período pela <strong>data do agendamento</strong>. Todas as reuniões dentro dessas datas serão incluídas na planilha.</p><div className="form-grid"><label className="form-field"><span>Data inicial</span><input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label className="form-field"><span>Data final</span><input type="date" value={to} onChange={event => setTo(event.target.value)} /></label></div></div><div className="modal-footer"><button className="button button-secondary" onClick={onClose}>Cancelar</button><button className="button button-primary" onClick={onExport} disabled={busy || !from || !to}>{busy ? "Gerando…" : "Exportar Excel"}</button></div></section></div>;
}

function exportMeetingsXlsx(rows: any[], filename: string) {
  const sheetRows = rows.map((row: any) => ({
    "ID da reunião": row.id,
    "Data do agendamento": row.data,
    "Data da ligação/contato": row.dataContato,
    "Horário": row.horario,
    "Nome da empresa": row.empresa,
    "CNPJ/CPF": row.cnpj,
    "Nome do sócio": row.contato,
    "Telefone": row.telefone,
    "E-mail / número do processo": row.emailOuProcesso,
    "SDR responsável": row.sdr,
    "E-mail do SDR": row.sdrEmail,
    "Responsável": row.responsavel,
    "E-mail do responsável": row.responsavelEmail,
    "Serviço / produto": row.servico,
    "Canal de origem do lead": row.canalOrigemLead,
    "Outro canal de origem": row.outroCanalOrigemLead,
    "Plataforma de anúncios": row.plataformaAnuncios,
    "Nome da campanha": row.nomeCampanha,
    "ID da campanha": row.idCampanha,
    "Nome do conjunto de anúncios": row.nomeConjuntoAnuncios,
    "ID do conjunto de anúncios": row.idConjuntoAnuncios,
    "Nome do anúncio": row.nomeAnuncio,
    "ID do anúncio": row.idAnuncio,
    "Origem específica do contato": row.origemEspecificaContato,
    "Outra origem do contato": row.outraOrigemContato,
    "Data de entrada do lead": row.dataEntradaLead,
    "UTM Source": row.utmSource,
    "UTM Medium": row.utmMedium,
    "UTM Campaign": row.utmCampaign,
    "UTM Content": row.utmContent,
    "UTM Term": row.utmTerm,
    "Status de qualificação": row.statusQualificacao,
    "Motivo da desqualificação": row.motivoDesqualificacao,
    "Outro motivo de desqualificação": row.outroMotivoDesqualificacao,
    "Closer da reunião": row.closer,
    "Valor do contrato": row.valorContrato,
    "Valor proposta": row.valorProposta,
    "Contrato fechado": row.contratoFechado,
    "Valor do contrato fechado": row.valorContratoFechado,
    "Quantidade de parcelas": row.quantidadeParcelas,
    "Advogado responsável pelo contrato": row.advogadoResponsavelContrato,
    "Status do cliente": row.statusCliente,
    "Status da reunião": row.status,
    "Resultado": row.resultado,
    "Próximo passo": row.proximoPasso,
    "Próximo contato": row.proximoContato,
    "Motivo do no-show": row.motivoNoShow,
    "Cliente contatado": row.clienteContatado,
    "Deseja remarcar": row.desejaRemarcar,
    "Motivo do cancelamento": row.motivoCancelamento,
    "Dívida PGFN acima de R$ 2 milhões": row.pgfnAcimaDeDoisMilhoes,
    "Valor da dívida PGFN": row.valorDividaPgfn,
    "E-mail do advogado": row.emailAdvogado,
    "Status Google Calendar": row.googleCalendarStatus,
    "Link Google Meet": row.linkGoogleMeet,
    "Convite Google enviado": row.conviteGoogleEnviado,
    "Observações": row.observacoes,
  }));
  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  worksheet["!autofilter"] = { ref: worksheet["!ref"] || "A1:A1" };
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
  worksheet["!cols"] = Array.from({ length: range.e.c + 1 }, (_, columnIndex) => {
    let width = 12;
    for (let rowIndex = range.s.r; rowIndex <= Math.min(range.e.r, 30); rowIndex += 1) {
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      width = Math.min(42, Math.max(width, String(cell?.v ?? "").length + 2));
    }
    return { wch: width };
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reuniões");
  XLSX.writeFile(workbook, filename);
}

function MeetingRow({ row, onEdit, compact = false, showPgfn = false }: { row: any; onEdit: (row: any) => void; compact?: boolean; showPgfn?: boolean }) {
  const meeting = row.meeting;
  const isPending = meeting.status === "AGENDADA" && `${meeting.date}T${meeting.time}` < new Date().toISOString().slice(0, 16);
  return <tr className={meeting.pgfnDebtOver2m ? "bonus-special-row-highlight" : ""}><td><strong>{formatDate(meeting.date)}</strong><span className="cell-subtext">{String(meeting.time).slice(0, 5)}</span></td><td><strong>{meeting.companyName}</strong>{showPgfn && meeting.pgfnDebtOver2m && <span className="bonus-pgfn-badge">🔥 R$ 2M+ PGFN</span>}<span className="cell-subtext">{meeting.cnpj}</span></td>{!compact && <><td>{meeting.contactName}<span className="cell-subtext">{meeting.phone}</span></td><td><div className="person-cell"><span className="mini-avatar">{initials(row.sdr?.name)}</span>{row.sdr?.name || "—"}</div></td><td>{row.responsible?.name || "—"}</td><td>{meeting.service}</td></>}<td><StatusBadge status={meeting.status} pending={isPending} /></td><td><button className="table-action" onClick={() => onEdit(row)}><MoreHorizontal size={18} /></button></td></tr>;
}
function DashboardPage({ user }: { user: any }) {
  const [filters, setFilters] = useState<any>({ preset: "week", ...getRange("week") });
  const userQuery = trpc.users.list.useQuery({ includeInactive: false });
  const summary = trpc.dashboard.summary.useQuery({ ...filters, preset: undefined }, { refetchInterval: 20000 });
  const [showMeeting, setShowMeeting] = useState(() => hasMeetingDraft(user));
  const [greetingNow, setGreetingNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setGreetingNow(new Date()), 60000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { const listener = () => setShowMeeting(true); window.addEventListener("villela:new-meeting", listener); return () => window.removeEventListener("villela:new-meeting", listener); }, []);
  const data: any = summary.data || { AGENDADA: 0, REALIZADA: 0, NO_SHOW: 0, CANCELADA: 0, attendanceRate: null, bySdr: [], today: [], upcoming: [] };
  const listUsers = userQuery.data || [];
  const isConcilie = user?.sectors?.some((sector: any) => sector.id === user?.activeSectorId && sector.code === "CONCILIE");
  return <><PageHeader eyebrow="VISÃO GERAL" title={`${brasilGreeting(greetingNow)}, ${(user?.name || "time").split(" ")[0]}`} description="Acompanhe a operação comercial e os próximos pontos de atenção." action={<button className="button button-primary" onClick={() => setShowMeeting(true)}><Plus size={18} /> Nova reunião</button>} />
    <div className="welcome-name">{(user?.name || "time").split(" ")[0]} <span className="muted-inline">• dados atualizados agora</span></div>
    <FilterBar filters={filters} setFilters={setFilters} users={listUsers} showTrafficFilters={user?.sectors?.some((sector: any) => sector.id === user?.activeSectorId && sector.code === "TRAFEGO_PAGO")} />
    {summary.isLoading ? <div className="loading-grid">{Array.from({ length: 6 }).map((_, i) => <div className="skeleton" key={i} />)}</div> : <div className="kpi-grid"><KpiCard label="Agendadas pendentes" value={data.AGENDADA} icon={CalendarDays} tone="blue" helper="no período" /><KpiCard label="Reuniões realizadas" value={data.REALIZADA} icon={CircleCheck} tone="green" helper="confirmadas" /><KpiCard label="No-show" value={data.NO_SHOW} icon={CircleAlert} tone="red" helper="não compareceram" /><KpiCard label="Canceladas" value={data.CANCELADA} icon={XCircle} tone="gray" helper="confirmadas" />{isConcilie && <KpiCard label="CONTRATOS FECHADOS" value={data.closedContracts || 0} icon={CircleCheck} tone="violet" helper="confirmados pela gestão" />}<KpiCard label="Comparecimento" value={data.attendanceRate === null ? "—" : `${data.attendanceRate}%`} icon={Target} tone="amber" helper="realizadas / concluídas" /></div>}
    <div className="dashboard-grid"><section className="panel panel-wide"><SectionHeader title="Reuniões de hoje" action={<Link href="/reunioes" className="text-link">Ver todas <ChevronRight size={15} /></Link>} />{data.today?.length ? <div className="table-wrap"><table className="compact-table"><thead><tr><th>Horário</th><th>Empresa</th><th>SDR</th><th>Status</th><th /></tr></thead><tbody>{data.today.map((row: any) => <tr key={row.meeting.id}><td><strong>{String(row.meeting.time).slice(0, 5)}</strong></td><td><strong>{row.meeting.companyName}</strong><span className="cell-subtext">{row.meeting.contactName}</span></td><td>{row.sdrName || "—"}</td><td><StatusBadge status={row.meeting.status} /></td><td><button className="table-action" onClick={() => setShowMeeting(row)}><ChevronRight size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState title="Agenda livre por aqui" description="Nenhuma reunião encontrada com os filtros atuais." />}</section><section className="panel"><SectionHeader title="Volume por SDR" action={<Link href="/sdrs" className="text-link">Detalhes <ChevronRight size={15} /></Link>} />{data.bySdr?.length ? <div className="sdr-bars">{data.bySdr.slice(0, 6).map((item: any) => <div className="sdr-bar-row" key={item.name}><div className="sdr-bar-meta"><span>{item.name}</span><strong>{item.total}</strong></div><div className="bar-track"><span style={{ width: `${Math.max(10, (item.total / Math.max(...data.bySdr.map((entry: any) => entry.total))) * 100)}%` }} /></div><div className="sdr-bar-foot"><span>{item.realized} realizadas</span><span>{item.noShow} no-show</span></div></div>)}</div> : <EmptyState title="Sem dados por SDR" description="Ajuste o período para visualizar o volume." icon={Users} />}</section></div>
    <section className="panel"><SectionHeader title="Próximas reuniões" action={<Link href="/calendario" className="text-link">Abrir calendário <ChevronRight size={15} /></Link>} />{data.upcoming?.length ? <div className="upcoming-grid">{data.upcoming.slice(0, 4).map((row: any) => <div className="upcoming-card" key={row.meeting.id}><div className="upcoming-date"><strong>{formatShortDate(row.meeting.date)}</strong><span>{String(row.meeting.time).slice(0, 5)}</span></div><div><strong>{row.meeting.companyName}</strong><span>{row.meeting.contactName} · {row.sdrName || "Sem SDR"}</span></div><StatusBadge status={row.meeting.status} /></div>)}</div> : <EmptyState title="Nenhuma próxima reunião" description="Os novos agendamentos aparecerão aqui." />}</section>
    {showMeeting && <MeetingModal user={user} initial={showMeeting === true ? undefined : showMeeting} users={listUsers} onClose={() => setShowMeeting(false)} />}
  </>;
}

function MeetingsPage({ user }: { user: any }) {
  const [filters, setFilters] = useState<any>({ preset: "month", ...getRange("month"), search: "" });
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState(() => getRange("month").from);
  const [exportTo, setExportTo] = useState(() => getRange("month").to);
  const [editing, setEditing] = useState<any>(() => hasMeetingDraft(user) ? true : null);
  const users = trpc.users.list.useQuery({ includeInactive: false });
  const query = trpc.meetings.list.useQuery({ ...filters, preset: undefined, page, pageSize: 12 });
  const exportRows = trpc.reports.exportRows.useQuery({ from: exportFrom, to: exportTo, exportByContactDate: false }, { enabled: false });
  const exportXlsx = async () => { if (exportFrom > exportTo) return toast.error("A data inicial não pode ser posterior à data final."); const result = await exportRows.refetch(); const rows = result.data || []; exportMeetingsXlsx(rows, `villela-sdr-reunioes-${exportFrom}-a-${exportTo}.xlsx`); setExportOpen(false); toast.success(`${rows.length} reuniões exportadas em planilha Excel.`); };
  useEffect(() => { const listener = () => setEditing(true); window.addEventListener("villela:new-meeting", listener); return () => window.removeEventListener("villela:new-meeting", listener); }, []);
  const totalPages = Math.max(1, Math.ceil((query.data?.total || 0) / 12));
  return <><PageHeader eyebrow="OPERAÇÃO" title="Reuniões" description="Cadastre, acompanhe e registre o resultado de cada agenda." action={<button className="button button-primary" onClick={() => setEditing(true)}><Plus size={18} /> Nova reunião</button>} /><FilterBar filters={filters} setFilters={value => { setFilters(value); setPage(1); }} users={users.data || []} showSearch showTrafficFilters={user?.sectors?.some((sector: any) => sector.id === user?.activeSectorId && sector.code === "TRAFEGO_PAGO")} /><section className="panel table-panel"><div className="panel-toolbar"><div><strong>{query.data?.total ?? 0} reuniões</strong><span className="toolbar-note">no período selecionado</span></div><button className="button button-secondary button-compact" onClick={() => setExportOpen(true)}><Download size={15} /> Exportar Excel</button></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Data / horário</th><th>Empresa</th><th>Contato</th><th>SDR</th><th>Responsável</th><th>Serviço</th><th>Status</th><th /></tr></thead><tbody>{query.isLoading ? <tr><td colSpan={8}><div className="table-loading">Carregando reuniões…</div></td></tr> : query.data?.items.length ? query.data.items.map((row: any) => <MeetingRow key={row.meeting.id} row={row} onEdit={setEditing} showPgfn={user?.sectors?.some((sector: any) => sector.id === user?.activeSectorId && sector.code === "PROJURIS_2")} />) : <tr><td colSpan={8}><EmptyState title="Nenhuma reunião encontrada" description="Tente ajustar os filtros ou cadastre uma nova reunião." /></td></tr>}</tbody></table></div><div className="pagination"><span>Página {page} de {totalPages}</span><div><button className="icon-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} /></button><button className="icon-button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}><ChevronRight size={16} /></button></div></div></section>{exportOpen && <ExportPeriodModal from={exportFrom} to={exportTo} setFrom={setExportFrom} setTo={setExportTo} onClose={() => setExportOpen(false)} onExport={exportXlsx} busy={exportRows.isFetching} />}{editing && <MeetingModal user={user} initial={editing === true ? undefined : editing} users={users.data || []} onClose={() => { setEditing(null); query.refetch(); }} />}</>;
}

function CalendarPage({ user }: { user: any }) {
  const [cursor, setCursor] = useState(new Date());
  const [mode, setMode] = useState("month");
  const [editing, setEditing] = useState<any>(null);
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const from = new Date(cursor.getFullYear(), cursor.getMonth(), 1).toISOString().slice(0, 10);
  const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).toISOString().slice(0, 10);
  const meetings = trpc.meetings.list.useQuery({ from, to, page: 1, pageSize: 10000 });
  const users = trpc.users.list.useQuery({ includeInactive: false });
  const cells: Array<number | null> = [...Array.from({ length: (start.getDay() || 7) - 1 }, () => null), ...Array.from({ length: end.getDate() }, (_, i) => i + 1)];
  const byDay = new Map<string, any[]>(); (meetings.data?.items || []).forEach((row: any) => { const key = String(row.meeting.date).slice(0, 10); byDay.set(key, [...(byDay.get(key) || []), row]); });
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(cursor);
  return <><PageHeader eyebrow="AGENDA VISUAL" title="Calendário" description="Todas as reuniões cadastradas no mês selecionado aparecem aqui." action={<button className="button button-primary" onClick={() => setEditing(true)}><Plus size={18} /> Nova reunião</button>} /><section className="panel calendar-panel"><div className="calendar-toolbar"><div className="calendar-nav"><button className="icon-button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><ChevronLeft size={16} /></button><strong>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</strong><button className="icon-button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><ChevronRight size={16} /></button><button className="button button-secondary button-compact" onClick={() => setCursor(new Date())}>Hoje</button></div><div className="view-toggle">{["day", "week", "month"].map(item => <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item === "day" ? "Dia" : item === "week" ? "Semana" : "Mês"}</button>)}</div></div><div className="calendar-legend"><span><i className="legend-dot dot-blue" /> Agendada</span><span><i className="legend-dot dot-green" /> Realizada</span><span><i className="legend-dot dot-red" /> No-show</span></div>{mode === "month" ? <div className="calendar-grid"><div className="calendar-weekdays">{["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(day => <span key={day}>{day}</span>)}</div><div className="calendar-days">{cells.map((day, index) => { const key = day ? `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` : `blank-${index}`; const rows = day ? byDay.get(key) || [] : []; return <div className={`calendar-cell ${day === new Date().getDate() && cursor.getMonth() === new Date().getMonth() ? "calendar-today" : ""}`} key={key}>{day && <><span className="calendar-day-number">{day}</span><div className="calendar-events">{rows.map((row: any) => <button key={row.meeting.id} className={`calendar-event ${statusClasses[row.meeting.status] || ""}`} onClick={() => setEditing(row)}><span>{String(row.meeting.time).slice(0, 5)}</span> {row.meeting.companyName}</button>)}</div></>}</div>; })}</div></div> : <div className="calendar-list-view">{(meetings.data?.items || []).length ? meetings.data?.items.map((row: any) => <button className="calendar-list-row" key={row.meeting.id} onClick={() => setEditing(row)}><span className="calendar-list-date">{formatDate(row.meeting.date)}<strong>{String(row.meeting.time).slice(0, 5)}</strong></span><span><strong>{row.meeting.companyName}</strong><small>{row.meeting.contactName} · {row.sdr?.name || "Sem SDR"}</small></span><StatusBadge status={row.meeting.status} /></button>) : <EmptyState title="Sem reuniões neste período" description="A agenda está livre para novos agendamentos." />}</div>}</section>{editing && <MeetingModal user={user} initial={editing === true ? undefined : editing} users={users.data || []} onClose={() => { setEditing(null); meetings.refetch(); }} />}</>;
}

function SdrsPage({ user }: { user: any }) {
  const [filters, setFilters] = useState<any>({ preset: "month", ...getRange("month") });
  const users = trpc.users.list.useQuery({ includeInactive: isManagement(user?.role) });
  const indicators = trpc.reports.indicators.useQuery({ ...filters, preset: undefined });
  return <><PageHeader eyebrow="PERFORMANCE OPERACIONAL" title="SDRs" description="Indicadores objetivos de volume e comparecimento." action={isMaster(user?.role) ? <button className="button button-secondary"><UserCog size={17} /> Gerenciar acessos</button> : undefined} /><FilterBar filters={filters} setFilters={setFilters} users={users.data || []} showTrafficFilters={user?.sectors?.some((sector: any) => sector.id === user?.activeSectorId && sector.code === "TRAFEGO_PAGO")} /><section className="panel table-panel"><div className="panel-toolbar"><div><strong>Indicadores por SDR</strong><span className="toolbar-note">sem rankings subjetivos</span></div><div className="table-caption">{users.data?.length || 0} usuários ativos</div></div><div className="table-wrap"><table className="data-table indicators-table"><thead><tr><th>SDR</th><th>Total de agendamentos</th><th>Pendentes</th><th>Realizadas</th><th>No-show</th><th>Canceladas</th><th>Comparecimento</th><th>Dias com contato</th><th>Ticket médio/dia</th></tr></thead><tbody>{indicators.data?.length ? indicators.data.map((item: any) => <tr key={item.id}><td><div className="person-cell"><UserAvatar user={item} className="settings-user-avatar" /><strong>{item.name}</strong></div></td><td>{item.totalAgendamentos}</td><td>{item.pendentes}</td><td className="text-green">{item.realizadas}</td><td className="text-red">{item.noShow}</td><td>{item.canceladas}</td><td><strong>{item.taxaComparecimento === null ? "—" : `${item.taxaComparecimento}%`}</strong></td><td>{item.diasComContato || 0}</td><td><strong>{item.ticketMedioAgendamentosDia === null ? "—" : item.ticketMedioAgendamentosDia.toFixed(2)}</strong></td></tr>) : <tr><td colSpan={10}><EmptyState title="Sem indicadores no período" description="Ajuste os filtros para visualizar os SDRs." /></td></tr>}</tbody></table></div></section></>;
}

function ReportsPage({ user }: { user: any }) {
  const [filters, setFilters] = useState<any>({ preset: "month", ...getRange("month") });
  const [selectedSdr, setSelectedSdr] = useState<any>(null);
  const [contactDate, setContactDate] = useState("");
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const users = trpc.users.list.useQuery({ includeInactive: false });
  const indicators = trpc.reports.indicators.useQuery({ ...filters, preset: undefined });
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "totalAgendamentos", direction: "desc" });
  const sortedIndicators = useMemo(() => [...(indicators.data || [])].sort((a: any, b: any) => {
    const av = a[sort.key] ?? -Infinity;
    const bv = b[sort.key] ?? -Infinity;
    return (av - bv) * (sort.direction === "asc" ? 1 : -1);
  }), [indicators.data, sort]);
  const sortHeader = (key: string, label: string) => <button className="sort-header" onClick={() => setSort(current => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }))}>{label}<span>{sort.key === key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button>;
  const detail = trpc.reports.sdrDetail.useQuery({ sdrId: selectedSdr?.id || 0, contactDate: contactDate || null }, { enabled: Boolean(selectedSdr) });
  const exportRows = trpc.reports.exportRows.useQuery({ ...filters, preset: undefined }, { enabled: false });
  const exportXlsx = async () => { const result = await exportRows.refetch(); const rows = result.data || []; exportMeetingsXlsx(rows, `villela-sdr-relatorio-${isoToday()}.xlsx`); toast.success(`${rows.length} reuniões exportadas em planilha Excel.`); };
  const detailRows = detail.data?.items || [];
  const dailyRows = useMemo(() => { const groups = new Map<string, any[]>(); detailRows.forEach((row: any) => { const key = row.meeting.contactDate || "SEM_DATA"; groups.set(key, [...(groups.get(key) || []), row]); }); return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])); }, [detailRows]);
  const openSdr = (item: any) => { setSelectedSdr(item); setContactDate(""); };
  if (selectedSdr) return <><PageHeader eyebrow="ANÁLISE · SDR" title={selectedSdr.name} description="Agendamentos agrupados pela data da ligação/contato." action={<button className="button button-secondary" onClick={() => { setSelectedSdr(null); setContactDate(""); }}><ChevronLeft size={17} /> Voltar para SDRs</button>} /><section className="panel detail-filter-panel"><div className="panel-toolbar"><div><strong>Filtro por data da ligação/contato</strong><span className="toolbar-note">Escolha um dia para ver somente os agendamentos registrados naquele contato.</span></div><label className="field"><span>Data da ligação/contato</span><input type="date" value={contactDate} onChange={event => setContactDate(event.target.value)} /></label></div><div className="report-kpi-row"><div className="report-highlight report-highlight-blue"><span>Total de agendamentos{contactDate ? " no dia" : ""}</span><strong>{detailRows.length}</strong><small>{contactDate ? formatDate(contactDate) : "todos os dias"}</small></div><div className="report-highlight"><span>Dias com agendamento</span><strong>{dailyRows.length}</strong><small>pela data da ligação/contato</small></div></div></section>{!contactDate && <section className="panel table-panel"><SectionHeader title="Total de agendamentos por dia" action={<span className="table-caption">Clique em uma data para filtrar</span>} /><div className="table-wrap"><table className="data-table"><thead><tr><th>Data da ligação/contato</th><th>Total de agendamentos</th><th /></tr></thead><tbody>{dailyRows.length ? dailyRows.map(([day, rows]) => <tr key={day} className="clickable-row" onClick={() => day !== "SEM_DATA" && setContactDate(day)}><td><strong>{day === "SEM_DATA" ? "Sem data informada" : formatDate(day)}</strong></td><td>{rows.length}</td><td><ChevronRight size={16} /></td></tr>) : <tr><td colSpan={3}><EmptyState title="Nenhum agendamento" description="Não há agendamentos para este SDR nos filtros atuais." /></td></tr>}</tbody></table></div></section>}<section className="panel table-panel"><SectionHeader title={contactDate ? `Agendamentos de ${formatDate(contactDate)}` : "Agendamentos do SDR"} action={<span className="table-caption">Clique na empresa para abrir os detalhes</span>} /><div className="table-wrap"><table className="data-table"><thead><tr><th>Data da ligação/contato</th><th>Data da reunião</th><th>Horário</th><th>Empresa</th><th>Status</th></tr></thead><tbody>{detailRows.length ? detailRows.map((row: any) => <tr key={row.meeting.id} className="clickable-row" onClick={() => setSelectedMeeting(row)}><td>{row.meeting.contactDate ? formatDate(row.meeting.contactDate) : "—"}</td><td>{formatDate(row.meeting.date)}</td><td>{String(row.meeting.time).slice(0, 5)}</td><td><strong>{row.meeting.companyName}</strong><span className="cell-subtext">{row.meeting.contactName}</span></td><td><StatusBadge status={row.meeting.status} /></td></tr>) : <tr><td colSpan={5}><EmptyState title="Nenhum agendamento encontrado" description="Altere a data da ligação/contato ou os filtros." /></td></tr>}</tbody></table></div></section>{selectedMeeting && <MeetingModal user={user} initial={selectedMeeting} users={users.data || []} onClose={() => { setSelectedMeeting(null); detail.refetch(); }} />}</>;
  return <><PageHeader eyebrow="ANÁLISE" title="Relatórios" description="O total e os status consideram todas as reuniões do período; dias e ticket médio usam a data da ligação/contato. Clique no SDR para detalhar." action={<button className="button button-primary" onClick={exportXlsx} disabled={exportRows.isFetching}><Download size={17} /> {exportRows.isFetching ? "Gerando…" : "Exportar Excel"}</button>} /><FilterBar filters={filters} setFilters={setFilters} users={users.data || []} showTrafficFilters={user?.sectors?.some((sector: any) => sector.id === user?.activeSectorId && sector.code === "TRAFEGO_PAGO")} /><div className="report-kpi-row"><div className="report-highlight report-highlight-blue"><span>Total de agendamentos</span><strong>{indicators.data?.reduce((sum: number, item: any) => sum + item.totalAgendamentos, 0) || 0}</strong><small>todos os status no período</small></div><div className="report-highlight"><span>Agendamentos pendentes</span><strong>{indicators.data?.reduce((sum: number, item: any) => sum + item.pendentes, 0) || 0}</strong><small>ainda com status agendada</small></div><div className="report-highlight report-highlight-green"><span>Realizadas</span><strong>{indicators.data?.reduce((sum: number, item: any) => sum + item.realizadas, 0) || 0}</strong><small>confirmadas</small></div><div className="report-highlight report-highlight-amber"><span>No-show</span><strong>{indicators.data?.reduce((sum: number, item: any) => sum + item.noShow, 0) || 0}</strong><small>não compareceram</small></div></div><section className="panel table-panel"><SectionHeader title="Detalhamento por SDR" action={<span className="table-caption">Clique no nome para abrir a subaba diária</span>} /><div className="table-wrap"><table className="data-table"><thead><tr><th>SDR</th><th>{sortHeader("totalAgendamentos", "Total de agendamentos")}</th><th>{sortHeader("pendentes", "Pendentes")}</th><th>{sortHeader("realizadas", "Realizadas")}</th><th>{sortHeader("noShow", "No-show")}</th><th>{sortHeader("canceladas", "Canceladas")}</th><th>{sortHeader("taxaComparecimento", "Taxa")}</th><th>{sortHeader("diasComContato", "Dias com contato")}</th><th>{sortHeader("ticketMedioAgendamentosDia", "Ticket médio/dia")}</th></tr></thead><tbody>{sortedIndicators.map((item: any) => <tr key={item.id} className="clickable-row" onClick={() => openSdr(item)}><td><strong>{item.name}</strong></td><td>{item.totalAgendamentos}</td><td>{item.pendentes}</td><td>{item.realizadas}</td><td>{item.noShow}</td><td>{item.canceladas}</td><td><strong>{item.taxaComparecimento === null ? "—" : `${item.taxaComparecimento}%`}</strong></td><td>{item.diasComContato || 0}</td><td><strong>{item.ticketMedioAgendamentosDia === null ? "—" : item.ticketMedioAgendamentosDia.toFixed(2)}</strong></td></tr>)}</tbody></table></div></section></>;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}
function recentMonthKeys() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => { const date = new Date(now.getFullYear(), now.getMonth() - index, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; });
}
function RankingPage({ user }: { user: any }) {
  const sector = user?.sectors?.find((item: any) => item.id === user?.activeSectorId);
  const isProjuris = sector?.code === "PROJURIS_2";
  const isConcilie = sector?.code === "CONCILIE";
  const allowed = isProjuris || isConcilie;
  const [monthKey, setMonthKey] = useState(recentMonthKeys()[0]);
  const [selectedSdr, setSelectedSdr] = useState("TODOS");
  const [fullScreen, setFullScreen] = useState(false);
  const summary = trpc.ranking.summary.useQuery({ monthKey }, { enabled: allowed, refetchInterval: 15000 });
  const data = summary.data as any;
  const rows = (data?.rows || []).filter((row: any) => selectedSdr === "TODOS" || String(row.id) === selectedSdr);
  const allRows = data?.rows || [];
  const [first, second, third] = allRows;
  const maxRealized = Math.max(1, ...allRows.map((row: any) => isConcilie ? row.closedContracts : row.realized));
  const evolution = data?.evolution || [];
  const evolutionValues = evolution.map((point: any) => Object.entries(point.values || {}).filter(([id]) => selectedSdr === "TODOS" || id === selectedSdr).reduce((sum, [, value]) => sum + Number(value), 0));
  const maxEvolution = Math.max(1, ...evolutionValues);
  useEffect(() => { document.body.classList.toggle("ranking-fullscreen-active", fullScreen); return () => document.body.classList.remove("ranking-fullscreen-active"); }, [fullScreen]);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setFullScreen(false); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  if (!allowed) return <AccessDeniedPage />;
  const money = (value: number) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const podium = [{ label: "2º", row: second, tone: "silver" }, { label: "1º", row: first, tone: "gold" }, { label: "3º", row: third, tone: "bronze" }];
  return <section className={`ranking-page ${fullScreen ? "ranking-fullscreen" : ""}`}>
    <PageHeader eyebrow={`${isProjuris ? "PROJURIS" : "CONCILIE"} · PLACAR DE PERFORMANCE`} title={`🏆 Ranking ${isProjuris ? "PROJURIS" : "CONCILIE"}`} description={`Quem vai terminar o mês no topo do ${isProjuris ? "PROJURIS" : "CONCILIE"}? A posição é definida pelas reuniões realizadas e critérios de desempate do setor.`} action={<div className="ranking-actions"><label className="month-picker"><span>Competência</span><select value={monthKey} onChange={event => setMonthKey(event.target.value)}>{recentMonthKeys().map(key => <option key={key} value={key}>{monthLabel(key)}</option>)}</select></label><button className="button button-primary" onClick={() => setFullScreen(value => !value)}>{fullScreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}{fullScreen ? "Sair da tela cheia" : "Tela cheia"}</button></div>} />
    <div className="ranking-live-strip"><span className="live-dot" /> {data?.status === "FECHADA" ? `${monthLabel(monthKey)} · FINALIZADO` : `${monthLabel(monthKey)} · RANKING AO VIVO`}<span className="ranking-refresh">Atualização automática a cada 15s</span></div>
    <section className="ranking-podium panel">{podium.map(slot => <div key={slot.label} className={`podium-card podium-${slot.tone}`}>{slot.row ? <><span className="podium-place">{slot.label}</span><UserAvatar user={slot.row} className="podium-avatar" /><strong>{slot.row.name || slot.row.email || "Sem nome"}</strong><b>{isConcilie ? `${slot.row.closedContracts} contratos fechados` : `${slot.row.realized} realizadas`}</b></> : <><span className="podium-place">{slot.label}</span><div className="podium-empty">—</div><strong>Aguardando resultados</strong><b>{isConcilie ? "0 contratos fechados" : "0 realizadas"}</b></>}</div>)}</section>
    <div className={`ranking-kpis ${isProjuris ? "" : "ranking-kpis-concilie"}`}><div className="ranking-kpi"><span>Reuniões agendadas</span><strong>{data?.totals?.scheduled || 0}</strong></div><div className="ranking-kpi ranking-kpi-green"><span>Reuniões realizadas</span><strong>{data?.totals?.realized || 0}</strong></div><div className="ranking-kpi ranking-kpi-amber"><span>Não realizadas</span><strong>{data?.totals?.noShow || 0}</strong></div>{isProjuris && <><div className="ranking-kpi ranking-kpi-gold"><span>Empresas &gt; R$ 2M</span><strong>{data?.totals?.specialMeetings || 0}</strong></div><div className="ranking-kpi ranking-kpi-violet"><span>Bonificações</span><strong>{money(data?.totals?.bonus || 0)}</strong></div></>}{isConcilie && <div className="ranking-kpi ranking-kpi-violet"><span>Contratos fechados</span><strong>{data?.totals?.closedContracts || 0}</strong></div>}</div>
    <section className="ranking-columns"><div className="panel ranking-table-panel"><div className="panel-toolbar"><div><strong>Ranking completo</strong><span className="toolbar-note">{isProjuris ? "Critérios: realizadas · PGFN acima de R$ 2M · agendadas · menor no-show" : "Critérios: realizadas · contratos fechados · agendadas · menor no-show"}</span></div><select className="inline-select ranking-sdr-filter" value={selectedSdr} onChange={event => setSelectedSdr(event.target.value)}><option value="TODOS">Todos os SDRs</option>{allRows.map((row: any) => <option key={row.id} value={row.id}>{row.name || row.email}</option>)}</select></div><div className="table-wrap"><table className="data-table ranking-table"><thead><tr><th>Pos.</th><th>SDR</th><th>Realizadas</th>{isConcilie && <th>Contratos fechados</th>}<th>Agendadas</th><th>Taxa</th>{isProjuris && <th>&gt; R$ 2M</th>}<th>Distância</th></tr></thead><tbody>{rows.length ? rows.map((row: any) => <tr key={row.id} className={row.position <= 3 ? `ranking-row-${row.position}` : ""}><td><strong>{`${row.position}º`}</strong></td><td><div className="person-cell"><UserAvatar user={row} className="ranking-mini-avatar" /><strong>{row.name || row.email}</strong></div></td><td className="ranking-realized">{row.realized}</td>{isConcilie && <td>{row.closedContracts}</td>}<td>{row.scheduled}</td><td>{row.rate === null ? "—" : `${row.rate}%`}</td>{isProjuris && <td>{row.specialMeetings}</td>}<td>{row.distanceToLeader ? `${row.distanceToLeader} atrás` : "Líder"}</td></tr>) : <tr><td colSpan={isProjuris ? 7 : isConcilie ? 7 : 6}><EmptyState title="Nenhum SDR encontrado" description={`Os SDRs ativos do ${isProjuris ? "PROJURIS" : "CONCILIE"} aparecem aqui automaticamente.`} /></td></tr>}</tbody></table></div></div><div className="ranking-side-column"><section className="panel ranking-bars"><SectionHeader title={isConcilie ? "Contratos fechados por SDR" : "Realizadas por SDR"} /><div className="ranking-bar-list">{rows.map((row: any) => <div className="ranking-bar-item" key={row.id}><div><span>{row.name || row.email}</span><b>{isConcilie ? row.closedContracts : row.realized}</b></div><i><em style={{ width: `${Math.round(((isConcilie ? row.closedContracts : row.realized) / maxRealized) * 100)}%` }} /></i></div>)}</div></section>{isConcilie ? <section className="panel ranking-bars"><SectionHeader title="Realizadas por SDR" /><div className="ranking-bar-list">{rows.map((row: any) => <div className="ranking-bar-item" key={row.id}><div><span>{row.name || row.email}</span><b>{row.realized}</b></div><i><em style={{ width: `${Math.round((row.realized / Math.max(1, ...rows.map((item: any) => item.realized))) * 100)}%` }} /></i></div>)}</div></section> : <section className="panel ranking-evolution"><SectionHeader title="Evolução no mês" /><svg viewBox="0 0 100 120" preserveAspectRatio="none" role="img" aria-label="Evolução de reuniões realizadas"><polyline points={evolutionValues.map((value: number, index: number) => `${evolutionValues.length === 1 ? 50 : (index * 100) / Math.max(1, evolutionValues.length - 1)},${110 - (value / maxEvolution) * 90}`).join(" ")} /></svg><div className="evolution-caption"><span>{evolution[0]?.date ? formatShortDate(evolution[0].date) : "Início"}</span><span>{evolution.at(-1)?.date ? formatShortDate(evolution.at(-1).date) : "Hoje"}</span></div></section>}</div></section>
  </section>;
}
function LawyersPage({ user }: { user: any }) {
  const allowed = isMaster(user?.role);
  const lawyers = trpc.lawyers.list.useQuery({ includeInactive: allowed }, { enabled: allowed });
  const create = trpc.lawyers.create.useMutation({ onSuccess: () => { toast.success("Advogado cadastrado."); setName(""); setEmail(""); lawyers.refetch(); }, onError: error => toast.error(error.message) });
  const update = trpc.lawyers.update.useMutation({ onSuccess: () => { toast.success("Cadastro atualizado."); lawyers.refetch(); }, onError: error => toast.error(error.message) });
  const sendInvite = trpc.lawyers.sendInvite.useMutation({ onSuccess: () => { toast.success("Convite enviado por e-mail."); lawyers.refetch(); }, onError: error => toast.error(error.message) });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [disconnecting, setDisconnecting] = useState<number | null>(null);
  const connectionState = (lawyer: any) => {
    if (lawyer.connection?.status === "CONNECTED") return "CONNECTED";
    if (lawyer.connection?.status === "ERROR" || lawyer.invite?.status === "ERROR" || lawyer.invite?.lastError) return "ERROR";
    if (lawyer.invite?.status === "PENDING" && new Date(lawyer.invite.expiresAt).getTime() > Date.now()) return "PENDING";
    return "NOT_CONNECTED";
  };
  const disconnect = async (id: number) => { if (!window.confirm("Desconectar a Google Agenda deste advogado?")) return; setDisconnecting(id); try { const response = await fetch("/api/google-calendar/lawyer-disconnect", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lawyerId: id }) }); if (!response.ok) throw new Error(); toast.success("Google Agenda desconectada."); lawyers.refetch(); } catch { toast.error("Não foi possível desconectar a agenda."); } finally { setDisconnecting(null); } };
  if (!allowed) return <><PageHeader eyebrow="ADMINISTRAÇÃO" title="Advogados" description="Área exclusiva do MASTER." /><section className="panel"><EmptyState title="Acesso restrito" description="Somente o MASTER pode cadastrar advogados e enviar convites." icon={ShieldCheck} /></section></>;
  return <><PageHeader eyebrow="INTEGRAÇÃO · MASTER" title="Advogados" description="Cadastre os closers e envie um convite para cada advogado autorizar a própria Google Agenda." /><section className="panel invite-panel"><div className="panel-toolbar"><div><strong>Novo advogado</strong><span className="toolbar-note">O advogado não recebe login do sistema; ele apenas autoriza a integração pelo e-mail.</span></div></div><form className="invite-form" onSubmit={event => { event.preventDefault(); create.mutate({ name, email }); }}><input value={name} onChange={event => setName(event.target.value)} placeholder="Nome do advogado" required /><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="advogado@empresa.com" required /><button className="button button-primary" disabled={create.isPending}>Cadastrar advogado</button></form></section><section className="panel table-panel"><div className="panel-toolbar"><div><strong>Advogados cadastrados</strong><span className="toolbar-note">O convite é individual, temporário e pode ser reenviado enquanto a conexão não for concluída.</span></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Nome</th><th>E-mail</th><th>Status Google Calendar</th><th>Ações</th></tr></thead><tbody>{(lawyers.data || []).map((lawyer: any) => { const state = connectionState(lawyer); return <tr key={lawyer.id}><td><input className="inline-name-input" defaultValue={lawyer.name} onBlur={event => { const value = event.currentTarget.value.trim(); if (value && value !== lawyer.name) update.mutate({ id: lawyer.id, name: value }); }} /></td><td><input className="inline-name-input" defaultValue={lawyer.email} type="email" onBlur={event => { const value = event.currentTarget.value.trim().toLowerCase(); if (value && value !== lawyer.email) update.mutate({ id: lawyer.id, email: value }); }} /></td><td>{state === "CONNECTED" ? <><span className="status-badge status-done">🟢 Google Calendar conectado</span><span className="cell-subtext">{lawyer.connection.googleAccountEmail} · {lawyer.connection.lastConnectedAt ? `Conectado em ${formatDate(String(lawyer.connection.lastConnectedAt))}` : "conectado"}</span></> : state === "PENDING" ? <><span className="status-badge status-pending">🟡 Convite enviado</span><span className="cell-subtext">Enviado em {lawyer.invite.sentAt ? formatDate(String(lawyer.invite.sentAt)) : "—"}</span></> : state === "ERROR" ? <><span className="status-badge status-cancelled">⚠️ Problema na conexão</span><span className="cell-subtext">{lawyer.invite?.lastError || lawyer.connection?.lastError || "Conexão precisa ser renovada"}</span></> : <span className="status-badge">🔴 Google Calendar não conectado</span>}</td><td><div className="settings-user-actions">{state === "CONNECTED" ? <><button className="button button-secondary button-compact" onClick={() => toast.info("O advogado pode ser reconectado com um novo convite após desconectar a conexão atual.")}>Gerenciar</button><button className="button button-danger button-compact" disabled={disconnecting === lawyer.id} onClick={() => disconnect(lawyer.id)}>{disconnecting === lawyer.id ? "Desconectando…" : "Desconectar"}</button></> : <button className="button button-primary button-compact" disabled={sendInvite.isPending} onClick={() => sendInvite.mutate({ id: lawyer.id })}>{state === "PENDING" ? "Reenviar convite" : state === "ERROR" ? "Enviar novo convite" : "Enviar convite"}</button>}<button className="button button-secondary button-compact" onClick={() => update.mutate({ id: lawyer.id, active: !lawyer.active })}>{lawyer.active ? "Desativar" : "Reativar"}</button></div></td></tr>; })}</tbody></table></div></section></>;
}
function ProfilePage({ user }: { user: any }) {
  const profile = trpc.profile.get.useQuery();
  const update = trpc.profile.updateAvatar.useMutation({ onSuccess: () => { toast.success("Foto de perfil atualizada"); window.location.reload(); }, onError: error => toast.error(error.message) });
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const avatarUrl = previewUrl !== undefined ? previewUrl : (profile.data?.avatarUrl || user?.avatarUrl || null);
  const sector = user?.sectors?.find((item: any) => item.id === user?.activeSectorId);
  const googleCalendar = profile.data?.googleCalendar;
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("google");
    if (!result) return;
    if (result === "connected") toast.success("Google Agenda conectada com sucesso!");
    else if (result === "cancelled") toast.info("A autorização foi cancelada. A Google Agenda continua não conectada.");
    else if (result === "not_configured") toast.error("A integração Google ainda não está configurada no Google Cloud Console.");
    else toast.error("Não foi possível conectar sua Google Agenda. Tente novamente.");
    profile.refetch();
    window.history.replaceState({}, "", "/perfil");
  }, [profile]);
  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith("image/")) return toast.error("Selecione um arquivo de imagem."); if (file.size > 2 * 1024 * 1024) return toast.error("A imagem deve ter no máximo 2 MB."); const reader = new FileReader(); reader.onload = () => { const value = String(reader.result); setPreviewUrl(value); update.mutate({ avatarUrl: value }); }; reader.readAsDataURL(file); };
  const connectGoogle = () => { setConnecting(true); window.location.assign("/api/google-calendar/connect"); };
  const disconnectGoogle = async () => { if (!window.confirm("Tem certeza que deseja desconectar sua Google Agenda?")) return; setDisconnecting(true); try { const response = await fetch("/api/google-calendar/disconnect", { method: "POST", credentials: "include" }); if (!response.ok) throw new Error(); toast.success("Google Agenda desconectada."); await profile.refetch(); } catch { toast.error("Não foi possível desconectar sua Google Agenda."); } finally { setDisconnecting(false); } };
  return <><PageHeader eyebrow="IDENTIDADE" title="Meu perfil" description="Gerencie sua identidade e prepare sua Google Agenda para futuras integrações de reuniões." /><section className="profile-layout"><section className="panel profile-panel"><div className="profile-preview"><UserAvatar user={{ ...user, avatarUrl }} className="profile-large-avatar" /><div><strong>{user?.name || user?.email}</strong><span>{displayRole(user?.role, sector?.name)}</span></div></div><div className="profile-actions"><label className="button button-primary"><Upload size={17} /> {avatarUrl ? "Substituir foto" : "Enviar foto"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} hidden /></label>{avatarUrl && <button className="button button-danger" onClick={() => update.mutate({ avatarUrl: null })} disabled={update.isPending}>Remover foto</button>}<small>PNG, JPG ou WebP · máximo de 2 MB. Sem foto, seu avatar emoji continua ativo.</small></div></section><section className="panel profile-info-card"><div className="profile-section-heading"><div><p className="eyebrow">DADOS DA CONTA</p><h2>Informações do usuário</h2></div></div><div className="profile-info-grid"><div><span>Nome</span><strong>{user?.name || "Não informado"}</strong></div><div><span>E-mail</span><strong>{user?.email || "Não informado"}</strong></div><div><span>Setor</span><strong>{sector?.name || "Não informado"}</strong></div><div><span>Cargo</span><strong>{displayRole(user?.role, sector?.name)}</strong></div></div></section><section className="panel google-calendar-card"><div className="profile-section-heading"><div><p className="eyebrow">INTEGRAÇÃO</p><h2><CalendarDays size={20} /> Google Agenda</h2></div><span className={`google-status ${googleCalendar ? "connected" : "disconnected"}`}>{googleCalendar ? "🟢 Conectado" : "🔴 Não conectado"}</span></div><p className="google-calendar-description">Conecte sua conta Google para permitir que o sistema utilize sua Google Agenda em futuras integrações de reuniões.</p>{googleCalendar ? <div className="google-connected-state"><div><span>Conta Google</span><strong>{googleCalendar.email}</strong></div><button className="button button-danger" onClick={disconnectGoogle} disabled={disconnecting}>{disconnecting ? "Desconectando…" : "Desconectar Google Agenda"}</button></div> : <button className="button google-connect-button" onClick={connectGoogle} disabled={connecting}><CalendarDays size={17} />{connecting ? "Conectando sua Google Agenda…" : "Conectar Google Agenda"}</button>}</section></section></>;
}
function BonusesPage({ user }: { user: any }) {
  const sector = user?.sectors?.find((item: any) => item.id === user?.activeSectorId);
  const allowed = sector?.code === "PROJURIS_2";
  const canViewAll = user?.role === "gestao" || user?.role === "master";
  const now = new Date();
  const [monthKey, setMonthKey] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const summary = trpc.bonuses.summary.useQuery({ monthKey }, { enabled: allowed });
  const competency = trpc.bonuses.competency.useQuery({ monthKey }, { enabled: allowed });
  const close = trpc.bonuses.close.useMutation({ onSuccess: () => { toast.success("Competência fechada e congelada."); summary.refetch(); competency.refetch(); }, onError: error => toast.error(error.message) });
  const [selected, setSelected] = useState<any>(null);
  const [bonusSort, setBonusSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: "totalValue", direction: "desc" });
  const data = summary.data;
  const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const sortedBonuses = useMemo(() => [...(data?.bySdr || [])].sort((a: any, b: any) => {
    const direction = bonusSort.direction === "asc" ? 1 : -1;
    const aValue = a[bonusSort.key];
    const bValue = b[bonusSort.key];
    if (bonusSort.key === "name" || bonusSort.key === "band") return String(aValue ?? "").localeCompare(String(bValue ?? ""), "pt-BR", { sensitivity: "base" }) * direction;
    return (Number(aValue ?? 0) - Number(bValue ?? 0)) * direction;
  }), [data?.bySdr, bonusSort]);
  const bonusSortHeader = (key: string, label: string) => <button type="button" className="sort-header" onClick={() => setBonusSort(current => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }))}>{label}<span>{bonusSort.key === key ? (bonusSort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button>;
  if (!allowed) return <AccessDeniedPage />;
  const isLastMonthAfterClosing = (() => { const [year, month] = monthKey.split("-").map(Number); const last = new Date(year, month, 0).getDate(); const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; return current === monthKey && now.getDate() === last && now.getHours() >= 18; })();
  return <><PageHeader eyebrow={canViewAll ? "PROJURIS · GESTÃO" : "PROJURIS · SDR"} title="Bonificações" description={canViewAll ? "Acompanhe o cálculo mensal de todos os SDRs." : "Acompanhe somente a sua bonificação mensal."} action={<label className="month-picker"><span>Competência</span><input type="month" value={monthKey} onChange={e => setMonthKey(e.target.value)} /></label>} /><div className="bonus-cards"><div className="bonus-card"><span>Total de bonificações</span><strong>{money(data?.totals.total || 0)}</strong></div><div className="bonus-card"><span>{canViewAll ? "SDRs bonificados" : "Sua bonificação"}</span><strong>{canViewAll ? data?.bySdr.filter((item: any) => item.totalValue > 0).length || 0 : money(data?.totals.total || 0)}</strong></div><div className="bonus-card"><span>Reuniões elegíveis</span><strong>{data?.totals.normalMeetings || 0}</strong></div><div className="bonus-card bonus-card-gold"><span>Reuniões especiais</span><strong>{data?.totals.specialMeetings || 0}</strong><small>{money(data?.totals.specialValue || 0)}</small></div></div><section className="panel table-panel"><div className="panel-toolbar"><div><strong>{canViewAll ? "Bonificações por SDR" : "Minha bonificação"} — {monthKey}</strong><span className="toolbar-note">Status: {data?.status || "ABERTA"}</span></div>{data?.status === "ABERTA" && isLastMonthAfterClosing && isMaster(user?.role) && <button className="button button-primary" onClick={() => close.mutate({ monthKey })}>Fechar competência</button>}</div><div className="table-wrap"><table className="data-table bonus-table"><thead><tr><th>{bonusSortHeader("name", canViewAll ? "SDR" : "Resumo")}</th><th>{bonusSortHeader("normalMeetings", "Reuniões normais")}</th><th>{bonusSortHeader("specialMeetings", "Especiais > R$2M")}</th><th>{bonusSortHeader("band", "Faixa")}</th><th>{bonusSortHeader("rate", "Valor/reunião")}</th><th>{bonusSortHeader("normalValue", "Bonificação normal")}</th><th>{bonusSortHeader("specialValue", "Bonificação especial")}</th><th>{bonusSortHeader("totalValue", "Total")}</th></tr></thead><tbody>{sortedBonuses.length ? sortedBonuses.map((item: any) => <tr key={item.id} className="clickable-row" onClick={() => setSelected(item)}><td><strong>{item.name}</strong></td><td>{item.normalMeetings}</td><td className={item.specialMeetings ? "bonus-gold-text" : ""}>{item.specialMeetings}</td><td>{item.band}</td><td>{money(item.rate)}</td><td>{money(item.normalValue)}</td><td className={item.specialValue ? "bonus-gold-text" : ""}>{money(item.specialValue)}</td><td><strong>{money(item.totalValue)}</strong></td></tr>) : <tr><td colSpan={8}><EmptyState title="Nenhuma reunião realizada no período" description="Os cálculos aparecem quando as reuniões elegíveis forem realizadas." /></td></tr>}</tbody></table></div></section>{selected && <section className="panel bonus-detail"><div className="panel-toolbar"><div><strong>{selected.name} — {monthKey}</strong><span className="toolbar-note">Detalhamento da bonificação</span></div><button className="button button-secondary button-compact" onClick={() => setSelected(null)}>Fechar</button></div><div className="bonus-detail-grid"><div><span>Bonificação normal</span><strong>{selected.normalMeetings} × {money(selected.rate)} = {money(selected.normalValue)}</strong></div><div><span>Bonificação especial</span><strong>{selected.specialMeetings} × R$ 50,00 = {money(selected.specialValue)}</strong></div><div><span>Total a receber</span><strong>{money(selected.totalValue)}</strong></div><div><span>Progressão</span><strong>{selected.nextRate ? `Faltam ${selected.missingForNext} para R$ ${selected.nextRate}/reunião` : "Faixa máxima atingida"}</strong></div></div>{selected.specialItems?.length > 0 && <div className="bonus-special-list"><h3>Reuniões que geraram R$ 50,00</h3>{selected.specialItems.map((item: any) => <div className="bonus-special-row" key={item.id}><span>🔥</span><strong>{item.company}</strong><small>{formatDate(item.date)} · {item.cnpj || "Sem CNPJ"} · {money(item.value)}</small></div>)}</div>}</section>}</>;
}

function SettingsPage({ user }: { user: any }) {
  const canManage = isMaster(user?.role);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"sdr" | "gestao">("sdr");
  const [inviteSectorIds, setInviteSectorIds] = useState<number[]>([]);
  const [sectorFilter, setSectorFilter] = useState("TODOS");
  const [roleFilter, setRoleFilter] = useState("TODOS");
  const [userStatusFilter, setUserStatusFilter] = useState("ATIVOS_PENDENTES");
  const [userSearch, setUserSearch] = useState("");
  const sectors = trpc.sectors.list.useQuery(undefined, { enabled: canManage });
  const users = trpc.users.list.useQuery({ includeInactive: true }, { enabled: canManage });
  const lawyers = trpc.lawyers.list.useQuery({ includeInactive: true }, { enabled: canManage });
  const gmail = trpc.gmail.status.useQuery(undefined, { enabled: canManage });
  const update = trpc.users.update.useMutation({ onSuccess: () => { toast.success("Acesso atualizado"); users.refetch(); }, onError: error => toast.error(error.message) });
  const updateAvatar = trpc.users.updateAvatar.useMutation({ onSuccess: () => { toast.success("Foto do usuário atualizada"); users.refetch(); }, onError: error => toast.error(error.message) });
  const remove = trpc.users.remove.useMutation({ onSuccess: () => { toast.success("Usuário excluído do acesso ativo; poderá ser reprovado pelo pré-cadastro."); users.refetch(); }, onError: error => toast.error(error.message) });
  const sendInvite = trpc.lawyers.sendInvite.useMutation({ onSuccess: () => { toast.success("Convite enviado por e-mail."); lawyers.refetch(); }, onError: error => toast.error(error.message) });
  const invite = trpc.users.invite.useMutation({ onSuccess: () => { toast.success("Usuário pré-cadastrado ou reprovado com os setores escolhidos."); setInviteEmail(""); setInviteSectorIds([]); users.refetch(); }, onError: error => toast.error(error.message) });
  const [newApiKey, setNewApiKey] = useState("");
  const integration = trpc.integrations.get.useQuery(undefined, { enabled: canManage });
  const createIntegration = trpc.integrations.create.useMutation({ onSuccess: result => { setNewApiKey(result.secret); integration.refetch(); toast.success("API Key criada. Copie-a agora; ela não será exibida novamente."); }, onError: error => toast.error(error.message) });
  const revokeIntegration = trpc.integrations.revoke.useMutation({ onSuccess: () => { setNewApiKey(""); integration.refetch(); toast.success("API Key revogada."); }, onError: error => toast.error(error.message) });
  const [disconnectingLawyer, setDisconnectingLawyer] = useState<number | null>(null);
  const disconnectLawyer = async (lawyerId: number) => { if (!window.confirm("Desconectar a Google Agenda deste advogado?")) return; setDisconnectingLawyer(lawyerId); try { const response = await fetch("/api/google-calendar/lawyer-disconnect", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lawyerId }) }); if (!response.ok) throw new Error(); toast.success("Google Agenda do advogado desconectada."); lawyers.refetch(); } catch { toast.error("Não foi possível desconectar a agenda."); } finally { setDisconnectingLawyer(null); } };
  const filteredUsers = (users.data || []).filter((item: any) => {
    const pending = item.loginMethod === "pending" && !item.active && !(item.sectors || []).length;
    const matchesStatus = userStatusFilter === "TODOS" || (userStatusFilter === "ATIVOS_PENDENTES" && (item.active || pending)) || (userStatusFilter === "ATIVOS" && item.active) || (userStatusFilter === "PENDENTES" && pending) || (userStatusFilter === "EXCLUIDOS" && !item.active && !pending);
    const search = userSearch.trim().toLowerCase();
    const matchesSearch = !search || `${item.name || ""} ${item.email || ""}`.toLowerCase().includes(search);
    return matchesStatus && matchesSearch && (sectorFilter === "TODOS" || (item.sectors || []).some((sector: any) => sector.code === sectorFilter)) && (roleFilter === "TODOS" || item.role === roleFilter);
  });
  const sectorLabel = sectorFilter === "TODOS" ? "Todos os setores" : sectorFilter === "CONCILIE" ? "CONCILIE" : "PROJURIS 2.0";
  const roleLabel = roleFilter === "TODOS" ? "Todos os cargos" : roleFilter === "sdr" ? "SDR" : roleFilter === "gestao" ? "Gestão" : roleFilter === "admin" ? "Admin" : roleFilter === "master" ? "MASTER" : "Usuário";
  if (!canManage) return <><PageHeader eyebrow="ADMINISTRAÇÃO" title="Configurações" description="Área exclusiva do MASTER." /><section className="panel"><EmptyState title="Acesso restrito" description="Somente os logins MASTER autorizados podem editar nomes, cargos e setores." icon={ShieldCheck} /></section></>;
  return <><PageHeader eyebrow="ADMINISTRAÇÃO MASTER" title="Configurações" description="O MASTER é o único papel que administra nomes, cargos, status e setores." /><section className="panel integration-panel"><div className="panel-toolbar"><div><strong>Integrações · API</strong><span className="toolbar-note">FINANCEIRO VILLELA — CONCILIE · escopo fixo e exclusivo do CONCILIE.</span></div>{integration.data?.active && <span className="status-badge status-done">ATIVA</span>}</div>{integration.data?.active ? <div className="integration-details"><div><span>Setor autorizado</span><strong>CONCILIE</strong></div><div><span>Prefixo</span><strong>{integration.data.keyPrefix}</strong></div><div><span>Último acesso</span><strong>{integration.data.lastUsedAt ? new Date(integration.data.lastUsedAt).toLocaleString("pt-BR") : "Nunca"}</strong></div><div><span>Permissões</span><strong>{integration.data.permissions.join(", ")}</strong></div><button className="button button-danger button-compact" onClick={() => { if (window.confirm("Revogar a API Key do Sistema Financeiro?")) revokeIntegration.mutate({ id: integration.data!.id }); }}>Revogar API Key</button></div> : <button className="button button-primary" onClick={() => createIntegration.mutate()} disabled={createIntegration.isPending}>Criar API Key FINANCEIRO_VILLELA_CONCILIE</button>}{newApiKey && <div className="api-key-once"><strong>API Key — copie agora, exibida somente uma vez</strong><code>{newApiKey}</code></div>}</section><section className="panel google-calendar-card"><div className="profile-section-heading"><div><p className="eyebrow">ENVIO DE CONVITES</p><h2>Gmail dos convites</h2></div><span className={`google-status ${gmail.data?.status === "CONNECTED" ? "connected" : "disconnected"}`}>{gmail.data?.status === "CONNECTED" ? "🟢 Conectado" : gmail.data?.status === "ERROR" ? "⚠️ Problema" : "🔴 Não conectado"}</span></div><p className="google-calendar-description">Conecte a conta Gmail que enviará os convites para os advogados. Esta autorização é separada das agendas dos advogados e usa somente o envio Gmail.</p>{gmail.data?.status === "CONNECTED" ? <div className="google-connected-state"><div><span>Conta remetente</span><strong>{gmail.data.googleAccountEmail}</strong>{gmail.data.lastError && <small>{gmail.data.lastError}</small>}</div><button className="button button-danger" onClick={async () => { if (!window.confirm("Desconectar o Gmail usado para enviar convites?")) return; const response = await fetch("/api/gmail/disconnect", { method: "POST", credentials: "include" }); if (response.ok) { toast.success("Gmail remetente desconectado."); gmail.refetch(); } else toast.error("Não foi possível desconectar o Gmail."); }}>Desconectar Gmail</button></div> : <div className="settings-user-actions"><button className="button button-primary" onClick={() => window.location.assign("/api/gmail/connect")}>Conectar Gmail para envio</button>{gmail.data?.lastError && <span className="field-hint">{gmail.data.lastError}</span>}</div>}</section><section className="panel table-panel"><div className="panel-toolbar"><div><strong>Google Calendar dos advogados</strong><span className="toolbar-note">Visível somente para o MASTER. O advogado autoriza a própria conta pelo convite enviado por e-mail.</span></div><a className="button button-secondary button-compact" href="/advogados">Administrar advogados</a></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Advogado</th><th>E-mail</th><th>Status Google Calendar</th><th>Ações</th></tr></thead><tbody>{(lawyers.data || []).length ? (lawyers.data || []).map((lawyer: any) => { const pending = lawyer.invite?.status === "PENDING" && new Date(lawyer.invite.expiresAt).getTime() > Date.now(); const problem = lawyer.invite?.status === "ERROR" || lawyer.invite?.lastError; return <tr key={lawyer.id}><td><strong>{lawyer.name}</strong></td><td>{lawyer.email}</td><td>{lawyer.connection ? <span className="status-badge status-done">🟢 Conectado · {lawyer.connection.googleAccountEmail}</span> : pending ? <span className="status-badge status-pending">🟡 Convite enviado</span> : problem ? <span className="status-badge status-cancelled">⚠️ Problema na conexão</span> : <span className="status-badge">🔴 Não conectado</span>}</td><td><div className="settings-user-actions">{!lawyer.connection && <button className="button button-primary button-compact" disabled={sendInvite.isPending} onClick={() => sendInvite.mutate({ id: lawyer.id })}>{pending ? "Reenviar convite" : problem ? "Enviar novo convite" : "Enviar convite"}</button>}{lawyer.connection && <button className="button button-danger button-compact" disabled={disconnectingLawyer === lawyer.id} onClick={() => disconnectLawyer(lawyer.id)}>{disconnectingLawyer === lawyer.id ? "Desconectando…" : "Desconectar"}</button>}</div></td></tr>; }) : <tr><td colSpan={4}><EmptyState title="Nenhum advogado cadastrado" description="Cadastre advogados na área Administração → Advogados." /></td></tr>}</tbody></table></div></section><section className="panel invite-panel"><div className="panel-toolbar"><div><strong>Pré-cadastrar ou reaprovar usuário</strong><span className="toolbar-note">O usuário entra com o mesmo e-mail via autenticação corporativa. O setor só é definido pelo MASTER.</span></div></div><form className="invite-form" onSubmit={event => { event.preventDefault(); if (inviteEmail) invite.mutate({ email: inviteEmail, role: inviteRole, sectorIds: inviteSectorIds }); }}><input type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="email@grupovillela.com" required /><select value={inviteRole} onChange={event => setInviteRole(event.target.value as "sdr" | "gestao")}><option value="sdr">SDR</option><option value="gestao">Gestão</option></select><select multiple value={inviteSectorIds.map(String)} onChange={event => setInviteSectorIds(Array.from(event.target.selectedOptions).map(option => Number(option.value)))} title="Selecione um ou mais setores"><option value="" disabled>Selecione o(s) setor(es)</option>{(sectors.data || []).map((sector: any) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select><button className="button button-primary" type="submit" disabled={invite.isPending || !inviteSectorIds.length}>Pré-cadastrar / reaprovar</button></form></section><section className="panel table-panel"><div className="panel-toolbar"><div><strong>Usuários e SDRs · {sectorLabel} · {roleLabel}</strong><span className="toolbar-note">Os vínculos de setor, nomes e status Google ficam persistidos pelo MASTER e não são alterados pelo login do usuário.</span></div><div className="settings-filters"><label className="field search-field"><Search size={16} /><input value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Pesquisar nome ou e-mail" /></label><label className="field settings-sector-filter"><span>Exibir</span><select value={userStatusFilter} onChange={event => setUserStatusFilter(event.target.value)}><option value="ATIVOS_PENDENTES">Ativos e pendentes</option><option value="ATIVOS">Usuários ativos</option><option value="PENDENTES">Aguardando aprovação</option><option value="EXCLUIDOS">Usuários excluídos</option><option value="TODOS">Todos os usuários</option></select></label><label className="field settings-sector-filter"><span>Filtrar por setor</span><select value={sectorFilter} onChange={event => setSectorFilter(event.target.value)}><option value="TODOS">Todos os setores</option><option value="PROJURIS_2">PROJURIS 2.0</option><option value="CONCILIE">CONCILIE</option><option value="TRAFEGO_PAGO">TRÁFEGO PAGO</option></select></label><label className="field settings-sector-filter"><span>Filtrar por cargo</span><select value={roleFilter} onChange={event => setRoleFilter(event.target.value)}><option value="TODOS">Todos os cargos</option><option value="sdr">SDR</option><option value="gestao">Gestão</option><option value="admin">Admin</option><option value="master">MASTER</option><option value="user">Usuário</option></select></label></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Nome exibido</th><th>E-mail</th><th>Papel</th><th>Setores</th><th>Google Calendar</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filteredUsers.map((item: any) => <tr key={item.id}><td><div className="person-cell"><span className="mini-avatar avatar-emoji">{userAvatar(item)}</span><input className="inline-name-input" defaultValue={item.name || ""} placeholder="Nome do usuário" title="Edite o nome e saia do campo para salvar" onBlur={event => { const name = event.currentTarget.value.trim(); if (name && name !== (item.name || "").trim()) update.mutate({ id: item.id, name, role: item.role, active: item.active }); }} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div></td><td>{item.email || "—"}</td><td><select className="inline-select" value={item.role} disabled={item.email?.toLowerCase() === "leonardo.cunha@grupovillela.com" || item.email?.toLowerCase() === "leonardo.cunha0905@gmail.com"} onChange={e => update.mutate({ id: item.id, role: e.target.value as any, active: item.active })}><option value="user">SDR</option><option value="sdr">SDR</option><option value="gestao">Gestão</option><option value="admin">Admin</option><option value="master">MASTER</option></select></td><td><div className="sector-checks">{(sectors.data || []).map((sector: any) => <label key={sector.id}><input type="checkbox" checked={(item.sectors || []).some((owned: any) => owned.id === sector.id)} onChange={event => { const ids = (item.sectors || []).map((owned: any) => owned.id); const next = event.target.checked ? [...new Set([...ids, sector.id])] : ids.filter((id: number) => id !== sector.id); if (next.length) update.mutate({ id: item.id, role: item.role, active: item.active, sectorIds: next }); else toast.error("O usuário precisa permanecer em pelo menos um setor."); }} />{sector.name}</label>)}</div></td><td>{item.googleCalendar ? <span className="status-badge status-done">Conectado<span className="cell-subtext">{item.googleCalendar.email}</span></span> : <span className="status-badge">Não conectado</span>}</td><td><button className={`toggle ${item.active ? "toggle-on" : ""}`} onClick={() => update.mutate({ id: item.id, role: item.role, active: !item.active })}><span />{item.active ? "Ativo" : item.loginMethod === "pending" && !(item.sectors || []).length ? "Aguardando aprovação" : "Excluído"}</button></td><td><div className="settings-user-actions"><label className="button button-secondary button-compact"><Upload size={14} /> Foto<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith("image/")) return toast.error("Selecione um arquivo de imagem."); if (file.size > 2 * 1024 * 1024) return toast.error("A imagem deve ter no máximo 2 MB."); const reader = new FileReader(); reader.onload = () => updateAvatar.mutate({ id: item.id, avatarUrl: String(reader.result) }); reader.readAsDataURL(file); }} /></label>{item.avatarUrl && <button className="button button-secondary button-compact" disabled={updateAvatar.isPending} onClick={() => updateAvatar.mutate({ id: item.id, avatarUrl: null })}>Remover foto</button>}<button className="button button-danger button-compact" disabled={!item.active || item.email?.toLowerCase() === "leonardo.cunha@grupovillela.com" || item.email?.toLowerCase() === "leonardo.cunha0905@gmail.com" || remove.isPending} onClick={() => { if (window.confirm(`Excluir o acesso de ${item.name || item.email}? O histórico será preservado e a reaprovação ficará sujeita ao MASTER.`)) remove.mutate({ id: item.id }); }}>Excluir</button></div></td></tr>)}</tbody></table></div></section></>;
}

function MeetingModal({ user, initial, users, onClose }: { user: any; initial?: any; users: any[]; onClose: () => void }) {
  const editing = Boolean(initial?.meeting);
  const meeting = initial?.meeting;
  const canManage = isManagement(user?.role);
  const activeSectorCode = user?.sectors?.find((sector: any) => sector.id === user?.activeSectorId)?.code;
  const isConcilie = activeSectorCode === "CONCILIE";
  const isProjuris = activeSectorCode === "PROJURIS_2";
  const canManageClosedContract = isConcilie && (user?.role === "gestao" || isMaster(user?.role));
  const isTrafegoPago = activeSectorCode === "TRAFEGO_PAGO";
  const lawyers = trpc.lawyers.list.useQuery({ includeInactive: false });
  const meetingDue = Boolean(meeting && `${String(meeting.date).slice(0, 10)}T${String(meeting.time).slice(0, 5)}` <= saoPauloNowKey());
  const canConfirm = canManage || meetingDue;
  const closedForSdr = Boolean(editing && !canManage && meeting?.status !== "AGENDADA");
  const draftKey = meetingDraftKey(user);
  const defaultForm = { companyName: meeting?.companyName || "", cnpj: meeting?.cnpj || "", contactName: meeting?.contactName || "", phone: meeting?.phone || "", email: meeting?.email || "", sdrId: meeting?.sdrId || user?.id || users[0]?.id || 0, responsibleId: meeting?.responsibleId || user?.id || users[0]?.id || 0, lawyerEmail: meeting?.lawyerEmail || "", lawyerId: meeting?.lawyerId || null, calendarOwner: meeting?.calendarOwner || "SDR", service: meeting?.service || "", closer: meeting?.closer || "", clientStatus: meeting?.clientStatus || "", contactDate: String(meeting?.contactDate || isoToday()).slice(0, 10), date: String(meeting?.date || isoToday()).slice(0, 10), time: String(meeting?.time || "09:00").slice(0, 5), status: meeting?.status || "AGENDADA", notes: meeting?.notes || "", result: meeting?.result || "", nextStep: meeting?.nextStep || "", contractValue: meeting?.contractValue || "", proposalValue: meeting?.proposalValue || "", closedContract: meeting?.closedContract ?? false, closedContractValue: meeting?.closedContractValue || "", contractInstallments: meeting?.contractInstallments || "", contractLawyer: meeting?.contractLawyer || "", nextContactDate: meeting?.nextContactDate || "", noShowReason: meeting?.noShowReason || "", wasContacted: meeting?.wasContacted ?? false, wantsReschedule: meeting?.wantsReschedule ?? false, cancelReason: meeting?.cancelReason || "", pgfnDebtOver2m: meeting?.pgfnDebtOver2m ?? false, pgfnDebtAmount: meeting?.pgfnDebtAmount || "", leadChannel: meeting?.leadChannel || "Não identificado", leadChannelOther: meeting?.leadChannelOther || "", adPlatform: meeting?.adPlatform || "Não se aplica", campaignName: meeting?.campaignName || "", campaignId: meeting?.campaignId || "", adSetName: meeting?.adSetName || "", adSetId: meeting?.adSetId || "", adName: meeting?.adName || "", adId: meeting?.adId || "", contactOrigin: meeting?.contactOrigin || "Não identificado", contactOriginOther: meeting?.contactOriginOther || "", utmSource: meeting?.utmSource || "", utmMedium: meeting?.utmMedium || "", utmCampaign: meeting?.utmCampaign || "", utmContent: meeting?.utmContent || "", utmTerm: meeting?.utmTerm || "", leadEntryDate: meeting?.leadEntryDate || "", qualificationStatus: meeting?.qualificationStatus || "NAO_AVALIADO", disqualificationReason: meeting?.disqualificationReason || "", disqualificationOther: meeting?.disqualificationOther || "" };
  const [form, setForm] = useState<any>(() => {
    if (!editing && typeof window !== "undefined") {
      try { const saved = window.localStorage.getItem(draftKey); if (saved) return { ...defaultForm, ...JSON.parse(saved), calendarOwner: "SDR", lawyerId: null, lawyerEmail: "" }; } catch { /* rascunho inválido: usa o formulário padrão */ }
    }
    return defaultForm;
  });
  const [justification, setJustification] = useState("");
  const [scheduleEditing, setScheduleEditing] = useState(false);
  useEffect(() => {
    if (editing || typeof window === "undefined") return;
    window.localStorage.setItem(draftKey, JSON.stringify(form));
  }, [editing, draftKey, form]);
  const closeModal = () => { if (!editing) clearMeetingDraft(user); onClose(); };
  const originalDate = normalizeFormDate(meeting?.date);
  const originalTime = normalizeFormTime(meeting?.time);
  const scheduleChanged = Boolean(editing && scheduleEditing && (normalizeFormDate(form.date) !== originalDate || normalizeFormTime(form.time) !== originalTime));
  const scheduleChangeFlow = Boolean(editing && !canManage && meeting?.status === "AGENDADA" && scheduleChanged);
  const confirmationFlow = Boolean(editing && !canManage && meeting?.status === "AGENDADA" && meetingDue && !scheduleChangeFlow);
  const confirmationRequired = confirmationFlow && form.status === "AGENDADA";
  const create = trpc.meetings.create.useMutation({ onSuccess: () => { clearMeetingDraft(user); toast.success("Reunião cadastrada"); onClose(); }, onError: error => toast.error(friendlyMeetingError(error)) });
  const update = trpc.meetings.update.useMutation({ onSuccess: () => { toast.success("Reunião atualizada"); onClose(); }, onError: error => toast.error(friendlyMeetingError(error)) });
  const remove = trpc.meetings.remove.useMutation({ onSuccess: () => { toast.success("Reunião excluída"); onClose(); }, onError: error => toast.error(error.message) });
  const syncGoogle = trpc.google.syncMeeting.useMutation({ onSuccess: () => { toast.success("Sincronização Google concluída."); onClose(); }, onError: error => toast.error(error.message) });
  const set = (key: string, value: any) => setForm((current: any) => ({ ...current, [key]: value }));
  const selectedLawyer = (lawyers.data || []).find((lawyer: any) => lawyer.id === Number(form.lawyerId));
  const chooseLawyer = (value: string) => { const lawyer = (lawyers.data || []).find((item: any) => item.id === Number(value)); setForm((current: any) => ({ ...current, lawyerId: value ? Number(value) : null, lawyerEmail: lawyer?.email || "", calendarOwner: current.calendarOwner === "LAWYER" && lawyer?.connection?.status !== "CONNECTED" ? "SDR" : current.calendarOwner })); };
  const setSchedule = (key: "date" | "time", value: string) => { setScheduleEditing(true); set(key, value); };
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (closedForSdr) return; const payload = cleanMeetingForm({ ...form, date: normalizeFormDate(form.date), time: normalizeFormTime(form.time) }); if (scheduleChangeFlow) { if (!justification.trim()) { toast.error("Informe o motivo da alteração de data ou horário."); return; } update.mutate({ id: meeting.id, data: { date: payload.date, time: payload.time }, justification: justification.trim() }); return; } if (confirmationRequired) { toast.error("Selecione o resultado da reunião antes de confirmar."); return; } if (!payload.companyName || !payload.contactName || !payload.phone || (isConcilie && !payload.service)) { toast.error("Preencha os campos obrigatórios."); return; } if (!payload.sdrId) { toast.error("Aguarde os usuários carregarem ou selecione o SDR."); return; } if (payload.calendarOwner === "LAWYER" && (!payload.lawyerId || selectedLawyer?.connection?.status !== "CONNECTED")) { toast.error("Este advogado ainda não conectou o Google Calendar. Solicite que ele autorize a conexão ou escolha 'Cadastrar na minha agenda (convite para o advogado)'."); return; } if (!editing && !payload.closer?.trim()) { toast.error("Selecione o advogado / closer da reunião."); return; } if (payload.status === "REALIZADA" && !payload.result?.trim()) { toast.error("Informe o resultado da reunião."); return; } if (payload.closedContract && (!payload.closedContractValue?.trim() || !Number(payload.contractInstallments) || !payload.contractLawyer?.trim())) { toast.error("Preencha valor do contrato, quantidade de parcelas e advogado responsável."); return; } if (payload.status === "CANCELADA" && !payload.cancelReason?.trim()) { toast.error("Informe o motivo do cancelamento."); return; } if (payload.status === "NO_SHOW" && !payload.noShowReason?.trim()) { toast.error("Informe o motivo do no-show."); return; } const normalizedPayload = { ...payload, responsibleId: payload.sdrId, service: payload.service || "" }; if (editing) update.mutate({ id: meeting.id, data: normalizedPayload }); else create.mutate(normalizedPayload); };
  const handleDelete = () => { if (!editing || !window.confirm("Excluir esta reunião? Esta ação não pode ser desfeita.")) return; remove.mutate({ id: meeting.id }); };
  const busy = create.isPending || update.isPending;
  return <div className="modal-backdrop"><section className="modal-card"><div className="modal-header"><div><p className="eyebrow">{editing ? "EDITAR REGISTRO" : "NOVO AGENDAMENTO"}</p><h2>{editing ? meeting.companyName : "Nova reunião"}</h2></div><button className="icon-button" onClick={closeModal}><X size={18} /></button></div><form onSubmit={submit}><fieldset disabled={closedForSdr}><div className="form-grid"><label className="form-field form-span-2"><span>{"NOME DA EMPRESA"}</span><input value={form.companyName} onChange={e => set("companyName", e.target.value)} placeholder="Ex.: Grupo Horizonte" /></label><label className="form-field"><span>{"CNPJ/CPF"}</span><input value={form.cnpj} onChange={e => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" /></label><label className="form-field"><span>{"NOME DO SÓCIO"}</span><input value={form.contactName} onChange={e => set("contactName", e.target.value)} placeholder="Nome completo" /></label><label className="form-field"><span>Telefone *</span><input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-9999" /></label><label className="form-field"><span>{isConcilie ? "Número do processo" : "E-mail"}</span><input type={isConcilie ? "text" : "email"} value={form.email} onChange={e => set("email", e.target.value)} placeholder={isConcilie ? "Digite o número do processo" : "contato@empresa.com"} /></label><label className="form-field"><span>SDR responsável *</span><select value={form.sdrId} disabled={!canManage} onChange={e => set("sdrId", Number(e.target.value))}>{users.map(item => <option key={item.id} value={item.id}>{item.name || item.email}</option>)}</select></label><label className="form-field"><span>Onde criar reunião?</span><select value={form.calendarOwner} disabled title="Integração de agenda temporariamente desativada"><option value="LAWYER">Cadastrar na agenda do advogado</option><option value="SDR">Cadastrar na minha agenda (convite para o advogado)</option></select></label>{form.calendarOwner === "LAWYER" && <label className="form-field"><span>ADVOGADO DONO DA AGENDA *</span><select value={form.lawyerId || ""} onChange={e => chooseLawyer(e.target.value)}><option value="">Selecione o advogado conectado</option>{(lawyers.data || []).filter((lawyer: any) => lawyer.connection?.status === "CONNECTED").map((lawyer: any) => <option key={lawyer.id} value={lawyer.id}>{lawyer.name} · {lawyer.email}</option>)}</select></label>}<label className="form-field"><span>ADVOGADO / CLOSER *</span><input required value={form.closer} onChange={e => set("closer", e.target.value)} placeholder="Digite o nome do advogado ou closer" />{selectedLawyer && form.calendarOwner === "LAWYER" && <small className="field-hint">Agenda selecionada: {selectedLawyer.name} · {selectedLawyer.connection?.googleAccountEmail}</small>}</label><label className="form-field"><span>{"DATA DA LIGAÇÃO/CONTATO *"}</span><input type="date" value={form.contactDate} onChange={e => set("contactDate", e.target.value)} /></label><label className="form-field"><span>{"DATA DO AGENDAMENTO"}</span><input type="date" value={form.date} onChange={e => setSchedule("date", e.target.value)} /></label><label className="form-field"><span>Horário *</span><input type="time" value={form.time} onChange={e => setSchedule("time", e.target.value)} /></label><label className="form-field"><span>{isConcilie ? "Trabalhista / FGTS" : "Serviço / produto"}</span>{isConcilie ? <select value={form.service} onChange={e => set("service", e.target.value)}><option value="">Não informado</option><option value="TRABALHISTA">TRABALHISTA</option><option value="FGTS">FGTS</option></select> : <input value={form.service} onChange={e => set("service", e.target.value)} placeholder="Ex.: Consultoria comercial" />}</label>{isTrafegoPago && <div className="form-span-2 traffic-lead-section"><div className="profile-section-heading"><div><p className="eyebrow">ORIGEM DO LEAD — TRÁFEGO PAGO</p><p className="field-hint">Identifique de onde veio o lead para medir a qualidade das campanhas e o desempenho comercial.</p></div></div><div className="form-grid"><label className="form-field"><span>REDE SOCIAL / CANAL</span><select value={form.leadChannel} onChange={e => set("leadChannel", e.target.value)}><option>Instagram</option><option>Facebook</option><option>Google</option><option>TikTok</option><option>LinkedIn</option><option>YouTube</option><option>WhatsApp</option><option>Site / busca orgânica</option><option>Indicação</option><option>Outro</option><option>Não identificado</option></select></label>{form.leadChannel === "Outro" && <label className="form-field"><span>OUTRO CANAL</span><input value={form.leadChannelOther} onChange={e => set("leadChannelOther", e.target.value)} placeholder="Informe o canal" /></label>}<label className="form-field"><span>PLATAFORMA DE ANÚNCIOS</span><select value={form.adPlatform} onChange={e => set("adPlatform", e.target.value)}><option>Meta Ads</option><option>Google Ads</option><option>TikTok Ads</option><option>LinkedIn Ads</option><option>YouTube Ads</option><option>Outra plataforma</option><option>Não identificado</option><option>Não se aplica</option></select></label><label className="form-field"><span>NOME DA CAMPANHA</span><input value={form.campaignName} onChange={e => set("campaignName", e.target.value)} placeholder="Nome da campanha" /></label><label className="form-field"><span>ID DA CAMPANHA</span><input value={form.campaignId} onChange={e => set("campaignId", e.target.value)} /></label><label className="form-field"><span>NOME DO CONJUNTO DE ANÚNCIOS</span><input value={form.adSetName} onChange={e => set("adSetName", e.target.value)} /></label><label className="form-field"><span>ID DO CONJUNTO</span><input value={form.adSetId} onChange={e => set("adSetId", e.target.value)} /></label><label className="form-field"><span>NOME DO ANÚNCIO</span><input value={form.adName} onChange={e => set("adName", e.target.value)} /></label><label className="form-field"><span>ID DO ANÚNCIO</span><input value={form.adId} onChange={e => set("adId", e.target.value)} /></label><label className="form-field"><span>COMO O LEAD ENTROU EM CONTATO?</span><select value={form.contactOrigin} onChange={e => set("contactOrigin", e.target.value)}><option>Formulário de anúncio</option><option>WhatsApp</option><option>Landing page</option><option>Site</option><option>Ligação</option><option>Formulário do site</option><option>Mensagem direta na rede social</option><option>Outro</option><option>Não identificado</option></select></label>{form.contactOrigin === "Outro" && <label className="form-field"><span>OUTRA ORIGEM</span><input value={form.contactOriginOther} onChange={e => set("contactOriginOther", e.target.value)} placeholder="Informe a origem" /></label>}<label className="form-field"><span>DATA DE ENTRADA DO LEAD</span><input type="date" value={form.leadEntryDate} onChange={e => set("leadEntryDate", e.target.value)} /></label><label className="form-field"><span>UTM SOURCE</span><input value={form.utmSource} onChange={e => set("utmSource", e.target.value)} /></label><label className="form-field"><span>UTM MEDIUM</span><input value={form.utmMedium} onChange={e => set("utmMedium", e.target.value)} /></label><label className="form-field"><span>UTM CAMPAIGN</span><input value={form.utmCampaign} onChange={e => set("utmCampaign", e.target.value)} /></label><label className="form-field"><span>UTM CONTENT</span><input value={form.utmContent} onChange={e => set("utmContent", e.target.value)} /></label><label className="form-field"><span>UTM TERM</span><input value={form.utmTerm} onChange={e => set("utmTerm", e.target.value)} /></label></div></div>}<label className="form-field"><span>Status</span><select value={form.status} onChange={e => set("status", e.target.value)}>{Object.entries(statusLabels).filter(([key]) => canManage || key === "AGENDADA" || (!scheduleChangeFlow && canConfirm && key !== "AGENDADA") || key === form.status).map(([key, label]) => <option key={key} value={key}>{confirmationRequired && key === "AGENDADA" ? "Selecione o resultado…" : label}</option>)}</select></label><label className="form-field form-span-2"><span>E-MAIL DO CLOSER</span><input type="email" value={form.lawyerEmail} readOnly={!isProjuris} onChange={e => isProjuris && set("lawyerEmail", e.target.value)} placeholder={isProjuris ? "Digite o e-mail do closer (opcional)" : "Preenchido pelo advogado / closer selecionado"} /></label><label className="form-field"><span>Status do cliente</span><select value={form.clientStatus} onChange={e => set("clientStatus", e.target.value || null)}><option value="">Não informado</option><option value="QUENTE">QUENTE</option><option value="MÉDIA">MÉDIA</option><option value="FRIA">FRIA</option></select></label>{isTrafegoPago && <div className="form-span-2 traffic-lead-section"><div className="profile-section-heading"><div><p className="eyebrow">QUALIFICAÇÃO COMERCIAL</p><p className="field-hint">Registre a avaliação comercial sem bloquear leads ainda não avaliados.</p></div></div><div className="form-grid"><label className="form-field"><span>STATUS DE QUALIFICAÇÃO</span><select value={form.qualificationStatus} onChange={e => set("qualificationStatus", e.target.value)}><option value="NAO_AVALIADO">Não avaliado</option><option value="QUALIFICADO">Qualificado</option><option value="NAO_QUALIFICADO">Não qualificado</option><option value="EM_ANALISE">Em análise</option></select></label>{form.qualificationStatus === "NAO_QUALIFICADO" && <label className="form-field"><span>MOTIVO DA DESQUALIFICAÇÃO</span><select value={form.disqualificationReason} onChange={e => set("disqualificationReason", e.target.value)}><option value="">Selecione</option><option>Fora do perfil de cliente</option><option>Sem necessidade do serviço</option><option>Contato inválido</option><option>Empresa não localizada</option><option>Sem interesse</option><option>Dados insuficientes</option><option>Outro</option></select></label>}{form.qualificationStatus === "NAO_QUALIFICADO" && form.disqualificationReason === "Outro" && <label className="form-field"><span>DESCRIÇÃO DO MOTIVO</span><input value={form.disqualificationOther} onChange={e => set("disqualificationOther", e.target.value)} placeholder="Descreva o motivo" /></label>}</div></div>}{activeSectorCode === "PROJURIS_2" && <label className="form-field form-span-2 bonus-pgfn-field"><span><input type="checkbox" checked={Boolean(form.pgfnDebtOver2m)} disabled={isConcilie} onChange={e => set("pgfnDebtOver2m", e.target.checked)} /> 🔥 Empresa com dívida superior a R$ 2 milhões na PGFN</span>{form.pgfnDebtOver2m && <input value={form.pgfnDebtAmount} disabled={isConcilie} onChange={e => set("pgfnDebtAmount", e.target.value)} placeholder="Valor da dívida (opcional)" />}</label>}<label className="form-field form-span-2"><span>Observações</span><textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Contexto ou observações importantes" /></label></div>{scheduleChanged && !closedForSdr && <label className="form-field form-span-2"><span>Justificativa da alteração *</span><textarea value={justification} onChange={e => setJustification(e.target.value)} rows={2} placeholder="Explique por que a data ou o horário foi alterado" /></label>}{(form.status !== "AGENDADA" || confirmationFlow) && <div className="result-block"><div className="result-heading"><CircleCheck size={16} /> {confirmationFlow ? "Confirme o resultado da reunião no campo Status" : "Resultado da reunião"}</div>{form.status === "REALIZADA" && <div className="form-grid"><label className="form-field form-span-2"><span>Resultado *</span><textarea value={form.result} onChange={e => set("result", e.target.value)} rows={2} placeholder="Resumo da conversa e decisão" /></label><label className="form-field"><span>Próximo passo</span><input value={form.nextStep} onChange={e => set("nextStep", e.target.value)} /></label>{isTrafegoPago && <><label className="form-field"><span>VALOR DO CONTRATO</span><input value={form.contractValue} onChange={e => set("contractValue", e.target.value)} placeholder="R$ 0,00" /></label><label className="form-field"><span>VALOR PROPOSTA</span><input value={form.proposalValue} onChange={e => set("proposalValue", e.target.value)} placeholder="R$ 0,00" /></label></>}<label className="form-field"><span>Próximo contato</span><input type="date" value={form.nextContactDate} onChange={e => set("nextContactDate", e.target.value)} /></label>{canManageClosedContract && <div className="form-span-2 contract-closed-panel"><label className="check-field"><input type="checkbox" checked={Boolean(form.closedContract)} onChange={e => set("closedContract", e.target.checked)} /> CONTRATO FECHADO</label>{form.closedContract && <div className="form-grid contract-closed-fields"><label className="form-field"><span>VALOR DO CONTRATO *</span><input value={form.closedContractValue} onChange={e => set("closedContractValue", e.target.value)} placeholder="R$ 0,00" required /></label><label className="form-field"><span>QUANTIDADE DE PARCELAS *</span><input type="number" min="1" max="120" value={form.contractInstallments} onChange={e => set("contractInstallments", e.target.value === "" ? "" : Number(e.target.value))} required /></label><label className="form-field form-span-2"><span>ADVOGADO RESPONSÁVEL *</span><input value={form.contractLawyer} onChange={e => set("contractLawyer", e.target.value)} placeholder="Nome do advogado responsável" required /></label></div>}</div>}</div>}{form.status === "NO_SHOW" && <div className="form-grid"><label className="form-field form-span-2"><span>Motivo *</span><textarea value={form.noShowReason} onChange={e => set("noShowReason", e.target.value)} rows={2} /></label><label className="check-field"><input type="checkbox" checked={form.wasContacted} onChange={e => set("wasContacted", e.target.checked)} /> Cliente foi contatado</label><label className="check-field"><input type="checkbox" checked={form.wantsReschedule} onChange={e => set("wantsReschedule", e.target.checked)} /> Deseja remarcar</label></div>}{form.status === "CANCELADA" && <label className="form-field"><span>Motivo do cancelamento *</span><textarea value={form.cancelReason} onChange={e => set("cancelReason", e.target.value)} rows={2} /></label>}</div>}<div className="google-meet-panel"><strong>GOOGLE MEET</strong>{editing && meeting?.googleMeetLink ? <><span className="google-sync-success">🟢 Google Meet criado</span><span>E-mail do closer: {meeting?.lawyerEmail || "Não informado"}</span><span>Convite: {meeting?.googleInviteSent ? "✓ Enviado" : "Não enviado"}</span> <a className="button button-primary button-compact" href={meeting.googleMeetLink} target="_blank" rel="noreferrer">ENTRAR NA REUNIÃO</a><button type="button" className="button button-secondary button-compact" onClick={() => { navigator.clipboard?.writeText(meeting.googleMeetLink); toast.success("Link do Meet copiado."); }}>COPIAR LINK</button><code>{meeting.googleMeetLink}</code></> : editing && meeting?.googleCalendarStatus === "ERROR" ? <><span className="google-sync-error">✕ {meeting.googleSyncError || "Erro na sincronização"}</span><button type="button" className="button button-secondary button-compact" onClick={() => syncGoogle.mutate({ id: meeting.id })}>TENTAR SINCRONIZAR NOVAMENTE</button></> : <span>{editing && meeting?.googleCalendarStatus === "NOT_CONNECTED" ? <><span>Google Agenda não conectada</span><a className="text-link" href="/perfil">CONECTAR GOOGLE AGENDA</a></> : "O evento e o Meet serão criados após salvar."}</span>}</div></fieldset><div className="modal-footer"><button type="button" className="button button-secondary" onClick={closeModal}>{closedForSdr ? "Fechar" : "Cancelar"}</button><div className="modal-footer-actions">{editing && (canManage || !closedForSdr) && <button type="button" className="button button-danger" onClick={handleDelete} disabled={busy || remove.isPending}>Excluir reunião</button>}{!closedForSdr && <button type="submit" className="button button-primary" disabled={busy || remove.isPending}>{busy ? "Salvando…" : scheduleChangeFlow ? "Salvar alterações" : confirmationFlow ? "Confirmar resultado" : editing ? "Salvar alterações" : "Cadastrar reunião"}</button>}</div></div></form></section></div>;
}

function NotFoundPage() { return <section className="not-found"><CircleAlert size={28} /><h1>Página não encontrada</h1><Link href="/" className="text-link">Voltar ao dashboard</Link></section>; }

function SectorPicker({ user }: { user: any }) {
  const choose = (sectorId: number) => { localStorage.setItem("villela-active-sector", String(sectorId)); window.location.reload(); };
  return <main className="login-screen sector-picker"><section className="login-card"><div className="brand-lockup"><img src="/villela-mark.png" alt="" /><div><strong>VILLELA</strong><span>SDR / OPERAÇÃO</span></div></div><div className="login-copy"><p className="eyebrow">CONTEXTO DE TRABALHO</p><h1>Selecione seu ambiente.</h1><p>Escolha o setor que você deseja acessar. Os dados de cada ambiente são independentes.</p></div><div className="sector-cards">{user.sectors.map((sector: any) => <button key={sector.id} className="sector-card" onClick={() => choose(sector.id)}><strong>{sector.name}</strong><span>Acessar ambiente</span><ChevronRight size={18} /></button>)}</div></section></main>;
}

function AccessDeniedPage() {
  return <main className="login-screen"><section className="login-card"><div className="brand-lockup"><img src="/villela-mark.png" alt="" /><div><strong>VILLELA</strong><span>SDR / OPERAÇÃO</span></div></div><div className="login-copy"><p className="eyebrow">CONTROLE DE ACESSO</p><h1>Acesso negado</h1><p>Seu usuário não está autorizado a acessar este setor. Solicite ao MASTER a liberação correta.</p></div><button className="button button-primary button-large" onClick={() => { localStorage.removeItem("villela-active-sector"); window.location.reload(); }}><ShieldCheck size={18} /> Voltar para meu setor</button></section></main>;
}
function PendingApprovalPage({ user }: { user: any }) {
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => { window.location.reload(); } });
  return <main className="login-screen"><section className="login-card"><div className="brand-lockup"><img src="/villela-mark.png" alt="" /><div><strong>VILLELA</strong><span>SDR / OPERAÇÃO</span></div></div><div className="login-copy"><p className="eyebrow">ACESSO EM ANÁLISE</p><h1>Usuário aguardando aprovação</h1><p>O e-mail <strong>{user?.email || "informado"}</strong> ainda não foi autorizado pelo proprietário MASTER.</p><p>Enquanto a aprovação não for concluída, nenhum dado do site fica disponível. Tente novamente depois que o MASTER cadastrar seu cargo e setor.</p></div><div className="pending-access-card"><Clock3 size={20} /><div><strong>Usuário esperando aprovação do proprietário MASTER</strong><span>Seu cadastro foi recebido com segurança.</span></div></div><button className="button button-primary button-large" onClick={() => window.location.reload()}><CircleCheck size={18} /> Verificar aprovação</button><button className="button button-secondary button-large" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={18} /> Sair</button></section></main>;
}
function InactiveAccessPage() {
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => { window.location.reload(); } });
  return <main className="login-screen"><section className="login-card"><div className="brand-lockup"><img src="/villela-mark.png" alt="" /><div><strong>VILLELA</strong><span>SDR / OPERAÇÃO</span></div></div><div className="login-copy"><p className="eyebrow">CONTROLE DE ACESSO</p><h1>Acesso desativado</h1><p>Este usuário foi excluído ou desativado pelo MASTER. Solicite uma reaprovação ao proprietário do site.</p></div><button className="button button-primary button-large" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={18} /> Sair</button></section></main>;
}

function App() {
  const user = trpc.auth.me.useQuery();
  const storedSectorId = typeof window !== "undefined" ? Number(localStorage.getItem("villela-active-sector")) : 0;
  const hasSectorChoice = Boolean(storedSectorId);
  const unauthorizedSector = Boolean(user.data && hasSectorChoice && !user.data.sectors?.some((sector: any) => sector.id === storedSectorId));
  const waitingApproval = Boolean(user.data && !user.data.sectors?.length && user.data.role !== "master");
  return <ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster />{user.isLoading ? <div className="app-loading"><div className="loading-mark"><img src="/villela-mark.png" alt="" /></div><span>Carregando operação…</span></div> : user.data ? waitingApproval ? <PendingApprovalPage user={user.data} /> : !user.data.active ? <InactiveAccessPage /> : unauthorizedSector ? <AccessDeniedPage /> : (user.data.sectors?.length > 1 && !hasSectorChoice ? <SectorPicker user={user.data} /> : <AppShell user={user.data} />) : <LoginScreen />}</TooltipProvider></ThemeProvider>;
}

export default App;
