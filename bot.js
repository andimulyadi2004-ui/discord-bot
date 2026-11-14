import { Client, GatewayIntentBits } from "discord.js";
import { init } from "@heyputer/puter.js/src/init.cjs";

const MODEL = "gpt-5.6-luna";
const FILE = "bot-memori/memori.json";
const puter = init(process.env.PUTER_AUTH_TOKEN);
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const SYSTEM = `Kamu adalah AI yang ngobrol di server Discord lewat chat teks. Pakai bahasa Indonesia santai, kecuali orangnya pakai bahasa lain.
Kamu cuma bisa kirim teks di Discord. Kamu TIDAK bisa melakukan apa pun di dunia nyata atau di perangkat orang, misalnya nyalain TV, angkat HP, telekinesis, nelpon, atau kirim barang. Kalau diminta hal begitu, bilang terus terang nggak bisa, singkat dan santai.
Selain itu kamu bisa ngobrol, jawab pertanyaan, bantu nulis, dan lainnya seperti AI biasa. Jawab ringkas.
Kamu punya ingatan permanen. Pakai ingatanmu dengan natural, jangan disebut-sebut kecuali ditanya.`;

let memori = { catatan: "", riwayat: [] };
let hitung = 0;

function toText(res) {
  const c = res?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x) => x.text ?? "").join("");
  return String(c ?? "");
}

async function muatMemori() {
  try {
    const blob = await puter.fs.read(FILE);
    const d = JSON.parse(await blob.text());
    memori = { catatan: d.catatan ?? "", riwayat: d.riwayat ?? [] };
    console.log("Memori dimuat:", memori.riwayat.length, "pesan");
  } catch {
    console.log("Belum ada memori, mulai baru");
  }
}

async function simpanMemori() {
  try {
    await puter.fs.write(FILE, JSON.stringify(memori), {
      overwrite: true,
      createMissingParents: true,
    });
  } catch (e) {
    console.error("Gagal simpan memori:", e);
  }
}

async function rapikanCatatan() {
  try {
    const terbaru = memori.riwayat
      .slice(-12)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
    const res = await puter.ai.chat(
      [
        {
          role: "system",
          content:
            "Kamu merawat catatan jangka panjang untuk bot Discord. Gabungkan CATATAN LAMA dengan PERCAKAPAN TERBARU jadi satu catatan baru yang ringkas (maks 1500 karakter): fakta tentang tiap orang (nama, kesukaan, hal yang mereka ceritakan), hal penting yang pernah dibahas, dan kesepakatan. Buang basa-basi. Balas HANYA isi catatan.",
        },
        {
          role: "user",
          content: `CATATAN LAMA:\n${memori.catatan || "(kosong)"}\n\nPERCAKAPAN TERBARU:\n${terbaru}`,
        },
      ],
      { model: MODEL }
    );
    const baru = toText(res).trim();
    if (baru) memori.catatan = baru.slice(0, 2000);
  } catch (e) {
    console.error("Gagal rapikan catatan:", e);
  }
}

async function perluSearch(q) {
  try {
    const res = await puter.ai.chat(
      [
        {
          role: "system",
          content:
            "Jawab HANYA satu kata: ya atau no. Pertanyaannya: apakah kamu akan search internet untuk menjawab pesan user ini? Jawab ya HANYA kalau user menyuruh kamu search/cari di internet, atau jelas butuh info terbaru yang nggak kamu tahu. Selain itu jawab no.",
        },
        { role: "user", content: q },
      ],
      { model: MODEL }
    );
    return /^\s*ya/i.test(toText(res));
  } catch {
    return false;
  }
}

async function lihatGambar(urls, pertanyaan) {
  const daftar = (process.env.VISION_MODEL || "google/gemini-2.5-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  for (const model of daftar) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Jelaskan dengan detail dan akurat isi gambar ini (objek, orang, teks yang terbaca, warna, suasana). ${pertanyaan ? "Pengguna bertanya: " + pertanyaan : ""} Jawab dalam bahasa Indonesia.`,
                },
                ...urls.map((url) => ({ type: "image_url", image_url: { url } })),
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        console.error("Vision error:", model, res.status, (await res.text()).slice(0, 300));
        continue;
      }
      const data = await res.json();
      const teks = data.choices?.[0]?.message?.content?.trim();
      if (teks) return teks;
      console.error("Vision kosong:", model);
    } catch (e) {
      console.error("Vision gagal:", model, e);
    }
  }
  return null;
}

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (process.env.CHANNEL_ID && msg.channel.id !== process.env.CHANNEL_ID) return;
  const q = msg.content.replace(/<@!?\d+>/g, "").trim();
  const gambar = [...msg.attachments.values()]
    .filter((a) => a.contentType?.startsWith("image/"))
    .slice(0, 3);
  if (!q && gambar.length === 0) return;

  await msg.channel.sendTyping();
  let info = "";
  if (gambar.length) {
    const hasil = await lihatGambar(gambar.map((a) => a.url), q);
    info = hasil
      ? `[Pengguna mengirim ${gambar.length} gambar. Hasil pengamatan AI penglihat: ${hasil}]`
      : "[Pengguna mengirim gambar, tapi AI penglihat gagal membacanya. Bilang kamu belum bisa lihat gambarnya sekarang.]";
  }
  memori.riwayat.push({
    role: "user",
    content: `${msg.member?.displayName ?? msg.author.username}${msg.author.id === msg.guild?.ownerId ? " (pemilik server)" : ""}: ${q} ${info}`.trim(),
  });

  const cari = await perluSearch(q || "(mengirim gambar)");
  if (cari) await msg.channel.send("lagi search dulu");

  let infoOwner = "";
  try {
    const owner = await msg.guild.fetchOwner();
    infoOwner = `\n\nServer Discord ini bernama "${msg.guild.name}". Pemilik (owner) server: ${owner.displayName} (username: ${owner.user.username}). Kalau ada yang tanya siapa owner server, jawab itu. Pesan dari pemilik server diberi label "(pemilik server)".`;
  } catch (e) {
    console.error("Gagal ambil owner:", e);
  }
  const sistem =
    SYSTEM +
    infoOwner +
    (memori.catatan ? `\n\nIngatan jangka panjangmu:\n${memori.catatan}` : "");

  const messages = [{ role: "system", content: sistem }, ...memori.riwayat.slice(-12)];

  let jawab;
  try {
    const opsi = cari ? { model: MODEL, tools: [{ type: "web_search" }] } : { model: MODEL };
    jawab = toText(await puter.ai.chat(messages, opsi));
  } catch (e) {
    console.error("Error AI:", e);
    try {
      jawab = toText(await puter.ai.chat(messages, { model: MODEL }));
    } catch (e2) {
      console.error("Error AI 2:", e2);
      jawab = "Maaf, lagi error. Coba lagi bentar ya.";
    }
  }
  if (!jawab.trim()) jawab = "Hmm, aku nggak bisa jawab itu.";

  memori.riwayat.push({ role: "assistant", content: jawab });
  while (memori.riwayat.length > 40) memori.riwayat.shift();

  await msg.reply(jawab.slice(0, 1900));
  for (let i = 1900; i < jawab.length; i += 1900) {
    await msg.channel.send(jawab.slice(i, i + 1900));
  }

  hitung++;
  if (hitung % 5 === 0) await rapikanCatatan();
  await simpanMemori();
});

client.once("clientReady", () => console.log("Login sebagai", client.user.tag));
await muatMemori();
client.login(process.env.TOKEN);
