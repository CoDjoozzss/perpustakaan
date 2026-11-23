// ============================================================
// Perpustakaan Online - Frontend
// ============================================================

// ---- PENGATURAN (wajib diisi) ----
const API_URL = 'GANTI_DENGAN_URL_WEB_APP';
const GOOGLE_CLIENT_ID = 'GANTI_DENGAN_CLIENT_ID_GOOGLE';
const SLOT = ['Pagi (09.00-12.00)', 'Sore (14.00-17.00)'];

const $ = (s) => document.querySelector(s);
let semuaBuku = [];
let token = sessionStorage.getItem('token') || '';
let akun = null;
let profil = null;
let bukuDipilih = null;

// ---- Utilitas ----
function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function rupiah(n) { return 'Rp' + Number(n || 0).toLocaleString('id-ID'); }
function toast(pesan) {
  const t = $('#toast');
  t.textContent = pesan;
  t.classList.add('tampil');
  clearTimeout(toast.w);
  toast.w = setTimeout(() => t.classList.remove('tampil'), 3500);
}
function bacaJwt(t) {
  const b = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))));
}
function formatTanggalLokal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function tambahHari(str, n) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
const WARNA = ['#2f5d50', '#8a5a44', '#44628a', '#7a4a7d', '#a37b2c', '#4a7d6e'];

// ---- API ----
async function api(aksi, data = {}) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ aksi, token, ...data }),
    });
    const j = await res.json();
    if (!j.ok && j.kode === 'LOGIN') { hapusSesi(); toast(j.error); }
    return j;
  } catch (e) {
    return { ok: false, error: 'Tidak bisa terhubung ke server. Coba lagi.' };
  }
}

// ---- Login Google ----
function hapusSesi() {
  token = ''; akun = null; profil = null;
  sessionStorage.removeItem('token');
  tampilAkun();
}
function tampilAkun() {
  $('#tombolGoogle').hidden = !!akun;
  $('#infoAkun').hidden = !akun;
  if (akun) $('#namaAkun').textContent = akun.name || akun.email;
}
function pasangGoogle() {
  if (!(window.google && google.accounts && google.accounts.id)) {
    return setTimeout(pasangGoogle, 200);
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (r) => {
      token = r.credential;
      sessionStorage.setItem('token', token);
      akun = bacaJwt(token);
      profil = null;
      tampilAkun();
      toast('Halo, ' + (akun.name || akun.email) + '!');
    },
  });
  google.accounts.id.renderButton($('#tombolGoogle'), { theme: 'outline', size: 'medium', text: 'signin_with' });
}

// ---- Katalog ----
async function muatBuku() {
  try {
    const res = await fetch(API_URL + '?aksi=daftarBuku');
    const j = await res.json();
    if (!j.ok) throw new Error(j.error);
    semuaBuku = j.data;
    const kategori = [...new Set(semuaBuku.map((b) => b.kategori))].sort();
    const sel = $('#filterKategori');
    const dipilih = sel.value;
    sel.innerHTML = '<option value="">Semua kategori</option>' +
      kategori.map((k) => `<option>${esc(k)}</option>`).join('');
    sel.value = dipilih;
    tampilBuku();
  } catch (e) {
    $('#daftarBuku').innerHTML = '<p class="info">Gagal memuat buku. Periksa pengaturan API_URL.</p>';
  }
}
function tampilBuku() {
  const q = $('#cari').value.toLowerCase().trim();
  const kat = $('#filterKategori').value;
  const hasil = semuaBuku.filter((b) =>
    (!kat || b.kategori === kat) &&
    (!q || (b.judul + ' ' + b.penulis).toLowerCase().includes(q)));
  if (!hasil.length) {
    $('#daftarBuku').innerHTML = '<p class="info">Tidak ada buku yang cocok.</p>';
    return;
  }
  $('#daftarBuku').innerHTML = hasil.map((b, i) => `
    <article class="kartu">
      <div class="sampul" style="background:${WARNA[i % WARNA.length]}">${esc(String(b.judul).charAt(0))}</div>
      <h3>${esc(b.judul)}</h3>
      <p class="penulis">${esc(b.penulis)}</p>
      <div class="meta">
        <span class="chip">${esc(b.kategori)}</span>
        <span class="info">Stok: ${b.stok}</span>
      </div>
      <p class="info">Harga ganti: ${rupiah(b.harga)}</p>
      <button data-pinjam="${esc(b.id_buku)}" ${b.stok < 1 ? 'disabled' : ''}>
        ${b.stok < 1 ? 'Stok habis' : 'Pinjam'}
      </button>
    </article>`).join('');
}

