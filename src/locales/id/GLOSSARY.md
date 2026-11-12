# Bahasa Indonesia for Sellio's owner app: glossary

The owner app's Indonesian (the `*.json` files here, one per group of screens) uses these words,
so a screen never says one thing in one place and another elsewhere. Claude drafts every phrase
from this list; a native speaker signs off each group before it goes live (`LIVE_GROUPS` in
`src/lib/appText.js`). The buyers' store page has its own dictionary
(`src/lib/LanguageContext.jsx`) in the same words.

Style: polite and plain, as Indonesian apps write. "Anda" for "you"; buttons are short verbs
(Simpan, Lanjut). Indonesian words, not Malay ones: ponsel (not telefon bimbit), Didukung oleh
(not Dikuasakan oleh), kata sandi (not kata laluan). Sellio, plan names (Starter, Growth, Pro),
QRIS, PayNow, DuitNow, Stripe, Google and WhatsApp stay as they are. Rupiah is written Rp38.000.

| English | Bahasa Indonesia |
|---|---|
| order (a buyer's) | pesanan |
| Orders (the screen) | Pesanan |
| Counter (taking orders at the till) | Kasir |
| Kitchen, kitchen screen | Dapur, layar dapur |
| receipt | struk |
| product | produk |
| category | kategori |
| menu | menu |
| stock | stok |
| sold out | habis |
| Settings | Pengaturan |
| Dashboard | Dasbor |
| shop, store | toko |
| store page (what buyers see) | halaman toko |
| home shop (selling from home) | toko rumahan |
| business | usaha |
| owner | pemilik |
| staff, team | staf, tim |
| customer | pelanggan |
| buyer, seller | pembeli, penjual |
| table | meja |
| dine in | makan di tempat |
| takeaway | bawa pulang |
| collection (the buyer collects) | ambil sendiri |
| delivery | pengantaran (diantar) |
| delivery charge | ongkos kirim |
| free delivery | gratis ongkir |
| pre-order | pre-order |
| payment, pay, paid, unpaid | pembayaran, bayar, lunas, belum lunas |
| cash, card | tunai, kartu |
| payment QR | QR pembayaran |
| tax, discount, service charge | pajak, diskon, biaya layanan |
| total, subtotal | total, subtotal |
| price, quantity | harga, jumlah |
| item(s) | item |
| variant, options, add-ons | varian, pilihan, tambahan |
| report(s), sales, revenue | laporan, penjualan, pendapatan |
| plan, subscription | paket, langganan |
| free trial | uji coba gratis |
| sign in, sign up, sign out | masuk, daftar, keluar |
| account | akun |
| password | kata sandi |
| mobile number | nomor ponsel |
| email, code (a sign-in code) | email, kode |
| name, business name, address | nama, nama usaha, alamat |
| opening hours, open, closed | jam buka, buka, tutup |
| save, save changes | simpan, simpan perubahan |
| cancel, delete, edit, add | batal, hapus, ubah, tambah |
| continue, next, back, done, close | lanjut, berikutnya, kembali, selesai, tutup |
| search | cari |
| upload, photo | unggah, foto |
| loading… | memuat… |
| try again | coba lagi |
| something went wrong | terjadi kesalahan |
| today, yesterday | hari ini, kemarin |
| notifications, alerts | notifikasi |
| Explore, Me, Chats | Jelajahi, Saya, Chat |
| powered by | didukung oleh |
| order statuses: pending, confirmed, preparing, ready, served, completed, cancelled | menunggu, dikonfirmasi, disiapkan, siap, disajikan, selesai, dibatalkan |

## Settled in group 1 (sign-up and onboarding)

| English | Bahasa Indonesia |
| --- | --- |
| Design Store (Dashboard) | Desain Toko |
| Table 3 (a new table's name) | Meja 3 |
| 4 pax | 4 orang |
| neighbourhood, landmark | kawasan, patokan |
| free delivery from | gratis ongkir mulai |
| language (the switch) | Bahasa |
| preview | pratinjau |
| Singapore, Malaysia, Indonesia | Singapura, Malaysia, Indonesia |
| F&B / Cafe / Restaurant, Retail, Service | Makanan & Minuman / Kafe / Restoran, Ritel, Jasa |
| colour sets | Biru Laut, Hijau Hutan, Jingga Senja, Ungu Royal, Merah Beri, Hijau Toska, Langit Nila, Taman Mawar |
| "…, then try again." (error notes) | "…, lalu coba lagi." |
| That phone number is already in use. | Nomor ponsel itu sudah dipakai. |

- A button named in a sentence goes in quotes: “Pertahankan akun saya” membuka kembali akun Anda…
- The verification email is in English, so the sign-up hint names its button in English: Ketuk **Verify my email** di email terbaru dari Sellio.
- Examples are Indonesian in the Indonesian text (Budi Santoso, Sri Wahyuni, Warung Makan Bu Sri, Nasi Goreng Spesial); the English examples are neutral, with no one country's names.
- Plan names (Starter, Growth, Pro), SGD and QR stay as they are.
