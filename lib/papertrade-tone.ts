/** Short original "tu" so a PaperTrade alert is recognizable. Playback can be blocked until the page has been used. */
export async function playPaperTradeTone() {
  if (typeof window === "undefined") return false;
  try {
    const audio = new Audio("/papertrade-tu.wav");
    audio.volume = 0.9;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}
