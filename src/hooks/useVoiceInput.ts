/** useVoiceInput — wraps Web Speech API. Feature-detects with webkit prefix.
 *  Returns supported flag so callers can hide UI on unsupported browsers (iOS Chrome, Firefox, etc.). */
import { useCallback, useEffect, useRef, useState } from "react";

type SR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: { [key: number]: { [key: number]: { transcript: string } } } & { length: number } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSRClass(): { new (): SR } | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: { new (): SR }; webkitSpeechRecognition?: { new (): SR } };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useVoiceInput() {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SR | null>(null);

  useEffect(() => {
    setSupported(getSRClass() != null);
  }, []);

  const start = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const Cls = getSRClass();
      if (!Cls) { reject(new Error("not-supported")); return; }
      try { recRef.current?.stop(); } catch { /* noop */ }
      const rec = new Cls();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let final = "";
      rec.onresult = (e) => {
        const len = e.results.length;
        for (let i = 0; i < len; i++) {
          const t = e.results[i][0]?.transcript ?? "";
          final += t;
        }
        setTranscript(final);
      };
      rec.onerror = (e) => {
        setError(e.error);
        setListening(false);
        reject(new Error(e.error));
      };
      rec.onend = () => {
        setListening(false);
        resolve(final.trim());
      };
      recRef.current = rec;
      setError(null);
      setTranscript("");
      setListening(true);
      rec.start();
    });
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  }, []);

  return { supported, listening, start, stop, transcript, error };
}