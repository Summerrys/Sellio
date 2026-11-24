# Bahasa Melayu for Sellio's owner app: glossary

The owner app's Malay (the `*.json` files here, one per group of screens) uses these words, so a
screen never says one thing in one place and another elsewhere. Claude drafts every phrase from
this list (Alvin, 16 Nov 2026: EN, 中文, MY, ID; no manual translation). It is Malaysian Malay
(Bahasa Melayu as written in Malaysia), not Indonesian, and matches the buyers' store page
(`src/lib/LanguageContext.jsx`) where the two meet: pesanan, troli, pembayaran, Bungkus, Ambil
sendiri, suka, sembang.

Who sees it (`src/lib/appText.js`): anyone who picks MY (switched on for everyone, every group,
16 Nov 2026: "there should be the EN, 中文, MY, ID for everyone"). No shop gets it first, and a
Malay phone does not switch the app by itself: the Wellness shop picks it when it wants it.

Style: polite and plain. "anda" for "you", lower case inside a sentence ("Anda" only to start
one); "sila" for please; buttons are short verbs (Simpan, Teruskan). Malaysian spelling and words,
never the Indonesian ones (`verification/app-text.dom.mjs` fails on ponsel, kata sandi, akun,
unduh, unggah, hapus, pengaturan, silakan, gratis, toko, dasbor, kamu, tautan, nomor, kode,
berhasil). Sellio, plan names (Starter, Growth, Pro, Professional), PayNow, DuitNow, QRIS,
Stripe, Google, WhatsApp, SKU, Logo and QR stay as they are.

| English | Bahasa Melayu |
|---|---|
| order (a buyer's), Orders (the screen) | pesanan, Pesanan |
| new order | pesanan baharu |
| Counter (taking orders at the till) | Kaunter |
| Take Orders, take an order | Ambil Pesanan, mengambil pesanan |
| Kitchen, Kitchen Display | dapur, Paparan Dapur |
| chit (kitchen ticket) | slip dapur, slip pesanan |
| receipt | resit |
| bill (a table's running bill), settle | bil, jelaskan |
| product, listing | produk |
| item (a line in an order, the Counter) | item |
| category, menu | kategori, menu |
| stock, low stock, out of stock, sold out | stok, stok rendah, kehabisan stok, habis dijual |
| variant, options, add-ons | varian, pilihan, tambahan |
| Featured | Pilihan |
| Dashboard | Papan Pemuka |
| Settings | Tetapan |
| shop, store | kedai |
| store page (what buyers see) | halaman kedai |
| owner | pemilik |
| staff, team | kakitangan, pasukan |
| customer | pelanggan |
| buyer, seller | pembeli, penjual |
| table, Table 3 (a new table's name) | meja, Meja 3 |
| dine in, takeaway | Makan di Sini, Bungkus |
| collection (the buyer collects), self-collect | Ambil sendiri |
| delivery, delivery charge, free delivery | penghantaran, caj penghantaran, penghantaran percuma |
| pre-order | pra-pesanan |
| checkout, at checkout | Pembayaran, semasa pembayaran |
| cart | troli |
| payment, pay, paid, unpaid | pembayaran, bayar, Dibayar, Belum dibayar |
| payment QR | QR pembayaran |
| cash, card, e-wallet | Tunai, Kad, E-dompet |
| QR code | kod QR |
| tax, discount, service charge | cukai, diskaun, caj perkhidmatan |
| total, subtotal | jumlah, jumlah kecil |
| report(s), revenue | laporan, hasil (jualan) |
| plan, subscription, free trial | pelan, langganan, percubaan percuma |
| upgrade, downgrade | naik taraf, turun taraf |
| invoice, billing | invois, pengebilan |
| sign in / log in, sign up, sign out | log masuk, daftar, log keluar |
| account, staff login | akaun, log masuk kakitangan |
| password, mobile number, email | kata laluan, nombor telefon (bimbit), e-mel |
| link | pautan |
| save, cancel, delete, remove, edit, add | Simpan, Batal, Padam, Buang, Sunting, Tambah |
| continue, next, back, done, close | Teruskan, Seterusnya, Kembali, Selesai, Tutup |
| try again, retry, loading | Cuba lagi, Cuba semula, Memuatkan |
| upload, download, scan | muat naik, muat turun, imbas |
| photo, image | foto, gambar |
| cover (the first photo) | muka depan |
| banner | sepanduk |
| tour (the app's walkthrough) | lawatan |
| tap, press and hold | ketik, tekan lama |
| notifications, alerts | pemberitahuan, amaran |
| printer, browser, device, app | pencetak, pelayar, peranti, apl |
| offline, online | di luar talian, dalam talian |
| Explore, Me, Chats | Teroka, Saya, Sembang |
| Sellio Explore | Teroka Sellio |
| Home seller(s), Merchant(s), Goods, Services, Food & drinks | penjual dari rumah, peniaga, barangan, perkhidmatan, makanan & minuman |
| My likes, My purchases, My listings | Suka Saya, Pembelian Saya, Produk Saya |
| like, liked, unlike | suka, disukai, batal suka |
| Fresh finds, Deal options | Penemuan terbaharu, pilihan urusan |
| Ongoing, Past (purchases) | Sedang berjalan, Lepas |
| archive, archived | arkibkan, diarkibkan |
| Online, Last seen …, Seen | Dalam talian, Terakhir dilihat …, Dilihat |
| rating, rate, stars, comment, report | penilaian, nilai, bintang, komen, laporkan |
| star words: Terrible, Not good, Okay, Good, Great | Sangat teruk, Kurang baik, Sederhana, Baik, Sangat baik |
| order statuses: new, confirmed, preparing, ready, served, completed, cancelled | Baharu, Disahkan, Sedang disediakan, Sedia, Dihidangkan, Selesai, Dibatalkan |
| out for delivery, delivered, ready for collection, collected | Sedang dihantar, Telah dihantar, Sedia untuk diambil, Sudah diambil |
| Active, Inactive (a product; a plan's status) | Aktif, Tidak aktif |
| Singapore, Malaysia, Indonesia | Singapura, Malaysia, Indonesia |
| Sellio Coins, coins (Sellio World) | Syiling Sellio, syiling |
| wallet (a person's coins), My coins | dompet, Syiling saya |
| stall (in Sellio World) | gerai |
| badge (Sellio World) | lencana |
| Sellio World, Pop-up Street (places in the World) | stay in English |

- Dates and times read as `src/lib/appDates.js` writes them for ms-MY: 14 Nov 2026,
  Sab, 14 Nov, 6:30 PG / 3:05 PTG, 5 minit lalu.
- Examples are Malaysian in the Malay text; dish and shop names that are data stay as written.
- Printed receipts, table bills and kitchen chits stay in the shop's language, which is English
  for a shop in Singapore or Malaysia (`src/lib/printWords.js`). New-order alerts and the emails
  Supabase sends stay English too.
- The CSV template and exports keep English column names: an import matches its columns by them.
- Store pages quote their own words in English ("Store unavailable"), as the Indonesian does.
- Canned chat questions (Boleh saya ambil hari ini?) go out in the buyer's language: they are sent
  as they read.
- Once the explore group is live in Malay, the store page's own Malay should say Saya › Suka Saya
  where it now says "Me › My likes".
