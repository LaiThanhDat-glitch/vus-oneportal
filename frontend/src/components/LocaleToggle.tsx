"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function LocaleToggle({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const nextLocale = locale === "vi" ? "en" : "vi";

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function switchLocale() {
    const parts = pathname.split("/");
    parts[1] = nextLocale;
    router.replace(parts.join("/") || `/${nextLocale}`);
  }

  return (
    <button className="locale-toggle" onClick={switchLocale} type="button" aria-label="Change language">
      <span className={locale === "vi" ? "selected" : ""}>VI</span>
      <span className="locale-divider">/</span>
      <span className={locale === "en" ? "selected" : ""}>EN</span>
    </button>
  );
}
