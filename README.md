# Trackers Workspace v2

Versi modular/multi-route untuk repository GitHub baru. **Supabase project, publishable key, tabel `trackly_user_state`, login, dan data lama tetap dipertahankan.**

## Route

- `/` — Dashboard
- `/projects/` — Projects + Detail Site
- `/bast/` — BAST
- `/pkbon/` — PKBON
- `/notes/` — Note Pad
- `/reporting/` — Reporting
- `/settings/` — Settings
- `/superadmin/` — system console tersembunyi (tidak ada link di UI)

## Struktur

- `app-shell.html` = shell UI stabil bersama. Jangan menaruh logic feature baru di sini kalau tidak perlu.
- `assets/css/core.css` = style stabil/legacy yang dibekukan.
- `assets/css/pages/*.css` = perubahan visual khusus halaman. **Edit file halaman terkait supaya tidak merusak fitur lain.**
- `assets/js/app.js` = compatibility core fitur lama.
- `assets/js/pages/*.js` = tempat logic baru khusus halaman.
- `assets/js/entry.js` = bootstrap route.
- `supabase/001_user_state.sql` = baseline state lama, tidak diubah.
- `supabase/002_superadmin.sql` = migration opsional untuk hidden Superadmin.

## GitHub Pages baru

1. Buat repository baru, contoh `trackers-workspace-v2`.
2. Extract ZIP ini, lalu upload **isi folder Trackers-Workspace-v2**, bukan ZIP-nya.
3. Pastikan `index.html` berada langsung di root repo.
4. GitHub → Settings → Pages → Deploy from a branch → `main` → `/(root)`.
5. Jangan hapus repo lama sampai v2 sudah stabil.

## Supabase

`assets/js/config.js` tetap memakai Supabase yang sama. Tidak perlu membuat project Supabase baru.

Untuk Superadmin, jalankan `supabase/002_superadmin.sql` sekali di SQL Editor. Migration ini tidak menghapus `trackly_user_state` atau payload user lama. Setelah itu promosi akun milikmu secara manual:

```sql
update public.profiles
set role='superadmin', access_enabled=true
where email='EMAIL_KAMU';
```

Route `/superadmin/` tidak ditampilkan di Dashboard/Settings/sidebar. Mengetahui URL saja tidak cukup: RPC Supabase tetap memeriksa role `superadmin` atau `owner` di server.

## Prinsip v2

Untuk perubahan berikutnya, usahakan edit `assets/css/pages/<fitur>.css` dan `assets/js/pages/<fitur>.js`. Dengan begitu perubahan Note Pad tidak perlu menyentuh CSS/JS Projects, PKBON, atau BAST.
