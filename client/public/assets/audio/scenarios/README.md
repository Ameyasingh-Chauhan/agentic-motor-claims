# Scenario voice notes

Drop one recording per demo scenario into this folder, using exactly these file names. Until a file exists, the
claim's **Media & Uploads** tab shows the transcript and English translation with an "Audio not retained" note
instead of a player. The server checks for the file on every request, so no re-seed or restart is needed.

Format: **WebM (Opus)**, mono, 48 kHz, 10–30 seconds, recorded on a phone or laptop in a quiet room. Speak naturally,
as a customer leaving a WhatsApp voice note. (To convert from another format: `ffmpeg -i in.m4a -c:a libopus -b:a 48k -ac 1 out.webm`.)

| File name | Scenario | Speaker / language | Script line (say this) |
|---|---|---|---|
| `clean_rear_end.webm` | Rahul Sharma · Creta rear-ended near Khed Shivapur | Hindi–English mix | "Khed Shivapur toll ke paas NH48 pe raat 9 baje ek truck ne peeche se thok diya. Peeche ka bumper aur dikki dono damage ho gaye." |
| `fastag_mismatch.webm` | Arjun Desai · Creta "hit a divider" | English | "I hit a divider on the Mumbai–Pune Expressway near Khalapur at about 2 AM. The front bumper and the left headlamp are broken." |
| `garage_overquote.webm` | Priya Nair · Baleno pillar scrape in Kochi | Malayalam | "എടപ്പള്ളി ലുലു മാളിന്റെ ബേസ്‌മെന്റ് പാർക്കിങ്ങിൽ തിരിക്കുമ്പോൾ ഒരു തൂണിൽ ഉരസി. ഇടതുവശത്തെ ഡോറുകൾക്കും മിററിനും കേടുപാട് പറ്റി." |
| `theft_two_wheeler.webm` | Imran Shaikh · Activa stolen in Pimpri | Hindi | "मैंने अपनी एक्टिवा शाम साढ़े सात बजे पिंपरी सब्ज़ी मंडी के बाहर पार्क की थी; वापस आया तो गाड़ी गायब थी। अगले दिन FIR दर्ज कराई।" |
| `flood_total_loss.webm` | Kavita Joshi · Swift flooded in Thane | Marathi | "रात्रभर पडलेल्या पावसामुळे वंदना अंडरपासजवळ पाणी साचलं. माझी गाडी तिथेच पार्क होती आणि पाणी डॅशबोर्डपर्यंत पोहोचलं." |

The transcripts and translations shown in the app come from `server/data/claims.json` (seeded from
`server/scripts/seed.py`), so keep the recording close to the script line.
