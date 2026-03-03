export default async function handler(req, res) {
  try {
    // Random ayah number 1..6236
    const ayah = Math.floor(Math.random() * 6236) + 1;

    // Fetch a few items (3-4)
    const picks = [ayah, ayah + 1, ayah + 2, ayah + 3].map(n => Math.min(6236, n));

    const items = [];
    for (const n of picks) {
      const url = `https://api.alquran.cloud/v1/ayah/${n}/en.asad`; // English translation
      const r = await fetch(url);
      const j = await r.json();

      const text = j?.data?.text || "";
      const surah = j?.data?.surah?.englishName || "";
      const ayahNo = j?.data?.numberInSurah || "";
      const meta = `${surah} • Ayah ${ayahNo}`;

      items.push({ text, meta });
    }

    res.status(200).json({ items });
  } catch (e) {
    res.status(200).json({ items: [] });
  }
}
