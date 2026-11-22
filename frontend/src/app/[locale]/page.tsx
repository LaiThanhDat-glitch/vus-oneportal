import { LoginPage } from "@/components/LoginPage";

export default async function LocalizedLogin({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LoginPage locale={locale} />;
}
