/** Custom activity logger — sport, recovery, mobility, etc.
 *  Lightweight form: title, tags, date, duration, notes. */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarIcon, Save } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { EchoHeadline } from "@/components/EchoHeadline";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSession } from "@/lib/session";
import { supabase } from "@/integrations/supabase/client";
import { appConfig, type ActivityTag } from "@/config/app.config";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function ActivityLogger() {
  const nav = useNavigate();
  const { user } = useSession();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<Set<ActivityTag>>(new Set(["sport"]));
  const [date, setDate] = useState<Date>(new Date());
  const [durationMin, setDurationMin] = useState<number>(30);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function toggleTag(t: ActivityTag) {
    const n = new Set(tags);
    if (n.has(t)) n.delete(t); else n.add(t);
    setTags(n);
  }

  const primaryTag = (Array.from(tags)[0] ?? "sport") as ActivityTag;

  async function save() {
    if (!user) return;
    if (!title.trim()) { toast.error("Add a title"); return; }
    setSaving(true);
    const totalSec = Math.max(0, Math.round(durationMin * 60));
    const { error } = await supabase.from("workout_logs").insert([{
      owner_user_id: user.id,
      log_date: format(date, "yyyy-MM-dd"),
      day_key: title.trim(),
      status: "done",
      total_seconds: totalSec,
      started_at: date.toISOString(),
      ended_at: new Date(date.getTime() + totalSec * 1000).toISOString(),
      notes: notes || null,
      data: {} as never,
      activity_type: primaryTag,
      tags: Array.from(tags),
    }]);
    setSaving(false);
    if (error) { toast.error("Save failed"); return; }
    toast.success("Activity logged");
    nav("/");
  }

  return (
    <>
      <TopBar title="Activity" />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">
        <EchoHeadline className="text-[2.25rem] sm:text-[3rem]">Log activity</EchoHeadline>
        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
          Sport · class · recovery · mobility
        </p>

        <div className="mt-8 space-y-6">
          <div>
            <label className="block text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-1">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Tennis, Yoga, Trail run"
              className="w-full bg-transparent border-b hairline py-2 focus:outline-none focus:border-foreground transition-colors duration-slow ease-swiss font-display text-lg"
            />
          </div>

          <div>
            <label className="block text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-2">Tags</label>
            <div className="flex flex-wrap gap-1">
              {appConfig.activity.tags.map((t) => {
                const on = tags.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => toggleTag(t)}
                    className={cn(
                      "text-[0.65rem] uppercase tracking-[0.12em] px-3 py-1.5 border transition-colors duration-slow ease-swiss",
                      on ? "bg-foreground text-background border-foreground" : "hairline hover:bg-secondary",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-1">Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-2 border hairline px-3 py-2 text-sm hover:bg-secondary transition-colors duration-slow ease-swiss">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {format(date, "PPP")}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => d && setDate(d)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <label className="block text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-1">Duration (min)</label>
              <input
                type="number" min={0} step={5} value={durationMin}
                onChange={(e) => setDurationMin(Math.max(0, Number(e.target.value) || 0))}
                className="w-full bg-transparent border-b hairline py-2 font-mono focus:outline-none focus:border-foreground transition-colors duration-slow ease-swiss"
              />
            </div>
          </div>

          <div>
            <label className="block text-[0.6rem] uppercase tracking-[0.14em] text-muted-foreground mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full bg-transparent border hairline p-2 focus:outline-none focus:border-foreground transition-colors duration-slow ease-swiss text-sm"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={saving} className="ll-btn flex items-center gap-1">
              <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => nav(-1)} className="ll-btn">Cancel</button>
          </div>
        </div>
      </main>
    </>
  );
}
