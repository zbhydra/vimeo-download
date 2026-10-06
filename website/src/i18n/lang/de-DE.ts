import type { SiteContent } from '../schema'
import { deDEPricingContent } from '../pricing'

export const deDE: SiteContent = {
  site: {
    description: 'Vimeo-Link einfügen und das Video im Browser speichern, kostenlos und ohne Anmeldung. Audio, Untertitel, Titelbilder oder eine Warteschlange? Dann die Chrome-Erweiterung hinzufügen.'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Startseite',
      pricing: 'Preise',
    },
    footer: {
      resources: 'Ressourcen',
      rights: '© 2026 Vimeo Video Downloader. Alle Rechte vorbehalten.'
    }
  },
  common: {
    installCta: 'Jetzt Installieren'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Video Downloader – kostenloses Online-Tool und Chrome-Erweiterung',
        description: 'Vimeo-Link einfügen und das Video im Browser speichern, kostenlos und ohne Anmeldung. Audio, Untertitel, Titelbilder oder eine Warteschlange? Dann die Chrome-Erweiterung hinzufügen.'
      },
      heroTrustPoints: [
        'HD-Downloads',
        'Ohne Registrierung',
        'Mobilfreundlich',
        'Läuft unter Windows, Mac, Android und iPhone'
      ],
      workspace: {
        parse: {
          eyebrow: 'Schnelle Link-Prüfung',
          titleBrand: 'Vimeo Video Downloader',
          titleTagline: 'Jedes öffentliche Vimeo-Video speichern',
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
          extensionEntryLine: 'Direkt auf Vimeo mit der Erweiterung herunterladen',
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
          rateLimitExceeded: 'Too many requests. Please try again later.',
          useExtensionForResource: 'Diese Ressource lässt sich nur mit der Browser-Erweiterung herunterladen. Installiere sie, um fortzufahren.'
        },
                anonymousQueue: {
          title: 'Download in der Warteschlange',
          remaining: 'Dein Download beginnt in {seconds} Sekunden.',
          close: 'Schließen'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    ,
      softwareApplication: {
        description: 'Eine Chrome-Erweiterung für Vimeo-Zuschauer, die eine lokale Kopie des Videos möchten, das sie gerade ansehen – mit einem Panel direkt auf der Seite für Video-, Audio-, Untertitel- und Titelbild-Downloads.',
        featureList: [
          'Download-Panel direkt auf der Seite mit den Zeilen Video, Audio, Untertitel und Bild',
          'Videoqualität wählen oder Best nehmen',
          'Audio als M4A speichern oder zu MP3 transkodieren',
          'Untertitel als VTT speichern, adaptive Video- und Audiospuren zuschneiden',
          'Titelbild als JPEG speichern',
          'Popup-Ressourcenliste mit Live-Fortschritt und Geschwindigkeit',
          'Globale Download-Warteschlange über alle Tabs',
          'Lokaler Verlauf, Dateinamensvorlage und Speicher-Unterordner'
        ]
      },
      intro: {
        heading: 'Mehr herausholen mit der Chrome-Erweiterung',
        lead: 'Das Online-Tool oben speichert ein Vimeo-Video per Link. Die Erweiterung arbeitet auf der Vimeo-Seite, die Sie gerade ansehen, und ergänzt Audio, Untertitel, Titelbilder und eine Download-Warteschlange.',
        primaryCta: 'Zu Chrome hinzufügen',
        secondaryCta: 'Tarife ansehen',
        panel: {
          ariaLabel: 'Darstellung des Download-Panels auf der Seite',
          rows: {
            video: 'Video',
            audio: 'Audio',
            subtitle: 'Untertitel',
            image: 'Bild'
          }
        }
      },
      features: {
        heading: 'Was die Erweiterung zusätzlich bietet',
        items: [
          {
            title: 'Download-Panel auf der Seite',
            description: 'Ein kleines Panel neben dem Video mit den Zeilen Video, Audio, Untertitel und Bild. Es baut sich neu auf, wenn Sie zu einem anderen Video wechseln.'
          },
          {
            title: 'Qualitätswahl und Best',
            description: 'Wählen Sie 720p, 1080p oder eine andere Qualität, die das Video anbietet, oder lassen Sie Best die höchste auswählen.'
          },
          {
            title: 'Audio als M4A oder MP3',
            description: 'Speichern Sie die Audiospur einzeln als M4A oder wählen Sie im Popup MP3 als transkodierte Ausgabe.'
          },
          {
            title: 'Untertitel und Zuschnitt',
            description: 'Verfügbare Untertitel als VTT speichern. Adaptive Video- und Audiospuren lassen sich ohne Video-Transkodierung zuschneiden.'
          },
          {
            title: 'Titelbild',
            description: 'Das Titelbild des Videos als eigene JPEG-Datei speichern.'
          },
          {
            title: 'Popup-Liste und Warteschlange',
            description: 'Alle erkannten Einträge im Popup mit Live-Fortschritt ansehen und einzeln in eine Warteschlange legen, die tabübergreifend nacheinander abgearbeitet wird.'
          },
          {
            title: 'Große Dateien',
            description: 'Dateien, die Chrome selbst laden kann, gehen an den Chrome-Downloadmanager. Adaptive Streams werden im Hintergrund innerhalb eines Speicherbudgets zusammengesetzt.'
          },
          {
            title: 'Einstellungen und Verlauf',
            description: 'Wählen Sie Unterordner, Dateinamensvorlage und Oberflächensprache. Abgeschlossene und fehlgeschlagene Downloads bleiben im lokalen Verlauf, der sich als CSV exportieren lässt.'
          }
        ]
      },
      steps: {
        heading: 'So funktioniert die Erweiterung',
        items: [
          {
            title: 'Installieren',
            description: 'Installieren Sie die Erweiterung aus dem Chrome Web Store.'
          },
          {
            title: 'Symbol anheften',
            description: 'Heften Sie es an die Symbolleiste, um das Popup schnell zu öffnen.'
          },
          {
            title: 'Vimeo-Video öffnen',
            description: 'Öffnen Sie eine unterstützte Videoseite auf vimeo.com oder player.vimeo.com und starten Sie die Wiedergabe.'
          },
          {
            title: 'Qualität wählen',
            description: 'Klicken Sie im Panel auf die gewünschte Qualität oder öffnen Sie das Erweiterungssymbol für die vollständige Liste. Ihr Browser schreibt die Datei auf die Festplatte.'
          }
        ]
      },
      comparison: {
        heading: 'Online-Tool oder Erweiterung',
        columns: {
          dimension: 'Vergleich',
          web: 'Online-Tool',
          extension: 'Chrome-Erweiterung'
        },
        rows: [
          {
            dimension: 'Wo es läuft',
            web: 'In jedem Browser-Tab auf dieser Seite: Vimeo-Link einfügen.',
            extension: 'In Chrome und anderen Chromium-Browsern, direkt auf der Vimeo-Seite, die Sie ansehen.'
          },
          {
            dimension: 'Was sich speichern lässt',
            web: 'Das Video als MP4-Datei.',
            extension: 'Video als MP4, Audio als M4A oder MP3, Untertitel als VTT und das Titelbild als JPEG.'
          },
          {
            dimension: 'Stapel und Warteschlange',
            web: 'Mehrere Links einfügen und mit „Alle herunterladen“ nacheinander abarbeiten.',
            extension: 'Einträge aus dem Popup in eine tabübergreifende Warteschlange legen; sie werden der Reihe nach geladen.'
          },
          {
            dimension: 'Große Dateien',
            web: 'Sehr große Dateien oder Dateien unbekannter Größe werden an die Erweiterung verwiesen.',
            extension: 'Direkte Dateien nutzen den Chrome-Downloadmanager; adaptive Streams werden innerhalb eines Speicherbudgets zusammengesetzt.'
          },
          {
            dimension: 'Anmeldung',
            web: 'Nicht erforderlich.',
            extension: 'Nicht erforderlich. Die Anmeldung ist optional und betrifft nur Ihr tägliches Kontingent und den Abostatus.'
          },
          {
            dimension: 'Kosten',
            web: 'Kostenlos.',
            extension: 'Ein kostenloses tägliches Kontingent, dazu der kostenpflichtige Unlimited-Plan für mehr.'
          }
        ]
      },
      scope: {
        heading: 'Wofür es funktioniert und was es nicht tut',
        worksFor: {
          heading: 'Funktioniert für',
          items: [
            'Unterstützte Videoseiten auf oberster Ebene auf vimeo.com, www.vimeo.com und player.vimeo.com; Wiedergabe allein garantiert keine herunterladbare Ressource',
            'Eine bestimmte Qualität oder die Audiospur statt des Standard-Streams wählen',
            'Das Titelbild speichern',
            'Mehrere Einträge derselben Seite in die Warteschlange legen'
          ]
        },
        doesNot: {
          heading: 'Tut nicht',
          items: [
            'Zugriffskontrollen umgehen: Private, passwortgeschützte oder kostenpflichtige Videos funktionieren nicht garantiert, auch wenn Sie sie abspielen können',
            'DRM entfernen oder umgehen',
            'Jedes HLS-Format, vollständige Live-Aufnahmen oder andere Seiten als Vimeo unterstützen',
            'In den Vimeo-Desktop- oder Mobile-Apps funktionieren'
          ]
        },
        compliance: {
          heading: 'Rechtliches und Compliance',
          items: [
            'Unabhängig entwickeltes Drittanbieter-Tool, nicht mit Vimeo, Inc. verbunden, von Vimeo, Inc. unterstützt oder anderweitig verknüpft. Vimeo ist eine Marke von Vimeo, Inc.',
            'Gedacht für Inhalte, auf die Sie rechtmäßig Zugriff haben. Sie sind für die Einhaltung des Urheberrechts sowie der Bedingungen von Vimeo und des ursprünglichen Urhebers verantwortlich.',
            'Nutzen Sie es nicht, um urheberrechtlich geschütztes Material weiterzuverbreiten oder Zugriffskontrollen zu umgehen, zu denen Sie nicht berechtigt sind.'
          ]
        }
      },
      plans: {
        heading: 'Tarife',
        free: {
          name: 'Free',
          description: 'Ein kostenloses tägliches Download-Kontingent. Ein neues Konto oder Gerät startet mit einem unbegrenzten ersten Tag.',
          cta: 'Pläne ansehen'
        },
        unlimited: {
          name: 'Unlimited',
          description: 'Ein kostenpflichtiges Abo, das das tägliche Limit der Erweiterung aufhebt.',
          cta: 'Unlimited holen'
        }
      },
      faq: {
        heading: 'Häufig gestellte Fragen',
        items: [
          {
            question: 'Brauche ich ein Konto zum Herunterladen?',
            answer: 'Nein. Das Online-Tool kommt ohne Anmeldung aus, die Erweiterung ebenfalls. Die Anmeldung in der Erweiterung ist optional und betrifft nur Ihr tägliches Kontingent und den Abostatus.'
          },
          {
            question: 'Ist es kostenlos?',
            answer: 'Das Online-Tool ist kostenlos. Die Erweiterung hat ein kostenloses tägliches Kontingent, zusätzlich gibt es den kostenpflichtigen Unlimited-Plan. Aktuelle Details stehen auf der Preisseite.'
          },
          {
            question: 'Online-Tool oder Erweiterung – was soll ich nutzen?',
            answer: 'Das Online-Tool eignet sich für ein schnelles MP4 per Link. Die Erweiterung nutzen Sie für Audio, Untertitel, das Titelbild, eine gewählte Qualität oder eine Warteschlange mit mehreren Einträgen.'
          },
          {
            question: 'Kann es private, passwortgeschützte oder kostenpflichtige Vimeo-Videos laden?',
            answer: 'Eine Unterstützung ist nicht garantiert. Keines der Tools hebt Vimeos Zugriffskontrollen auf, und keines entfernt DRM.'
          },
          {
            question: 'Welche Formate erhalte ich?',
            answer: 'Das Online-Tool speichert MP4-Video. Die Erweiterung speichert MP4-Video, Audio als M4A oder MP3, Untertitel als VTT und Titelbilder als JPEG.'
          },
          {
            question: 'Was passiert bei sehr großen Dateien?',
            answer: 'Das Online-Tool verweist sehr große Dateien oder Dateien unbekannter Größe an die Erweiterung. In der Erweiterung werden adaptive Streams innerhalb eines Speicherbudgets zusammengesetzt, daher werden bekannte zu große Einträge nicht angeboten.'
          },
          {
            question: 'Läuft mein Video über Ihre Server?',
            answer: 'Die Medien selbst gehen von den Vimeo-Servern direkt in Ihren Browser und auf Ihre Festplatte. Entwicklerdienste werden außerdem für Kontofunktionen, Download-Kontingente, Abos, Remote-Einstellungen sowie Nutzungs- und Fehlerberichte kontaktiert.'
          },
          {
            question: 'Welche Browser und Seiten werden unterstützt?',
            answer: 'Die Erweiterung läuft in Chrome und anderen Chromium-Browsern wie Edge und Brave, und nur auf Vimeo-Seiten. Andere Videoseiten werden nicht unterstützt.'
          }
        ]
      },
      finalCta: {
        heading: 'Mehr aus Vimeo speichern mit der Erweiterung',
        description: 'Einmal installieren und direkt von der Vimeo-Seite laden, die Sie gerade ansehen.',
        primaryCta: 'Zu Chrome hinzufügen'
      }
    },
    pricing: deDEPricingContent,
  }
}
