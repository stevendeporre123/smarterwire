// Fotoanalyse van een zekeringskast via een eigen proxy (zie cloudflare/worker.ts).
// De API-sleutel staat NOOIT in de browser; de proxy houdt hem vast.
export interface ProposedDevice {
  kind: string; label?: string; poles?: string; rating_a?: number; curve?: string; sens_ma?: number; dtype?: string;
  modules?: number; rect: { x: number; y: number; w: number; h: number }; parent_hint?: string; notes?: string;
}

export const getAiEndpoint = () => localStorage.getItem('smarterwire.ai') ?? '/api/analyze-board';
export const setAiEndpoint = (u: string) => localStorage.setItem('smarterwire.ai', u);

export async function analyzeBoardPhoto(imageUrl: string): Promise<ProposedDevice[]> {
  const blob = await (await fetch(imageUrl)).blob();
  const b64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.readAsDataURL(blob); });
  const resp = await fetch(getAiEndpoint(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: b64, mime: blob.type || 'image/jpeg' }) });
  if (!resp.ok) throw new Error(`Analyse mislukt (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
  const json = await resp.json();
  return json.devices as ProposedDevice[];
}
