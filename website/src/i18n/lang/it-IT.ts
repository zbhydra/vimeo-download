import type { SiteContent } from '../schema'
import { itITPricingContent } from '../pricing'

export const itIT: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — Scarica video Vimeo in HD',
    description:
      'Incolla un link Vimeo pubblico e salva il video nella risoluzione che ti serve. Per un download normale non servono app, account o estensione.',
    keywords:
      'scaricare video vimeo, downloader vimeo, vimeo hd, salvare video vimeo, vimeo in mp4, scaricare vimeo online'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Home',
      pricing: 'Prezzi',
      solutions: 'Guida al download',
      changelog: 'Modifiche'
    },
    footer: {
      resources: 'Risorse',
      rights: '© 2026 Vimeo Video Downloader. Tutti i diritti riservati.'
    }
  },
  common: {
    installCta: 'Installa Ora'
  },
  sections: {
    features: {
      title: 'Funzioni del downloader Vimeo',
      subtitle:
        'Cosa fa il downloader con un link Vimeo pubblico: analizza la pagina, elenca le risoluzioni offerte da Vimeo e salva quella che scegli.',
      metaDescription:
        'Funzioni di Vimeo Video Downloader: download in HD, scelta della risoluzione, output MP4, nessun account e un confine chiaro per i video privati o protetti da password.',
      items: [
        {
          title: 'Scelta della risoluzione',
          description: 'Scegli la risoluzione che ti serve invece di accontentarti del file più piccolo offerto da Vimeo',
          details: [
            'Scegli tra le risoluzioni offerte dal video',
            'Scarica la qualità massima disponibile per la visione offline',
            'Mantieni le proporzioni e la traccia audio originali',
            'Output MP4 che si riproduce su qualsiasi dispositivo'
          ]
        },
        {
          title: 'Analisi del link',
          description: 'Incolla l’URL di una pagina video Vimeo e il downloader legge le risoluzioni disponibili',
          details: [
            'Funziona con link vimeo.com, www.vimeo.com e player.vimeo.com',
            'Nessun account né accesso a Vimeo',
            'Messaggio chiaro quando il video è privato o non analizzabile',
            'Niente da installare per un download normale'
          ]
        },
        {
          title: 'File di grandi dimensioni',
          description:
            'I video Vimeo lunghi restano scaricabili con avanzamento visibile e l’estensione si occupa dei file enormi',
          details: [
            'L’avanzamento è visibile durante il download',
            'I download interrotti si possono riprendere dall’area di lavoro',
            'L’estensione del browser gestisce ciò che il browser da solo non completa',
            'Lo spazio di archiviazione viene verificato prima di un download grande'
          ]
        },
        {
          title: 'Su qualsiasi dispositivo',
          description:
            'Usa la stessa pagina da telefono, tablet o computer: il download avviene nel browser',
          details: [
            'Funziona su Windows, macOS, Android, iPhone e tablet',
            'Nessuna applicazione desktop richiesta',
            'Layout adattato agli schermi piccoli',
            'Il file finisce nella tua cartella dei download abituale'
          ]
        },
        {
          title: 'Confine di accesso chiaro',
          description: 'I video Vimeo privati, protetti da password o a pagamento restano fuori e vengono indicati come tali',
          details: [
            'Nessun tentativo di aggirare privacy o restrizioni di accesso',
            'Non vengono mai richiesti password, codice di verifica o file di sessione Vimeo',
            'Si possono analizzare solo pagine video pubbliche',
            'Resta tua la responsabilità di avere il diritto di salvare il video'
          ]
        },
        {
          title: 'Veloce e senza registrazione',
          description: 'Copia, incolla, scegli, scarica; l’account serve solo per i download con crediti',
          details: [
            'Nessuna registrazione per provare un link pubblico',
            'Accesso con Google o codice via email solo quando servono crediti',
            'I crediti non scadono',
            'Messaggi di errore chiari quando un link non può essere elaborato'
          ]
        }
      ]
    },
    steps: {
      title: 'Come salvare un video Vimeo',
      subtitle:
        'L’intero flusso è di tre passaggi: copia l’URL della pagina video Vimeo, incollalo sopra, scegli la risoluzione e scarica.',
      metaDescription:
        'Guida passo passo per salvare un video Vimeo: copia l’URL della pagina, incollalo in Vimeo Video Downloader, scegli la risoluzione e scarica l’MP4.',
      items: [
        {
          title: 'Copia il link Vimeo',
          description: 'Apri il video su vimeo.com e copia l’URL dalla barra degli indirizzi o dal menu di condivisione'
        },
        {
          title: 'Incollalo sopra',
          description:
            'Metti il link nel campo e avvia l’analisi: il downloader elenca ciò che Vimeo offre'
        },
        {
          title: 'Scegli una risoluzione',
          description: 'Seleziona la qualità che vuoi tra le risoluzioni disponibili'
        },
        {
          title: 'Scarica l’MP4',
          description: 'Salva il file sul dispositivo; i file molto grandi possono richiedere l’estensione'
        }
      ]
    },
    cta: {
      title: 'Pronto a scaricare un video Vimeo?',
      description: 'Incolla sopra un link Vimeo pubblico e salvalo nella risoluzione che ti serve.'
    },
    techSpecs: {
      title: 'Specifiche tecniche',
      browsersLabel: 'Browser',
      browsers: 'Chrome, Edge, Brave e tutti i browser basati su Chromium',
      sourceHostsLabel: 'Link supportati',
      sourceHosts: 'vimeo.com, www.vimeo.com, player.vimeo.com',
      permissionsLabel: 'Permessi',
      permissions: 'Permessi minimi richiesti',
      updatesLabel: 'Aggiornamenti',
      updates: 'Aggiornamenti automatici dal negozio delle estensioni'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: 'Scarica i video Vimeo nella risoluzione che ti serve',
        description: 'Incolla un link Vimeo pubblico, scegli una risoluzione e salva l’MP4 direttamente dal browser.'
      },
      stats: {
        users: 'Utenti nel Mondo',
        downloads: 'Download Totali'
      },
      seo: {
        title: 'Downloader di video Vimeo: scarica video Vimeo in HD',
        description:
          'Salva video Vimeo pubblici in HD e scegli la risoluzione. Incolla il link, analizza le risoluzioni e scarica l’MP4 senza installare nulla.',
        keywords:
          'downloader vimeo, scaricare video vimeo, vimeo hd, salvare video vimeo, vimeo mp4, scaricare vimeo online'
      },
      heroTrustPoints: [
        'Download in HD',
        'Nessuna registrazione',
        'Ottimizzato per mobile',
        'Funziona su Windows, Mac, Android e iPhone'
      ],
      situation: {
        title: 'Inizia qui: quale link Vimeo hai?',
        intro: 'Chi cerca un downloader Vimeo di solito ha uno di questi link. Trova il tuo:',
        headers: ['La tua situazione', 'Prova prima questo'],
        rows: [
          {
            cells: [
              'Hai l’URL di una pagina video Vimeo pubblica',
              'Incollalo nel downloader sopra e scegli una risoluzione'
            ]
          },
          {
            cells: [
              'La pagina video non ha un pulsante di download',
              'Usa questo downloader: Vimeo mostra il suo pulsante solo se il proprietario lo consente'
            ]
          },
          {
            cells: [
              'Il video è privato o protetto da password',
              'Serve l’accesso del proprietario: un downloader non può aprirlo al posto tuo'
            ]
          },
          {
            cells: [
              'Il downloader dice che il video è privato o non analizzabile',
              'Verifica che il link sia l’URL di una pagina video e che il video sia pubblico'
            ]
          }
        ]
      },
      solutions: {
        title: 'Cosa funziona davvero con un video Vimeo',
        intro:
          'Vimeo ospita video con regole di accesso molto diverse. Una pagina video pubblica può essere analizzata da un downloader; un video privato, protetto da password o a pagamento non è raggiungibile dall’esterno, con qualsiasi strumento.',
        quickAnswer:
          'Risposta rapida: se la pagina Vimeo è pubblica, incolla il link sopra e scarica la risoluzione che ti serve. Se Vimeo mostra il suo pulsante di download, quella è la via più pulita. Se il video è privato o protetto da password, chiedi accesso o un export al proprietario: nessun downloader può aggirarlo.',
        items: [
          {
            title: 'Soluzione 1: downloader Vimeo online',
            description:
              'Ideale per una pagina video Vimeo pubblica. Incolla l’URL, lascia che il downloader elenchi le risoluzioni offerte da Vimeo e salva quella che vuoi.',
            useWhenLabel: 'Usalo quando:',
            useWhen: [
              'La pagina video è pubblica e si apre senza accesso.',
              'Vuoi una risoluzione specifica o la qualità massima disponibile.',
              'Non vuoi installare estensioni o applicazioni desktop.'
            ]
          },
          {
            title: 'Soluzione 2: il pulsante di download di Vimeo',
            description:
              'Alcuni creator consentono il download dei propri video. Quando l’opzione è attiva, il player Vimeo mostra un pulsante di download ed è la via più diretta.',
            useWhenLabel: 'Usalo quando:',
            useWhen: [
              'Il player Vimeo mostra un’opzione di download.',
              'Vuoi esattamente il file pubblicato dal creator.',
              'Hai già il permesso di conservarne una copia.'
            ]
          },
          {
            title: 'Soluzione 3: estensione del browser per file grandi',
            description:
              'I video lunghi possono superare ciò che una scheda riesce a trasferire e archiviare in una volta. L’estensione prende in carico il trasferimento e lo mantiene riprendibile.',
            useWhenLabel: 'Usala quando:',
            useWhen: [
              'Il download è molto grande o si interrompe di continuo.',
              'L’area di lavoro segnala che il browser ha esaurito lo spazio locale.',
              'Scarichi da Vimeo con regolarità.'
            ]
          },
          {
            title: 'Soluzione 4: registrazione dello schermo (ultima risorsa)',
            description:
              'Se un video si riproduce ma non è scaricabile per vie legali, un registratore dello schermo può catturarlo. È una risorsa di riserva, non il primo metodo, perché qualità e audio dipendono dalla riproduzione.',
            useWhenLabel: 'Usala quando:',
            useWhen: [
              'Hai il permesso di guardare e conservare il video.',
              'Il video non può essere analizzato dal link.',
              'Ti serve solo una copia personale offline di riferimento.'
            ]
          }
        ]
      },
      benefits: {
        title: 'Perché usare un downloader Vimeo online?',
        intro:
          'Un buon downloader risponde subito a una domanda: questo video Vimeo si può salvare dal link che ho? L’esperienza deve essere diretta, onesta sui limiti e chiara quando un video privato non può essere elaborato.',
        items: [
          {
            title: 'Salva i video in alta qualità',
            description:
              'Mantieni la risoluzione massima offerta da Vimeo, così la copia offline resta come l’ha pubblicata il creator.'
          },
          {
            title: 'Funziona su ogni dispositivo',
            description:
              'Usa il downloader dal browser su Android, iPhone, Windows, Mac o tablet: a salvare il file è il browser che hai già.'
          },
          {
            title: 'Nessun accesso a Vimeo richiesto',
            description:
              'Una pagina video pubblica non richiede account Vimeo. Password, codice di verifica e file di sessione non vengono mai richiesti.'
          },
          {
            title: 'Riproduzione offline semplice',
            description:
              'I download escono in MP4, riproducibile su praticamente qualsiasi dispositivo e player senza codec aggiuntivi.'
          },
          {
            title: 'Processo rapido basato sul link',
            description:
              'Copia, incolla, scegli, scarica. Se il link fallisce, la pagina spiega se il video è privato, rimosso o non supportato.'
          },
          {
            title: 'Confine dei permessi chiaro',
            description:
              'Scarica solo i video che hai il diritto di conservare. Rispetta i diritti dei creator, i termini di Vimeo e le regole di accesso del video.'
          },
          {
            title: 'Controllo della risoluzione',
            description:
              'Scegli tra le risoluzioni offerte dal video invece di restare bloccato su un’unica qualità.'
          },
          {
            title: 'Gestione dei file grandi',
            description:
              'I video più lunghi vengono verificati prima di partire e possono proseguire tramite l’estensione del browser quando sono troppo grandi per una scheda.'
          },
          {
            title: 'Prezzo prevedibile',
            description:
              'Analizzare un link pubblico non richiede account. I crediti servono solo per i download che passano dall’area di lavoro e non scadono.'
          }
        ]
      },
      troubleshooting: {
        title: 'Se il link Vimeo non funziona',
        intro:
          'Non ogni errore significa che il downloader è rotto. I video Vimeo spesso falliscono perché la pagina non è pubblica. Prova questa lista:',
        items: [
          'Apri il link nel browser e verifica che il video parta senza accesso.',
          'Assicurati che l’URL sia una pagina video, non un profilo, uno showcase o una ricerca.',
          'Controlla se il video è protetto da password o contrassegnato come privato.',
          'Verifica che il video esista ancora: i video eliminati non si possono analizzare.',
          'Prova un altro browser o un’altra rete se la pagina non raggiunge Vimeo.',
          'Evita qualsiasi strumento che chieda la password di Vimeo o di Google.'
        ]
      },
      permission: {
        title: 'Nota importante sui permessi',
        note:
          'Un downloader di video Vimeo non va usato per aggirare privacy, diritto d’autore o restrizioni di accesso. Salva i video solo con il permesso del titolare dei diritti o quando il tuo uso è consentito dalla legge e dai termini di Vimeo.'
      },
      comparison: {
        title: 'Scegli il metodo giusto per scaricare da Vimeo',
        headers: ['Situazione', 'Soluzione consigliata', 'Ideale per', 'Cosa verificare'],
        rows: [
          {
            cells: [
              'Pagina video Vimeo pubblica',
              'Downloader Vimeo online',
              'Download rapido in HD senza app',
              'La pagina si apre senza accesso e il video è pubblico'
            ]
          },
          {
            cells: [
              'Il creator ha abilitato i download',
              'Pulsante di download di Vimeo',
              'Ottenere esattamente il file pubblicato',
              'Il player mostra un’opzione di download'
            ]
          },
          {
            cells: [
              'Download molto grande o interrotto',
              'Estensione del browser',
              'Trasferimenti riprendibili oltre la scheda',
              'Spazio locale disponibile e stabilità della rete'
            ]
          },
          {
            cells: [
              'Video privato o protetto da password',
              'Chiedi accesso o un export al proprietario',
              'Restare nelle regole di accesso di Vimeo',
              'Nessun downloader raggiunge un video a cui non hai accesso'
            ]
          }
        ]
      },
      howTo: {
        title: 'Come scaricare un video Vimeo in 3 passaggi',
        subtitle:
          'La via più rapida è il downloader sopra. Funziona quando la pagina video Vimeo è pubblica e raggiungibile dal browser.',
        steps: [
          {
            title: 'Copia il link del video',
            description:
              'Apri il video su Vimeo e copia l’URL della pagina dalla barra degli indirizzi o dal menu di condivisione.'
          },
          {
            title: 'Incolla e analizza',
            description:
              'Incolla il link nel downloader sopra. Lo strumento verifica quali risoluzioni Vimeo offre per quel video.'
          },
          {
            title: 'Scegli la qualità e scarica',
            description:
              'Seleziona una risoluzione e salva l’MP4 sul dispositivo. Se non compare nulla, il video è probabilmente privato o non disponibile, non rotto.'
          }
        ]
      },
      faq: {
        title: 'Domande frequenti',
        description: 'Le domande che si fanno prima di scaricare un video Vimeo.',
        items: [
          {
            question: 'Come scarico un video da Vimeo?',
            answer:
              'Apri la pagina del video su Vimeo, copia l’URL, incollalo nel downloader sopra, scegli una delle risoluzioni disponibili e scarica l’MP4.'
          },
          {
            question: 'Posso scaricare video Vimeo privati o protetti da password?',
            answer:
              'No. I video privati, protetti da password o a pagamento non sono raggiungibili fuori dalla tua sessione Vimeo, quindi il downloader non può analizzarli. Chiedi al proprietario accesso o un export del file.'
          },
          {
            question: 'Perché il downloader dice che il video Vimeo è privato?',
            answer:
              'Vimeo non ha restituito risoluzioni pubbliche per quel link. Le cause tipiche sono le impostazioni di privacy, una password richiesta, un video eliminato o un URL che punta a un profilo o a uno showcase invece che a una pagina video.'
          },
          {
            question: 'Servono un account Vimeo o l’estensione?',
            answer:
              'Per un normale download pubblico non servono né account né estensione. L’estensione è utile solo con file molto grandi o quando vuoi che il trasferimento continui fuori dalla scheda.'
          },
          {
            question: 'In che formato e qualità arriva il file?',
            answer:
              'I download sono file MP4 generati dalle risoluzioni che Vimeo offre per il video. Puoi scegliere tra le risoluzioni disponibili e la più alta è di solito la qualità caricata dal creator.'
          },
          {
            question: 'È gratis?',
            answer:
              'Analizzare un link Vimeo pubblico è gratis. I download che passano dall’area di lavoro consumano crediti, acquistati una volta e senza scadenza; l’estensione ha un abbonamento Unlimited separato.'
          },
          {
            question: 'È sicuro incollare qui un link Vimeo?',
            answer:
              'Sì. Il link incollato serve solo a cercare il video. Il downloader non chiede mai password, codice di verifica o file di sessione Vimeo: se una pagina lo fa, esci subito.'
          },
          {
            question: 'Scaricare video Vimeo è legale?',
            answer:
              'Dipende dal video, dal tuo permesso e dall’uso previsto. Scarica solo contenuti che puoi conservare e non ridistribuire materiale protetto da diritto d’autore o privato senza autorizzazione.'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: 'Accesso web',
          title: 'Accedi per sincronizzare i tuoi crediti',
          signedInAs: 'Accesso effettuato come',
          continueWithGoogle: 'Continua con Google',
          googleLoading: 'Apertura di Google...',
          or: 'oppure',
          emailLabel: 'Email',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: 'Continua con email',
          sendCode: 'Invia codice',
          sendingCode: 'Invio in corso...',
          sendCodeSuccess: 'Codice di verifica inviato.',
          sendAgain: 'Invia di nuovo',
          codeLabel: 'Codice di verifica',
          codePlaceholder: '123456',
          signIn: 'Accedi',
          termsNotice: 'Accedendo accetti i',
          termsLink: 'Termini',
          privacyLink: 'Informativa sulla privacy',
          logout: 'Esci',
          creditsLabel: 'crediti'
        },
                quota: {
          eyebrow: 'Quota web',
          title: 'Saldo crediti attuale',
          planLabel: 'Piano',
          remainingLabel: 'Rimanente',
          dailyLimitLabel: 'Limite giornaliero',
          unlimited: 'Illimitato'
        },
                checkin: {
          creditsLoading: 'Crediti',
          creditsButtonLabel: 'Apri check-in giornaliero',
          accountButtonLabel: 'Apri menu account',
          accountMenuLabel: 'Menu account',
          title: 'I tuoi crediti gratuiti di oggi sono pronti',
          todayRewardText: 'Ricompensa di oggi: {credits} crediti',
          claimedRewardText: 'Hai riscosso {credits} crediti oggi.',
          nextCountdown: 'Prossimo riscatto tra {time}',
          nextAt: '(Prossimo aggiornamento: {time} EST)',
          claimButton: 'Riscuoti {credits} crediti',
          claimingButton: 'Riscossione...',
          notNow: 'Non ora',
          close: 'Chiudi',
          loadFailed: 'Impossibile caricare lo stato del check-in.',
          claimFailed: 'Impossibile riscuotere i crediti.'
        },
                creditPurchase: {
          installGuide: 'Puoi scaricare anche con l’estensione del browser.',
          installExtension: 'Installa estensione',
          title: 'Acquista crediti',
          description: 'Aggiungi crediti e continua a scaricare da questo spazio di lavoro.',
          successTitle: 'Crediti aggiunti',
          successDescription: 'Il saldo è stato aggiornato. Chiudi questa finestra e avvia di nuovo il download.',
          packageEyebrow: 'Paga in base all’uso',
          cardNote: 'Usa i crediti per i download dal sito. I crediti non scadono.',
          creditsAmount: '{credits} crediti',
          buyNow: 'Acquista ora',
          selectPackage: 'Seleziona',
          paymentMethodLabel: 'Scegli metodo di pagamento',
          paymentTitle: 'Scegli metodo di pagamento',
          selectedPackageLabel: 'Prodotto selezionato',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: 'Continua al pagamento',
          backToProducts: 'Indietro',
          close: 'Chiudi',
          agreementText: 'Accetto le condizioni di acquisto, i Termini e l’Informativa sulla privacy.',
          loadingConfigs: 'Caricamento pacchetti crediti...',
          loadFailed: 'Impossibile caricare i pacchetti crediti. Riprova.',
          noConfigs: 'Nessun pacchetto crediti è disponibile ora. Riprova più tardi.',
          ready: 'Scegli un pacchetto crediti. I prezzi sono mostrati in USD.',
          creatingOrder: 'Creazione ordine...',
          pendingPayment: 'Completa il pagamento nella nuova scheda aperta. Verificheremo automaticamente il risultato.',
          pendingPaymentTitle: 'In attesa del pagamento',
          cancelPayment: 'Annulla pagamento',
          supportMailPrefix: 'Segnala un problema: ',
          success: 'Pagamento completato. I crediti sono disponibili.',
          failed: 'Il pagamento non è completo. Puoi riprovare o chiudere questa finestra.',
          successCredits: '+{credits} crediti aggiunti',
          successBalance: 'Saldo attuale: {balance} crediti',
          createFailed: 'Impossibile creare l’ordine. Riprova.',
          invalidPaymentData: 'Il link di pagamento non è valido. Riprova più tardi.',
          priceUpdated: 'Il prezzo è cambiato. Controlla il prezzo aggiornato e acquista di nuovo.',
          gatewayFailed: 'L’accesso al pagamento è temporaneamente non disponibile. Riprova più tardi.',
          paymentCanceled: 'Il pagamento è stato annullato. Scegli un metodo di pagamento e riprova.',
          pollFailed: 'Impossibile aggiornare lo stato del pagamento. Riprova.',
          pollTimeout: 'L’aggiornamento automatico è scaduto. Aggiorna il risultato dopo il pagamento.',
          orderNotFound: 'L’ordine non è più disponibile. Crea un nuovo ordine.',
          orderExpired: 'L’ordine è scaduto. Acquista di nuovo.',
          fulfillmentFailed: 'Il pagamento è stato ricevuto, ma i crediti non sono ancora stati aggiunti. Riprova più tardi.',
          authExpired: 'Accesso scaduto. Accedi di nuovo per continuare.'
        },
        parse: {
          eyebrow: 'Controllo rapido del link',
          title: 'Downloader di video Vimeo: salva qualsiasi video pubblico',
          helperText:
            'Incolla un link video Vimeo pubblico, controlla le risoluzioni offerte e scarica quella che ti serve.',
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
          enterEmailFirst: 'Inserisci prima il tuo indirizzo email.',
          enterEmailAndCode: 'Inserisci email e codice di verifica.',
          sendCodeFailed: 'Impossibile inviare il codice di verifica.',
          googleSignInFailed: 'Accesso con Google non riuscito.',
          googleClientMissing: 'Accesso con Google non configurato.',
          restoreSessionFailed: 'Impossibile ripristinare la sessione.',
          signInFailed: 'Accesso non riuscito.',
          logoutFailed: 'Disconnessione non riuscita.',
          loadQuotaFailed: 'Impossibile caricare i crediti.',
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
          quotaExceeded: 'Crediti insufficienti per scaricare questo file.',
          rateLimitExceeded: 'Troppe richieste. Riprova più tardi.'
        },
                anonymousQueue: {
          title: 'Download in coda',
          remaining: 'Il download inizierà tra {seconds} secondi.',
          hint: 'Nessuna attesa dopo l\'accesso.',
          login: 'Accedi',
          close: 'Chiudi'
        },
                downloadAll: {
          allSuccess: 'Tutti i file scaricati.',
          partialFailed: 'Alcuni file scaricati. Alcuni file non riusciti.',
          allFailed: 'Tutti i download non riusciti.'
        }
      }
    },
    changelog: {
      title: 'Novità del downloader Vimeo',
      description:
        'Segui gli aggiornamenti sul download da Vimeo, le modifiche all’analisi, il supporto ai file più grandi e le note di rilascio di Vimeo Video Downloader.',
      seoTitle: 'Novità del downloader Vimeo | Vimeo Video Downloader',
      seoDescription:
        'Leggi le novità di Vimeo Video Downloader: aggiornamenti dell’analisi, gestione delle risoluzioni, file più grandi e note di ogni versione.',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: 'Prestazioni migliorate',
          description: 'Miglioramenti significativi delle prestazioni per un’esperienza migliore.',
          features: [
            'Velocità di analisi migliorata del 50%',
            'Stabilità ottimizzata sui download grandi',
            'Interfaccia più reattiva'
          ]
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: 'Supporto multilingue',
          description: 'Aggiunto il supporto a 14 lingue.',
          features: ['Aggiunti giapponese, coreano e altre lingue', 'Maggiore precisione delle traduzioni', 'Rilevamento automatico della lingua']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: 'Scelta della risoluzione',
          description: 'Scegli la risoluzione Vimeo desiderata prima che il download inizi.',
          features: [
            'Scegli qualsiasi risoluzione offerta',
            'Mantieni la qualità massima disponibile',
            'Gestione migliorata della coda di download'
          ]
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: 'Sicurezza e privacy',
          description: 'Miglioramenti a sicurezza e privacy.',
          features: [
            'Rimosso ogni tracciamento analytics dai download',
            'Aggiunta la modalità di elaborazione solo locale',
            'Crittografia dei dati migliorata'
          ]
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: 'Prima versione',
          description: 'Prima versione del downloader per link Vimeo.',
          features: [
            'Analisi dei link Vimeo e output MP4',
            'Supporto ai link vimeo.com e player.vimeo.com',
            'Gestione di base delle risoluzioni'
          ]
        }
      ],
      labels: {
        features: 'Nuove funzioni',
        fixes: 'Correzioni'
      }
    },
    pricing: itITPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Downloader video Vimeo HD - Più risoluzioni | Vimeo Video Downloader',
          description:
            'Scarica video Vimeo in HD con più risoluzioni, gratis. Nessuna app richiesta. Salva subito qualsiasi video Vimeo pubblico.',
          keywords:
            'downloader vimeo, scaricare video vimeo, scaricare vimeo hd, downloader vimeo gratis, salvare video vimeo, vimeo hd'
        },
        workspace: {
          title: 'Downloader video Vimeo HD',
          helperText:
            'Incolla qualsiasi link video Vimeo pubblico per scaricarlo in HD con scelta della risoluzione.',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: 'Perché usare il nostro downloader Vimeo',
          subtitle: 'Salva i video Vimeo in HD scegliendo la risoluzione, completamente gratis.',
          items: [
            {
              title: 'Qualità HD originale',
              description:
                'Scarica i video Vimeo nella loro risoluzione Full HD. Ottieni la stessa nitidezza caricata dal creator.'
            },
            {
              title: 'Più risoluzioni',
              description:
                'Scegli tra le risoluzioni disponibili (360p, 720p, 1080p e oltre). Prendi la qualità che ti serve.'
            },
            {
              title: 'Veloce e gratis',
              description:
                'Nessuna app da installare, nessun account. Incolla il link Vimeo, scegli la risoluzione e scarica subito.'
            }
          ]
        },
        howTo: {
          title: 'Come scaricare video Vimeo in HD',
          subtitle: 'Tre semplici passaggi per salvare qualsiasi video Vimeo pubblico nella risoluzione che preferisci.',
          steps: [
            {
              title: 'Copia il link del video Vimeo',
              description: 'Apri la pagina del video su Vimeo e copia l’URL dalla barra degli indirizzi del browser.'
            },
            {
              title: 'Incolla il link sopra',
              description: 'Incolla l’URL Vimeo copiato nel campo di input e fai clic su Analizza.'
            },
            {
              title: 'Scegli la risoluzione e scarica',
              description: 'Seleziona la risoluzione che preferisci e fai clic su Scarica per salvare il video in HD.'
            }
          ]
        },
        faq: {
          title: 'FAQ del downloader Vimeo',
          items: [
            {
              question: 'Come scarico un video da Vimeo?',
              answer:
                'Copia l’URL della pagina video Vimeo, incollalo nel campo sopra, fai clic su Analizza, poi scegli la risoluzione e scarica.'
            },
            {
              question: 'Posso scegliere la risoluzione del video?',
              answer:
                'Sì. Dopo l’analisi puoi scegliere tra tutte le risoluzioni disponibili, incluse 360p, 720p, 1080p e superiori quando presenti.'
            },
            {
              question: 'Questo downloader Vimeo è gratis?',
              answer:
                'Analizzare un link Vimeo pubblico è gratis e non richiede registrazione. I download che passano dall’area di lavoro consumano crediti.'
            },
            {
              question: 'Serve un account Vimeo per scaricare?',
              answer: 'Non serve alcun account. Puoi scaricare qualsiasi video Vimeo pubblico senza accedere.'
            },
            {
              question: 'In che formato vengono scaricati i video?',
              answer: 'I video Vimeo si scaricano in MP4, compatibile con praticamente tutti i dispositivi e i player.'
            }
          ]
        }
      }
    }
  }
}
