"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, BookOpenCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { LocaleToggle } from "@/components/LocaleToggle";
import { api, type PortalUser } from "@/lib/api";

type LoginResponse = { access_token: string; user: PortalUser };

const demoAccounts = [
  { email: "parent@vus.vn", label: "roleStudent" },
  { email: "teacher@vus.vn", label: "roleTeacher" },
  { email: "staff@vus.vn", label: "roleStaff" },
] as const;

export function LoginPage({ locale }: { locale: string }) {
  const t = useTranslations("login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(accountEmail = email, accountPassword = password) {
    setLoading(true);
    setError("");
    try {
      const result = await api<LoginResponse>("/auth/login", {
        method: "POST",
        auth: false,
        body: JSON.stringify({ email: accountEmail, password: accountPassword }),
      });
      window.localStorage.setItem("vus_token", result.access_token);
      window.localStorage.setItem("vus_user", JSON.stringify(result.user));
      router.replace(`/${locale}/portal`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void signIn();
  }

  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="showcase-grid" aria-hidden="true" />
        <div className="showcase-topline">
          <a className="brand-lockup" href={`/${locale}`} aria-label="VUS OnePortal">
            <span className="brand-mark">V</span>
            <span className="brand-name">VUS <i>ONEPORTAL</i></span>
          </a>
          <span className="showcase-campus">ENGLISH CENTERS · VIETNAM</span>
        </div>
        <div className="showcase-content">
          <div className="eyebrow"><span className="eyebrow-dot" />{t("eyebrow")}</div>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
          <div className="showcase-proof">
            <div className="proof-icon"><BookOpenCheck size={19} strokeWidth={1.8} /></div>
            <div><b>Learning, all in one place.</b><span>Class · Progress · Community</span></div>
            <ArrowRight size={17} className="proof-arrow" />
          </div>
          <div className="showcase-decoration" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <span className="decoration-letter">V.</span><span className="decoration-accent" />
          </div>
        </div>
        <div className="showcase-footer"><span>VUS · HỌC TẬP TRỌN ĐỜI</span><span>© 2026</span></div>
      </section>

      <section className="login-panel">
        <header className="login-panel-header">
          <span className="mobile-brand">VUS <i>ONEPORTAL</i></span>
          <LocaleToggle locale={locale} />
        </header>
        <div className="login-card-wrap">
          <div className="login-heading">
            <span className="login-icon"><LockKeyhole size={18} /></span>
            <div className="small-label">VUS ONEPORTAL</div>
            <h2>{t("signIn")}</h2>
            <p>{locale === "vi" ? "Chào mừng bạn quay lại. Tiếp tục hành trình học tập." : "Welcome back. Continue your learning journey."}</p>
          </div>

          <form className="login-form" onSubmit={submit}>
            <label htmlFor="email">{t("email")}</label>
            <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t("emailPlaceholder")} autoComplete="username" required />
            <div className="password-label"><label htmlFor="password">{t("password")}</label><a href="#demo">{locale === "vi" ? "Quên mật khẩu?" : "Forgot password?"}</a></div>
            <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("passwordPlaceholder")} autoComplete="current-password" required />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary login-submit" type="submit" disabled={loading}>
              {loading ? t("loading") : t("submit")}<ArrowRight size={17} />
            </button>
          </form>

          <div className="demo-divider"><span />{t("quickDemo")}<span /></div>
          <div className="demo-buttons" id="demo">
            {demoAccounts.map((account) => (
              <button className="demo-button" type="button" key={account.email} disabled={loading} onClick={() => void signIn(account.email, "Demo123!")}>
                <span className="demo-dot" />{t(account.label)}<ArrowRight size={14} />
              </button>
            ))}
          </div>
          <div className="demo-hint"><span className="demo-hint-dot" />{t("demoHint")}</div>
          <div className="secure-note"><ShieldCheck size={15} />{t("secure")}</div>
        </div>
        <footer className="login-footer"><a href="mailto:support@vus.vn">{locale === "vi" ? "Cần trợ giúp?" : "Need help?"}</a><span>VUS · English Centers</span></footer>
      </section>
    </main>
  );
}
