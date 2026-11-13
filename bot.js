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

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  if (process.env.CHANNEL_ID && msg.channel.id !== process.env.CHANNEL_ID) return;
  const q = msg.content.replace(/<@!?\d+>/g, "").trim();
  if (!q) return;

  await msg.channel.sendTyping();
  memori.riwayat.push({
    role: "user",
    content: `${msg.member?.displayName ?? msg.author.username}: ${q}`,
  });

  const cari = await perluSearch(q);
  if (cari) await msg.channel.send("lagi search dulu");

  const sistem = memori.catatan
    ? `${SYSTEM}\n\nIngatan jangka panjangmu:\n${memori.catatan}`
    : SYSTEM;
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