// ---- Alur pinjam ----
async function mulaiPinjam(idBuku) {
  if (!akun) {
    toast('Masuk dengan Google dulu ya.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  bukuDipilih = semuaBuku.find((b) => String(b.id_buku) === String(idBuku));
  if (!bukuDipilih) return;
  if (!profil) {
    const j = await api('profil');
    if (!j.ok) return toast(j.error);
    profil = j.data;
  }
  if (!profil.nama || !profil.nomor_hp || !profil.alamat) {
    bukaProfil(true);
  } else {
    bukaPesan();
  }
}
function bukaProfil(lanjutPesan) {
  const f = $('#formProfil');
  f.nama.value = (profil && profil.nama) || (akun && akun.name) || '';
  f.nomor_hp.value = (profil && profil.nomor_hp) || '';
  f.alamat.value = (profil && profil.alamat) || '';
  f.dataset.lanjut = lanjutPesan ? '1' : '';
  $('#dialogProfil').showModal();
}
function bukaPesan() {
  const f = $('#formPesan');
  $('#judulPesan').textContent = bukuDipilih.judul;
  f.slotAntar.innerHTML = f.slotJemput.innerHTML =
    SLOT.map((s) => `<option>${esc(s)}</option>`).join('');
  const besok = new Date(); besok.setDate(besok.getDate() + 1);
  const maks = new Date(); maks.setDate(maks.getDate() + 30);
  f.tanggalAntar.min = formatTanggalLokal(besok);
  f.tanggalAntar.max = formatTanggalLokal(maks);
  f.tanggalAntar.value = formatTanggalLokal(besok);
  hitungTenggat();
  $('#dialogPesan').showModal();
}
function hitungTenggat() {
  const f = $('#formPesan');
  if (!f.tanggalAntar.value) return;
  const tenggat = tambahHari(f.tanggalAntar.value, Number(f.durasi.value));
  $('#ringkasTenggat').textContent = 'Tenggat pengembalian: ' + tenggat;
}

// ---- Pesanan saya ----
async function muatPesanan() {
  const box = $('#daftarPesanan');
  if (!akun) { box.innerHTML = '<p class="info">Masuk dengan Google untuk melihat pesananmu.</p>'; return; }
  box.innerHTML = '<p class="info">Memuat...</p>';
  const j = await api('pesananSaya');
  if (!j.ok) { box.innerHTML = `<p class="info">${esc(j.error)}</p>`; return; }
  if (!j.data.length) { box.innerHTML = '<p class="info">Belum ada pesanan.</p>'; return; }
  box.innerHTML = j.data.map((p) => `
    <article class="pesanan">
      <div class="meta"><h3>${esc(p.judul)}</h3><span class="status s-${esc(p.status)}">${esc(p.status)}</span></div>
      <p>Diantar: ${esc(p.tanggal_antar)} (${esc(p.slot_antar)})</p>
      <p>Tenggat: ${esc(p.tenggat)}, dijemput ${esc(p.slot_jemput)}</p>
      ${p.tanggal_kembali ? `<p>Dikembalikan: ${esc(p.tanggal_kembali)} ${p.kondisi_buku ? '(' + esc(p.kondisi_buku) + ')' : ''}</p>` : ''}
      ${p.denda > 0 ? `<p class="denda">Denda: ${rupiah(p.denda)} (bayar tunai ke kurir)</p>` : ''}
    </article>`).join('');
}

// ---- Event ----
function pasangEvent() {
  $('#cari').addEventListener('input', tampilBuku);
  $('#filterKategori').addEventListener('change', tampilBuku);
  $('#daftarBuku').addEventListener('click', (e) => {
    const id = e.target.dataset && e.target.dataset.pinjam;
    if (id) mulaiPinjam(id);
  });

  $('#tabKatalog').addEventListener('click', () => gantiTab('katalog'));
  $('#tabPesanan').addEventListener('click', () => gantiTab('pesanan'));

  $('#btnKeluar').addEventListener('click', () => {
    if (window.google) google.accounts.id.disableAutoSelect();
    hapusSesi();
    toast('Kamu sudah keluar.');
    if (!$('#viewPesanan').hidden) muatPesanan();
  });
  $('#btnProfil').addEventListener('click', async () => {
    if (!profil) {
      const j = await api('profil');
      if (j.ok) profil = j.data;
    }
    bukaProfil(false);
  });

  document.querySelectorAll('[data-tutup]').forEach((b) =>
    b.addEventListener('click', () => b.closest('dialog').close()));

  $('#formProfil').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const j = await api('simpanProfil', {
      nama: f.nama.value, nomor_hp: f.nomor_hp.value, alamat: f.alamat.value,
    });
    if (!j.ok) return toast(j.error);
    profil = j.data;
    $('#dialogProfil').close();
    toast('Profil tersimpan.');
    if (f.dataset.lanjut) bukaPesan();
  });

  $('#formPesan').addEventListener('input', hitungTenggat);
  $('#formPesan').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const btn = $('#btnKirimPesan');
    btn.disabled = true; btn.textContent = 'Memproses...';
    const j = await api('pesan', {
      idBuku: bukuDipilih.id_buku,
      durasi: f.durasi.value,
      tanggalAntar: f.tanggalAntar.value,
      slotAntar: f.slotAntar.value,
      slotJemput: f.slotJemput.value,
    });
    btn.disabled = false; btn.textContent = 'Pesan';
    if (!j.ok) { toast(j.error); muatBuku(); return; }
    $('#dialogPesan').close();
    toast('Pesanan berhasil! Tenggat ' + j.data.tenggat);
    muatBuku();
    gantiTab('pesanan');
  });
}
function gantiTab(nama) {
  const k = nama === 'katalog';
  $('#viewKatalog').hidden = !k;
  $('#viewPesanan').hidden = k;
  $('#tabKatalog').classList.toggle('aktif', k);
  $('#tabPesanan').classList.toggle('aktif', !k);
  if (!k) muatPesanan();
}

// ---- Mulai ----
(function mulai() {
  if (token) {
    try {
      const p = bacaJwt(token);
      if (p.exp * 1000 > Date.now()) akun = p; else hapusSesi();
    } catch (e) { hapusSesi(); }
  }
  tampilAkun();
  pasangEvent();
  muatBuku();
  pasangGoogle();
})();
