"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BookOpenCheck,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  LifeBuoy,
  LoaderCircle,
  LogOut,
  MapPin,
  MessageSquareText,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LocaleToggle } from "@/components/LocaleToggle";
import { api, type PortalUser } from "@/lib/api";

type Session = {
  id: string;
  title: string;
  class_name: string;
  room: string;
  starts_at: string;
  duration_minutes: number;
  enrolled_count: number;
  capacity: number;
};
type Invoice = {
  id: string;
  reference: string;
  description: string;
  amount_vnd: number;
  due_date: string;
  status: string;
};
type Student = { id: string; full_name: string };
type Ticket = {
  id: string;
  requester_name?: string;
  title: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
  sla_remaining_minutes: number;
  sla_level?: "green" | "yellow" | "red";
};
type AttendanceRow = { id: string; student_name: string; checked_in_at: string };
type FeedbackNote = { id: string; session_title: string; english_text: string; vietnamese_text: string; created_at: string };
type PortalData = {
  student_name?: string;
  class_name?: string;
  next_session?: Session | null;
  sessions: Session[];
  invoices: Invoice[];
  attendance: AttendanceRow[];
  feedback: FeedbackNote[];
  students: Student[];
  tickets: Ticket[];
};

const emptyData: PortalData = { sessions: [], invoices: [], attendance: [], feedback: [], students: [], tickets: [] };

function formatDate(value: string | Date, locale: string, withTime = false) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: withTime ? "short" : undefined,
    day: "2-digit",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(value);
}

