# WebRTC HTTPS Video Call, Chat, Filter, dan Logout

Project ini sudah dirapikan agar mudah dibuka di VS Code.

## Fitur

- Video call antar laptop dalam satu Wi-Fi/LAN
- HTTPS lokal otomatis
- Real-time chat
- Room ID manual
- Copy link room
- Tombol kamera dan microphone
- Tombol Logout/Keluar Room
- Filter kamera lokal
- Filter peserta lain ikut berubah di tampilan peserta lain

## Struktur Folder

```text
webrtc-vscode-ready/
├── public/
│   ├── index.html
│   ├── client.js
│   └── style.css
├── scripts/
│   └── reset-cert.js
├── server.js
├── package.json
├── .gitignore
└── README.md
```

## Cara buka di VS Code

1. Extract file ZIP.
2. Buka VS Code.
3. Klik File > Open Folder.
4. Pilih folder `webrtc-vscode-ready`.
5. Buka terminal di VS Code.
6. Jalankan:

```bash
npm install
npm start
```

Server jalan di port `3443`.

## Cara pakai

Laptop utama:

```bash
https://localhost:3443
```

Laptop lain dalam Wi-Fi yang sama:

```bash
https://IP-LAPTOP-UTAMA:3443
```

Contoh:

```bash
https://192.168.1.10:3443
```

Masukkan Room ID yang sama di semua laptop.

## Catatan

Kalau muncul peringatan sertifikat di browser, klik:

```text
Advanced / Lanjutan > Proceed / Tetap lanjutkan
```

Kalau kamera tidak muncul, pastikan:

1. Camera dan Microphone di browser sudah Allow.
2. Laptop lain tidak membuka `localhost`, tetapi membuka link IP laptop utama.
3. Aplikasi lain seperti Zoom, Meet, Teams, atau Camera sudah ditutup.
4. Windows Firewall mengizinkan Node.js.

## Reset sertifikat

Kalau IP berubah dan browser bermasalah, jalankan:

```bash
npm run reset-cert
npm start
```
"# tugas-jarmul" 
