import { Portal } from "@/components/Portal";

export default async function LocalizedPortal({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <Portal locale={locale} />;
}
