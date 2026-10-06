import type { SiteContent } from '../schema'
import { ptBRPricingContent } from '../pricing'

export const ptBR: SiteContent = {
  site: {
    description: 'Cole um link do Vimeo para salvar o vídeo no navegador, de graça e sem login. Precisa de áudio, legendas, imagem de capa ou fila? Adicione a extensão do Chrome.'
  },
  layout: {
    nav: {
      brand: 'Vimeo Downloader',
      home: 'Início',
      pricing: 'Preços',
    },
    footer: {
      resources: 'Recursos',
      rights: '© 2026 Vimeo Downloader. Todos os direitos reservados.'
    }
  },
  common: {
    installCta: 'Instalar Agora'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Downloader - Baixe vídeos em HD e áudio',
        description: 'Cole um link do Vimeo para salvar o vídeo no navegador, de graça e sem login. Precisa de áudio, legendas, imagem de capa ou fila? Adicione a extensão do Chrome.'
      },
      heroTrustPoints: [
        'Downloads em HD',
        'Sem cadastro'
      ],
      workspace: {
        parse: {
          eyebrow: 'Verificação rápida do link',
          titleBrand: 'Baixador de vídeos do Vimeo',
          titleTagline: 'Salve qualquer vídeo público',
          helperText:
            'Cole um link público de vídeo do Vimeo e baixe-o em MP4 na maior qualidade disponível.',
          linkLabel: 'Link do Vimeo',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: 'Limpar entrada',
          submit: 'Colar link de vídeo do Vimeo',
          submitting: 'Analisando...',
          noResults: 'Nenhum arquivo para download foi encontrado para este vídeo.',
          download: 'Baixar',
          downloading: 'Baixando...',
          checkingStorage: 'Verificando o armazenamento do navegador...',
          unknownSize: 'Tamanho desconhecido',
          preparingMp4: 'Preparando MP4...',
          downloadAll: 'Baixar tudo',
          downloadingAll: 'Baixando tudo...',
          resumeNotice:
            'Detectamos um download não concluído "{filename}" ({progress}). Deseja continuar?',
          resumeAction: 'Continuar',
          pendingRestartText: 'O registro de download anterior de "{filename}" pode ser reiniciado.',
          pendingRestartButton: 'Reiniciar download',
          resumeUnavailableText: 'O registro de recuperação local expirou.',
          resumeDismiss: 'Ignorar',
          resuming: 'Retomando...',
          extensionEntryLine: 'Baixe direto no Vimeo com a extensão',
          largeFileExtensionInlineChromeTitle: 'Extensão para Chrome',
          largeFileExtensionInlineChromeDescription:
            'Extensão específica para o Chrome que mantém downloads grandes do Vimeo rodando fora da aba.',
          largeFileExtensionInlineChromeCta: 'Instalar extensão',
          largeFileExtensionInlineEdgeTitle: 'Extensão para Edge',
          largeFileExtensionInlineEdgeDescription:
            'Extensão específica para o Microsoft Edge, com o mesmo tratamento para downloads grandes do Vimeo.',
          largeFileExtensionInlineEdgeCta: 'Instalar extensão'
        },
                errors: {
          enterLink: 'Digite um link de mídia.',
          invalidLink: 'Esta não é uma URL válida.',
          parseFailed: 'Não foi possível analisar este link.',
          downloadFailed: 'Não foi possível baixar este arquivo.',
          unsafeFileTypeUseExtension:
            'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.',
          unsafeFileTypeConfirmTitle: 'Use the browser extension',
          unsafeFileTypeConfirmViewExtension: 'View extension download',
          unsafeFileTypeConfirmCancel: 'Cancel',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: 'Este vídeo excede o limite de tamanho para downloads no navegador.',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: 'A plataforma deste link não é compatível.',
          vimeoParseFailed: 'Este vídeo do Vimeo é privado ou não pode ser analisado.',
          rateLimitExceeded: 'Muitas solicitações. Tente novamente mais tarde.',
          useExtensionForResource: 'Este recurso só pode ser baixado com a extensão do navegador. Instale-a para continuar.'
        },
                anonymousQueue: {
          title: 'Download na fila',
          remaining: 'O download começa em {seconds} segundos.',
          close: 'Fechar'
        },
                downloadAll: {
          allSuccess: 'Todos os arquivos foram baixados.',
          partialFailed: 'Alguns arquivos foram baixados. Alguns falharam.',
          allFailed: 'Todos os downloads falharam.'
        }
      }
    ,
      softwareApplication: {
        description: 'Uma extensão do Chrome para quem assiste ao Vimeo e quer uma cópia local do vídeo que já está reproduzindo, com um painel na página para baixar vídeo, áudio, legendas e imagem de capa.',
        featureList: [
          'Painel de download na página com linhas de vídeo, áudio, legendas e imagem',
          'Escolha uma qualidade de vídeo ou use Best',
          'Salve o áudio como M4A ou transcodifique para MP3',
          'Salve legendas como VTT e recorte vídeo ou áudio adaptativo',
          'Salve a imagem de capa como JPEG',
          'Lista de recursos no pop-up com progresso e velocidade ao vivo',
          'Fila global de downloads compartilhada entre abas',
          'Histórico local, modelo de nome de arquivo e subpasta de salvamento'
        ]
      },
      intro: {
        heading: 'Vá além com a extensão do Chrome',
        lead: 'A ferramenta online acima salva um vídeo do Vimeo a partir de um link. A extensão funciona na página do Vimeo que você já está assistindo e acrescenta áudio, legendas, imagem de capa e fila de downloads.',
        primaryCta: 'Adicionar ao Chrome',
        secondaryCta: 'Ver planos',
        panel: {
          ariaLabel: 'Ilustração do painel de download na página',
          rows: {
            video: 'Vídeo',
            audio: 'Áudio',
            subtitle: 'Legendas',
            image: 'Imagem'
          }
        }
      },
      features: {
        heading: 'O que a extensão acrescenta',
        items: [
          {
            title: 'Painel de download na página',
            description: 'Um pequeno painel ao lado do vídeo com linhas de vídeo, áudio, legendas e imagem. Ele é reconstruído quando você muda para outro vídeo.'
          },
          {
            title: 'Escolha de qualidade e Best',
            description: 'Escolha 720p, 1080p ou outra qualidade que o vídeo ofereça, ou deixe o Best selecionar a mais alta.'
          },
          {
            title: 'Áudio em M4A ou MP3',
            description: 'Salve a faixa de áudio sozinha como M4A ou escolha MP3 no pop-up para uma saída transcodificada.'
          },
          {
            title: 'Legendas e recorte',
            description: 'Salve as legendas disponíveis como VTT. Vídeo e áudio adaptativos podem ser recortados sem transcodificar o vídeo.'
          },
          {
            title: 'Imagem de capa',
            description: 'Salve a imagem de capa do vídeo como um arquivo JPEG separado.'
          },
          {
            title: 'Lista no pop-up e fila',
            description: 'Veja no pop-up todos os itens identificados, com progresso ao vivo, e coloque-os na fila para baixar em ordem entre abas.'
          },
          {
            title: 'Arquivos grandes',
            description: 'Arquivos que o Chrome consegue buscar sozinho vão para o gerenciador de downloads do Chrome. Fluxos adaptativos são combinados em segundo plano dentro de um orçamento de memória.'
          },
          {
            title: 'Configurações e histórico',
            description: 'Defina subpasta de salvamento, modelo de nome de arquivo e idioma da interface. Downloads concluídos e com falha ficam no histórico local, que pode ser exportado como CSV.'
          }
        ]
      },
      steps: {
        heading: 'Como funciona a extensão',
        items: [
          {
            title: 'Instalar',
            description: 'Adicione a extensão pela Chrome Web Store.'
          },
          {
            title: 'Fixar o ícone',
            description: 'Fixe-o na barra de ferramentas para abrir o pop-up rapidamente.'
          },
          {
            title: 'Abrir um vídeo do Vimeo',
            description: 'Acesse uma página de vídeo compatível em vimeo.com ou player.vimeo.com e comece a reproduzir.'
          },
          {
            title: 'Escolher a qualidade',
            description: 'Clique na qualidade desejada no painel ou abra o ícone da extensão para ver a lista completa. O navegador grava o arquivo no disco.'
          }
        ]
      },
      comparison: {
        heading: 'Ferramenta online ou extensão',
        columns: {
          dimension: 'Comparar',
          web: 'Ferramenta online',
          extension: 'Extensão do Chrome'
        },
        rows: [
          {
            dimension: 'Onde funciona',
            web: 'Em qualquer aba do navegador nesta página: basta colar um link do Vimeo.',
            extension: 'No Chrome e em outros navegadores baseados em Chromium, na página do Vimeo que você está assistindo.'
          },
          {
            dimension: 'O que você pode salvar',
            web: 'O vídeo como arquivo MP4.',
            extension: 'Vídeo em MP4, áudio em M4A ou MP3, legendas em VTT e imagem de capa em JPEG.'
          },
          {
            dimension: 'Lote e fila',
            web: 'Um link por vez.',
            extension: 'Adicione itens pelo pop-up a uma fila compartilhada entre abas; eles são baixados em ordem.'
          },
          {
            dimension: 'Arquivos grandes',
            web: 'Arquivos muito grandes ou de tamanho desconhecido são encaminhados para a extensão.',
            extension: 'Arquivos diretos usam o gerenciador de downloads do Chrome; fluxos adaptativos são combinados dentro de um orçamento de memória.'
          },
          {
            dimension: 'Login',
            web: 'Não é necessário.',
            extension: 'Não é necessário. O login é opcional e afeta apenas a cota diária e o status da assinatura.'
          },
          {
            dimension: 'Custo',
            web: 'Gratuita.',
            extension: 'Cota diária gratuita, com plano pago Unlimited para quem precisa de mais.'
          }
        ]
      },
      scope: {
        heading: 'Para que serve e o que não faz',
        worksFor: {
          heading: 'Serve para',
          items: [
            'Páginas de vídeo compatíveis abertas como página principal em vimeo.com, www.vimeo.com e player.vimeo.com; poder reproduzir não garante poder baixar',
            'Escolher uma qualidade específica ou a faixa de áudio em vez do fluxo padrão',
            'Salvar a imagem de capa',
            'Enfileirar vários itens da mesma página'
          ]
        },
        doesNot: {
          heading: 'Não faz',
          items: [
            'Contornar controles de acesso: vídeos privados, protegidos por senha ou pagos não têm suporte garantido, mesmo que você consiga reproduzi-los',
            'Remover ou contornar DRM',
            'Suportar todos os formatos HLS, gravação completa ao vivo ou sites que não sejam o Vimeo',
            'Funcionar nos aplicativos do Vimeo para desktop ou celular'
          ]
        },
        compliance: {
          heading: 'Aspectos legais e conformidade',
          items: [
            'Ferramenta de terceiros desenvolvida de forma independente, sem afiliação, endosso ou vínculo com a Vimeo, Inc. Vimeo é uma marca da Vimeo, Inc.',
            'Destinada a conteúdo ao qual você já tem acesso legítimo. Você é responsável pela legislação de direitos autorais e pelos termos do Vimeo e do autor original.',
            'Não a use para redistribuir material protegido por direitos autorais nem para contornar controles de acesso de conteúdo ao qual você não tem direito.'
          ]
        }
      },
      plans: {
        heading: 'Planos',
        free: {
          name: 'Free',
          description: 'Uma cota diária gratuita de downloads. Uma conta ou dispositivo novo começa com o primeiro dia ilimitado.',
          cta: 'Ver planos'
        },
        unlimited: {
          name: 'Unlimited',
          description: 'Uma assinatura paga que elimina o limite diário da extensão.',
          cta: 'Assinar o Unlimited'
        }
      },
      faq: {
        heading: 'Perguntas frequentes',
        items: [
          {
            question: 'Preciso de uma conta para baixar?',
            answer: 'Não. A ferramenta online não exige login, nem a extensão. O login na extensão é opcional e afeta apenas a cota diária de downloads e o status da assinatura.'
          },
          {
            question: 'É gratuito?',
            answer: 'A ferramenta online é gratuita. A extensão tem uma cota diária gratuita e há um plano pago Unlimited. Veja os detalhes atuais na página de preços.'
          },
          {
            question: 'Devo usar a ferramenta online ou a extensão?',
            answer: 'Use a ferramenta online para obter um MP4 rápido a partir de um link. Use a extensão quando quiser áudio, legendas, imagem de capa, uma qualidade específica ou uma fila de vários itens.'
          },
          {
            question: 'Ela baixa vídeos do Vimeo privados, protegidos por senha ou pagos?',
            answer: 'O suporte não é garantido. Nenhuma das duas desbloqueia nem contorna os controles de acesso do Vimeo, e nenhuma remove DRM.'
          },
          {
            question: 'Quais formatos eu recebo?',
            answer: 'A ferramenta online salva vídeo em MP4. A extensão salva vídeo em MP4, áudio em M4A ou MP3, legendas em VTT e imagem de capa em JPEG.'
          },
          {
            question: 'O que acontece com arquivos muito grandes?',
            answer: 'A ferramenta online encaminha arquivos muito grandes ou de tamanho desconhecido para a extensão. Na extensão, fluxos adaptativos são combinados dentro de um orçamento de memória, então itens conhecidos como grandes demais não são oferecidos.'
          },
          {
            question: 'Meu vídeo passa pelos seus servidores?',
            answer: 'A mídia vai dos servidores do Vimeo direto para o navegador e o disco. A extensão também acessa serviços do desenvolvedor para contas, cotas de download, assinaturas, configurações remotas e relatórios de uso e erros.'
          },
          {
            question: 'Quais navegadores e sites são compatíveis?',
            answer: 'A extensão funciona no Chrome e em outros navegadores baseados em Chromium, como Edge e Brave, e somente em páginas do Vimeo. Outros sites de vídeo não são compatíveis.'
          }
        ]
      },
      finalCta: {
        heading: 'Salve mais do Vimeo com a extensão',
        description: 'Instale uma vez e baixe direto da página do Vimeo que você já está assistindo.',
        primaryCta: 'Adicionar ao Chrome'
      }
    },
    pricing: ptBRPricingContent,
  }
}
