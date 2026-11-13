import os
import discord, random
from discord.ext import tasks

TOKEN = os.environ["TOKEN"]
CHANNEL_ID = int(os.environ["CHANNEL_ID"])

kata = [
    "Kucing gue bisa terbang tadi pagi 🐱✈️",
    "Nasi goreng itu sebenarnya alien yang nyamar 👽",
    "Gue baru sadar bantal itu mata-mata 🛏️👀",
    "AAAAAAA WIFI-NYA MAKAN SAMBAL 🌶️",
    "Kemarin gue ketemu kulkas, dia minta pinjem duit 💸",
    "Awan itu sebenarnya kapas raksasa punya dewa",
    "Gue ngomong sama tembok, tembok-nya balas 'p' 😭",
    "Bebek tadi ngajak gue investasi kripto 🦆",
    "Sendal gue ilang, ternyata lagi liburan ke Bali 🏝️",
    "Bulan itu cuma lampu tidur yang lupa dimatiin 🌙",
    "Gue lihat ayam pakai kacamata hitam, dia lebih keren dari gue 😎🐔",
    "Tiba-tiba semua cicak bilang 'tek tek tek' sambil joget",
    "Indomie rebus itu sebenarnya mie yang lagi mandi 🍜🛁",
    "HP gue ngambek karena gue nggak ngucapin selamat pagi",
    "Gue baru sadar angka 7 itu angka 1 yang kena patah tulang",
    "Ada kentang ngetik di keyboard gue, katanya mau jadi presiden 🥔",
    "Laut itu kolam renang yang kebanyakan airnya 🌊",
    "Matahari ngirim DM tapi gue seen doang ☀️",
    "Gue curiga galon itu punya perasaan 💧",
    "Semut-semut bikin demo minta gula gratis 🐜",
]

client = discord.Client(intents=discord.Intents.default())
terakhir = None

@tasks.loop(seconds=20)
async def gila():
    global terakhir
    ch = client.get_channel(CHANNEL_ID)
    if ch is None:
        print("Channel nggak ketemu, cek CHANNEL_ID dan izin bot")
        return
    pilihan = random.choice([k for k in kata if k != terakhir])
    terakhir = pilihan
    try:
        await ch.send(pilihan)
    except Exception as e:
        print("Gagal kirim:", e)

@client.event
async def on_ready():
    print(f"Login sebagai {client.user}")
    if not gila.is_running():
        gila.start()

client.run(TOKEN)
