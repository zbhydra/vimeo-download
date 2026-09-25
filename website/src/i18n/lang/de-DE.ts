import type { SiteContent } from '../schema'
import { deDEPricingContent } from '../pricing'

export const deDE: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — Vimeo-Videos in HD herunterladen',
    description:
      'Füge einen öffentlichen Vimeo-Link ein und speichere das Video in der Auflösung, die du brauchst. Für einen normalen Download sind weder App noch Konto noch Erweiterung nötig.',
    keywords:
      'vimeo video herunterladen, vimeo downloader, vimeo hd, vimeo video speichern, vimeo zu mp4, vimeo online downloaden'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Startseite',
      pricing: 'Preise',
      solutions: 'Download-Anleitung',
      changelog: 'Änderungen'
    },
    footer: {
      resources: 'Ressourcen',
      rights: '© 2026 Vimeo Video Downloader. Alle Rechte vorbehalten.'
    }
  },
  common: {
    installCta: 'Jetzt Installieren'
  },
  sections: {
    features: {
      title: 'Funktionen des Vimeo-Downloaders',
      subtitle:
        'Was der Downloader mit einem öffentlichen Vimeo-Link macht: Seite analysieren, die von Vimeo angebotenen Auflösungen auflisten und die gewählte speichern.',
      metaDescription:
        'Funktionen von Vimeo Video Downloader: HD-Downloads, Auflösungsauswahl, MP4-Ausgabe, kein Konto nötig und eine klare Grenze bei privaten oder passwortgeschützten Videos.',
      items: [
        {
          title: 'Auflösung wählen',
          description: 'Wähle die Auflösung, die du brauchst, statt dich mit der kleinsten Datei von Vimeo zu begnügen',
          details: [
            'Aus den Auflösungen wählen, die das Video anbietet',
            'Die höchste verfügbare Qualität für offline herunterladen',
            'Original-Seitenverhältnis und Tonspur bleiben erhalten',
            'MP4-Ausgabe, die auf jedem Gerät läuft'
          ]
        },
        {
          title: 'Link-Analyse',
          description: 'Füge die URL einer Vimeo-Videoseite ein und der Downloader liest die verfügbaren Auflösungen',
          details: [
            'Funktioniert mit Links von vimeo.com, www.vimeo.com und player.vimeo.com',
            'Kein Vimeo-Konto und kein Login nötig',
            'Klare Meldung, wenn das Video privat ist oder nicht analysiert werden kann',
            'Für einen normalen Download ist nichts zu installieren'
          ]
        },
        {
          title: 'Große Dateien',
          description:
            'Auch längere Vimeo-Videos bleiben mit Fortschrittsanzeige ladbar; sehr große Dateien übernimmt die Browser-Erweiterung',
          details: [
            'Der Fortschritt ist während des Downloads sichtbar',
            'Unterbrochene Downloads lassen sich im Arbeitsbereich fortsetzen',
            'Was der Browser allein nicht schafft, übernimmt die Erweiterung',
            'Vor einem großen Download wird der Speicher geprüft'
          ]
        },
        {
          title: 'Auf jedem Gerät',
          description:
            'Nutze dieselbe Seite am Handy, Tablet oder Computer — der Download läuft im Browser',
          details: [
            'Funktioniert unter Windows, macOS, Android, iPhone und auf Tablets',
            'Keine Desktop-Anwendung nötig',
            'Layout, das auch auf kleinen Bildschirmen passt',
            'Die Datei landet in deinem gewohnten Download-Ordner'
          ]
        },
        {
          title: 'Klare Zugriffsgrenze',
          description: 'Private, passwortgeschützte oder kostenpflichtige Vimeo-Videos sind ausgenommen und werden so benannt',
          details: [
            'Es wird nicht versucht, Privatsphäre oder Zugriffsbeschränkungen zu umgehen',
            'Es werden nie Vimeo-Passwort, Bestätigungscode oder Sitzungsdatei verlangt',
            'Nur öffentliche Videoseiten lassen sich analysieren',
            'Du bleibst dafür verantwortlich, das Video speichern zu dürfen'
          ]
        },
        {
          title: 'Schnell und ohne Registrierung',
          description: 'Kopieren, einfügen, wählen, herunterladen — ein Konto ist nur bei Downloads mit Credits nötig',
          details: [
            'Für einen öffentlichen Link ist keine Anmeldung nötig',
            'Anmeldung per Google oder E-Mail-Code nur, wenn Credits gebraucht werden',
            'Credits verfallen nicht',
            'Klare Fehlermeldungen, wenn ein Link nicht verarbeitet werden kann'
          ]
        }
      ]
    },
    steps: {
      title: 'So speicherst du ein Vimeo-Video',
      subtitle:
        'Der ganze Ablauf hat drei Schritte: URL der Vimeo-Videoseite kopieren, oben einfügen, Auflösung wählen und herunterladen.',
      metaDescription:
        'Schritt-für-Schritt-Anleitung zum Speichern eines Vimeo-Videos: Videoseiten-URL kopieren, in Vimeo Video Downloader einfügen, Auflösung wählen und MP4 herunterladen.',
      items: [
        {
          title: 'Vimeo-Link kopieren',
          description: 'Öffne das Video auf vimeo.com und kopiere die URL aus der Adressleiste oder dem Teilen-Menü'
        },
        {
          title: 'Oben einfügen',
          description:
            'Setze den Link ins Eingabefeld und starte die Analyse — der Downloader listet, was Vimeo anbietet'
        },
        {
          title: 'Auflösung wählen',
          description: 'Wähle die Qualität, die du möchtest, aus den verfügbaren Auflösungen'
        },
        {
          title: 'MP4 herunterladen',
          description: 'Speichere die Datei auf deinem Gerät; sehr große Dateien brauchen eventuell die Erweiterung'
        }
      ]
    },
    cta: {
      title: 'Bereit, ein Vimeo-Video herunterzuladen?',
      description: 'Füge oben einen öffentlichen Vimeo-Link ein und speichere ihn in der Auflösung, die du brauchst.'
    },
    techSpecs: {
      title: 'Technische Angaben',
      browsersLabel: 'Browser',
      browsers: 'Chrome, Edge, Brave und alle Chromium-basierten Browser',
      sourceHostsLabel: 'Unterstützte Links',
      sourceHosts: 'vimeo.com, www.vimeo.com, player.vimeo.com',
      permissionsLabel: 'Berechtigungen',
      permissions: 'Minimale Berechtigungen erforderlich',
      updatesLabel: 'Updates',
      updates: 'Automatische Updates vom Extension Store'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: 'Vimeo-Videos in der Auflösung herunterladen, die du brauchst',
        description: 'Füge einen öffentlichen Vimeo-Link ein, wähle eine Auflösung und speichere das MP4 direkt im Browser.'
      },
      stats: {
        users: 'Benutzer Weltweit',
        downloads: 'Gesamte Downloads'
      },
      seo: {
        title: 'Vimeo Video Downloader: Vimeo-Videos in HD herunterladen',
        description:
          'Speichere öffentliche Vimeo-Videos in HD und wähle die Auflösung. Link einfügen, Auflösungen analysieren und MP4 ohne Installation herunterladen.',
        keywords:
          'vimeo downloader, vimeo video herunterladen, vimeo hd herunterladen, vimeo video speichern, vimeo mp4, vimeo online downloader'
      },
      heroTrustPoints: [
        'HD-Downloads',
        'Ohne Registrierung',
        'Mobilfreundlich',
        'Läuft unter Windows, Mac, Android und iPhone'
      ],
      situation: {
        title: 'Start hier: Welchen Vimeo-Link hast du?',
        intro: 'Wer einen Vimeo-Downloader sucht, hat meist einen dieser Links. Finde deinen:',
        headers: ['Deine Situation', 'Das zuerst versuchen'],
        rows: [
          {
            cells: [
              'Du hast die URL einer öffentlichen Vimeo-Videoseite',
              'Füge sie oben in den Downloader ein und wähle eine Auflösung'
            ]
          },
          {
            cells: [
              'Die Videoseite hat keinen Download-Button',
              'Nutze diesen Downloader — Vimeo zeigt seinen Button nur, wenn der Eigentümer es erlaubt'
            ]
          },
          {
            cells: [
              'Das Video ist privat oder passwortgeschützt',
              'Dafür brauchst du Zugriff vom Eigentümer; ein Downloader kann es nicht für dich öffnen'
            ]
          },
          {
            cells: [
              'Der Downloader meldet, das Video sei privat oder nicht analysierbar',
              'Prüfe, ob der Link die URL einer Videoseite ist und das Video öffentlich ist'
            ]
          }
        ]
      },
      solutions: {
        title: 'Was bei einem Vimeo-Video wirklich funktioniert',
        intro:
          'Vimeo hostet Videos mit sehr unterschiedlichen Zugriffsregeln. Eine öffentliche Videoseite kann ein Downloader analysieren; ein privates, passwortgeschütztes oder kostenpflichtiges Video ist von außen nicht erreichbar — egal mit welchem Werkzeug.',
        quickAnswer:
          'Kurz gesagt: Ist die Vimeo-Seite öffentlich, füge den Link oben ein und lade die gewünschte Auflösung herunter. Zeigt Vimeo seinen eigenen Download-Button, ist das der sauberste Weg. Ist das Video privat oder passwortgeschützt, bitte den Eigentümer um Zugriff oder Export — kein Downloader kann das umgehen.',
        items: [
          {
            title: 'Lösung 1: Online-Vimeo-Downloader',
            description:
              'Am besten für eine öffentliche Vimeo-Videoseite. URL einfügen, die von Vimeo angebotenen Auflösungen auflisten lassen und die gewünschte speichern.',
            useWhenLabel: 'Nutze das, wenn:',
            useWhen: [
              'Die Videoseite öffentlich ist und ohne Login öffnet.',
              'Du eine bestimmte Auflösung oder die höchste verfügbare Qualität willst.',
              'Du keine Erweiterung und keine Desktop-App installieren möchtest.'
            ]
          },
          {
            title: 'Lösung 2: Vimeos eigener Download-Button',
            description:
              'Manche Creator erlauben Downloads ihrer Videos. Ist diese Option aktiv, zeigt der Vimeo-Player einen Download-Button — der direkteste Weg.',
            useWhenLabel: 'Nutze das, wenn:',
            useWhen: [
              'Der Vimeo-Player eine Download-Option zeigt.',
              'Du genau die Datei willst, die der Creator veröffentlicht hat.',
              'Du bereits die Erlaubnis hast, eine Kopie zu behalten.'
            ]
          },
          {
            title: 'Lösung 3: Browser-Erweiterung für große Dateien',
            description:
              'Lange Videos können das überschreiten, was ein Tab bequem übertragen und speichern kann. Die Erweiterung übernimmt die Übertragung und hält sie fortsetzbar.',
            useWhenLabel: 'Nutze das, wenn:',
            useWhen: [
              'Der Download sehr groß ist oder ständig abbricht.',
              'Der Arbeitsbereich meldet, dass dem Browser der lokale Speicher ausgeht.',
              'Du regelmäßig von Vimeo herunterlädst.'
            ]
          },
          {
            title: 'Lösung 4: Bildschirmaufnahme (letzter Ausweg)',
            description:
              'Lässt sich ein Video abspielen, aber auf keinem legalen Weg herunterladen, kann eine Bildschirmaufnahme es erfassen. Das ist ein Notfallweg und nicht die erste Wahl, weil Qualität und Ton von der Wiedergabe abhängen.',
            useWhenLabel: 'Nutze das, wenn:',
            useWhen: [
              'Du die Erlaubnis hast, das Video anzusehen und zu behalten.',
              'Das Video sich nicht über seinen Link analysieren lässt.',
              'Du nur eine persönliche Offline-Kopie zur Referenz brauchst.'
            ]
          }
        ]
      },
      benefits: {
        title: 'Warum einen Online-Vimeo-Downloader nutzen?',
        intro:
          'Ein guter Downloader beantwortet schnell eine Frage: Lässt sich dieses Vimeo-Video über den vorhandenen Link speichern? Die Erfahrung sollte direkt sein, Grenzen ehrlich benennen und klar sagen, wenn ein privates Video nicht verarbeitet werden kann.',
        items: [
          {
            title: 'Videos in hoher Qualität speichern',
            description:
              'Behalte die höchste von Vimeo angebotene Auflösung, damit die Offline-Kopie so aussieht wie beim Creator.'
          },
          {
            title: 'Auf allen Geräten nutzbar',
            description:
              'Nutze den Downloader im Browser unter Android, iPhone, Windows, Mac oder Tablet — gespeichert wird von dem Browser, den du schon hast.'
          },
          {
            title: 'Kein Vimeo-Login nötig',
            description:
              'Eine öffentliche Videoseite braucht kein Vimeo-Konto. Passwort, Bestätigungscode oder Sitzungsdatei werden nie verlangt.'
          },
          {
            title: 'Einfache Offline-Wiedergabe',
            description:
              'Downloads liegen als MP4 vor und laufen ohne zusätzliche Codecs auf praktisch jedem Gerät und Player.'
          },
          {
            title: 'Schneller Ablauf per Link',
            description:
              'Kopieren, einfügen, wählen, herunterladen. Schlägt der Link fehl, erklärt die Seite, ob das Video privat, gelöscht oder nicht unterstützt ist.'
          },
          {
            title: 'Klare Berechtigungsgrenze',
            description:
              'Lade nur Videos herunter, die du behalten darfst. Respektiere Creator-Rechte, Vimeos Bedingungen und die Zugriffsregeln des Videos.'
          },
          {
            title: 'Auflösung im Griff',
            description:
              'Wähle zwischen den angebotenen Auflösungen, statt auf eine einzige Qualitätsstufe festgelegt zu sein.'
          },
          {
            title: 'Umgang mit großen Dateien',
            description:
              'Längere Videos werden vor dem Start auf den Browser-Speicher geprüft und können per Erweiterung fortgesetzt werden, wenn sie für einen Tab zu groß sind.'
          },
          {
            title: 'Planbare Kosten',
            description:
              'Öffentliche Links lassen sich ohne Konto analysieren. Credits brauchst du nur für Downloads über den Arbeitsbereich, und sie verfallen nicht.'
          }
        ]
      },
      troubleshooting: {
        title: 'Wenn der Vimeo-Link nicht funktioniert',
        intro:
          'Nicht jeder Fehlschlag heißt, dass der Downloader kaputt ist. Vimeo-Videos scheitern oft, weil die Seite nicht öffentlich ist. Probiere diese Liste:',
        items: [
          'Öffne den Link im Browser und prüfe, ob das Video ohne Login abspielt.',
          'Stelle sicher, dass die URL eine Videoseite ist — kein Profil, Showcase oder Suchergebnis.',
          'Prüfe, ob das Video passwortgeschützt oder als privat markiert ist.',
          'Prüfe, ob das Video noch existiert — gelöschte Videos lassen sich nicht analysieren.',
          'Probiere einen anderen Browser oder ein anderes Netzwerk, wenn die Seite Vimeo nicht erreicht.',
          'Meide jedes Werkzeug, das nach deinem Vimeo- oder Google-Passwort fragt.'
        ]
      },
      permission: {
        title: 'Wichtiger Hinweis zur Berechtigung',
        note:
          'Ein Vimeo-Video-Downloader darf nicht genutzt werden, um Privatsphäre, Urheberrecht oder Zugriffsbeschränkungen zu umgehen. Speichere Videos nur, wenn du die Erlaubnis des Rechteinhabers hast oder deine Nutzung nach Gesetz und Vimeos Bedingungen zulässig ist.'
      },
      comparison: {
        title: 'Die passende Vimeo-Download-Methode wählen',
        headers: ['Situation', 'Empfohlene Lösung', 'Am besten für', 'Was zu prüfen ist'],
        rows: [
          {
            cells: [
              'Öffentliche Vimeo-Videoseite',
              'Online-Vimeo-Downloader',
              'Schneller HD-Download ohne App',
              'Die Seite öffnet ohne Login und das Video ist öffentlich'
            ]
          },
          {
            cells: [
              'Creator hat Downloads erlaubt',
              'Vimeos eigener Download-Button',
              'Genau die veröffentlichte Datei erhalten',
              'Der Player zeigt eine Download-Option'
            ]
          },
          {
            cells: [
              'Sehr großer oder abbrechender Download',
              'Browser-Erweiterung',
              'Fortsetzbare Übertragung jenseits des Tabs',
              'Verfügbarer lokaler Speicher und Netzstabilität'
            ]
          },
          {
            cells: [
              'Privates oder passwortgeschütztes Video',
              'Eigentümer um Zugriff oder Export bitten',
              'Im Rahmen von Vimeos Zugriffsregeln bleiben',
              'Kein Downloader erreicht ein Video, auf das du keinen Zugriff hast'
            ]
          }
        ]
      },
      howTo: {
        title: 'Vimeo-Video in 3 Schritten herunterladen',
        subtitle:
          'Der schnellste Weg ist der Downloader oben. Er funktioniert, wenn die Vimeo-Videoseite öffentlich und vom Browser erreichbar ist.',
        steps: [
          {
            title: 'Videolink kopieren',
            description:
              'Öffne das Video auf Vimeo und kopiere die Seiten-URL aus der Adressleiste oder dem Teilen-Menü.'
          },
          {
            title: 'Einfügen und analysieren',
            description:
              'Füge den Link oben in den Downloader ein. Das Werkzeug prüft, welche Auflösungen Vimeo für dieses Video anbietet.'
          },
          {
            title: 'Qualität wählen und herunterladen',
            description:
              'Wähle eine Auflösung und speichere das MP4 auf deinem Gerät. Erscheint nichts, ist das Video wahrscheinlich privat oder nicht verfügbar — nicht kaputt.'
          }
        ]
      },
      faq: {
        title: 'Häufige Fragen',
        description: 'Die Fragen, die vor einem Vimeo-Download am häufigsten gestellt werden.',
        items: [
          {
            question: 'Wie lade ich ein Vimeo-Video herunter?',
            answer:
              'Öffne die Videoseite auf Vimeo, kopiere die URL, füge sie oben in den Downloader ein, wähle eine der verfügbaren Auflösungen und lade das MP4 herunter.'
          },
          {
            question: 'Kann ich private oder passwortgeschützte Vimeo-Videos herunterladen?',
            answer:
              'Nein. Private, passwortgeschützte und kostenpflichtige Videos sind außerhalb deiner Vimeo-Sitzung nicht erreichbar, daher kann der Downloader sie nicht analysieren. Bitte den Eigentümer um Zugriff oder einen Export.'
          },
          {
            question: 'Warum meldet der Downloader, das Vimeo-Video sei privat?',
            answer:
              'Vimeo hat für diesen Link keine öffentlichen Auflösungen zurückgegeben. Übliche Ursachen sind Privatsphäre-Einstellungen, eine Passwortpflicht, ein gelöschtes Video oder eine URL, die auf ein Profil oder Showcase statt auf eine Videoseite zeigt.'
          },
          {
            question: 'Brauche ich ein Vimeo-Konto oder die Erweiterung?',
            answer:
              'Für einen normalen öffentlichen Download brauchst du weder Konto noch Erweiterung. Die Erweiterung hilft nur bei sehr großen Dateien oder wenn die Übertragung außerhalb des Tabs weiterlaufen soll.'
          },
          {
            question: 'In welchem Format und welcher Qualität wird geladen?',
            answer:
              'Downloads sind MP4-Dateien aus den Auflösungen, die Vimeo für das Video anbietet. Du wählst unter den verfügbaren Auflösungen, die höchste ist meist die vom Creator hochgeladene Qualität.'
          },
          {
            question: 'Ist es kostenlos?',
            answer:
              'Das Analysieren eines öffentlichen Vimeo-Links ist kostenlos. Downloads über den Arbeitsbereich verbrauchen Credits, die einmalig gekauft werden und nicht verfallen; für die Erweiterung gibt es ein separates Unlimited-Abo.'
          },
          {
            question: 'Ist es sicher, einen Vimeo-Link hier einzufügen?',
            answer:
              'Ja. Nur der eingefügte Link wird genutzt, um das Video zu suchen. Der Downloader verlangt nie ein Vimeo-Passwort, einen Bestätigungscode oder eine Sitzungsdatei — verlasse jede Seite, die das tut.'
          },
          {
            question: 'Ist das Herunterladen von Vimeo-Videos legal?',
            answer:
              'Das hängt vom Video, deiner Erlaubnis und deiner Nutzung ab. Lade nur Inhalte, die du behalten darfst, und verbreite urheberrechtlich geschütztes oder privates Material nicht ohne Zustimmung.'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: 'Web-Zugang',
          title: 'Anmelden, um deine Guthaben zu synchronisieren',
          signedInAs: 'Angemeldet als',
          continueWithGoogle: 'Mit Google fortfahren',
          googleLoading: 'Google wird geöffnet...',
          or: 'oder',
          emailLabel: 'E-Mail',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: 'Mit E-Mail fortfahren',
          sendCode: 'Code senden',
          sendingCode: 'Wird gesendet...',
          sendCodeSuccess: 'Bestätigungscode wurde gesendet.',
          sendAgain: 'Erneut senden',
          codeLabel: 'Bestätigungscode',
          codePlaceholder: '123456',
          signIn: 'Anmelden',
          termsNotice: 'Mit der Anmeldung akzeptierst du die',
          termsLink: 'Bedingungen',
          privacyLink: 'Datenschutzerklärung',
          logout: 'Abmelden',
          creditsLabel: 'Guthaben'
        },
                quota: {
          eyebrow: 'Web-Kontingent',
          title: 'Aktueller Guthaben-Saldo',
          planLabel: 'Tarif',
          remainingLabel: 'Verbleibend',
          dailyLimitLabel: 'Tageslimit',
          unlimited: 'Unbegrenzt'
        },
                checkin: {
          creditsLoading: 'Guthaben',
          creditsButtonLabel: 'Täglichen Check-in öffnen',
          accountButtonLabel: 'Kontomenü öffnen',
          accountMenuLabel: 'Kontomenü',
          title: 'Dein kostenloses Guthaben für heute ist bereit',
          todayRewardText: 'Heutige Belohnung: {credits} Guthaben',
          claimedRewardText: 'Du hast heute {credits} Guthaben erhalten.',
          nextCountdown: 'Nächster Anspruch in {time}',
          nextAt: '(Nächste Aktualisierung: {time} EST)',
          claimButton: '{credits} Guthaben erhalten',
          claimingButton: 'Wird abgeholt...',
          notNow: 'Nicht jetzt',
          close: 'Schließen',
          loadFailed: 'Check-in-Status konnte nicht geladen werden.',
          claimFailed: 'Guthaben konnte nicht abgeholt werden.'
        },
                creditPurchase: {
          installGuide: 'Du kannst auch mit der Browser-Erweiterung herunterladen.',
          installExtension: 'Erweiterung installieren',
          title: 'Guthaben kaufen',
          description: 'Füge Guthaben hinzu und lade in diesem Arbeitsbereich weiter herunter.',
          successTitle: 'Guthaben hinzugefügt',
          successDescription: 'Dein Saldo wurde aktualisiert. Schließe dieses Fenster und starte den Download erneut.',
          packageEyebrow: 'Nach Bedarf zahlen',
          cardNote: 'Nutze Guthaben für Website-Downloads. Guthaben verfällt nicht.',
          creditsAmount: '{credits} Guthaben',
          buyNow: 'Jetzt kaufen',
          selectPackage: 'Auswählen',
          paymentMethodLabel: 'Zahlungsmethode wählen',
          paymentTitle: 'Zahlungsmethode wählen',
          selectedPackageLabel: 'Ausgewähltes Produkt',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: 'Weiter zur Zahlung',
          backToProducts: 'Zurück',
          close: 'Schließen',
          agreementText: 'Ich stimme den Kaufbedingungen, den Nutzungsbedingungen und der Datenschutzrichtlinie zu.',
          loadingConfigs: 'Guthabenpakete werden geladen...',
          loadFailed: 'Guthabenpakete konnten nicht geladen werden. Bitte versuche es erneut.',
          noConfigs: 'Derzeit sind keine Guthabenpakete verfügbar. Bitte versuche es später erneut.',
          ready: 'Wähle ein Guthabenpaket. Preise werden in USD angezeigt.',
          creatingOrder: 'Bestellung wird erstellt...',
          pendingPayment: 'Schließe die Zahlung im neu geöffneten Tab ab. Wir prüfen das Ergebnis automatisch.',
          pendingPaymentTitle: 'Warten auf Zahlung',
          cancelPayment: 'Zahlung abbrechen',
          supportMailPrefix: 'Problem melden: ',
          success: 'Zahlung abgeschlossen. Guthaben ist jetzt verfügbar.',
          failed: 'Die Zahlung ist nicht abgeschlossen. Du kannst es erneut versuchen oder dieses Fenster schließen.',
          successCredits: '+{credits} Guthaben hinzugefügt',
          successBalance: 'Aktueller Saldo: {balance} Guthaben',
          createFailed: 'Bestellung konnte nicht erstellt werden. Bitte versuche es erneut.',
          invalidPaymentData: 'Der Zahlungslink ist ungültig. Bitte versuche es später erneut.',
          priceUpdated: 'Der Preis hat sich geändert. Prüfe den aktuellen Preis und kaufe erneut.',
          gatewayFailed: 'Der Zahlungseinstieg ist vorübergehend nicht verfügbar. Bitte versuche es später erneut.',
          paymentCanceled: 'Die Zahlung wurde abgebrochen. Wähle eine Zahlungsmethode und versuche es erneut.',
          pollFailed: 'Zahlungsstatus konnte nicht aktualisiert werden. Bitte versuche es erneut.',
          pollTimeout: 'Die automatische Aktualisierung ist abgelaufen. Aktualisiere das Ergebnis nach der Zahlung manuell.',
          orderNotFound: 'Die Bestellung ist nicht mehr verfügbar. Erstelle eine neue Bestellung.',
          orderExpired: 'Die Bestellung ist abgelaufen. Kaufe erneut.',
          fulfillmentFailed: 'Die Zahlung wurde empfangen, aber das Guthaben wurde noch nicht hinzugefügt. Versuche es später erneut.',
          authExpired: 'Die Anmeldung ist abgelaufen. Melde dich erneut an, um fortzufahren.'
        },
        parse: {
          eyebrow: 'Schnelle Link-Prüfung',
          title: 'Vimeo Video Downloader: jedes öffentliche Vimeo-Video speichern',
          helperText:
            'Füge einen öffentlichen Vimeo-Link ein, sieh dir die angebotenen Auflösungen an und lade die gewünschte herunter.',
          linkLabel: 'Vimeo-Link',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: 'Eingabe löschen',
          submit: 'Vimeo-Videolink einfügen',
          submitting: 'Analyse läuft...',
          noResults: 'Für dieses Video wurden keine herunterladbaren Dateien gefunden.',
          download: 'Herunterladen',
          downloading: 'Wird heruntergeladen...',
          checkingStorage: 'Browser-Speicher wird geprüft...',
          unknownSize: 'Größe unbekannt',
          preparingMp4: 'MP4 wird vorbereitet...',
          downloadAll: 'Alle herunterladen',
          downloadingAll: 'Alle werden heruntergeladen...',
          resumeNotice:
            'Ein unvollendeter Download "{filename}" ({progress}) wurde gefunden. Fortsetzen?',
          resumeAction: 'Fortsetzen',
          pendingRestartText: 'Der frühere Download-Eintrag für "{filename}" kann neu gestartet werden.',
          pendingRestartButton: 'Download neu starten',
          resumeUnavailableText: 'Der lokale Wiederherstellungseintrag ist abgelaufen.',
          resumeDismiss: 'Ignorieren',
          resuming: 'Wird fortgesetzt...',
          largeFileExtensionInlineChromeTitle: 'Chrome-Erweiterung',
          largeFileExtensionInlineChromeDescription:
            'Erweiterung speziell für Chrome, die große Vimeo-Downloads außerhalb des Tabs weiterlaufen lässt.',
          largeFileExtensionInlineChromeCta: 'Erweiterung installieren',
          largeFileExtensionInlineEdgeTitle: 'Edge-Erweiterung',
          largeFileExtensionInlineEdgeDescription:
            'Erweiterung speziell für Microsoft Edge mit derselben Behandlung großer Vimeo-Downloads.',
          largeFileExtensionInlineEdgeCta: 'Erweiterung installieren'
        },
                errors: {
          enterEmailFirst: 'Bitte gib zuerst deine E-Mail-Adresse ein.',
          enterEmailAndCode: 'Bitte gib E-Mail-Adresse und Bestätigungscode ein.',
          sendCodeFailed: 'Der Bestätigungscode konnte nicht gesendet werden.',
          googleSignInFailed: 'Google-Anmeldung fehlgeschlagen.',
          googleClientMissing: 'Google-Anmeldung ist nicht konfiguriert.',
          restoreSessionFailed: 'Die Sitzung konnte nicht wiederhergestellt werden.',
          signInFailed: 'Anmeldung fehlgeschlagen.',
          logoutFailed: 'Abmeldung fehlgeschlagen.',
          loadQuotaFailed: 'Guthaben konnte nicht geladen werden.',
          enterLink: 'Bitte gib einen Medienlink ein.',
          invalidLink: 'Das ist keine gültige URL.',
          parseFailed: 'Dieser Link konnte nicht analysiert werden.',
          downloadFailed: 'Diese Datei konnte nicht heruntergeladen werden.',
          unsafeFileTypeUseExtension:
            'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.',
          unsafeFileTypeConfirmTitle: 'Use the browser extension',
          unsafeFileTypeConfirmViewExtension: 'View extension download',
          unsafeFileTypeConfirmCancel: 'Cancel',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: 'Dieses Video überschreitet die Größenbeschränkung für Browser-Downloads.',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: 'This link platform is not supported.',
          vimeoParseFailed: 'This Vimeo video is private or cannot be parsed.',
          quotaExceeded: 'Nicht genug Guthaben, um diese Datei herunterzuladen.',
          rateLimitExceeded: 'Too many requests. Please try again later.'
        },
                anonymousQueue: {
          title: 'Download in der Warteschlange',
          remaining: 'Dein Download beginnt in {seconds} Sekunden.',
          hint: 'Melde dich an, um ohne Wartezeit herunterzuladen.',
          login: 'Anmelden',
          close: 'Schließen'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    },
    changelog: {
      title: 'Vimeo-Downloader Änderungen',
      description:
        'Verfolge Vimeo-Download-Updates, Änderungen an der Analyse, Unterstützung größerer Dateien und Release-Notes zu Vimeo Video Downloader.',
      seoTitle: 'Vimeo-Downloader Änderungen | Vimeo Video Downloader',
      seoDescription:
        'Lies die Änderungen von Vimeo Video Downloader: Analyse-Updates, Auflösungs-Handling, größere Dateien und Release-Notes je Version.',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: 'Leistungsschub',
          description: 'Deutliche Leistungsverbesserungen für ein besseres Nutzererlebnis.',
          features: [
            'Analysegeschwindigkeit um 50 % verbessert',
            'Stabilität bei großen Downloads optimiert',
            'Reaktionsschnellere Oberfläche'
          ]
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: 'Mehrsprachigkeit',
          description: 'Unterstützung für 14 Sprachen hinzugefügt.',
          features: ['Japanisch, Koreanisch und weitere Sprachen', 'Genauere Übersetzungen', 'Automatische Spracherkennung']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: 'Auflösungsauswahl',
          description: 'Wähle die gewünschte Vimeo-Auflösung, bevor der Download startet.',
          features: [
            'Jede angebotene Auflösung wählbar',
            'Höchste verfügbare Qualität bleibt erhalten',
            'Verbesserte Download-Warteschlange'
          ]
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: 'Sicherheit und Datenschutz',
          description: 'Verbesserungen bei Sicherheit und Datenschutz.',
          features: [
            'Analyse-Tracking aus Downloads entfernt',
            'Modus für rein lokale Verarbeitung ergänzt',
            'Verbesserte Datenverschlüsselung'
          ]
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: 'Erste Version',
          description: 'Erste Version des Vimeo-Link-Downloaders.',
          features: [
            'Vimeo-Link-Analyse und MP4-Ausgabe',
            'Unterstützung für vimeo.com- und player.vimeo.com-Links',
            'Grundlegendes Auflösungs-Handling'
          ]
        }
      ],
      labels: {
        features: 'Neue Funktionen',
        fixes: 'Fehlerbehebungen'
      }
    },
    pricing: deDEPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Vimeo Video Downloader HD - Mehrere Auflösungen | Vimeo Video Downloader',
          description:
            'Lade Vimeo-Videos in HD mit mehreren Auflösungen kostenlos herunter. Ohne App. Speichere jedes öffentliche Vimeo-Video sofort.',
          keywords:
            'vimeo downloader, vimeo video herunterladen, vimeo hd herunterladen, vimeo downloader kostenlos, vimeo video speichern, vimeo hd'
        },
        workspace: {
          title: 'Vimeo Video Downloader HD',
          helperText:
            'Füge einen öffentlichen Vimeo-Link ein, um ihn in HD mit Auflösungsauswahl herunterzuladen.',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: 'Warum unseren Vimeo-Downloader nutzen',
          subtitle: 'Speichere Vimeo-Videos in HD mit freier Auflösungswahl, völlig kostenlos.',
          items: [
            {
              title: 'Originale HD-Qualität',
              description:
                'Lade Vimeo-Videos in ihrer vollen HD-Auflösung. Du bekommst dieselbe Schärfe, die der Creator hochgeladen hat.'
            },
            {
              title: 'Mehrere Auflösungen',
              description:
                'Wähle aus den verfügbaren Auflösungen (360p, 720p, 1080p und mehr). Nimm die Qualität, die zu dir passt.'
            },
            {
              title: 'Schnell und kostenlos',
              description:
                'Keine App-Installation, kein Konto nötig. Vimeo-Link einfügen, Auflösung wählen und sofort herunterladen.'
            }
          ]
        },
        howTo: {
          title: 'Vimeo-Videos in HD herunterladen',
          subtitle: 'Drei einfache Schritte, um jedes öffentliche Vimeo-Video in deiner Wunschauflösung zu speichern.',
          steps: [
            {
              title: 'Vimeo-Videolink kopieren',
              description: 'Öffne die Vimeo-Videoseite und kopiere die URL aus der Adressleiste des Browsers.'
            },
            {
              title: 'Link oben einfügen',
              description: 'Füge die kopierte Vimeo-URL ins Eingabefeld ein und klicke auf Analysieren.'
            },
            {
              title: 'Auflösung wählen und herunterladen',
              description: 'Wähle deine Wunschauflösung und klicke auf Herunterladen, um das HD-Video zu speichern.'
            }
          ]
        },
        faq: {
          title: 'Vimeo-Downloader FAQ',
          items: [
            {
              question: 'Wie lade ich ein Video von Vimeo herunter?',
              answer:
                'Kopiere die URL der Vimeo-Videoseite, füge sie oben ins Eingabefeld ein, klicke auf Analysieren und wähle die Auflösung zum Herunterladen.'
            },
            {
              question: 'Kann ich die Auflösung wählen?',
              answer:
                'Ja. Nach der Analyse kannst du aus allen verfügbaren Auflösungen wählen, einschließlich 360p, 720p, 1080p und höher, sofern vorhanden.'
            },
            {
              question: 'Ist dieser Vimeo-Downloader kostenlos?',
              answer:
                'Das Analysieren eines öffentlichen Vimeo-Links ist kostenlos und ohne Registrierung. Downloads über den Arbeitsbereich verbrauchen Credits.'
            },
            {
              question: 'Brauche ich ein Vimeo-Konto zum Herunterladen?',
              answer: 'Kein Konto nötig. Du kannst jedes öffentliche Vimeo-Video ohne Login herunterladen.'
            },
            {
              question: 'In welchem Format werden die Videos geladen?',
              answer: 'Vimeo-Videos werden als MP4 heruntergeladen, kompatibel mit praktisch allen Geräten und Playern.'
            }
          ]
        }
      }
    }
  }
}
