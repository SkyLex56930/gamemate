import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Diagnostic Supabase",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SupabaseTestPage() {
  if (process.env.NODE_ENV !== "development") notFound();

  const { supabase } = await import("@/lib/supabase");
  const { error } = await supabase.from("profiles").select("*").limit(1);

  return (
    <main style={{ padding: 40 }}>
      <h1>Test Supabase</h1>
      <p>
        {error
          ? `Connexion Supabase OK, mais table absente/inaccessible : ${error.message}`
          : "Connexion Supabase OK"}
      </p>
    </main>
  );
}
