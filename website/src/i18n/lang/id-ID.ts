import type { SiteContent } from '../schema'
import { idIDPricingContent } from '../pricing'

export const idID: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — Unduh video Vimeo dalam HD',
    description:
      'Tempel tautan Vimeo publik dan simpan video pada resolusi yang kamu butuhkan. Tanpa aplikasi, tanpa akun, dan tanpa ekstensi untuk unduhan biasa.',
    keywords:
      'unduh video vimeo, pengunduh vimeo, vimeo hd, simpan video vimeo, vimeo ke mp4, unduh vimeo online'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Beranda',
      pricing: 'Harga',
      solutions: 'Panduan unduh',
      changelog: 'Perubahan'
    },
    footer: {
      resources: 'Sumber daya',
      rights: '© 2026 Vimeo Video Downloader. Seluruh hak dilindungi.'
    }
  },
  common: {
    installCta: 'Instal Sekarang'
  },
  sections: {
    features: {
      title: 'Fitur pengunduh Vimeo',
      subtitle:
        'Yang dilakukan pengunduh pada tautan Vimeo publik: menganalisis halaman, menampilkan resolusi yang disediakan Vimeo, lalu menyimpan pilihanmu.',
      metaDescription:
        'Fitur Vimeo Video Downloader: unduhan HD, pilihan resolusi, keluaran MP4, tanpa akun, dan batas jelas untuk video privat atau berpassword.',
      items: [
        {
          title: 'Pilih resolusi',
          description: 'Pilih resolusi yang kamu butuhkan alih-alih menerima file terkecil yang disediakan Vimeo',
          details: [
            'Pilih dari resolusi yang disediakan video',
            'Unduh kualitas tertinggi yang tersedia untuk ditonton offline',
            'Pertahankan rasio gambar dan trek audio asli',
            'Keluaran MP4 yang bisa diputar di perangkat apa pun'
          ]
        },
        {
          title: 'Analisis tautan',
          description: 'Tempel URL halaman video Vimeo dan pengunduh akan membaca resolusi yang tersedia',
          details: [
            'Mendukung tautan vimeo.com, www.vimeo.com, dan player.vimeo.com',
            'Tidak perlu akun atau login Vimeo',
            'Pesan jelas saat video privat atau tidak bisa dianalisis',
            'Tidak ada yang perlu dipasang untuk unduhan biasa'
          ]
        },
        {
          title: 'File besar',
          description:
            'Video Vimeo yang panjang tetap bisa diunduh dengan progres terlihat, dan ekstensi menangani file yang sangat besar',
          details: [
            'Progres terlihat selama pengunduhan',
            'Unduhan yang terputus bisa dilanjutkan dari ruang kerja',
            'Ekstensi browser menangani bagian yang tidak bisa diselesaikan browser',
            'Penyimpanan diperiksa sebelum unduhan besar dimulai'
          ]
        },
        {
          title: 'Semua perangkat',
          description:
            'Pakai halaman yang sama di ponsel, tablet, atau komputer — pengunduhan berjalan di browser',
          details: [
            'Berjalan di Windows, macOS, Android, iPhone, dan tablet',
            'Tidak perlu aplikasi desktop',
            'Tata letak menyesuaikan layar kecil',
            'File tersimpan di folder unduhan biasa'
          ]
        },
        {
          title: 'Batas akses yang jelas',
          description: 'Video Vimeo privat, berpassword, atau berbayar di luar cakupan dan dinyatakan apa adanya',
          details: [
            'Tidak berusaha melewati privasi atau batasan akses',
            'Tidak pernah meminta password, kode verifikasi, atau file sesi Vimeo',
            'Hanya halaman video publik yang bisa dianalisis',
            'Kamu tetap bertanggung jawab memiliki hak untuk menyimpan video'
          ]
        },
        {
          title: 'Cepat tanpa pendaftaran',
          description: 'Salin, tempel, pilih, unduh; akun hanya perlu saat menggunakan kredit',
          details: [
            'Tidak perlu mendaftar untuk mencoba tautan publik',
            'Masuk dengan Google atau kode email hanya saat butuh kredit',
            'Kredit tidak pernah kedaluwarsa',
            'Pesan kesalahan jelas saat tautan tidak bisa diproses'
          ]
        }
      ]
    },
    steps: {
      title: 'Cara menyimpan video Vimeo',
      subtitle:
        'Seluruh alurnya tiga langkah: salin URL halaman video Vimeo, tempel di atas, lalu pilih resolusi dan unduh.',
      metaDescription:
        'Panduan langkah demi langkah menyimpan video Vimeo: salin URL halaman video, tempel di Vimeo Video Downloader, pilih resolusi, lalu unduh MP4.',
      items: [
        {
          title: 'Salin tautan Vimeo',
          description: 'Buka video di vimeo.com dan salin URL dari bilah alamat atau menu bagikan'
        },
        {
          title: 'Tempel di atas',
          description:
            'Masukkan tautan ke kolom lalu mulai analisis: pengunduh menampilkan apa yang disediakan Vimeo'
        },
        {
          title: 'Pilih resolusi',
          description: 'Pilih kualitas yang kamu inginkan dari resolusi yang tersedia'
        },
        {
          title: 'Unduh MP4',
          description: 'Simpan file ke perangkat; file sangat besar mungkin butuh ekstensi'
        }
      ]
    },
    cta: {
      title: 'Siap mengunduh video Vimeo?',
      description: 'Tempel tautan Vimeo publik di atas dan simpan pada resolusi yang kamu butuhkan.'
    },
    techSpecs: {
      title: 'Spesifikasi teknis',
      browsersLabel: 'Browser',
      browsers: 'Chrome, Edge, Brave, dan semua browser berbasis Chromium',
      sourceHostsLabel: 'Tautan yang didukung',
      sourceHosts: 'vimeo.com, www.vimeo.com, player.vimeo.com',
      permissionsLabel: 'Izin',
      permissions: 'Izin minimum diperlukan',
      updatesLabel: 'Pembaruan',
      updates: 'Pembaruan otomatis dari toko ekstensi'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: 'Unduh video Vimeo pada resolusi yang kamu butuhkan',
        description: 'Tempel tautan Vimeo publik, pilih resolusi, lalu simpan MP4 langsung dari browser.'
      },
      stats: {
        users: 'Pengguna Seluruh Dunia',
        downloads: 'Total Unduhan'
      },
      seo: {
        title: 'Pengunduh video Vimeo: unduh video Vimeo dalam HD',
        description:
          'Simpan video Vimeo publik dalam HD dan pilih resolusinya. Tempel tautan, lihat resolusi yang tersedia, lalu unduh MP4 tanpa memasang apa pun.',
        keywords:
          'pengunduh vimeo, unduh video vimeo, vimeo hd, simpan video vimeo, vimeo mp4, unduh vimeo online'
      },
      heroTrustPoints: [
        'Unduhan HD',
        'Tanpa pendaftaran',
        'Ramah seluler',
        'Berjalan di Windows, Mac, Android, dan iPhone'
      ],
      situation: {
        title: 'Mulai di sini: tautan Vimeo mana yang kamu punya?',
        intro: 'Kebanyakan orang yang mencari pengunduh Vimeo memegang salah satu tautan ini. Temukan milikmu:',
        headers: ['Situasimu', 'Coba ini dulu'],
        rows: [
          {
            cells: [
              'Kamu punya URL halaman video Vimeo publik',
              'Tempel di pengunduh atas dan pilih resolusi'
            ]
          },
          {
            cells: [
              'Halaman video tidak punya tombol unduh',
              'Pakai pengunduh ini — Vimeo hanya menampilkan tombolnya jika pemilik mengizinkan'
            ]
          },
          {
            cells: [
              'Video privat atau berpassword',
              'Kamu perlu akses dari pemiliknya; pengunduh tidak bisa membukanya untukmu'
            ]
          },
          {
            cells: [
              'Pengunduh menyatakan video privat atau tidak bisa dianalisis',
              'Pastikan tautannya URL halaman video dan videonya publik'
            ]
          }
        ]
      },
      solutions: {
        title: 'Apa yang benar-benar berhasil untuk video Vimeo?',
        intro:
          'Vimeo menyimpan video dengan aturan akses yang sangat berbeda. Halaman video publik bisa dianalisis pengunduh; video privat, berpassword, atau berbayar tidak bisa dijangkau dari luar, apa pun alatnya.',
        quickAnswer:
          'Jawaban singkat: jika halaman Vimeo publik, tempel tautannya di atas dan unduh resolusi yang kamu butuhkan. Jika Vimeo menampilkan tombol unduhnya sendiri, itu jalur paling bersih. Jika video privat atau berpassword, minta akses atau ekspor kepada pemiliknya — tidak ada pengunduh yang bisa melewatinya.',
        items: [
          {
            title: 'Solusi 1: pengunduh Vimeo online',
            description:
              'Paling cocok untuk halaman video Vimeo publik. Tempel URL, biarkan pengunduh menampilkan resolusi yang disediakan Vimeo, lalu simpan pilihanmu.',
            useWhenLabel: 'Pakai saat:',
            useWhen: [
              'Halaman video publik dan terbuka tanpa login.',
              'Kamu ingin resolusi tertentu atau kualitas tertinggi yang tersedia.',
              'Kamu tidak ingin memasang ekstensi atau aplikasi desktop.'
            ]
          },
          {
            title: 'Solusi 2: tombol unduh milik Vimeo',
            description:
              'Sebagian kreator mengizinkan video mereka diunduh. Saat opsi itu aktif, pemutar Vimeo menampilkan tombol unduh dan itu jalur paling langsung.',
            useWhenLabel: 'Pakai saat:',
            useWhen: [
              'Pemutar Vimeo menampilkan opsi unduh.',
              'Kamu ingin persis file yang dipublikasikan kreator.',
              'Kamu sudah punya izin menyimpan salinannya.'
            ]
          },
          {
            title: 'Solusi 3: ekstensi browser untuk file besar',
            description:
              'Video panjang bisa melebihi kemampuan satu tab untuk mentransfer dan menyimpan sekaligus. Ekstensi mengambil alih transfer dan menjaganya tetap bisa dilanjutkan.',
            useWhenLabel: 'Pakai saat:',
            useWhen: [
              'Unduhannya sangat besar atau terus terputus.',
              'Ruang kerja memberi tahu penyimpanan lokal browser tidak cukup.',
              'Kamu sering mengunduh dari Vimeo.'
            ]
          },
          {
            title: 'Solusi 4: rekam layar (upaya terakhir)',
            description:
              'Jika video bisa diputar tetapi tidak bisa diunduh lewat jalur legal mana pun, perekam layar bisa menangkapnya. Ini opsi cadangan, bukan cara pertama, karena kualitas dan audio bergantung pada pemutaran.',
            useWhenLabel: 'Pakai saat:',
            useWhen: [
              'Kamu punya izin menonton dan menyimpan video itu.',
              'Video tidak bisa dianalisis dari tautannya.',
              'Kamu hanya butuh salinan offline pribadi untuk referensi.'
            ]
          }
        ]
      },
      benefits: {
        title: 'Mengapa memakai pengunduh Vimeo online?',
        intro:
          'Pengunduh yang baik menjawab satu pertanyaan dengan cepat: bisakah video Vimeo ini disimpan dari tautan yang kupunya? Pengalamannya harus langsung, jujur soal batasan, dan jelas saat video privat tidak bisa diproses.',
        items: [
          {
            title: 'Simpan video berkualitas tinggi',
            description:
              'Pertahankan resolusi tertinggi yang disediakan Vimeo agar salinan offline tetap seperti saat kreator mempublikasikannya.'
          },
          {
            title: 'Berjalan di semua perangkat',
            description:
              'Pakai pengunduh lewat browser di Android, iPhone, Windows, Mac, atau tablet — file disimpan oleh browser yang sudah kamu miliki.'
          },
          {
            title: 'Tanpa login Vimeo',
            description:
              'Halaman video publik tidak butuh akun Vimeo. Password, kode verifikasi, dan file sesi tidak pernah diminta.'
          },
          {
            title: 'Pemutaran offline mudah',
            description:
              'Hasil unduhan berupa MP4 yang bisa diputar di hampir semua perangkat dan pemutar tanpa codec tambahan.'
          },
          {
            title: 'Proses cepat berbasis tautan',
            description:
              'Salin, tempel, pilih, unduh. Jika tautan gagal, halaman menjelaskan apakah video privat, sudah dihapus, atau tidak didukung.'
          },
          {
            title: 'Batas izin yang jelas',
            description:
              'Unduh hanya video yang berhak kamu simpan. Hormati hak kreator, ketentuan Vimeo, dan aturan akses video tersebut.'
          },
          {
            title: 'Kendali resolusi',
            description:
              'Pilih di antara resolusi yang disediakan video alih-alih terkunci pada satu tingkat kualitas.'
          },
          {
            title: 'Penanganan file besar',
            description:
              'Video yang lebih panjang diperiksa penyimpanannya sebelum mulai dan bisa dilanjutkan lewat ekstensi browser saat terlalu besar untuk satu tab.'
          },
          {
            title: 'Harga yang bisa diprediksi',
            description:
              'Analisis tautan publik tanpa akun. Kredit hanya diperlukan untuk unduhan yang lewat ruang kerja dan tidak pernah kedaluwarsa.'
          }
        ]
      },
      troubleshooting: {
        title: 'Jika tautan Vimeo tidak berfungsi',
        intro:
          'Tidak semua kegagalan berarti pengunduhnya rusak. Video Vimeo sering gagal karena halamannya tidak publik. Coba daftar ini:',
        items: [
          'Buka tautan di browser dan pastikan video berputar tanpa login.',
          'Pastikan URL-nya halaman video, bukan profil, showcase, atau pencarian.',
          'Periksa apakah video berpassword atau ditandai privat.',
          'Pastikan videonya masih ada — video yang dihapus tidak bisa dianalisis.',
          'Coba browser atau jaringan lain jika halaman tidak bisa menjangkau Vimeo.',
          'Hindari alat apa pun yang meminta password Vimeo atau Google-mu.'
        ]
      },
      permission: {
        title: 'Catatan penting soal izin',
        note:
          'Pengunduh video Vimeo tidak boleh dipakai untuk melewati privasi, hak cipta, atau batasan akses. Simpan video hanya jika kamu punya izin dari pemegang hak atau penggunaannya diizinkan hukum dan ketentuan Vimeo.'
      },
      comparison: {
        title: 'Pilih metode unduh Vimeo yang tepat',
        headers: ['Situasi', 'Solusi yang disarankan', 'Paling cocok untuk', 'Yang perlu diperiksa'],
        rows: [
          {
            cells: [
              'Halaman video Vimeo publik',
              'Pengunduh Vimeo online',
              'Unduhan HD cepat tanpa aplikasi',
              'Halaman terbuka tanpa login dan videonya publik'
            ]
          },
          {
            cells: [
              'Kreator mengaktifkan unduhan',
              'Tombol unduh milik Vimeo',
              'Mendapat persis file yang dipublikasikan',
              'Pemutar menampilkan opsi unduh'
            ]
          },
          {
            cells: [
              'Unduhan sangat besar atau terputus',
              'Ekstensi browser',
              'Transfer bisa dilanjutkan melebihi batas tab',
              'Penyimpanan lokal yang tersedia dan kestabilan jaringan'
            ]
          },
          {
            cells: [
              'Video privat atau berpassword',
              'Minta akses atau ekspor ke pemiliknya',
              'Tetap dalam aturan akses Vimeo',
              'Video yang tidak bisa kamu akses tidak bisa dijangkau alat mana pun'
            ]
          }
        ]
      },
      howTo: {
        title: 'Unduh video Vimeo dalam 3 langkah',
        subtitle:
          'Jalur tercepat adalah pengunduh di atas. Ini berfungsi saat halaman video Vimeo publik dan bisa dijangkau browser.',
        steps: [
          {
            title: 'Salin tautan video',
            description:
              'Buka video di Vimeo dan salin URL halaman dari bilah alamat atau menu bagikan.'
          },
          {
            title: 'Tempel dan analisis',
            description:
              'Tempel tautan ke pengunduh di atas. Alat ini memeriksa resolusi apa yang disediakan Vimeo untuk video itu.'
          },
          {
            title: 'Pilih kualitas dan unduh',
            description:
              'Pilih resolusi lalu simpan MP4 ke perangkatmu. Jika tidak ada yang muncul, kemungkinan videonya privat atau tidak tersedia, bukan rusak.'
          }
        ]
      },
      faq: {
        title: 'Pertanyaan umum',
        description: 'Pertanyaan yang sering muncul sebelum mengunduh video Vimeo.',
        items: [
          {
            question: 'Bagaimana cara mengunduh video Vimeo?',
            answer:
              'Buka halaman video di Vimeo, salin URL-nya, tempel di pengunduh atas, pilih salah satu resolusi yang tersedia, lalu unduh MP4-nya.'
          },
          {
            question: 'Bisakah mengunduh video Vimeo privat atau berpassword?',
            answer:
              'Tidak. Video privat, berpassword, dan berbayar tidak bisa dijangkau dari luar sesi Vimeo-mu, jadi pengunduh tidak bisa menganalisisnya. Minta akses atau ekspor file kepada pemiliknya.'
          },
          {
            question: 'Mengapa pengunduh menyatakan video Vimeo ini privat?',
            answer:
              'Vimeo tidak mengembalikan resolusi publik untuk tautan itu. Penyebab umumnya pengaturan privasi, permintaan password, video yang sudah dihapus, atau URL yang mengarah ke profil atau showcase alih-alih halaman video.'
          },
          {
            question: 'Apakah perlu akun Vimeo atau ekstensi?',
            answer:
              'Unduhan publik biasa tidak perlu akun maupun ekstensi. Ekstensi hanya berguna untuk file yang sangat besar atau saat kamu ingin transfer berlanjut di luar tab.'
          },
          {
            question: 'Format dan kualitas apa yang didapat?',
            answer:
              'Hasil unduhan adalah MP4 yang dibuat dari resolusi yang disediakan Vimeo untuk video tersebut. Kamu bisa memilih di antara resolusi yang tersedia, dan yang tertinggi biasanya kualitas yang diunggah kreator.'
          },
          {
            question: 'Apakah gratis?',
            answer:
              'Menganalisis tautan Vimeo publik gratis. Unduhan yang lewat ruang kerja memakai kredit, yang dibeli sekali dan tidak kedaluwarsa; ekstensi punya langganan Unlimited terpisah.'
          },
          {
            question: 'Aman menempelkan tautan Vimeo di sini?',
            answer:
              'Aman. Hanya tautan yang kamu tempel yang dipakai untuk mencari videonya. Pengunduh tidak pernah meminta password, kode verifikasi, atau file sesi Vimeo, dan kamu sebaiknya meninggalkan halaman yang memintanya.'
          },
          {
            question: 'Apakah mengunduh video Vimeo legal?',
            answer:
              'Tergantung videonya, izinmu, dan tujuan penggunaannya. Unduh hanya konten yang berhak kamu simpan, dan jangan menyebarkan materi berhak cipta atau privat tanpa izin.'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: 'Akses web',
          title: 'Masuk untuk menyinkronkan kredit Anda',
          signedInAs: 'Masuk sebagai',
          continueWithGoogle: 'Lanjutkan dengan Google',
          googleLoading: 'Membuka Google...',
          or: 'atau',
          emailLabel: 'Email',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: 'Lanjutkan dengan email',
          sendCode: 'Kirim kode',
          sendingCode: 'Mengirim...',
          sendCodeSuccess: 'Kode verifikasi telah dikirim.',
          sendAgain: 'Kirim lagi',
          codeLabel: 'Kode verifikasi',
          codePlaceholder: '123456',
          signIn: 'Masuk',
          termsNotice: 'Dengan masuk, Anda menyetujui',
          termsLink: 'Ketentuan',
          privacyLink: 'Kebijakan Privasi',
          logout: 'Keluar',
          creditsLabel: 'kredit'
        },
                quota: {
          eyebrow: 'Kuota web',
          title: 'Saldo kredit saat ini',
          planLabel: 'Paket',
          remainingLabel: 'Tersisa',
          dailyLimitLabel: 'Batas harian',
          unlimited: 'Tanpa batas'
        },
                checkin: {
          creditsLoading: 'Kredit',
          creditsButtonLabel: 'Buka check-in harian',
          accountButtonLabel: 'Buka menu akun',
          accountMenuLabel: 'Menu akun',
          title: 'Kredit gratis hari ini sudah siap',
          todayRewardText: 'Hadiah hari ini: {credits} kredit',
          claimedRewardText: 'Anda menerima {credits} kredit hari ini.',
          nextCountdown: 'Klaim berikutnya dalam {time}',
          nextAt: '(Penyegaran berikutnya: {time} EST)',
          claimButton: 'Klaim {credits} kredit',
          claimingButton: 'Mengklaim...',
          notNow: 'Nanti saja',
          close: 'Tutup',
          loadFailed: 'Gagal memuat status check-in.',
          claimFailed: 'Gagal mengklaim kredit.'
        },
                creditPurchase: {
          installGuide: 'Anda juga dapat mengunduh dengan ekstensi browser.',
          installExtension: 'Pasang ekstensi',
          title: 'Beli kredit',
          description: 'Tambahkan kredit dan lanjutkan mengunduh dari ruang kerja ini.',
          successTitle: 'Kredit ditambahkan',
          successDescription: 'Saldo Anda sudah diperbarui. Tutup jendela ini dan mulai unduhan lagi.',
          packageEyebrow: 'Bayar sesuai penggunaan',
          cardNote: 'Gunakan kredit untuk unduhan web. Kredit tidak kedaluwarsa.',
          creditsAmount: '{credits} kredit',
          buyNow: 'Beli sekarang',
          selectPackage: 'Pilih',
          paymentMethodLabel: 'Pilih metode pembayaran',
          paymentTitle: 'Pilih metode pembayaran',
          selectedPackageLabel: 'Produk terpilih',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: 'Lanjut ke pembayaran',
          backToProducts: 'Kembali',
          close: 'Tutup',
          agreementText: 'Saya menyetujui ketentuan pembelian, Ketentuan, dan Kebijakan Privasi.',
          loadingConfigs: 'Memuat paket kredit...',
          loadFailed: 'Gagal memuat paket kredit. Coba lagi.',
          noConfigs: 'Belum ada paket kredit yang tersedia saat ini. Coba lagi nanti.',
          ready: 'Pilih paket kredit. Harga ditampilkan dalam USD.',
          creatingOrder: 'Membuat pesanan...',
          pendingPayment: 'Selesaikan pembayaran di tab yang baru dibuka. Kami akan memeriksa hasilnya otomatis.',
          pendingPaymentTitle: 'Menunggu pembayaran',
          cancelPayment: 'Batalkan pembayaran',
          supportMailPrefix: 'Laporkan masalah: ',
          success: 'Pembayaran selesai. Kredit sudah tersedia.',
          failed: 'Pembayaran belum selesai. Anda dapat mencoba lagi atau menutup jendela ini.',
          successCredits: '+{credits} kredit ditambahkan',
          successBalance: 'Saldo saat ini: {balance} kredit',
          createFailed: 'Gagal membuat pesanan. Coba lagi.',
          invalidPaymentData: 'Tautan pembayaran tidak valid. Coba lagi nanti.',
          priceUpdated: 'Harga berubah. Periksa harga terbaru lalu beli lagi.',
          gatewayFailed: 'Akses pembayaran sementara tidak tersedia. Coba lagi nanti.',
          paymentCanceled: 'Pembayaran dibatalkan. Pilih metode pembayaran dan coba lagi.',
          pollFailed: 'Gagal memperbarui status pembayaran. Coba lagi.',
          pollTimeout: 'Pembaruan otomatis habis waktu. Segarkan hasil setelah pembayaran.',
          orderNotFound: 'Pesanan tidak tersedia lagi. Buat pesanan baru.',
          orderExpired: 'Pesanan kedaluwarsa. Beli lagi.',
          fulfillmentFailed: 'Pembayaran diterima, tetapi kredit belum ditambahkan. Coba lagi nanti.',
          authExpired: 'Sesi masuk kedaluwarsa. Masuk lagi untuk melanjutkan.'
        },
        parse: {
          eyebrow: 'Pemeriksaan tautan cepat',
          title: 'Pengunduh video Vimeo: simpan video Vimeo publik apa pun',
          helperText:
            'Tempel tautan video Vimeo publik, lihat resolusi yang disediakan Vimeo, lalu unduh resolusi yang kamu butuhkan.',
          linkLabel: 'Tautan Vimeo',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: 'Hapus input',
          submit: 'Tempel tautan video Vimeo',
          submitting: 'Memproses...',
          noResults: 'Tidak ada file yang bisa diunduh untuk video ini.',
          download: 'Unduh',
          downloading: 'Mengunduh...',
          checkingStorage: 'Memeriksa penyimpanan browser...',
          unknownSize: 'Ukuran tidak diketahui',
          preparingMp4: 'Menyiapkan MP4...',
          downloadAll: 'Unduh semua',
          downloadingAll: 'Mengunduh semua...',
          resumeNotice:
            'Terdeteksi unduhan yang belum selesai "{filename}" ({progress}). Lanjutkan?',
          resumeAction: 'Lanjutkan',
          pendingRestartText: 'Catatan unduhan sebelumnya untuk "{filename}" bisa dimulai ulang.',
          pendingRestartButton: 'Mulai ulang unduhan',
          resumeUnavailableText: 'Catatan pemulihan lokal sudah kedaluwarsa.',
          resumeDismiss: 'Abaikan',
          resuming: 'Melanjutkan...',
          largeFileExtensionInlineChromeTitle: 'Ekstensi Chrome',
          largeFileExtensionInlineChromeDescription:
            'Ekstensi khusus Chrome yang menjaga unduhan Vimeo besar tetap berjalan di luar tab.',
          largeFileExtensionInlineChromeCta: 'Instal ekstensi',
          largeFileExtensionInlineEdgeTitle: 'Ekstensi Edge',
          largeFileExtensionInlineEdgeDescription:
            'Ekstensi khusus Microsoft Edge dengan penanganan unduhan Vimeo besar yang sama.',
          largeFileExtensionInlineEdgeCta: 'Instal ekstensi'
        },
                errors: {
          enterEmailFirst: 'Masukkan alamat email Anda terlebih dahulu.',
          enterEmailAndCode: 'Masukkan email dan kode verifikasi.',
          sendCodeFailed: 'Gagal mengirim kode verifikasi.',
          googleSignInFailed: 'Gagal masuk dengan Google.',
          googleClientMissing: 'Login Google belum dikonfigurasi.',
          restoreSessionFailed: 'Gagal memulihkan sesi.',
          signInFailed: 'Gagal masuk.',
          logoutFailed: 'Gagal keluar.',
          loadQuotaFailed: 'Gagal memuat kredit.',
          enterLink: 'Masukkan tautan media.',
          invalidLink: 'Ini bukan URL yang valid.',
          parseFailed: 'Gagal memproses tautan ini.',
          downloadFailed: 'Gagal mengunduh file ini.',
          unsafeFileTypeUseExtension:
            'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.',
          unsafeFileTypeConfirmTitle: 'Use the browser extension',
          unsafeFileTypeConfirmViewExtension: 'View extension download',
          unsafeFileTypeConfirmCancel: 'Cancel',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: 'Video ini melebihi batas ukuran unduhan browser.',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: 'This link platform is not supported.',
          vimeoParseFailed: 'This Vimeo video is private or cannot be parsed.',
          quotaExceeded: 'Kredit tidak cukup untuk mengunduh file ini.',
          rateLimitExceeded: 'Too many requests. Please try again later.'
        },
                anonymousQueue: {
          title: 'Unduhan dalam antrean',
          remaining: 'Unduhan dimulai dalam {seconds} detik.',
          hint: 'Masuk untuk mengunduh tanpa menunggu.',
          login: 'Masuk',
          close: 'Tutup'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    },
    changelog: {
      title: 'Pembaruan pengunduh Vimeo',
      description:
        'Ikuti pembaruan unduhan Vimeo, perubahan analisis, dukungan file yang lebih besar, dan catatan rilis Vimeo Video Downloader.',
      seoTitle: 'Pembaruan pengunduh Vimeo | Vimeo Video Downloader',
      seoDescription:
        'Baca pembaruan Vimeo Video Downloader: pembaruan analisis, penanganan resolusi, file lebih besar, dan catatan setiap versi.',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: 'Peningkatan performa',
          description: 'Peningkatan performa besar untuk pengalaman yang lebih baik.',
          features: [
            'Kecepatan analisis naik 50%',
            'Stabilitas unduhan file besar dioptimalkan',
            'Antarmuka lebih responsif'
          ]
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: 'Dukungan multibahasa',
          description: 'Menambahkan dukungan 14 bahasa.',
          features: ['Menambahkan bahasa Jepang, Korea, dan lainnya', 'Akurasi terjemahan meningkat', 'Deteksi bahasa otomatis']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: 'Pilihan resolusi',
          description: 'Pilih resolusi Vimeo yang diinginkan sebelum unduhan dimulai.',
          features: [
            'Pilih resolusi apa pun yang disediakan',
            'Pertahankan kualitas tertinggi yang tersedia',
            'Manajemen antrean unduhan lebih baik'
          ]
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: 'Keamanan dan privasi',
          description: 'Peningkatan keamanan dan privasi.',
          features: [
            'Menghapus semua pelacakan analitik dari unduhan',
            'Menambahkan mode pemrosesan lokal saja',
            'Enkripsi data ditingkatkan'
          ]
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: 'Rilis pertama',
          description: 'Rilis pertama pengunduh berbasis tautan Vimeo.',
          features: [
            'Analisis tautan Vimeo dan keluaran MP4',
            'Dukungan tautan vimeo.com dan player.vimeo.com',
            'Penanganan resolusi dasar'
          ]
        }
      ],
      labels: {
        features: 'Fitur baru',
        fixes: 'Perbaikan bug'
      }
    },
    pricing: idIDPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Pengunduh video Vimeo HD - Berbagai resolusi | Vimeo Video Downloader',
          description:
            'Unduh video Vimeo dalam HD dengan berbagai pilihan resolusi, gratis. Tanpa aplikasi. Simpan video Vimeo publik apa pun seketika.',
          keywords:
            'pengunduh vimeo, unduh video vimeo, unduh vimeo hd, pengunduh vimeo gratis, simpan video vimeo, vimeo hd'
        },
        workspace: {
          title: 'Pengunduh video Vimeo HD',
          helperText:
            'Tempel tautan video Vimeo publik apa pun untuk mengunduhnya dalam HD dengan pilihan resolusi.',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: 'Mengapa memakai pengunduh Vimeo kami',
          subtitle: 'Simpan video Vimeo dalam HD dengan resolusi pilihanmu, sepenuhnya gratis.',
          items: [
            {
              title: 'Kualitas HD asli',
              description:
                'Unduh video Vimeo dalam resolusi Full HD. Kamu mendapat ketajaman yang sama seperti yang diunggah kreator.'
            },
            {
              title: 'Berbagai resolusi',
              description:
                'Pilih dari resolusi yang tersedia (360p, 720p, 1080p, dan lebih tinggi). Ambil kualitas yang sesuai kebutuhanmu.'
            },
            {
              title: 'Cepat dan gratis',
              description:
                'Tanpa memasang aplikasi, tanpa akun. Tempel tautan Vimeo, pilih resolusi, lalu unduh seketika.'
            }
          ]
        },
        howTo: {
          title: 'Cara mengunduh video Vimeo dalam HD',
          subtitle: 'Tiga langkah sederhana untuk menyimpan video Vimeo publik apa pun pada resolusi pilihanmu.',
          steps: [
            {
              title: 'Salin tautan video Vimeo',
              description: 'Buka halaman video di Vimeo dan salin URL dari bilah alamat browser.'
            },
            {
              title: 'Tempel tautan di atas',
              description: 'Tempel URL Vimeo yang disalin ke kolom isian lalu klik Analisis.'
            },
            {
              title: 'Pilih resolusi dan unduh',
              description: 'Pilih resolusi yang kamu inginkan dan klik Unduh untuk menyimpan video HD.'
            }
          ]
        },
        faq: {
          title: 'FAQ pengunduh Vimeo',
          items: [
            {
              question: 'Bagaimana cara mengunduh video dari Vimeo?',
              answer:
                'Salin URL halaman video Vimeo, tempel di kolom atas, klik Analisis, lalu pilih resolusi dan unduh.'
            },
            {
              question: 'Bisakah saya memilih resolusi video?',
              answer:
                'Bisa. Setelah analisis, kamu dapat memilih dari semua resolusi yang tersedia, termasuk 360p, 720p, 1080p, dan lebih tinggi jika ada.'
            },
            {
              question: 'Apakah pengunduh Vimeo ini gratis?',
              answer:
                'Menganalisis tautan Vimeo publik gratis dan tanpa pendaftaran. Unduhan yang lewat ruang kerja memakai kredit.'
            },
            {
              question: 'Apakah perlu akun Vimeo untuk mengunduh?',
              answer: 'Tidak perlu akun. Kamu bisa mengunduh video Vimeo publik apa pun tanpa login.'
            },
            {
              question: 'Format apa hasil unduhannya?',
              answer: 'Video Vimeo diunduh dalam format MP4 yang kompatibel dengan hampir semua perangkat dan pemutar.'
            }
          ]
        }
      }
    }
  }
}
