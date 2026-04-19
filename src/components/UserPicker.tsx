/** User picker after access. Shows existing users + create new. */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { EchoHeadline } from "@/components/EchoHeadline";

type U = { id: string; display_name: string };

export function UserPicker() {
  const { selectUser, createUser } = useSession();
  const [users, setUsers] = useState<U[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("app_users").select("id,display_name").order("created_at", { ascending: true }).then(({ data }) => {
      if (data) setUsers(data as U[]);
    });
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await createUser(name);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Could not create user");
    }
    setBusy(false);
  }

  return (
    <main className="min-h-[100dvh] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-md">
        <EchoHeadline className="text-[2.5rem]">Who's lifting?</EchoHeadline>
        <p className="mt-4 text-xs uppercase tracking-[0.18em] text-muted-foreground">Pick a profile or create one</p>

        <ul className="mt-8 divide-y hairline border-y hairline">
          {users.map((u) => (
            <li key={u.id}>
              <button
                onClick={() => selectUser(u)}
                className="w-full text-left px-1 py-3 flex items-center justify-between hover:bg-secondary transition-colors duration-slow ease-swiss"
              >
                <span className="font-display text-xl uppercase tracking-[-0.04em]">{u.display_name}</span>
                <span className="text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">enter</span>
              </button>
            </li>
          ))}
          {users.length === 0 && (
            <li className="px-1 py-3 text-xs text-muted-foreground uppercase tracking-[0.12em]">No users yet</li>
          )}
        </ul>

        <form onSubmit={add} className="mt-8 flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">New profile</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent border-b hairline py-2 text-lg focus:outline-none focus:border-foreground transition-colors duration-slow ease-swiss"
              placeholder="your name"
              maxLength={40}
            />
          </div>
          <button disabled={busy || !name.trim()} className="ll-btn">{busy ? "..." : "Create"}</button>
        </form>
        {err && <div className="text-xs mt-2 text-foreground/70">{err}</div>}
      </div>
    </main>
  );
}
