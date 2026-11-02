// Generates the demo video's audio with ElevenLabs: narration lines, music and sound effects.
// Run from the project root:  node --env-file=.env.local video/make-audio.mjs
// The SDK reads ELEVENLABS_API_KEY from the environment; the key is never in this file.
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const OUT = "video/assets/audio";
mkdirSync(OUT, { recursive: true });
const client = new ElevenLabsClient();

// Charlotte: warm, conversational, confident.
const VOICE = "XB0fDUnXU5powFXDhCwa";
const LINES = {
  vo1: "Job hunting shouldn't feel like guessing.",
  vo2: "Meet Carreadi. Drop in your CV… and it scans over two thousand nine hundred live jobs to find the ones that fit you.",
  vo3: "See what you already have, backed by your own words… and what's missing.",
  vo4: "Then a step-by-step roadmap to close the gap. Every step. Every resource. Every hour.",
  vo5: "Your next job isn't a guessing game. Carreadi. Try it free at carreadi dot naijabukana dot com.",
};

const SFX = {
  whoosh: { text: "Quick soft airy whoosh transition, clean modern UI motion", duration_seconds: 0.8 },
  tick: { text: "Crisp soft UI checkbox click, satisfying, short", duration_seconds: 0.5 },
  chime: { text: "Bright short success chime, positive app notification, two notes", duration_seconds: 1.0 },
  hit: { text: "Warm cinematic logo reveal hit with soft shimmer tail, modern tech brand", duration_seconds: 2.0 },
};

async function save(stream, file) {
  const s = typeof stream.getReader === "function" ? Readable.fromWeb(stream) : stream;
  await pipeline(s, createWriteStream(`${OUT}/${file}`));
  console.log("saved", file);
}

const only = process.argv[2]; // optional: "vo", "music" or "sfx" to regenerate one group
const skip = (f) => !only && existsSync(`${OUT}/${f}`);

if (!only || only === "vo")
  for (const [id, text] of Object.entries(LINES)) {
    if (skip(`${id}.mp3`)) continue;
    await save(
      await client.textToSpeech.convert(VOICE, { text, modelId: "eleven_v4", voiceSettings: { stability: 0.45, similarityBoost: 0.8 } }),
      `${id}.mp3`,
    );
  }

if ((!only || only === "music") && !skip("music.mp3"))
  await save(
    await client.music.compose({
      prompt:
        "Upbeat modern tech product launch background track, instrumental only, no vocals. Light punchy drums, warm synth plucks, " +
        "subtle bass, optimistic and confident, steady 112 bpm, builds gently and ends on a clean final hit at the end.",
      musicLengthMs: 34000,
      modelId: "music_v2_5",
    }),
    "music.mp3",
  );

if (!only || only === "sfx")
  for (const [id, p] of Object.entries(SFX)) {
    if (skip(`${id}.mp3`)) continue;
    await save(await client.textToSoundEffects.convert({ text: p.text, durationSeconds: p.duration_seconds, promptInfluence: 0.6 }), `${id}.mp3`);
  }
