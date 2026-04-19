// Lovable AI fallback parser for workout plans.
// Receives raw markdown / text, returns structured ParsedPlan via tool calling.
import { corsHeaders } from "@supabase/supabase-js/cors";

const PLAN_TOOL = {
  type: "function" as const,
  function: {
    name: "save_parsed_plan",
    description: "Save the structured workout plan extracted from the user's text.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        goal: { type: "string" },
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              weeks: { type: "array", items: { type: "number" } },
              mainRpe: { type: "string" },
              accessoryRpe: { type: "string" },
            },
            required: ["name", "weeks"],
          },
        },
        weeklyTemplate: {
          type: "array",
          items: {
            type: "object",
            properties: {
              day: { type: "string" },
              type: { type: "string" },
              focus: { type: "string" },
              conditioning: { type: "string" },
            },
            required: ["day", "type"],
          },
        },
        days: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dayName: { type: "string" },
              type: { type: "string" },
              warmup: { type: "string" },
              substitutions: { type: "string" },
              exercises: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    block: { type: "string", description: "Warm-up | Main | Secondary | Finisher" },
                    name: { type: "string" },
                    metrics: {
                      type: "array",
                      items: { type: "string", enum: ["weight", "reps", "rpe", "distance", "time"] },
                    },
                    primaryMetric: { type: "string", enum: ["weight", "reps", "rpe", "distance", "time"] },
                    weeks: {
                      type: "object",
                      description: "Map of week number (1-16) -> planned set string, e.g. '4x5 R7' or '3x8/side (t) R7' or 'x4 trips' or null when skipped.",
                      additionalProperties: { type: ["string", "null"] },
                    },
                    variant: { type: ["string", "null"] },
                  },
                  required: ["block", "name", "metrics", "primaryMetric", "weeks"],
                },
              },
            },
            required: ["dayName", "type", "exercises"],
          },
        },
      },
      required: ["title", "days"],
      additionalProperties: false,
    },
  },
};

const SYSTEM = `You are a careful workout-plan extractor.
Given a markdown document describing a multi-week strength program, extract the structured plan.
Rules:
- Block must be one of: Warm-up, Main, Secondary, Finisher.
- For each exercise, populate weeks as an object mapping week number (string keys: "1".."16") to the raw planned-set cell text from the source. If the cell says "skip", "—", or empty, use null.
- Infer primaryMetric: weight for loaded barbell/dumbbell lifts, reps for bodyweight or rep-counted accessories, time for planks/holds/carries duration, distance for sled/farmer trips.
- metrics array should include all metrics the movement uses (subset of weight/reps/rpe/distance/time).
- Notations like (p), (t), +5%, /side, → must be preserved verbatim inside the weeks cell text.
- If a cell starts with "→" indicating a variant swap (e.g. "→Back Squat 3x4 R9"), set variant to that movement name on the parent exercise.
Always call save_parsed_plan exactly once.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { markdown } = await req.json();
    if (!markdown || typeof markdown !== "string") {
      return new Response(JSON.stringify({ error: "markdown (string) is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: markdown.slice(0, 60_000) },
        ],
        tools: [PLAN_TOOL],
        tool_choice: { type: "function", function: { name: "save_parsed_plan" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Lovable workspace." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI returned no structured output" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const parsed = JSON.parse(call.function.arguments);
    return new Response(JSON.stringify({ parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-plan error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