function timeUntil(value: string, locale: string) {
  const distance = Math.max(0, new Date(value).getTime() - Date.now());
  const hours = Math.floor(distance / 3_600_000);
  const minutes = Math.floor((distance % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return locale === "vi" ? `Còn ${days} ngày` : `In ${days} days`;
  }
  return locale === "vi" ? `Còn ${hours} giờ ${minutes} phút` : `In ${hours}h ${minutes}m`;
}

function IconFor({ icon: Icon, size = 18 }: { icon: typeof CalendarDays; size?: number }) {
  return <Icon size={size} strokeWidth={1.8} />;
}

export function Portal({ locale }: { locale: string }) {
  const t = useTranslations("portal") as unknown as (key: string) => string;
  const router = useRouter();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [data, setData] = useState<PortalData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [flash, setFlash] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [qrToken, setQrToken] = useState("");
  const [qrRefreshing, setQrRefreshing] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveSessionId, setLeaveSessionId] = useState("");
  const [makeupSessionId, setMakeupSessionId] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [strengths, setStrengths] = useState(["Active participation", "Clear pronunciation"]);
  const [focus, setFocus] = useState("using complete sentences with confidence");
  const [englishFeedback, setEnglishFeedback] = useState("");
  const [vietnameseFeedback, setVietnameseFeedback] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const refreshData = useCallback(async (currentUser: PortalUser) => {
    setLoading(true);
    try {
      if (currentUser.role === "student") {
        const [dashboard, schedule, invoices, feedback] = await Promise.all([
          api<{ student_name?: string; class_name?: string; next_session?: Session | null; sessions: Session[]; attendance: { id: string; session_id: string; checked_in_at: string }[] }>("/student/dashboard"),
          api<{ sessions: Session[] }>("/student/schedule"),
          api<{ invoices: Invoice[] }>("/student/invoices"),
          api<{ feedback: FeedbackNote[] }>("/student/feedback"),
          api<{ tickets: Ticket[] }>("/student/tickets"),
        ]);
        setData({ ...emptyData, ...dashboard, sessions: schedule.sessions, invoices: invoices.invoices, feedback: feedback.feedback, tickets: tickets.tickets });
      } else if (currentUser.role === "teacher") {
        const sessions = await api<{ sessions: Session[] }>("/teacher/sessions");
        setData({ ...emptyData, sessions: sessions.sessions });
        setSelectedSessionId((current) => current || sessions.sessions[0]?.id || "");
        setSelectedStudentId("");
      } else {
        const result = await api<{ tickets: Ticket[] }>("/staff/tickets");
        setData({ ...emptyData, tickets: result.tickets });
      }
    } catch (cause) {
      const failure = cause as Error & { status?: number };
      if (failure.status === 401) {
        window.localStorage.removeItem("vus_token");
        window.localStorage.removeItem("vus_user");
        router.replace(`/${locale}`);
      } else {
        setFlash({ message: failure.message || t("error"), kind: "error" });
      }
    } finally {
      setLoading(false);
    }
  }, [locale, router, t]);

  useEffect(() => {
    const saved = window.localStorage.getItem("vus_user");
    const token = window.localStorage.getItem("vus_token");
    if (!saved || !token) {
      router.replace(`/${locale}`);
      return;
    }
    try {
      setUser(JSON.parse(saved) as PortalUser);
    } catch {
      window.localStorage.removeItem("vus_user");
      router.replace(`/${locale}`);
    }
  }, [locale, router]);

  useEffect(() => {
    if (user) void refreshData(user);
  }, [user, refreshData]);

  const role = user?.role ?? "student";

  useEffect(() => {
    if (role !== "teacher" || !selectedSessionId) return;
    let mounted = true;
    api<{ students: Student[] }>(`/teacher/students?session_id=${encodeURIComponent(selectedSessionId)}`)
      .then((result) => {
        if (!mounted) return;
        setData((current) => ({ ...current, students: result.students }));
        setSelectedStudentId((current) => result.students.some((item) => item.id === current) ? current : result.students[0]?.id ?? "");
      })
      .catch((cause) => setFlash({ message: cause instanceof Error ? cause.message : t("error"), kind: "error" }));
    return () => { mounted = false; };
  }, [role, selectedSessionId, t]);

  useEffect(() => {
    if (!flash) return;
    const timeout = window.setTimeout(() => setFlash(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [flash]);

  const navItems = useMemo(() => {
    if (role === "teacher") return [
      { id: "overview", label: t("overview"), icon: CalendarDays },
      { id: "attendance", label: t("attendance"), icon: QrCode },
      { id: "feedback", label: t("feedback"), icon: MessageSquareText },
    ];
    if (role === "staff") return [
      { id: "overview", label: t("overview"), icon: CalendarDays },
      { id: "helpdesk", label: t("helpdesk"), icon: LifeBuoy },
    ];
    return [
      { id: "overview", label: t("overview"), icon: CalendarDays },
      { id: "schedule", label: t("schedule"), icon: BookOpenCheck },
      { id: "tuition", label: t("tuition"), icon: CircleDollarSign },
      { id: "helpdesk", label: t("helpdesk"), icon: LifeBuoy },
    ];
  }, [role, t]);

  const activeLabel = navItems.find((item) => item.id === activeTab)?.label ?? t("overview");
  const roleLabel = role === "teacher" ? t("roleTeacher") : role === "staff" ? t("roleStaff") : t("roleStudent");
  const nextSession = data.next_session ?? data.sessions.find((session) => new Date(session.starts_at).getTime() >= Date.now());
  const eligibleSessions = data.sessions.filter((session) => new Date(session.starts_at).getTime() > Date.now() + 4 * 60 * 60 * 1000);
  const originalForLeave = eligibleSessions.find((session) => session.id === leaveSessionId) ?? eligibleSessions[0];
  const makeups = data.sessions.filter((session) =>
    session.id !== originalForLeave?.id &&
    (!originalForLeave || new Date(session.starts_at) > new Date(originalForLeave.starts_at)) &&
    session.enrolled_count < Math.min(session.capacity, 18),
  );
  const pendingInvoices = data.invoices.filter((invoice) => invoice.status !== "paid");

  function notify(message: string, kind: "success" | "error" = "success") {
    setFlash({ message, kind });
  }

  function signOut() {
    window.localStorage.removeItem("vus_token");
    window.localStorage.removeItem("vus_user");
    router.replace(`/${locale}`);
  }

  async function handleDemoCheckIn(scannedToken?: string) {
    try {
      const demoQr = scannedToken ? null : await api<{ token: string }>("/student/demo-qr");
      const token = scannedToken || demoQr?.token || "";
      const result = await api<{ status: string }>("/student/attendance", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      notify(result.status === "already_checked_in" ? t("attended") : t("success"));
      if (user) await refreshData(user);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("error"), "error");
    }
  }

  async function submitLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!originalForLeave || !makeupSessionId) return;
    try {
      await api("/student/leave-requests", {
        method: "POST",
        body: JSON.stringify({ session_id: originalForLeave.id, makeup_session_id: makeupSessionId, reason: leaveReason }),
      });
      setShowLeaveForm(false);
      setLeaveReason("");
      notify(t("success"));
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("error"), "error");
    }
  }

  async function payInvoice(invoice: Invoice) {
    try {
      await api(`/student/invoices/${invoice.id}/pay`, { method: "POST" });
      notify(t("success"));
      if (user) await refreshData(user);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("error"), "error");
    }
  }

  const refreshQr = useCallback(async () => {
    if (!selectedSessionId) return;
    setQrRefreshing(true);
    try {
      const result = await api<{ token: string }>(`/teacher/sessions/${selectedSessionId}/qr`, { method: "POST" });
      setQrToken(result.token);
    } catch (cause) {
      setFlash({ message: cause instanceof Error ? cause.message : t("error"), kind: "error" });
    } finally {
      setQrRefreshing(false);
    }
  }, [selectedSessionId, t]);

  useEffect(() => {
    if (role !== "teacher" || activeTab !== "attendance" || !selectedSessionId) return;
    void refreshQr();
    const interval = window.setInterval(() => void refreshQr(), 55_000);
    return () => window.clearInterval(interval);
  }, [role, activeTab, selectedSessionId, refreshQr]);

  useEffect(() => {
    if (role !== "teacher" || activeTab !== "attendance" || !selectedSessionId) return;
    let mounted = true;
    const loadAttendance = async () => {
      try {
        const result = await api<{ attendance: AttendanceRow[] }>(`/teacher/sessions/${selectedSessionId}/attendance`);
        if (mounted) setData((current) => ({ ...current, attendance: result.attendance }));
      } catch {
        // The QR stays usable if the live attendance list cannot refresh.
      }
    };
    void loadAttendance();
    const interval = window.setInterval(() => void loadAttendance(), 12_000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [role, activeTab, selectedSessionId]);

  async function suggestFeedback() {
    if (!selectedStudentId) return;
    setFeedbackBusy(true);
    try {
      const result = await api<{ english_text: string; vietnamese_text: string }>("/teacher/feedback/suggest", {
        method: "POST",
        body: JSON.stringify({ student_id: selectedStudentId, strengths, focus }),
      });
      setEnglishFeedback(result.english_text);
      setVietnameseFeedback(result.vietnamese_text);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("error"), "error");
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function saveFeedback() {
    if (!selectedSessionId || !selectedStudentId || !englishFeedback || !vietnameseFeedback) return;
    try {
      await api("/teacher/feedback", {
        method: "POST",
        body: JSON.stringify({ session_id: selectedSessionId, student_id: selectedStudentId, english_text: englishFeedback, vietnamese_text: vietnameseFeedback }),
      });
      notify(t("success"));
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("error"), "error");
    }
  }

  async function updateTicket(ticket: Ticket, status: string) {
    try {
      await api(`/staff/tickets/${ticket.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (user) await refreshData(user);
      notify(t("success"));
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("error"), "error");
    }
  }

  function setTicketFilter(status: string) {
    setFilterStatus(status);
  }

  if (!user) return <div className="app-loading"><LoaderCircle className="spin" size={24} />{t("loading")}</div>;

  return (
    <main className="portal-shell">
      <aside className="sidebar">
        <a href={`/${locale}/portal`} className="sidebar-brand">
          <span className="brand-mark">V</span><span className="brand-name">VUS <i>ONEPORTAL</i></span>
        </a>
        <div className="workspace-label">{locale === "vi" ? "KHÔNG GIAN LÀM VIỆC" : "WORKSPACE"}</div>
        <div className="workspace-switcher"><span className="workspace-avatar">V</span><span><b>VUS English Centers</b><small>Ho Chi Minh City</small></span><ChevronRight size={15} /></div>
        <div className="nav-section-label">{locale === "vi" ? "MENU CHÍNH" : "MAIN MENU"}</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <button className={`nav-link ${activeTab === item.id ? "active" : ""}`} key={item.id} onClick={() => setActiveTab(item.id)} type="button">
              <IconFor icon={item.icon} /> <span>{item.label}</span>{activeTab === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help"><div className="sidebar-help-icon"><LifeBuoy size={18} /></div><b>{locale === "vi" ? "Bạn cần hỗ trợ?" : "Need help?"}</b><span>{locale === "vi" ? "Đội ngũ VUS luôn sẵn sàng." : "The VUS team is here to help."}</span><button type="button" onClick={() => setActiveTab(role === "staff" ? "helpdesk" : "overview")}>{locale === "vi" ? "Liên hệ hỗ trợ" : "Contact support"}<ArrowRight size={14} /></button></div>
          <button className="sidebar-signout" type="button" onClick={signOut}><LogOut size={16} />{t("signOut")}</button>
          <div className="sidebar-version">ONEPORTAL · VERSION 1.0</div>
        </div>
      </aside>

      <section className="portal-main">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">V</span>VUS <i>ONEPORTAL</i></div>
          <div className="breadcrumb"><span>VUS OnePortal</span><ChevronRight size={14} /><b>{activeLabel}</b></div>
          <div className="topbar-actions">
            <label className="search-box"><Search size={15} /><input placeholder={t("search")} aria-label={t("search")} /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" type="button" aria-label={t("notifications")}><Bell size={18} /><i /></button>
            <LocaleToggle locale={locale} />
            <div className="profile-chip"><span className={`profile-avatar role-${role}`}>{user.full_name.trim().charAt(0)}</span><span className="profile-name"><b>{user.full_name}</b><small>{roleLabel}</small></span><button type="button" onClick={signOut} aria-label={t("signOut")}><LogOut size={16} /></button></div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div><div className="page-eyebrow">{roleLabel.toUpperCase()} <span>·</span> VUS ONEPORTAL</div><h1>{activeTab === "overview" ? `${t("greeting")} ${user.full_name.split(" ").slice(-2).join(" ")}` : activeLabel}</h1><p>{formatDate(new Date(), locale)} <span className="heading-dot">·</span> {locale === "vi" ? "Mọi thông tin học tập của bạn, trong một nơi." : "Everything about your learning, in one place."}</p></div>
            <button className="button button-outline heading-action" type="button" onClick={() => user && refreshData(user)}><CalendarCheck2 size={16} />{locale === "vi" ? "Cập nhật dữ liệu" : "Refresh data"}</button>
          </div>

          {flash && <div className={`toast toast-${flash.kind}`} role="status">{flash.kind === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{flash.message}<button type="button" onClick={() => setFlash(null)}>×</button></div>}

          {loading ? <div className="content-loading"><LoaderCircle className="spin" size={22} />{t("loading")}</div> : (
            <>
              {activeTab === "overview" && role === "student" && <StudentOverview data={data} locale={locale} t={t} onCheckIn={handleDemoCheckIn} onPay={(invoice) => void payInvoice(invoice)} onNavigate={setActiveTab} />}
              {activeTab === "schedule" && role === "student" && <StudentSchedule data={data} locale={locale} t={t} showForm={showLeaveForm} setShowForm={setShowLeaveForm} originalId={leaveSessionId} setOriginalId={setLeaveSessionId} makeupId={makeupSessionId} setMakeupId={setMakeupSessionId} reason={leaveReason} setReason={setLeaveReason} original={originalForLeave} makeups={makeups} eligible={eligibleSessions} onSubmit={submitLeave} />}
              {activeTab === "tuition" && role === "student" && <TuitionView invoices={data.invoices} locale={locale} t={t} onPay={(invoice) => void payInvoice(invoice)} />}
              {activeTab === "helpdesk" && role === "student" && <StudentHelpdesk tickets={data.tickets} locale={locale} t={t} notify={notify} onCreated={() => user && refreshData(user)} />}
              {activeTab === "overview" && role === "teacher" && <TeacherOverview data={data} locale={locale} t={t} onNavigate={setActiveTab} />}
              {activeTab === "attendance" && role === "teacher" && <TeacherAttendance data={data} locale={locale} t={t} sessionId={selectedSessionId} setSessionId={setSelectedSessionId} qrToken={qrToken} qrRefreshing={qrRefreshing} />}
              {activeTab === "feedback" && role === "teacher" && <FeedbackWorkspace data={data} locale={locale} t={t} strengths={strengths} setStrengths={setStrengths} focus={focus} setFocus={setFocus} studentId={selectedStudentId} setStudentId={setSelectedStudentId} sessionId={selectedSessionId} setSessionId={setSelectedSessionId} english={englishFeedback} setEnglish={setEnglishFeedback} vietnamese={vietnameseFeedback} setVietnamese={setVietnameseFeedback} busy={feedbackBusy} onSuggest={() => void suggestFeedback()} onSave={() => void saveFeedback()} />}
              {activeTab === "overview" && role === "staff" && <StaffOverview data={data} locale={locale} t={t} onNavigate={setActiveTab} />}
              {activeTab === "helpdesk" && role === "staff" && <HelpdeskView tickets={data.tickets} locale={locale} t={t} filterStatus={filterStatus} setFilterStatus={setTicketFilter} onUpdate={(ticket, status) => void updateTicket(ticket, status)} />}
            </>
          )}
        </div>
        <footer className="portal-footer"><span>© 2026 VUS · ONEPORTAL</span><span>{locale === "vi" ? "Được thiết kế cho trải nghiệm học tập liền mạch." : "Designed for a seamless learning experience."}</span></footer>
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navItems.slice(0, 4).map((item) => <button type="button" key={item.id} onClick={() => setActiveTab(item.id)} className={activeTab === item.id ? "active" : ""}><IconFor icon={item.icon} size={20} /><span>{item.label}</span></button>)}
      </nav>
    </main>
  );
}

function MetricCard({ icon: Icon, label, value, note, tone = "navy" }: { icon: typeof CalendarDays; label: string; value: string; note?: string; tone?: "navy" | "red" | "green" | "gold" }) {
  return <article className="metric-card"><span className={`metric-icon tone-${tone}`}><Icon size={18} strokeWidth={1.9} /></span><span className="metric-label">{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}

function StudentOverview({ data, locale, t, onCheckIn, onPay, onNavigate }: { data: PortalData; locale: string; t: (key: string) => string; onCheckIn: (token?: string) => void; onPay: (invoice: Invoice) => void; onNavigate: (tab: string) => void }) {
  const next = data.next_session ?? data.sessions.find((session) => new Date(session.starts_at).getTime() >= Date.now());
  const invoice = data.invoices.find((item) => item.status !== "paid");
  const [qrInputOpen, setQrInputOpen] = useState(false);
  const [qrToken, setQrToken] = useState("");
  function submitQr(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onCheckIn(qrToken.trim()); setQrToken(""); }
  return <div className="dashboard-grid">
    <div className="student-welcome-card">
      <div className="welcome-copy"><span className="welcome-kicker"><span />{locale === "vi" ? "HỌC TẬP TIẾN BỘ MỖI NGÀY" : "A LITTLE BETTER EVERY DAY"}</span><h2>{locale === "vi" ? "Sẵn sàng cho buổi học tiếp theo?" : "Ready for your next class?"}</h2><p>{locale === "vi" ? "Lịch học, điểm danh và thông tin học tập đã được cập nhật." : "Your schedule, attendance, and learning updates are in sync."}</p><button type="button" onClick={() => onNavigate("schedule")} className="welcome-link">{t("viewSchedule")}<ArrowRight size={15} /></button></div>
      <div className="welcome-illustration" aria-hidden="true"><div className="illustration-circle circle-large" /><div className="illustration-circle circle-small" /><BookOpenCheck size={58} strokeWidth={1.2} /></div>
    </div>
    <div className="metric-grid four-metrics">
      <MetricCard icon={CalendarDays} label={t("nextLesson")} value={next ? formatDate(next.starts_at, locale) : "—"} note={next ? timeUntil(next.starts_at, locale) : undefined} />
      <MetricCard icon={MapPin} label={t("room")} value={next?.room ?? "NOVA-402"} note={`${t("classCode")} · ${next?.class_name ?? data.class_name ?? "AV7-204"}`} tone="green" />
      <MetricCard icon={CheckCircle2} label={t("attendanceRate")} value="96%" note={locale === "vi" ? "Tốt hơn 8% so với tháng trước" : "Up 8% from last month"} tone="green" />
      <MetricCard icon={CircleDollarSign} label={t("outstanding")} value={invoice ? formatMoney(invoice.amount_vnd) : "0 ₫"} note={invoice ? `${t("dueDate")} · ${formatDate(invoice.due_date, locale)}` : t("paid")} tone={invoice ? "red" : "green"} />
    </div>
    <section className="panel quick-panel">
      <div className="panel-heading">
        <div><span className="panel-overline">ONE-CLICK</span><h3>{t("quickAction")}</h3></div>
        <button type="button" className="text-button" onClick={() => setQrInputOpen((open) => !open)}><QrCode size={14} />{locale === "vi" ? "Nhập mã QR" : "Enter QR token"}</button>
      </div>
      <div className="quick-actions">
        <button className="quick-action" type="button" onClick={() => onNavigate("schedule")}><span className="quick-action-icon icon-blue"><CalendarDays size={18} /></span><span><b>{t("viewSchedule")}</b><small>{locale === "vi" ? "Xem lịch và lớp học bù" : "Classes and make-up sessions"}</small></span><ChevronRight size={16} /></button>
        <button className="quick-action" type="button" onClick={() => onCheckIn()}><span className="quick-action-icon icon-green"><QrCode size={18} /></span><span><b>{t("checkInDemo")}</b><small>{locale === "vi" ? "Thử quy trình điểm danh QR" : "Try the QR attendance flow"}</small></span><ChevronRight size={16} /></button>
        <button className="quick-action" type="button" onClick={() => invoice ? onPay(invoice) : onNavigate("tuition")}><span className="quick-action-icon icon-red"><CreditCard size={18} /></span><span><b>{t("payNow")}</b><small>{locale === "vi" ? "Hóa đơn và lịch sử thanh toán" : "Invoices and payment history"}</small></span><ChevronRight size={16} /></button>
      </div>
      {qrInputOpen && <form className="attendance-token-entry" onSubmit={submitQr}><label>{locale === "vi" ? "Mã QR của buổi học" : "Class QR token"}<input value={qrToken} onChange={(event) => setQrToken(event.target.value)} placeholder={t("qrPasteHint")} required /></label><button className="button button-primary" type="submit" disabled={!qrToken.trim()}>{t("submitCheckIn")}<ArrowRight size={14} /></button></form>}
    </section>
    <section className="panel next-session-panel"><div className="panel-heading"><div><span className="panel-overline">{locale === "vi" ? "LỊCH HỌC" : "YOUR SCHEDULE"}</span><h3>{t("nextLesson")}</h3></div><button className="text-button" type="button" onClick={() => onNavigate("schedule")}>{locale === "vi" ? "Tất cả lịch" : "Full schedule"}<ArrowRight size={14} /></button></div>{next ? <div className="next-session-detail"><div className="session-date-block"><b>{new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(next.starts_at))}</b><span>{new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { month: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(next.starts_at))}</span></div><div className="session-main"><b>{next.title}</b><span>{next.class_name} <i>·</i> {next.room}</span></div><span className="session-time"><Clock3 size={14} />{new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(next.starts_at))}</span></div> : <div className="empty-state">{t("empty")}</div>}</section>
    <section className="panel activity-panel"><div className="panel-heading"><div><span className="panel-overline">{locale === "vi" ? "CẬP NHẬT" : "UPDATES"}</span><h3>{t("latestActivity")}</h3></div><button className="icon-button subtle-icon" type="button"><Bell size={17} /></button></div><div className="activity-row"><span className="activity-indicator activity-success"><CheckCircle2 size={15} /></span><span><b>{t("recentNotice")}</b><small>{locale === "vi" ? "Lịch học tuần mới đã sẵn sàng." : "Your new weekly schedule is ready."}</small></span><time>{locale === "vi" ? "2 giờ trước" : "2h ago"}</time></div><div className="activity-row"><span className="activity-indicator activity-payment"><CreditCard size={15} /></span><span><b>{t("invoiceTitle")}</b><small>{locale === "vi" ? "Học phí tháng này đã được cập nhật." : "This month's tuition has been updated."}</small></span><time>{locale === "vi" ? "Hôm qua" : "Yesterday"}</time></div></section>
    <section className="panel parent-feedback-panel"><div className="panel-heading"><div><span className="panel-overline">ACADEMIC UPDATE</span><h3>{t("teacherFeedback")}</h3></div><MessageSquareText size={18} className="muted-icon" /></div>{data.feedback[0] ? <><div className="parent-feedback-meta"><b>{data.feedback[0].session_title}</b><time>{formatDate(data.feedback[0].created_at, locale)}</time></div><div className="parent-feedback-copy"><p lang="en"><span>EN</span>{data.feedback[0].english_text}</p><p lang="vi"><span>VI</span>{data.feedback[0].vietnamese_text}</p></div></> : <div className="feedback-empty">{t("noFeedback")}</div>}</section>
  </div>;
}

function StudentSchedule({ data, locale, t, showForm, setShowForm, originalId, setOriginalId, makeupId, setMakeupId, reason, setReason, original, makeups, eligible, onSubmit }: { data: PortalData; locale: string; t: (key: string) => string; showForm: boolean; setShowForm: (value: boolean) => void; originalId: string; setOriginalId: (value: string) => void; makeupId: string; setMakeupId: (value: string) => void; reason: string; setReason: (value: string) => void; original?: Session; makeups: Session[]; eligible: Session[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="workspace-grid"><section className="panel schedule-panel"><div className="panel-heading"><div><span className="panel-overline">{locale === "vi" ? "THỜI KHÓA BIỂU" : "TIMETABLE"}</span><h3>{t("scheduleTitle")}</h3></div><button className="button button-outline" type="button" onClick={() => setShowForm(!showForm)}><CalendarCheck2 size={15} />{t("leaveRequest")}</button></div><div className="schedule-list">{data.sessions.map((session) => <article className="schedule-row" key={session.id}><div className="schedule-date"><b>{new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(session.starts_at))}</b><span>{new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { month: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(session.starts_at))}</span></div><div className="schedule-row-main"><b>{session.title}</b><span>{session.class_name} <i>·</i> {session.room}</span></div><div className="schedule-row-meta"><span><Clock3 size={14} />{new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(session.starts_at))}</span><span><Users size={14} />{session.enrolled_count}/{session.capacity}</span></div></article>)}</div>{data.sessions.length === 0 && <div className="empty-state">{t("empty")}</div>}</section>
    {showForm ? <section className="panel leave-panel"><div className="panel-heading"><div><span className="panel-overline">STUDENT SERVICES</span><h3>{t("leaveRequest")}</h3></div><button type="button" className="close-button" onClick={() => setShowForm(false)}>×</button></div><form className="leave-form" onSubmit={onSubmit}><label>{t("originalClass")}<select value={original?.id ?? originalId} onChange={(event) => { setOriginalId(event.target.value); setMakeupId(""); }} required><option value="">—</option>{eligible.map((session) => <option value={session.id} key={session.id}>{session.title} · {formatDate(session.starts_at, locale, true)}</option>)}</select></label><label>{t("makeupClass")}<select value={makeupId} onChange={(event) => setMakeupId(event.target.value)} required><option value="">—</option>{makeups.map((session) => <option value={session.id} key={session.id}>{session.title} · {formatDate(session.starts_at, locale, true)} · {Math.max(0, Math.min(session.capacity, 18) - session.enrolled_count)} {t("capacity")}</option>)}</select></label><label>{t("reason")}<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={500} placeholder={t("reasonPlaceholder")} required /></label><div className="form-rule"><ShieldCheck size={15} />{locale === "vi" ? "Gửi trước giờ học ít nhất 4 tiếng · Lớp bù tối đa 18 học viên." : "Submit at least 4 hours ahead · Make-up classes cap at 18 students."}</div><button className="button button-primary" disabled={!original || !makeupId || !reason.trim()} type="submit"><Send size={15} />{t("leaveSubmit")}</button></form>{eligible.length === 0 && <p className="inline-warning">{locale === "vi" ? "Chưa có buổi học đủ điều kiện xin nghỉ (cần báo trước 4 tiếng)." : "No class is eligible yet (requests must be 4 hours ahead)."}</p>}</section> : <section className="panel makeup-info"><div className="makeup-symbol"><CalendarCheck2 size={23} /></div><span className="panel-overline">FLEXIBLE LEARNING</span><h3>{locale === "vi" ? "Lỡ một buổi học?" : "Need to miss a class?"}</h3><p>{locale === "vi" ? "Gửi yêu cầu xin nghỉ và chọn buổi học bù phù hợp. Hệ thống sẽ kiểm tra thời hạn báo trước và sĩ số lớp." : "Request leave and choose a make-up class. The portal checks the notice window and class capacity."}</p><button className="text-button" type="button" onClick={() => setShowForm(true)}>{t("leaveRequest")}<ArrowRight size={14} /></button><div className="capacity-preview"><span>{locale === "vi" ? "Sĩ số lớp học bù" : "Make-up class capacity"}</span><b>{makeups[0] ? `${makeups[0].enrolled_count}/${Math.min(makeups[0].capacity, 18)}` : "—"}</b><div><i style={{ width: `${makeups[0] ? Math.min(100, (makeups[0].enrolled_count / Math.min(makeups[0].capacity, 18)) * 100) : 0}%` }} /></div></div></section>}</div>;
}

function StudentHelpdesk({ tickets, locale, t, notify, onCreated }: { tickets: Ticket[]; locale: string; t: (key: string) => string; notify: (message: string, kind?: "success" | "error") => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Tài khoản & thông báo");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/student/tickets", { method: "POST", body: JSON.stringify({ title, category, description }) });
      setTitle("");
      setDescription("");
      notify(t("ticketSubmitted"));
      onCreated();
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : t("error"), "error");
    } finally {
      setBusy(false);
    }
  }

  return <div className="parent-helpdesk-grid"><section className="panel parent-ticket-form"><div className="panel-heading"><div><span className="panel-overline">PARENT SUPPORT · SLA 8H</span><h3>{t("newTicket")}</h3></div><span className="quick-action-icon icon-blue"><LifeBuoy size={18} /></span></div><p className="section-description">{locale === "vi" ? "Gửi câu hỏi cho đội ngũ giáo vụ. Bạn sẽ thấy trạng thái và thời gian phản hồi tại đây." : "Send a request to the academic team and follow its status here."}</p><form className="leave-form" onSubmit={submit}><label>{t("ticketTitle")}<input value={title} onChange={(event) => setTitle(event.target.value)} minLength={5} maxLength={180} required placeholder={locale === "vi" ? "Ví dụ: Cần hỗ trợ lịch học" : "For example: Help with my schedule"} /></label><label>{t("ticketCategory")}<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="Tài khoản & thông báo">{t("categoryAccount")}</option><option value="Lịch học & lớp bù">{t("categorySchedule")}</option><option value="Học phí & thanh toán">{t("categoryTuition")}</option><option value="Khác">{t("categoryOther")}</option></select></label><label>{t("ticketDescription")}<textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={10} maxLength={3000} required placeholder={t("reasonPlaceholder")} /></label><div className="form-rule"><Clock3 size={15} />{locale === "vi" ? "Cam kết phản hồi trong 8 giờ làm việc (thứ Hai–thứ Sáu, 09:00–18:00)." : "We respond within 8 working hours (Mon–Fri, 09:00–18:00)."}</div><button type="submit" className="button button-primary" disabled={busy || !title.trim() || !description.trim()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Send size={15} />}{t("submitTicket")}</button></form></section><section className="panel parent-ticket-list"><div className="panel-heading"><div><span className="panel-overline">SERVICE REQUESTS</span><h3>{t("ticketTitle")}</h3></div><span className="invoice-count">{tickets.length}</span></div><div className="student-ticket-list">{tickets.map((ticket) => { const level = ticket.sla_level ?? (ticket.sla_remaining_minutes < 60 ? "red" : ticket.sla_remaining_minutes < 240 ? "yellow" : "green"); const label = ticket.status === "resolved" ? t("resolved") : ticket.status === "new" ? t("new") : t("inProgress"); return <article className="student-ticket-card" key={ticket.id}><div className="student-ticket-head"><span className={`ticket-status-marker ${level}`}><LifeBuoy size={15} /></span><div><b>{ticket.title}</b><small>{ticket.category} · {formatDate(ticket.created_at, locale, true)}</small></div><span className={`status-pill status-${ticket.status === "resolved" ? "green" : ticket.status === "new" ? "red" : "blue"}`}><i />{label}</span></div><p>{ticket.description}</p><div className="student-ticket-sla"><span>{t("sla")}</span><span className={`sla-pill sla-${level}`}>{formatSla(ticket.sla_remaining_minutes, locale)}</span></div></article>; })}{tickets.length === 0 && <div className="empty-state">{t("noTickets")}</div>}</div></section></div>;
}

function TuitionView({ invoices, locale, t, onPay }: { invoices: Invoice[]; locale: string; t: (key: string) => string; onPay: (invoice: Invoice) => void }) {
  return <div className="workspace-grid tuition-grid"><section className="panel invoice-panel"><div className="panel-heading"><div><span className="panel-overline">FINANCE & BILLING</span><h3>{t("invoiceTitle")}</h3></div><span className="invoice-count">{invoices.length} {locale === "vi" ? "hóa đơn" : "invoices"}</span></div>{invoices.map((invoice) => <article className="invoice-row" key={invoice.id}><span className={`invoice-icon ${invoice.status === "paid" ? "paid-icon" : "pending-icon"}`}><CreditCard size={18} /></span><div className="invoice-main"><b>{invoice.description}</b><span>{t("invoiceRef")}: {invoice.reference}</span></div><div className="invoice-amount"><b>{formatMoney(invoice.amount_vnd)}</b><span>{t("dueDate")}: {formatDate(invoice.due_date, locale)}</span></div><span className={`status-pill ${invoice.status === "paid" ? "status-green" : "status-yellow"}`}>{invoice.status === "paid" ? t("paid") : t("pending")}</span>{invoice.status !== "paid" && <button className="button button-primary invoice-pay" onClick={() => onPay(invoice)} type="button">{t("payNow")}<ArrowRight size={14} /></button>}</article>)}{invoices.length === 0 && <div className="empty-state">{t("empty")}</div>}</section><aside className="panel payment-side"><div className="payment-top-icon"><CircleDollarSign size={23} /></div><span className="panel-overline">SIMPLE & SECURE</span><h3>{locale === "vi" ? "Học phí rõ ràng, thanh toán dễ dàng." : "Clear tuition. Simple payments."}</h3><p>{locale === "vi" ? "Theo dõi học phí và trạng thái hóa đơn ngay trên OnePortal." : "Track tuition and invoice status from your OnePortal."}</p><div className="payment-total"><span>{t("outstanding")}</span><b>{formatMoney(invoices.filter((invoice) => invoice.status !== "paid").reduce((sum, invoice) => sum + invoice.amount_vnd, 0))}</b></div><div className="payment-method"><ShieldCheck size={15} /><span>{locale === "vi" ? "Thanh toán sandbox cho bản demo" : "Sandbox payment for this demo"}</span></div></aside></div>;
}

function TeacherOverview({ data, locale, t, onNavigate }: { data: PortalData; locale: string; t: (key: string) => string; onNavigate: (tab: string) => void }) {
  const next = data.sessions[0];
  return <div className="dashboard-grid teacher-dashboard"><div className="student-welcome-card teacher-welcome"><div className="welcome-copy"><span className="welcome-kicker"><span />ACADEMIC PORTAL</span><h2>{locale === "vi" ? "Mỗi buổi học truyền cảm hứng." : "Inspiring progress, one class at a time."}</h2><p>{locale === "vi" ? "Tạo mã điểm danh, theo dõi lớp và gửi nhận xét học tập song ngữ." : "Run attendance, follow your classes, and send bilingual feedback."}</p><button className="welcome-link" type="button" onClick={() => onNavigate("attendance")}>{t("attendance")}<ArrowRight size={15} /></button></div><div className="welcome-illustration"><div className="illustration-circle circle-large" /><div className="illustration-circle circle-small" /><QrCode size={57} strokeWidth={1.4} /></div></div><div className="metric-grid three-metrics"><MetricCard icon={CalendarDays} label={locale === "vi" ? "Buổi học sắp tới" : "Upcoming classes"} value={`${data.sessions.length}`} note={locale === "vi" ? "Đã lên lịch" : "Scheduled"} /><MetricCard icon={Users} label={t("students")} value="14" note="AV7-204" tone="green" /><MetricCard icon={MessageSquareText} label={t("feedback")} value={locale === "vi" ? "Song ngữ" : "Bilingual"} note="AI · EN → VI" tone="gold" /></div><section className="panel next-session-panel teacher-class-panel"><div className="panel-heading"><div><span className="panel-overline">YOUR CLASSROOM</span><h3>{locale === "vi" ? "Lớp học sắp tới" : "Upcoming class"}</h3></div><button className="text-button" type="button" onClick={() => onNavigate("attendance")}>{locale === "vi" ? "Mở điểm danh" : "Open attendance"}<ArrowRight size={14} /></button></div>{next ? <div className="next-session-detail"><div className="session-date-block"><b>{new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(next.starts_at))}</b><span>{new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { month: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(next.starts_at))}</span></div><div className="session-main"><b>{next.title}</b><span>{next.class_name} <i>·</i> {next.room}</span></div><span className="session-time"><Clock3 size={14} />{timeUntil(next.starts_at, locale)}</span></div> : <div className="empty-state">{t("empty")}</div>}</section><section className="panel teacher-tool-panel"><div className="panel-heading"><div><span className="panel-overline">TEACHING TOOLS</span><h3>{locale === "vi" ? "Tiết kiệm thời gian chuẩn bị" : "Spend more time teaching"}</h3></div><Sparkles size={18} className="muted-icon" /></div><button className="quick-action" type="button" onClick={() => onNavigate("feedback")}><span className="quick-action-icon icon-gold"><Sparkles size={18} /></span><span><b>{t("aiTitle")}</b><small>{locale === "vi" ? "Gợi ý nhận xét và dịch trong một chạm" : "Draft and translate feedback in one step"}</small></span><ChevronRight size={16} /></button></section></div>;
}

function TeacherAttendance({ data, locale, t, sessionId, setSessionId, qrToken, qrRefreshing }: { data: PortalData; locale: string; t: (key: string) => string; sessionId: string; setSessionId: (value: string) => void; qrToken: string; qrRefreshing: boolean }) {
  const session = data.sessions.find((item) => item.id === sessionId);
  return <div className="attendance-workspace"><section className="panel qr-panel"><div className="panel-heading"><div><span className="panel-overline">DYNAMIC QR · 60 SEC</span><h3>{t("qrTitle")}</h3></div><span className="live-badge"><i />LIVE</span></div><label className="session-picker">{locale === "vi" ? "Chọn buổi học" : "Choose a class"}<select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>{data.sessions.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.class_name}</option>)}</select></label>{session && <div className="qr-session-summary"><b>{session.class_name}</b><span><MapPin size={14} />{session.room}</span><span><Clock3 size={14} />{formatDate(session.starts_at, locale, true)}</span></div>}<div className="qr-code-wrap">{qrToken ? <QRCodeSVG value={qrToken} size={224} level="H" includeMargin fgColor="#002B49" bgColor="#ffffff" /> : <div className="qr-skeleton"><LoaderCircle className="spin" size={24} /></div>}</div><p className="qr-refresh-note"><span className="qr-live-dot" />{qrRefreshing ? t("refreshing") : t("qrHint")}</p><div className="qr-security"><ShieldCheck size={15} />{locale === "vi" ? "Mã QR có chữ ký và tự hết hạn sau 60 giây." : "Signed QR code expires after 60 seconds."}</div></section><section className="panel attendance-list-panel"><div className="panel-heading"><div><span className="panel-overline">LIVE ROSTER</span><h3>{locale === "vi" ? "Danh sách điểm danh" : "Attendance list"}</h3></div><span className="attendance-counter"><Users size={14} />{data.attendance.length}/{session?.enrolled_count ?? 0}</span></div><p className="section-description">{locale === "vi" ? "Danh sách tự cập nhật khi học viên quét mã QR." : "This list updates as students scan the QR code."}</p><div className="attendee-list">{data.attendance.map((student) => <div className="attendee-row" key={student.id}><span className="attendee-avatar">{student.student_name.charAt(0)}</span><span><b>{student.student_name}</b><small>{locale === "vi" ? "Đã có mặt" : "Present"}</small></span><time>{new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(student.checked_in_at))}</time><CheckCircle2 size={17} className="attendee-check" /></div>)}{data.attendance.length === 0 && <div className="attendance-empty"><div><Users size={22} /></div><b>{locale === "vi" ? "Đang chờ học viên" : "Waiting for students"}</b><span>{locale === "vi" ? "Khi quét mã, tên học viên sẽ hiện tại đây." : "Students will appear here after scanning."}</span></div>}</div><div className="attendance-summary"><span>{locale === "vi" ? "Chuyên cần lớp" : "Class attendance"}</span><b>{session ? Math.round((data.attendance.length / Math.max(1, session.enrolled_count)) * 100) : 0}%</b><div className="progress-track"><i style={{ width: `${session ? Math.min(100, (data.attendance.length / Math.max(1, session.enrolled_count)) * 100) : 0}%` }} /></div></div></section></div>;
}

function FeedbackWorkspace({ data, locale, t, strengths, setStrengths, focus, setFocus, studentId, setStudentId, sessionId, setSessionId, english, setEnglish, vietnamese, setVietnamese, busy, onSuggest, onSave }: { data: PortalData; locale: string; t: (key: string) => string; strengths: string[]; setStrengths: (value: string[]) => void; focus: string; setFocus: (value: string) => void; studentId: string; setStudentId: (value: string) => void; sessionId: string; setSessionId: (value: string) => void; english: string; setEnglish: (value: string) => void; vietnamese: string; setVietnamese: (value: string) => void; busy: boolean; onSuggest: () => void; onSave: () => void }) {
  const tags = locale === "vi"
    ? [
        { value: "Active participation", label: "Tích cực tham gia" },
        { value: "Clear pronunciation", label: "Phát âm rõ ràng" },
        { value: "Good vocabulary", label: "Vốn từ tốt" },
        { value: "Teamwork", label: "Hợp tác tốt" },
      ]
    : [
        { value: "Active participation", label: "Active participation" },
        { value: "Clear pronunciation", label: "Clear pronunciation" },
        { value: "Good vocabulary", label: "Good vocabulary" },
        { value: "Teamwork", label: "Teamwork" },
      ];

  return (
    <div className="feedback-workspace">
      <section className="panel feedback-form-panel">
        <div className="panel-heading">
          <div><span className="panel-overline">AI-ASSISTED · ENGLISH → VIETNAMESE</span><h3>{t("aiTitle")}</h3></div>
          <span className="ai-badge"><Sparkles size={14} />AI</span>
        </div>
        <p className="section-description">{t("feedbackIntro")}</p>
        <div className="feedback-context">
          <label>{t("student")}<select value={studentId} onChange={(event) => setStudentId(event.target.value)}>{data.students.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
          <label>{t("classSession")}<select value={sessionId} onChange={(event) => setSessionId(event.target.value)}>{data.sessions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        </div>
        <div className="feedback-input-block">
          <label>{t("strengths")}</label>
          <div className="chip-list">
            {tags.map((tag) => <button type="button" key={tag.value} className={`select-chip ${strengths.includes(tag.value) ? "selected" : ""}`} onClick={() => setStrengths(strengths.includes(tag.value) ? strengths.filter((item) => item !== tag.value) : [...strengths, tag.value])}>{strengths.includes(tag.value) && <CheckCircle2 size={13} />}{tag.label}</button>)}
          </div>
        </div>
        <label className="focus-field">{t("focus")}<input value={focus} onChange={(event) => setFocus(event.target.value)} /></label>
        <button type="button" className="button button-ai" onClick={onSuggest} disabled={busy || !studentId}>{busy ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}{busy ? t("generating") : t("suggest")}</button>
      </section>
      <section className="panel feedback-preview-panel">
        <div className="panel-heading">
          <div><span className="panel-overline">REVIEW & EDIT</span><h3>{t("feedbackDraft")}</h3></div>
          <span className="draft-badge">{t("editable")}</span>
        </div>
        <label className="feedback-textarea-label">{t("englishFeedback")}<textarea value={english} onChange={(event) => setEnglish(event.target.value)} placeholder={t("englishPlaceholder")} /></label>
        <label className="feedback-textarea-label">{t("vietnameseFeedback")}<textarea value={vietnamese} onChange={(event) => setVietnamese(event.target.value)} placeholder={t("vietnamesePlaceholder")} /></label>
        <div className="feedback-footer"><span><ShieldCheck size={14} />{t("teacherReview")}</span><button type="button" className="button button-primary" disabled={!english || !vietnamese} onClick={onSave}>{t("saveFeedback")}<ArrowRight size={14} /></button></div>
      </section>
    </div>
  );
}

function StaffOverview({ data, locale, t, onNavigate }: { data: PortalData; locale: string; t: (key: string) => string; onNavigate: (tab: string) => void }) {
  const active = data.tickets.filter((ticket) => ticket.status !== "resolved");
  const atRisk = active.filter((ticket) => ticket.sla_level !== "green").length;
  return <div className="dashboard-grid staff-dashboard"><div className="student-welcome-card staff-welcome"><div className="welcome-copy"><span className="welcome-kicker"><span />OPERATIONS · SERVICE DESK</span><h2>{locale === "vi" ? "Hỗ trợ đúng lúc, trải nghiệm trọn vẹn." : "Timely support makes learning smoother."}</h2><p>{locale === "vi" ? "Theo dõi yêu cầu phụ huynh và thời hạn phản hồi SLA ngay trên một màn hình." : "Track parent requests and response SLAs in one workspace."}</p><button className="welcome-link" type="button" onClick={() => onNavigate("helpdesk")}>{t("helpdesk")}<ArrowRight size={15} /></button></div><div className="welcome-illustration"><div className="illustration-circle circle-large" /><div className="illustration-circle circle-small" /><LifeBuoy size={58} strokeWidth={1.3} /></div></div><div className="metric-grid three-metrics"><MetricCard icon={LifeBuoy} label={locale === "vi" ? "Yêu cầu đang mở" : "Open requests"} value={`${active.length}`} note={locale === "vi" ? "Cần theo dõi" : "Need follow-up"} tone="navy" /><MetricCard icon={Clock3} label={t("sla")} value={`${atRisk}`} note={locale === "vi" ? "Sắp đến hạn" : "Approaching deadline"} tone={atRisk ? "gold" : "green"} /><MetricCard icon={CheckCircle2} label={t("resolved")} value={`${data.tickets.filter((ticket) => ticket.status === "resolved").length}`} note="SLA · 8h" tone="green" /></div><section className="panel ticket-preview-panel"><div className="panel-heading"><div><span className="panel-overline">SERVICE LEVEL · 8H</span><h3>{locale === "vi" ? "Yêu cầu cần chú ý" : "Requests to watch"}</h3></div><button className="text-button" type="button" onClick={() => onNavigate("helpdesk")}>{locale === "vi" ? "Mở Helpdesk" : "Open Helpdesk"}<ArrowRight size={14} /></button></div>{data.tickets.slice(0, 2).map((ticket) => <TicketSummary key={ticket.id} ticket={ticket} locale={locale} t={t} />)}{data.tickets.length === 0 && <div className="empty-state">{t("empty")}</div>}</section></div>;
}

function TicketSummary({ ticket, locale, t }: { ticket: Ticket; locale: string; t: (key: string) => string }) {
  const level = ticket.sla_level ?? "green";
  return <div className="ticket-summary-row"><span className={`ticket-status-marker ${level}`}><LifeBuoy size={16} /></span><span className="ticket-summary-main"><b>{ticket.title}</b><small>{ticket.category} · {formatDate(ticket.created_at, locale, true)}</small></span><span className={`sla-pill sla-${level}`}>{t("sla")} · {formatSla(ticket.sla_remaining_minutes, locale)}</span></div>;
}

function formatSla(minutes: number, locale: string) {
  if (minutes < 0) return locale === "vi" ? "Quá hạn" : "Overdue";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return locale === "vi" ? `${hours}g ${remainder}p` : `${hours}h ${remainder}m`;
}

function HelpdeskView({ tickets, locale, t, filterStatus, setFilterStatus, onUpdate }: { tickets: Ticket[]; locale: string; t: (key: string) => string; filterStatus: string; setFilterStatus: (status: string) => void; onUpdate: (ticket: Ticket, status: string) => void }) {
  const filters = [{ id: "all", label: t("all") }, { id: "new", label: t("new") }, { id: "in_progress", label: t("inProgress") }, { id: "resolved", label: t("resolved") }];
  const visibleTickets = filterStatus === "all" ? tickets : tickets.filter((ticket) => ticket.status === filterStatus);
  return <section className="panel helpdesk-panel"><div className="panel-heading helpdesk-heading"><div><span className="panel-overline">HELPDESK · SERVICE LEVEL AGREEMENT</span><h3>{t("ticketTitle")}</h3><p className="section-description">{locale === "vi" ? "Phản hồi trong 8 giờ làm việc · Xanh: còn trên 4h · Vàng: 1–4h · Đỏ: dưới 1h hoặc quá hạn." : "Respond within 8 working hours · Green: >4h · Yellow: 1–4h · Red: <1h or overdue."}</p></div><span className="sla-target"><Clock3 size={16} />8 {locale === "vi" ? "giờ làm việc" : "working hours"}</span></div><div className="ticket-filter-row">{filters.map((filter) => <button type="button" key={filter.id} onClick={() => setFilterStatus(filter.id)} className={filterStatus === filter.id ? "selected" : ""}>{filter.label}<span>{filter.id === "all" ? tickets.length : tickets.filter((item) => item.status === filter.id).length}</span></button>)}</div><div className="ticket-table-wrap"><table className="ticket-table"><thead><tr><th>{locale === "vi" ? "YÊU CẦU" : "REQUEST"}</th><th>{locale === "vi" ? "NGƯỜI GỬI" : "REQUESTER"}</th><th>{locale === "vi" ? "TRẠNG THÁI" : "STATUS"}</th><th>{t("sla")}</th><th /></tr></thead><tbody>{visibleTickets.map((ticket) => <tr key={ticket.id}><td><div className="ticket-title-cell"><b>{ticket.title}</b><span>{ticket.category} · {ticket.description}</span></div></td><td><div className="requester-cell"><span className="requester-avatar">{(ticket.requester_name ?? "P").charAt(0)}</span><span>{ticket.requester_name ?? (locale === "vi" ? "Phụ huynh" : "Parent")}<small>{formatDate(ticket.created_at, locale, true)}</small></span></div></td><td><span className={`status-pill status-${ticket.status === "resolved" ? "green" : ticket.status === "new" ? "red" : "blue"}`}><i />{ticket.status === "new" ? t("new") : ticket.status === "resolved" ? t("resolved") : t("inProgress")}</span></td><td><span className={`sla-pill sla-${ticket.sla_level ?? "green"}`}>{formatSla(ticket.sla_remaining_minutes, locale)}</span></td><td>{ticket.status !== "resolved" ? <button className="resolve-button" type="button" onClick={() => onUpdate(ticket, "resolved")} title={t("markResolved")}><CheckCircle2 size={17} /></button> : <span className="resolved-check"><CheckCircle2 size={17} /></span>}</td></tr>)}</tbody></table>{visibleTickets.length === 0 && <div className="empty-state">{t("empty")}</div>}</div></section>;
}
