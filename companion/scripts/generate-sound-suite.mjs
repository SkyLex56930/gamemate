import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const sampleRate = 44_100;
const outputDir = fileURLToPath(new URL("../public/sounds/", import.meta.url));
mkdirSync(outputDir, { recursive: true });

function envelope(position, duration, attack = 0.015, release = 0.16) {
  const fadeIn = Math.min(1, position / attack);
  const fadeOut = Math.min(1, Math.max(0, duration - position) / release);
  return Math.sin(Math.min(fadeIn, fadeOut) * Math.PI / 2) ** 2;
}

function render(name, duration, voices) {
  const length = Math.ceil(duration * sampleRate);
  const pcm = new Float32Array(length);

  for (const voice of voices) {
    const start = Math.floor((voice.start ?? 0) * sampleRate);
    const voiceDuration = voice.duration ?? duration - (voice.start ?? 0);
    const end = Math.min(length, start + Math.floor(voiceDuration * sampleRate));
    let phase = 0;
    for (let index = start; index < end; index += 1) {
      const time = (index - start) / sampleRate;
      const progress = time / voiceDuration;
      const frequency = voice.from + ((voice.to ?? voice.from) - voice.from) * progress;
      phase += (Math.PI * 2 * frequency) / sampleRate;
      const harmonic = Math.sin(phase) + Math.sin(phase * 2) * (voice.shimmer ?? 0.08);
      pcm[index] += harmonic * (voice.gain ?? 0.3) * envelope(time, voiceDuration, voice.attack, voice.release);
    }
  }

  let peak = 0;
  for (const value of pcm) peak = Math.max(peak, Math.abs(value));
  const scale = peak > 0 ? 0.82 / peak : 1;
  const dataSize = pcm.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < pcm.length; index += 1) {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[index] * scale)) * 32767), 44 + index * 2);
  }
  writeFileSync(join(outputDir, name), buffer);
}

render("ui-navigate.wav", 0.11, [
  { from: 430, to: 690, gain: 0.25, release: 0.08 },
  { from: 860, to: 1040, gain: 0.12, release: 0.07, shimmer: 0.03 },
]);
render("message-send.wav", 0.19, [
  { from: 520, to: 780, gain: 0.28, release: 0.11 },
  { from: 910, to: 1280, gain: 0.18, start: 0.035, duration: 0.13, release: 0.08 },
]);
render("notification-bell.wav", 0.62, [
  { from: 587, gain: 0.28, duration: 0.42, release: 0.26 },
  { from: 784, gain: 0.23, start: 0.08, duration: 0.42, release: 0.28 },
  { from: 1175, gain: 0.13, start: 0.16, duration: 0.38, release: 0.3 },
]);
render("success.wav", 0.52, [
  { from: 523, gain: 0.22, duration: 0.28 },
  { from: 659, gain: 0.22, start: 0.09, duration: 0.31 },
  { from: 988, gain: 0.19, start: 0.19, duration: 0.29 },
]);
render("voice-start.wav", 0.3, [
  { from: 330, to: 520, gain: 0.26, duration: 0.24 },
  { from: 660, to: 880, gain: 0.17, start: 0.06, duration: 0.2 },
]);
render("voice-stop.wav", 0.28, [
  { from: 720, to: 430, gain: 0.24, duration: 0.22 },
  { from: 480, to: 290, gain: 0.14, start: 0.05, duration: 0.18 },
]);
render("incoming-call.wav", 0.86, [
  { from: 659, gain: 0.2, duration: 0.28 },
  { from: 880, gain: 0.19, start: 0.12, duration: 0.28 },
  { from: 659, gain: 0.17, start: 0.46, duration: 0.27 },
  { from: 880, gain: 0.16, start: 0.58, duration: 0.24 },
]);

console.log("GameMate sound suite generated in public/sounds.");
