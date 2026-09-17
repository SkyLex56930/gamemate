import { supabase } from "@/lib/supabase";

export default async function SupabaseTestPage() {
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