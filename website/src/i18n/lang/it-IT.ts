import type { SiteContent } from '../schema'
import { itITPricingContent } from '../pricing'

export const itIT: SiteContent = {
  site: {
    description: 'Incolla un link Vimeo per salvare il video nel browser, gratis e senza accedere. Ti servono audio, sottotitoli, immagine di copertina o una coda? Aggiungi l\'estensione Chrome.'
  },
  layout: {
    nav: {
      brand: 'Vimeo Downloader',
      home: 'Home',
      pricing: 'Prezzi',
    },
    footer: {
      resources: 'Risorse',
      rights: '© 2026 Vimeo Downloader. Tutti i diritti riservati.'
    }
  },
  common: {
    installCta: 'Installa Ora'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Downloader - Scarica video HD e audio',
        description: 'Incolla un link Vimeo per salvare il video nel browser, gratis e senza accedere. Ti servono audio, sottotitoli, immagine di copertina o una coda? Aggiungi l\'estensione Chrome.'
      },
      heroTrustPoints: [
        'Download in HD',
        'Nessuna registrazione'
      ],
      workspace: {
        parse: {
          eyebrow: 'Controllo rapido del link',
          titleBrand: 'Downloader di video Vimeo',
          titleTagline: 'Salva qualsiasi video pubblico',
          helperText:
            'Incolla un link video Vimeo pubblico e scaricalo in MP4 alla massima qualità disponibile.',
          linkLabel: 'Link Vimeo',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: 'Cancella input',
          submit: 'Incolla il link del video Vimeo',
          submitting: 'Analisi in corso...',
          noResults: 'Nessun file scaricabile trovato per questo video.',
          download: 'Scarica',
          downloading: 'Download in corso...',
          checkingStorage: 'Verifica dello spazio del browser...',
          unknownSize: 'Dimensione sconosciuta',
          preparingMp4: 'Preparazione MP4...',
          downloadAll: 'Scarica tutto',
          downloadingAll: 'Download di tutti i file in corso...',
          resumeNotice:
            'Rilevato un download non completato "{filename}" ({progress}). Vuoi continuare?',
          resumeAction: 'Continua',
          pendingRestartText: 'Il record di download precedente per "{filename}" può essere riavviato.',
          pendingRestartButton: 'Riavvia il download',
          resumeUnavailableText: 'Il record di ripristino locale è scaduto.',
          resumeDismiss: 'Ignora',
          resuming: 'Ripresa in corso...',
          extensionEntryLine: 'Scarica direttamente su Vimeo con l’estensione',
          largeFileExtensionInlineChromeTitle: 'Estensione Chrome',
          largeFileExtensionInlineChromeDescription:
            'Estensione dedicata a Chrome che mantiene i download Vimeo di grandi dimensioni fuori dalla scheda.',
          largeFileExtensionInlineChromeCta: 'Installa estensione',
          largeFileExtensionInlineEdgeTitle: 'Estensione Edge',
          largeFileExtensionInlineEdgeDescription:
            'Estensione dedicata a Microsoft Edge, con la stessa gestione dei download Vimeo di grandi dimensioni.',
          largeFileExtensionInlineEdgeCta: 'Installa estensione'
        },
                errors: {
          enterLink: 'Inserisci un link multimediale.',
          invalidLink: 'Questo non è un URL valido.',
          parseFailed: 'Impossibile analizzare questo link.',
          downloadFailed: 'Impossibile scaricare questo file.',
          unsafeFileTypeUseExtension:
            'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.',
          unsafeFileTypeConfirmTitle: 'Use the browser extension',
          unsafeFileTypeConfirmViewExtension: 'View extension download',
          unsafeFileTypeConfirmCancel: 'Cancel',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: 'Questo video supera il limite di dimensione per il download nel browser.',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: 'La piattaforma di questo link non è supportata.',
          vimeoParseFailed: 'Questo video Vimeo è privato o non può essere analizzato.',
          rateLimitExceeded: 'Troppe richieste. Riprova più tardi.',
          useExtensionForResource: 'Questa risorsa può essere scaricata solo con l’estensione del browser. Installala per continuare.'
        },
                anonymousQueue: {
          title: 'Download in coda',
          remaining: 'Il download inizierà tra {seconds} secondi.',
          close: 'Chiudi'
        },
                downloadAll: {
          allSuccess: 'Tutti i file scaricati.',
          partialFailed: 'Alcuni file scaricati. Alcuni file non riusciti.',
          allFailed: 'Tutti i download non riusciti.'
        }
      }
    ,
      softwareApplication: {
        description: 'Un\'estensione Chrome per chi guarda Vimeo e vuole una copia locale del video che sta già riproducendo, con un pannello nella pagina per scaricare video, audio, sottotitoli e immagine di copertina.',
        featureList: [
          'Pannello di download nella pagina con righe Video, Audio, Sottotitoli e Immagine',
          'Scegli la qualità del video o usa Best',
          'Salva l\'audio in M4A o transcodificalo in MP3',
          'Salva i sottotitoli in VTT e ritaglia video o audio adattivi',
          'Salva l\'immagine di copertina in JPEG',
          'Elenco risorse nel popup con avanzamento e velocità in tempo reale',
          'Coda di download globale condivisa tra le schede',
          'Cronologia locale, modello del nome file e sottocartella di salvataggio'
        ]
      },
      intro: {
        heading: 'Vai oltre con l\'estensione Chrome',
        lead: 'Lo strumento online qui sopra salva un video Vimeo da un link. L\'estensione lavora sulla pagina Vimeo che stai già guardando e aggiunge audio, sottotitoli, immagini di copertina e una coda di download.',
        primaryCta: 'Aggiungi a Chrome',
        secondaryCta: 'Vedi i piani',
        panel: {
          ariaLabel: 'Illustrazione del pannello di download nella pagina',
          rows: {
            video: 'Video',
            audio: 'Audio',
            subtitle: 'Sottotitoli',
            image: 'Immagine'
          }
        }
      },
      features: {
        heading: 'Cosa aggiunge l\'estensione',
        items: [
          {
            title: 'Pannello di download nella pagina',
            description: 'Un piccolo pannello accanto al video con le righe Video, Audio, Sottotitoli e Immagine. Si ricostruisce quando passi a un altro video.'
          },
          {
            title: 'Scelta della qualità e Best',
            description: 'Scegli 720p, 1080p o un\'altra qualità offerta dal video, oppure lascia che Best selezioni la più alta.'
          },
          {
            title: 'Audio in M4A o MP3',
            description: 'Salva la traccia audio da sola in M4A, oppure scegli MP3 nel popup per un output transcodificato.'
          },
          {
            title: 'Sottotitoli e ritaglio',
            description: 'Salva i sottotitoli disponibili in VTT. Video e audio adattivi possono essere ritagliati senza transcodificare il video.'
          },
          {
            title: 'Immagine di copertina',
            description: 'Salva l\'immagine di copertina del video come file JPEG separato.'
          },
          {
            title: 'Elenco nel popup e coda',
            description: 'Vedi nel popup tutte le voci rilevate con l\'avanzamento in tempo reale, poi mettile in coda per scaricarle una dopo l\'altra tra le schede.'
          },
          {
            title: 'File di grandi dimensioni',
            description: 'I file che Chrome può recuperare da solo passano al gestore di download di Chrome. I flussi adattivi vengono combinati in background entro un budget di memoria.'
          },
          {
            title: 'Impostazioni e cronologia',
            description: 'Scegli la sottocartella di salvataggio, il modello del nome file e la lingua dell\'interfaccia. I download completati e falliti restano nella cronologia locale, esportabile in CSV.'
          }
        ]
      },
      steps: {
        heading: 'Come funziona l\'estensione',
        items: [
          {
            title: 'Installa',
            description: 'Aggiungi l\'estensione dal Chrome Web Store.'
          },
          {
            title: 'Fissa l\'icona',
            description: 'Fissala sulla barra degli strumenti per aprire subito il popup.'
          },
          {
            title: 'Apri un video Vimeo',
            description: 'Vai a una pagina video supportata su vimeo.com o player.vimeo.com e avvia la riproduzione.'
          },
          {
            title: 'Scegli la qualità',
            description: 'Clicca la qualità che vuoi nel pannello, oppure apri l\'icona dell\'estensione per l\'elenco completo. Il browser scrive il file sul disco.'
          }
        ]
      },
      comparison: {
        heading: 'Strumento online o estensione',
        columns: {
          dimension: 'Confronto',
          web: 'Strumento online',
          extension: 'Estensione Chrome'
        },
        rows: [
          {
            dimension: 'Dove funziona',
            web: 'In qualsiasi scheda del browser su questa pagina: incolla un link Vimeo.',
            extension: 'In Chrome e altri browser Chromium, sulla pagina Vimeo che stai guardando.'
          },
          {
            dimension: 'Cosa puoi salvare',
            web: 'Il video come file MP4.',
            extension: 'Video in MP4, audio in M4A o MP3, sottotitoli in VTT e immagine di copertina in JPEG.'
          },
          {
            dimension: 'Batch e coda',
            web: 'Un link alla volta.',
            extension: 'Aggiungi voci dal popup a un\'unica coda condivisa tra le schede; vengono scaricate in ordine.'
          },
          {
            dimension: 'File di grandi dimensioni',
            web: 'I file molto grandi, o di dimensione sconosciuta, vengono indirizzati all\'estensione.',
            extension: 'I file diretti usano il gestore di download di Chrome; i flussi adattivi vengono combinati entro un budget di memoria.'
          },
          {
            dimension: 'Accesso',
            web: 'Non richiesto.',
            extension: 'Non richiesto. L\'accesso è facoltativo e influisce solo sul limite giornaliero e sullo stato dell\'abbonamento.'
          },
          {
            dimension: 'Costo',
            web: 'Gratuito.',
            extension: 'Un limite giornaliero di download gratuito, con il piano Unlimited a pagamento per di più.'
          }
        ]
      },
      scope: {
        heading: 'Per cosa funziona e cosa non fa',
        worksFor: {
          heading: 'Funziona per',
          items: [
            'Pagine video supportate aperte come pagina principale su vimeo.com, www.vimeo.com e player.vimeo.com; la sola riproduzione non garantisce una risorsa scaricabile',
            'Scegliere una qualità specifica o la traccia audio invece del flusso predefinito',
            'Salvare l\'immagine di copertina',
            'Mettere in coda più voci della stessa pagina'
          ]
        },
        doesNot: {
          heading: 'Non fa',
          items: [
            'Aggirare i controlli di accesso: video privati, protetti da password o a pagamento non sono garantiti, anche se riesci a riprodurli',
            'Rimuovere o aggirare il DRM',
            'Supportare ogni formato HLS, la registrazione completa di dirette o siti diversi da Vimeo',
            'Funzionare nelle app Vimeo per desktop o dispositivi mobili'
          ]
        },
        compliance: {
          heading: 'Note legali e conformità',
          items: [
            'Strumento indipendente di terze parti, non affiliato, approvato né collegato a Vimeo, Inc. Vimeo è un marchio di Vimeo, Inc.',
            'Pensato per contenuti a cui hai già legittimamente accesso. Sei responsabile del rispetto del diritto d\'autore e dei termini di servizio di Vimeo e dell\'autore originale.',
            'Non usarlo per ridistribuire materiale protetto da copyright né per aggirare controlli di accesso a cui non hai diritto.'
          ]
        }
      },
      plans: {
        heading: 'Piani',
        free: {
          name: 'Free',
          description: 'Un limite giornaliero di download gratuito. Un nuovo account o dispositivo parte con il primo giorno illimitato.',
          cta: 'Vedi i piani'
        },
        unlimited: {
          name: 'Unlimited',
          description: 'Un abbonamento a pagamento che toglie il limite giornaliero all\'estensione.',
          cta: 'Scegli Unlimited'
        }
      },
      faq: {
        heading: 'Domande frequenti',
        items: [
          {
            question: 'Mi serve un account per scaricare?',
            answer: 'No. Lo strumento online non richiede accesso, e nemmeno l\'estensione. L\'accesso nell\'estensione è facoltativo e influisce solo sul limite giornaliero e sullo stato dell\'abbonamento.'
          },
          {
            question: 'È gratuito?',
            answer: 'Lo strumento online è gratuito. L\'estensione ha un limite giornaliero di download gratuito ed è disponibile un piano Unlimited a pagamento. Consulta la pagina dei prezzi per i dettagli aggiornati.'
          },
          {
            question: 'Meglio lo strumento online o l\'estensione?',
            answer: 'Usa lo strumento online per un MP4 rapido da un link. Usa l\'estensione se ti servono audio, sottotitoli, immagine di copertina, una qualità scelta o una coda di più voci.'
          },
          {
            question: 'Può scaricare video Vimeo privati, protetti da password o a pagamento?',
            answer: 'Il supporto non è garantito. Nessuno dei due strumenti sblocca o aggira i controlli di accesso di Vimeo, e nessuno rimuove il DRM.'
          },
          {
            question: 'Quali formati ottengo?',
            answer: 'Lo strumento online salva video MP4. L\'estensione salva video MP4, audio M4A o MP3, sottotitoli VTT e immagini di copertina JPEG.'
          },
          {
            question: 'Cosa succede con i file molto grandi?',
            answer: 'Lo strumento online indirizza i file molto grandi o di dimensione sconosciuta all\'estensione. Nell\'estensione i flussi adattivi vengono combinati entro un budget di memoria, quindi le voci note come troppo grandi non vengono offerte.'
          },
          {
            question: 'Il mio video passa dai vostri server?',
            answer: 'Il contenuto multimediale va dai server di Vimeo al tuo browser e al tuo disco. L\'estensione contatta anche i servizi dello sviluppatore per funzioni dell\'account, limiti di download, abbonamenti, impostazioni remote e segnalazioni di utilizzo o errori.'
          },
          {
            question: 'Quali browser e siti sono supportati?',
            answer: 'L\'estensione funziona su Chrome e altri browser Chromium come Edge e Brave, e solo sulle pagine Vimeo. Altri siti video non sono supportati.'
          }
        ]
      },
      finalCta: {
        heading: 'Salva di più da Vimeo con l\'estensione',
        description: 'Installala una volta e scarica dalla pagina Vimeo che stai già guardando.',
        primaryCta: 'Aggiungi a Chrome'
      }
    },
    pricing: itITPricingContent,
  }
}
