import urllib.request, urllib.error, json, getpass, sys

token = getpass.getpass("Token: ").strip()
cid = input("Channel ID: ").strip()

def get(path):
    req = urllib.request.Request(
        "https://discord.com/api/v10" + path,
        headers={"Authorization": "Bot " + token,
                 "User-Agent": "DiscordBot (cek, 1.0)"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, None

s, d = get("/users/@me")
if s == 200:
    print("✅ Token BENAR, bot:", d["username"])
elif s == 401:
    print("❌ Token SALAH (reset token lagi di Developer Portal)")
    sys.exit()
else:
    print("⚠️ Error Discord:", s)
    sys.exit()

s, d = get("/channels/" + cid)
if s == 200:
    print("✅ Channel BENAR:", d.get("name"))
elif s == 403:
    print("❌ ID ada, tapi bot nggak punya izin lihat channel itu")
elif s == 404:
    print("❌ Channel ID SALAH (bukan ID channel)")
else:
    print("⚠️ Error Discord:", s)
