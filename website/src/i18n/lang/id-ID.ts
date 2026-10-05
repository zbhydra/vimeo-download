import type { SiteContent } from '../schema'
import { idIDPricingContent } from '../pricing'

export const idID: SiteContent = {
  site: {
    description: 'Tempel tautan Vimeo untuk menyimpan video di browser, gratis dan tanpa masuk akun. Butuh audio, subtitle, gambar sampul, atau antrean? Pasang ekstensi Chrome.'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Beranda',
      pricing: 'Harga',
    },
    footer: {
      resources: 'Sumber daya',
      rights: '© 2026 Vimeo Video Downloader. Seluruh hak dilindungi.'
    }
  },
  common: {
    installCta: 'Instal Sekarang'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Video Downloader – Alat Online Gratis dan Ekstensi Chrome',
        description: 'Tempel tautan Vimeo untuk menyimpan video di browser, gratis dan tanpa masuk akun. Butuh audio, subtitle, gambar sampul, atau antrean? Pasang ekstensi Chrome.'
      },
      heroTrustPoints: [
        'Unduhan HD',
        'Tanpa pendaftaran',
        'Ramah seluler',
        'Berjalan di Windows, Mac, Android, dan iPhone'
      ],
      workspace: {
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
          rateLimitExceeded: 'Too many requests. Please try again later.',
          useExtensionForResource: 'Sumber ini hanya dapat diunduh dengan ekstensi browser. Instal ekstensi untuk melanjutkan.'
        },
                anonymousQueue: {
          title: 'Unduhan dalam antrean',
          remaining: 'Unduhan dimulai dalam {seconds} detik.',
          close: 'Tutup'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    ,
      softwareApplication: {
        description: 'Ekstensi Chrome untuk penonton Vimeo yang ingin salinan lokal video yang sedang ditonton, dengan panel di halaman untuk mengunduh video, audio, subtitle, dan gambar sampul.',
        featureList: [
          'Panel unduh di halaman dengan baris Video, Audio, Subtitle, dan Gambar',
          'Pilih kualitas video atau gunakan Best',
          'Simpan audio sebagai M4A atau transkode ke MP3',
          'Simpan subtitle sebagai VTT dan potong video atau audio adaptif',
          'Simpan gambar sampul sebagai JPEG',
          'Daftar sumber daya di popup dengan progres dan kecepatan langsung',
          'Antrean unduhan global yang dibagi antar tab',
          'Riwayat lokal, templat nama berkas, dan pengaturan subfolder simpan'
        ]
      },
      intro: {
        heading: 'Lebih jauh dengan ekstensi Chrome',
        lead: 'Alat online di atas menyimpan video Vimeo dari sebuah tautan. Ekstensi bekerja langsung di halaman Vimeo yang sedang Anda tonton dan menambahkan audio, subtitle, gambar sampul, serta antrean unduhan.',
        primaryCta: 'Tambahkan ke Chrome',
        secondaryCta: 'Lihat paket',
        panel: {
          ariaLabel: 'Ilustrasi panel unduh di halaman',
          rows: {
            video: 'Video',
            audio: 'Audio',
            subtitle: 'Subtitle',
            image: 'Gambar'
          }
        }
      },
      features: {
        heading: 'Yang ditambahkan ekstensi',
        items: [
          {
            title: 'Panel unduh di halaman',
            description: 'Panel kecil di dekat video dengan baris Video, Audio, Subtitle, dan Gambar. Panel dibangun ulang saat Anda pindah ke video lain.'
          },
          {
            title: 'Pilihan kualitas dan Best',
            description: 'Pilih 720p, 1080p, atau kualitas lain yang tersedia untuk video, atau biarkan Best memilih yang tertinggi.'
          },
          {
            title: 'Audio sebagai M4A atau MP3',
            description: 'Simpan trek audio secara terpisah sebagai M4A, atau pilih MP3 di popup untuk keluaran hasil transkode.'
          },
          {
            title: 'Subtitle dan pemotongan',
            description: 'Simpan subtitle yang tersedia sebagai VTT. Video dan audio adaptif dapat dipotong tanpa transkode video.'
          },
          {
            title: 'Gambar sampul',
            description: 'Simpan gambar sampul video sebagai berkas JPEG tersendiri.'
          },
          {
            title: 'Daftar popup dan antrean',
            description: 'Lihat semua item yang terdeteksi di popup beserta progres langsung, lalu masukkan ke antrean agar diunduh satu per satu lintas tab.'
          },
          {
            title: 'Berkas besar',
            description: 'Berkas yang bisa diambil Chrome sendiri diserahkan ke pengelola unduhan Chrome. Streaming adaptif dirakit di latar belakang dalam batas anggaran memori.'
          },
          {
            title: 'Pengaturan dan riwayat',
            description: 'Pilih subfolder simpan, templat nama berkas, dan bahasa antarmuka. Unduhan yang selesai maupun gagal tersimpan di riwayat lokal yang bisa diekspor sebagai CSV.'
          }
        ]
      },
      steps: {
        heading: 'Cara kerja ekstensi',
        items: [
          {
            title: 'Pasang',
            description: 'Pasang ekstensi dari Chrome Web Store.'
          },
          {
            title: 'Sematkan ikon',
            description: 'Sematkan di toolbar agar popup mudah dibuka.'
          },
          {
            title: 'Buka video Vimeo',
            description: 'Buka halaman video yang didukung di vimeo.com atau player.vimeo.com lalu mulai memutar.'
          },
          {
            title: 'Pilih kualitas',
            description: 'Klik kualitas yang Anda mau di panel, atau buka ikon ekstensi untuk daftar lengkap. Browser menulis berkas ke disk Anda.'
          }
        ]
      },
      comparison: {
        heading: 'Alat online atau ekstensi',
        columns: {
          dimension: 'Perbandingan',
          web: 'Alat online',
          extension: 'Ekstensi Chrome'
        },
        rows: [
          {
            dimension: 'Tempat berjalan',
            web: 'Di tab browser mana pun pada halaman ini: tempel tautan Vimeo.',
            extension: 'Di Chrome dan browser Chromium lainnya, pada halaman Vimeo yang sedang Anda tonton.'
          },
          {
            dimension: 'Yang bisa disimpan',
            web: 'Video sebagai berkas MP4.',
            extension: 'Video sebagai MP4, audio sebagai M4A atau MP3, subtitle sebagai VTT, dan gambar sampul sebagai JPEG.'
          },
          {
            dimension: 'Batch dan antrean',
            web: 'Tempel beberapa tautan dan jalankan satu per satu dengan «Unduh semua».',
            extension: 'Tambahkan item dari popup ke satu antrean yang dibagi antar tab; item diunduh berurutan.'
          },
          {
            dimension: 'Berkas besar',
            web: 'Berkas yang sangat besar, atau berukuran tidak diketahui, diarahkan ke ekstensi.',
            extension: 'Berkas langsung memakai pengelola unduhan Chrome; streaming adaptif dirakit dalam batas anggaran memori.'
          },
          {
            dimension: 'Masuk akun',
            web: 'Tidak diperlukan.',
            extension: 'Tidak diperlukan. Masuk bersifat opsional dan hanya memengaruhi kuota harian serta status langganan Anda.'
          },
          {
            dimension: 'Biaya',
            web: 'Gratis.',
            extension: 'Kuota harian gratis, dengan paket Unlimited berbayar untuk kebutuhan lebih banyak.'
          }
        ]
      },
      scope: {
        heading: 'Cocok untuk apa, dan apa yang tidak dilakukan',
        worksFor: {
          heading: 'Cocok untuk',
          items: [
            'Halaman video tingkat atas yang didukung di vimeo.com, www.vimeo.com, dan player.vimeo.com; dapat diputar belum tentu berarti ada sumber daya yang bisa diunduh',
            'Memilih kualitas tertentu atau trek audio, bukan aliran bawaan',
            'Menyimpan gambar sampul',
            'Mengantrekan beberapa item dari halaman yang sama'
          ]
        },
        doesNot: {
          heading: 'Tidak dapat',
          items: [
            'Melewati kontrol akses: video privat, berkata sandi, atau berbayar tidak dijamin berhasil, meski Anda bisa memutarnya',
            'Menghapus atau melewati DRM',
            'Mendukung semua format HLS, perekaman siaran langsung penuh, atau situs selain Vimeo',
            'Bekerja di aplikasi desktop atau seluler Vimeo'
          ]
        },
        compliance: {
          heading: 'Hukum dan kepatuhan',
          items: [
            'Alat pihak ketiga independen, tidak berafiliasi, tidak didukung, dan tidak terhubung dengan Vimeo, Inc. Vimeo adalah merek dagang Vimeo, Inc.',
            'Ditujukan untuk konten yang memang sah Anda akses. Anda bertanggung jawab atas hukum hak cipta serta ketentuan layanan Vimeo dan pencipta aslinya.',
            'Jangan dipakai untuk mendistribusikan ulang materi berhak cipta atau menghindari kontrol akses yang bukan hak Anda.'
          ]
        }
      },
      plans: {
        heading: 'Paket',
        free: {
          name: 'Gratis',
          description: 'Kuota unduhan harian gratis. Akun atau perangkat baru memulai dengan hari pertama tanpa batas.',
          cta: 'Lihat paket'
        },
        unlimited: {
          name: 'Unlimited',
          description: 'Langganan berbayar yang menghapus batas harian untuk ekstensi.',
          cta: 'Dapatkan Unlimited'
        }
      },
      faq: {
        heading: 'Pertanyaan yang sering diajukan',
        items: [
          {
            question: 'Apakah saya perlu akun untuk mengunduh?',
            answer: 'Tidak. Alat online tidak perlu masuk akun, begitu juga ekstensi. Masuk di ekstensi bersifat opsional dan hanya memengaruhi kuota harian serta status langganan Anda.'
          },
          {
            question: 'Apakah gratis?',
            answer: 'Alat online gratis. Ekstensi punya kuota harian gratis, dan tersedia paket Unlimited berbayar. Lihat halaman Harga untuk rincian terbaru.'
          },
          {
            question: 'Mana yang sebaiknya dipakai, alat online atau ekstensi?',
            answer: 'Pakai alat online untuk MP4 cepat dari sebuah tautan. Pakai ekstensi jika Anda butuh audio, subtitle, gambar sampul, kualitas pilihan, atau antrean beberapa item.'
          },
          {
            question: 'Bisakah mengunduh video Vimeo yang privat, berkata sandi, atau berbayar?',
            answer: 'Dukungan tidak dijamin. Keduanya tidak membuka atau melewati kontrol akses Vimeo, dan tidak menghapus DRM.'
          },
          {
            question: 'Format apa yang saya dapat?',
            answer: 'Alat online menyimpan video MP4. Ekstensi menyimpan video MP4, audio M4A atau MP3, subtitle VTT, dan gambar sampul JPEG.'
          },
          {
            question: 'Bagaimana dengan berkas yang sangat besar?',
            answer: 'Alat online mengarahkan berkas yang sangat besar atau berukuran tidak diketahui ke ekstensi. Di ekstensi, streaming adaptif dirakit dalam batas anggaran memori, sehingga item yang diketahui terlalu besar tidak ditawarkan.'
          },
          {
            question: 'Apakah video saya melewati server Anda?',
            answer: 'Media itu sendiri mengalir dari server Vimeo ke browser dan disk Anda. Ekstensi juga menghubungi layanan pengembang untuk fitur akun, kuota unduhan, langganan, pengaturan jarak jauh, dan pelaporan penggunaan atau galat.'
          },
          {
            question: 'Browser dan situs apa yang didukung?',
            answer: 'Ekstensi berjalan di Chrome dan browser Chromium lain seperti Edge dan Brave, hanya di halaman Vimeo. Situs video lain tidak didukung.'
          }
        ]
      },
      finalCta: {
        heading: 'Simpan lebih banyak dari Vimeo dengan ekstensi',
        description: 'Pasang sekali, lalu unduh dari halaman Vimeo yang sedang Anda tonton.',
        primaryCta: 'Tambahkan ke Chrome'
      }
    },
    pricing: idIDPricingContent,
  }
}
