import type { SiteContent } from '../schema'
import { ptBRPricingContent } from '../pricing'

export const ptBR: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — Baixe vídeos do Vimeo em HD',
    description:
      'Cole um link público do Vimeo e salve o vídeo na resolução que você precisar. Sem aplicativo, sem conta e sem extensão para um download normal.',
    keywords:
      'baixar vídeos do vimeo, baixador de vimeo, vimeo hd, salvar vídeo do vimeo, vimeo para mp4, baixar vimeo online'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Início',
      pricing: 'Preços',
      solutions: 'Guia de download',
      changelog: 'Alterações'
    },
    footer: {
      resources: 'Recursos',
      rights: '© 2026 Vimeo Video Downloader. Todos os direitos reservados.'
    }
  },
  common: {
    installCta: 'Instalar Agora'
  },
  sections: {
    features: {
      title: 'Recursos do baixador de Vimeo',
      subtitle:
        'O que o baixador faz com um link público do Vimeo: analisa a página, lista as resoluções que o Vimeo oferece e salva a que você escolher.',
      metaDescription:
        'Recursos do Vimeo Video Downloader: downloads em HD, escolha de resolução, saída MP4, sem conta e um limite claro para vídeos privados ou com senha.',
      items: [
        {
          title: 'Escolha da resolução',
          description: 'Escolha a resolução que você precisa em vez de aceitar o menor arquivo que o Vimeo oferece',
          details: [
            'Escolha entre as resoluções que o vídeo oferece',
            'Baixe a melhor qualidade disponível para assistir offline',
            'Mantenha a proporção e a faixa de áudio originais',
            'Saída MP4 que reproduz em qualquer aparelho'
          ]
        },
        {
          title: 'Análise por link',
          description: 'Cole a URL de uma página de vídeo do Vimeo e o baixador lê as resoluções disponíveis',
          details: [
            'Funciona com links vimeo.com, www.vimeo.com e player.vimeo.com',
            'Sem conta ou login no Vimeo',
            'Aviso claro quando o vídeo é privado ou não pode ser analisado',
            'Nada para instalar em um download comum'
          ]
        },
        {
          title: 'Arquivos grandes',
          description:
            'Vídeos longos do Vimeo continuam baixáveis com progresso visível, e a extensão assume os arquivos enormes',
          details: [
            'O progresso fica visível durante o download',
            'Downloads interrompidos podem ser retomados na área de trabalho',
            'A extensão do navegador cuida do que o navegador sozinho não conclui',
            'O armazenamento é verificado antes de um download grande'
          ]
        },
        {
          title: 'Qualquer aparelho',
          description:
            'Use a mesma página no celular, no tablet ou no computador: o download acontece no navegador',
          details: [
            'Funciona em Windows, macOS, Android, iPhone e tablets',
            'Não exige aplicativo de desktop',
            'Layout adaptado para telas pequenas',
            'O arquivo vai para a sua pasta de downloads de sempre'
          ]
        },
        {
          title: 'Limite de acesso claro',
          description: 'Vídeos privados, com senha ou pagos ficam de fora e são informados como tal',
          details: [
            'Não tenta burlar privacidade nem restrições de acesso',
            'Nunca pede senha, código de verificação ou arquivo de sessão do Vimeo',
            'Só páginas de vídeo públicas podem ser analisadas',
            'Você continua responsável por ter o direito de salvar o vídeo'
          ]
        },
        {
          title: 'Fluxo rápido, sem cadastro',
          description: 'Copie, cole, escolha e baixe; a conta só é necessária quando são usados créditos',
          details: [
            'Não é preciso se cadastrar para testar um link público',
            'Entre com Google ou código por e-mail só quando precisar de créditos',
            'Os créditos não expiram',
            'Mensagens de erro claras quando um link não pode ser processado'
          ]
        }
      ]
    },
    steps: {
      title: 'Como salvar um vídeo do Vimeo',
      subtitle:
        'Todo o fluxo tem três passos: copie a URL da página do vídeo no Vimeo, cole acima e escolha a resolução para baixar.',
      metaDescription:
        'Guia passo a passo para salvar um vídeo do Vimeo: copie a URL da página, cole no Vimeo Video Downloader, escolha a resolução e baixe o MP4.',
      items: [
        {
          title: 'Copie o link do Vimeo',
          description: 'Abra o vídeo em vimeo.com e copie a URL da barra de endereços ou do menu de compartilhar'
        },
        {
          title: 'Cole acima',
          description:
            'Coloque o link no campo de entrada e inicie a análise: o baixador lista o que o Vimeo oferece'
        },
        {
          title: 'Escolha a resolução',
          description: 'Selecione a qualidade que você quer entre as resoluções disponíveis'
        },
        {
          title: 'Baixe o MP4',
          description: 'Salve o arquivo no seu aparelho; arquivos grandes podem exigir a extensão'
        }
      ]
    },
    cta: {
      title: 'Pronto para baixar um vídeo do Vimeo?',
      description: 'Cole um link público do Vimeo acima e salve na resolução que você precisar.'
    },
    techSpecs: {
      title: 'Especificações técnicas',
      browsersLabel: 'Navegadores',
      browsers: 'Chrome, Edge, Brave e todos os navegadores baseados em Chromium',
      sourceHostsLabel: 'Links compatíveis',
      sourceHosts: 'vimeo.com, www.vimeo.com, player.vimeo.com',
      permissionsLabel: 'Permissões',
      permissions: 'Permissões mínimas necessárias',
      updatesLabel: 'Atualizações',
      updates: 'Atualizações automáticas da loja de extensões'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: 'Baixe vídeos do Vimeo na resolução que você precisar',
        description: 'Cole um link público do Vimeo, escolha uma resolução e salve o MP4 direto pelo navegador.'
      },
      stats: {
        users: 'Usuários em Todo o Mundo',
        downloads: 'Downloads Totais'
      },
      seo: {
        title: 'Baixador de vídeos do Vimeo: baixe vídeos do Vimeo em HD',
        description:
          'Salve vídeos públicos do Vimeo em HD e escolha a resolução. Cole o link, analise as resoluções e baixe o MP4 sem instalar nada.',
        keywords:
          'baixador de vimeo, baixar vídeos do vimeo, vimeo hd, salvar vídeo do vimeo, vimeo mp4, baixar vimeo online'
      },
      heroTrustPoints: [
        'Downloads em HD',
        'Sem cadastro',
        'Compatível com celular',
        'Funciona em Windows, Mac, Android e iPhone'
      ],
      situation: {
        title: 'Comece aqui: qual link do Vimeo você tem?',
        intro: 'A maioria de quem procura um baixador de Vimeo tem um destes links. Encontre o seu:',
        headers: ['Sua situação', 'Tente isto primeiro'],
        rows: [
          {
            cells: [
              'Você tem a URL de uma página pública de vídeo do Vimeo',
              'Cole no baixador acima e escolha uma resolução'
            ]
          },
          {
            cells: [
              'A página do vídeo não tem botão de download',
              'Use este baixador: o Vimeo só mostra o botão dele quando o dono permite'
            ]
          },
          {
            cells: [
              'O vídeo é privado ou tem senha',
              'Você precisa de acesso do dono; um baixador não pode abrir por você'
            ]
          },
          {
            cells: [
              'O baixador diz que o vídeo é privado ou não pode ser analisado',
              'Confirme que o link é a URL da página do vídeo e que o vídeo é público'
            ]
          }
        ]
      },
      solutions: {
        title: 'O que realmente funciona com um vídeo do Vimeo?',
        intro:
          'O Vimeo hospeda vídeos com regras de acesso bem diferentes. Uma página pública pode ser analisada por um baixador; um vídeo privado, com senha ou pago não pode ser alcançado de fora, use a ferramenta que usar.',
        quickAnswer:
          'Resposta rápida: se a página do Vimeo é pública, cole o link acima e baixe a resolução que precisar. Se o Vimeo mostra o botão de download dele, esse é o caminho mais limpo. Se o vídeo é privado ou tem senha, peça acesso ou exportação ao dono: nenhum baixador contorna isso.',
        items: [
          {
            title: 'Solução 1: baixador de Vimeo online',
            description:
              'Melhor para uma página pública do Vimeo. Cole a URL, deixe o baixador listar as resoluções que o Vimeo oferece e salve a que quiser.',
            useWhenLabel: 'Use quando:',
            useWhen: [
              'A página do vídeo é pública e abre sem login.',
              'Você quer uma resolução específica ou a melhor qualidade disponível.',
              'Você não quer instalar extensão nem aplicativo de desktop.'
            ]
          },
          {
            title: 'Solução 2: botão de download do próprio Vimeo',
            description:
              'Alguns criadores permitem baixar os próprios vídeos. Quando essa opção está ligada, o player do Vimeo mostra um botão de download e esse é o caminho mais direto.',
            useWhenLabel: 'Use quando:',
            useWhen: [
              'O player do Vimeo mostra uma opção de download.',
              'Você quer exatamente o arquivo publicado pelo criador.',
              'Você já tem permissão para guardar uma cópia.'
            ]
          },
          {
            title: 'Solução 3: extensão do navegador para arquivos grandes',
            description:
              'Vídeos longos podem passar do que uma aba consegue transmitir e armazenar de uma vez. A extensão assume a transferência e mantém o download retomável.',
            useWhenLabel: 'Use quando:',
            useWhen: [
              'O download é muito grande ou vive sendo interrompido.',
              'A área de trabalho avisa que o navegador ficou sem armazenamento local.',
              'Você baixa do Vimeo com frequência.'
            ]
          },
          {
            title: 'Solução 4: gravação de tela (último recurso)',
            description:
              'Se um vídeo reproduz para você mas não pode ser baixado por nenhuma via legal, um gravador de tela consegue capturá-lo. É um recurso de reserva, não o primeiro método, porque a qualidade e o áudio dependem da reprodução.',
            useWhenLabel: 'Use quando:',
            useWhen: [
              'Você tem permissão para ver e guardar o vídeo.',
              'O vídeo não pode ser analisado a partir do link.',
              'Você só precisa de uma cópia pessoal offline para referência.'
            ]
          }
        ]
      },
      benefits: {
        title: 'Por que usar um baixador de Vimeo online?',
        intro:
          'Um bom baixador responde rápido a uma pergunta: dá para salvar este vídeo do Vimeo a partir do link que eu tenho? A experiência deve ser direta, honesta sobre os limites e clara quando um vídeo privado não pode ser processado.',
        items: [
          {
            title: 'Salve em alta qualidade',
            description:
              'Mantenha a melhor resolução que o Vimeo oferece para que a cópia offline continue igual ao que o criador publicou.'
          },
          {
            title: 'Funciona em qualquer aparelho',
            description:
              'Use o baixador pelo navegador no Android, iPhone, Windows, Mac ou tablet: quem salva o arquivo é o navegador que você já tem.'
          },
          {
            title: 'Sem login no Vimeo',
            description:
              'Uma página pública não exige conta no Vimeo. Nunca pedimos senha, código de verificação ou arquivo de sessão.'
          },
          {
            title: 'Reprodução offline fácil',
            description:
              'Os downloads saem em MP4, que reproduz em praticamente qualquer aparelho e player sem codecs extras.'
          },
          {
            title: 'Processo rápido baseado em link',
            description:
              'Copie, cole, escolha e baixe. Se o link falhar, a página explica se o vídeo é privado, indisponível ou não suportado.'
          },
          {
            title: 'Limite de permissão claro',
            description:
              'Baixe apenas vídeos que você tem o direito de guardar. Respeite os direitos do criador, os termos do Vimeo e as regras de acesso do vídeo.'
          },
          {
            title: 'Controle da resolução',
            description:
              'Escolha entre as resoluções que o vídeo oferece em vez de ficar preso a uma única qualidade.'
          },
          {
            title: 'Arquivos grandes',
            description:
              'Vídeos mais longos são verificados antes de começar e podem continuar pela extensão do navegador quando são grandes demais para uma aba.'
          },
          {
            title: 'Preço previsível',
            description:
              'Analise um link público sem conta. Os créditos só são necessários para downloads que passam pela área de trabalho e nunca expiram.'
          }
        ]
      },
      troubleshooting: {
        title: 'Se o link do Vimeo não funcionar',
        intro:
          'Nem toda falha significa que o baixador está quebrado. Vídeos do Vimeo costumam falhar porque a página não é pública. Tente esta lista:',
        items: [
          'Abra o link no navegador e confirme que o vídeo reproduz sem login.',
          'Verifique se a URL é uma página de vídeo, não um perfil, showcase ou busca.',
          'Confira se o vídeo tem senha ou está marcado como privado.',
          'Confirme que o vídeo ainda existe: vídeos excluídos não podem ser analisados.',
          'Tente outro navegador ou rede se a página não alcançar o Vimeo.',
          'Evite qualquer ferramenta que peça sua senha do Vimeo ou do Google.'
        ]
      },
      permission: {
        title: 'Aviso importante sobre permissão',
        note:
          'Um baixador de vídeos do Vimeo não deve ser usado para burlar privacidade, direitos autorais ou restrições de acesso. Salve vídeos apenas quando tiver permissão do titular dos direitos ou quando seu uso for permitido pela lei e pelos termos do Vimeo.'
      },
      comparison: {
        title: 'Escolha o método certo para baixar do Vimeo',
        headers: ['Situação', 'Solução recomendada', 'Melhor para', 'O que verificar'],
        rows: [
          {
            cells: [
              'Página pública de vídeo do Vimeo',
              'Baixador de Vimeo online',
              'Download rápido em HD sem aplicativo',
              'A página abre sem login e o vídeo é público'
            ]
          },
          {
            cells: [
              'O criador liberou downloads',
              'Botão de download do próprio Vimeo',
              'Obter exatamente o arquivo publicado',
              'O player mostra uma opção de download'
            ]
          },
          {
            cells: [
              'Download muito grande ou interrompido',
              'Extensão do navegador',
              'Transferências retomáveis além da aba',
              'Armazenamento local disponível e estabilidade da rede'
            ]
          },
          {
            cells: [
              'Vídeo privado ou com senha',
              'Peça acesso ou exportação ao dono',
              'Manter-se dentro das regras do Vimeo',
              'Nenhum baixador alcança um vídeo que você não acessa'
            ]
          }
        ]
      },
      howTo: {
        title: 'Como baixar um vídeo do Vimeo em 3 passos',
        subtitle:
          'O caminho mais rápido é o baixador acima. Ele funciona quando a página do vídeo no Vimeo é pública e acessível pelo seu navegador.',
        steps: [
          {
            title: 'Copie o link do vídeo',
            description:
              'Abra o vídeo no Vimeo e copie a URL da página na barra de endereços ou no menu de compartilhar.'
          },
          {
            title: 'Cole e analise',
            description:
              'Cole o link no baixador acima. A ferramenta verifica quais resoluções o Vimeo oferece para aquele vídeo.'
          },
          {
            title: 'Escolha a qualidade e baixe',
            description:
              'Selecione uma resolução e salve o MP4 no seu aparelho. Se nada aparecer, o vídeo provavelmente é privado ou indisponível, e não está quebrado.'
          }
        ]
      },
      faq: {
        title: 'Perguntas frequentes',
        description: 'As perguntas que aparecem antes de baixar um vídeo do Vimeo.',
        items: [
          {
            question: 'Como faço para baixar um vídeo do Vimeo?',
            answer:
              'Abra a página do vídeo no Vimeo, copie a URL, cole no baixador acima, escolha uma das resoluções disponíveis e baixe o MP4.'
          },
          {
            question: 'Posso baixar vídeos privados ou com senha do Vimeo?',
            answer:
              'Não. Vídeos privados, com senha ou pagos não são acessíveis fora da sua sessão do Vimeo, então o baixador não consegue analisá-los. Peça ao dono acesso ou uma exportação do arquivo.'
          },
          {
            question: 'Por que o baixador diz que o vídeo do Vimeo é privado?',
            answer:
              'O Vimeo não retornou resoluções públicas para esse link. As causas comuns são configuração de privacidade, exigência de senha, vídeo excluído ou uma URL que aponta para um perfil ou showcase em vez de uma página de vídeo.'
          },
          {
            question: 'Preciso de conta no Vimeo ou da extensão?',
            answer:
              'Para um download público comum não é preciso conta nem extensão. A extensão só ajuda em arquivos muito grandes ou quando você quer que a transferência continue fora da aba.'
          },
          {
            question: 'Em que formato e qualidade o vídeo é baixado?',
            answer:
              'Os downloads são arquivos MP4 gerados a partir das resoluções que o Vimeo oferece para o vídeo. Você escolhe entre as resoluções disponíveis e a mais alta costuma ser a qualidade enviada pelo criador.'
          },
          {
            question: 'É grátis?',
            answer:
              'Analisar um link público do Vimeo é grátis. Os downloads que passam pela área de trabalho usam créditos, que são comprados uma vez e não expiram; a extensão tem uma assinatura Unlimited separada.'
          },
          {
            question: 'É seguro colar um link do Vimeo aqui?',
            answer:
              'Sim. Só usamos o link que você colou para localizar o vídeo. O baixador nunca pede senha, código de verificação ou arquivo de sessão do Vimeo, e você deve sair de qualquer página que peça isso.'
          },
          {
            question: 'Baixar vídeos do Vimeo é legal?',
            answer:
              'Depende do vídeo, da sua permissão e do uso pretendido. Baixe apenas conteúdo que você pode guardar e não redistribua material protegido por direitos autorais ou privado sem autorização.'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: 'Acesso web',
          title: 'Entre para sincronizar seus créditos',
          signedInAs: 'Sessão iniciada como',
          continueWithGoogle: 'Continuar com Google',
          googleLoading: 'Abrindo o Google...',
          or: 'ou',
          emailLabel: 'E-mail',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: 'Continuar com e-mail',
          sendCode: 'Enviar código',
          sendingCode: 'Enviando...',
          sendCodeSuccess: 'Código de verificação enviado.',
          sendAgain: 'Enviar novamente',
          codeLabel: 'Código de verificação',
          codePlaceholder: '123456',
          signIn: 'Entrar',
          termsNotice: 'Ao entrar, você aceita os',
          termsLink: 'Termos',
          privacyLink: 'Política de Privacidade',
          logout: 'Sair',
          creditsLabel: 'créditos'
        },
                quota: {
          eyebrow: 'Cota da web',
          title: 'Saldo atual de créditos',
          planLabel: 'Plano',
          remainingLabel: 'Restante',
          dailyLimitLabel: 'Limite diário',
          unlimited: 'Ilimitado'
        },
                checkin: {
          creditsLoading: 'Créditos',
          creditsButtonLabel: 'Abrir check-in diário',
          accountButtonLabel: 'Abrir menu da conta',
          accountMenuLabel: 'Menu da conta',
          title: 'Seus créditos grátis de hoje estão prontos',
          todayRewardText: 'Recompensa de hoje: {credits} créditos',
          claimedRewardText: 'Você recebeu {credits} créditos hoje.',
          nextCountdown: 'Próximo resgate em {time}',
          nextAt: '(Próxima atualização: {time} EST)',
          claimButton: 'Receber {credits} créditos',
          claimingButton: 'Recebendo...',
          notNow: 'Agora não',
          close: 'Fechar',
          loadFailed: 'Não foi possível carregar o status do check-in.',
          claimFailed: 'Não foi possível receber os créditos.'
        },
                creditPurchase: {
          installGuide: 'Você também pode baixar com a extensão do navegador.',
          installExtension: 'Instalar extensão',
          title: 'Comprar créditos',
          description: 'Adicione créditos e continue baixando neste workspace.',
          successTitle: 'Créditos adicionados',
          successDescription: 'Seu saldo foi atualizado. Feche esta janela e inicie o download novamente.',
          packageEyebrow: 'Pague conforme usar',
          cardNote: 'Use créditos para downloads no site. Créditos não expiram.',
          creditsAmount: '{credits} créditos',
          buyNow: 'Comprar agora',
          selectPackage: 'Selecionar',
          paymentMethodLabel: 'Escolha o método de pagamento',
          paymentTitle: 'Escolha o método de pagamento',
          selectedPackageLabel: 'Produto selecionado',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: 'Continuar para pagamento',
          backToProducts: 'Voltar',
          close: 'Fechar',
          agreementText: 'Aceito os termos de compra, os Termos e a Política de Privacidade.',
          loadingConfigs: 'Carregando pacotes de créditos...',
          loadFailed: 'Não foi possível carregar os pacotes de créditos. Tente novamente.',
          noConfigs: 'Nenhum pacote de créditos está disponível agora. Tente mais tarde.',
          ready: 'Escolha um pacote de créditos. Os preços são exibidos em USD.',
          creatingOrder: 'Criando pedido...',
          pendingPayment: 'Conclua o pagamento na aba recém-aberta. Verificaremos o resultado automaticamente.',
          pendingPaymentTitle: 'Aguardando pagamento',
          cancelPayment: 'Cancelar pagamento',
          supportMailPrefix: 'Relatar um problema: ',
          success: 'Pagamento concluído. Os créditos já estão disponíveis.',
          failed: 'O pagamento não foi concluído. Você pode tentar novamente ou fechar esta janela.',
          successCredits: '+{credits} créditos adicionados',
          successBalance: 'Saldo atual: {balance} créditos',
          createFailed: 'Não foi possível criar o pedido. Tente novamente.',
          invalidPaymentData: 'O link de pagamento é inválido. Tente mais tarde.',
          priceUpdated: 'O preço mudou. Confira o preço atualizado e compre novamente.',
          gatewayFailed: 'A entrada de pagamento está temporariamente indisponível. Tente mais tarde.',
          paymentCanceled: 'O pagamento foi cancelado. Escolha um método de pagamento e tente novamente.',
          pollFailed: 'Não foi possível atualizar o status do pagamento. Tente novamente.',
          pollTimeout: 'A atualização automática expirou. Atualize o resultado após o pagamento.',
          orderNotFound: 'O pedido não está mais disponível. Crie um novo pedido.',
          orderExpired: 'O pedido expirou. Compre novamente.',
          fulfillmentFailed: 'O pagamento foi recebido, mas os créditos ainda não foram adicionados. Tente mais tarde.',
          authExpired: 'A sessão expirou. Entre novamente para continuar.'
        },
        parse: {
          eyebrow: 'Verificação rápida do link',
          title: 'Baixador de vídeos do Vimeo: salve qualquer vídeo público',
          helperText:
            'Cole um link público de vídeo do Vimeo, veja as resoluções que o Vimeo oferece e baixe a que você precisar.',
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
          enterEmailFirst: 'Digite seu e-mail primeiro.',
          enterEmailAndCode: 'Digite o e-mail e o código de verificação.',
          sendCodeFailed: 'Não foi possível enviar o código de verificação.',
          googleSignInFailed: 'Não foi possível entrar com o Google.',
          googleClientMissing: 'O login com Google não está configurado.',
          restoreSessionFailed: 'Não foi possível restaurar a sessão.',
          signInFailed: 'Não foi possível entrar.',
          logoutFailed: 'Não foi possível sair.',
          loadQuotaFailed: 'Não foi possível carregar os créditos.',
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
          quotaExceeded: 'Créditos insuficientes para baixar este arquivo.',
          rateLimitExceeded: 'Muitas solicitações. Tente novamente mais tarde.'
        },
                anonymousQueue: {
          title: 'Download na fila',
          remaining: 'O download começa em {seconds} segundos.',
          hint: 'Faça login para baixar sem espera.',
          login: 'Entrar',
          close: 'Fechar'
        },
                downloadAll: {
          allSuccess: 'Todos os arquivos foram baixados.',
          partialFailed: 'Alguns arquivos foram baixados. Alguns falharam.',
          allFailed: 'Todos os downloads falharam.'
        }
      }
    },
    changelog: {
      title: 'Novidades do baixador de Vimeo',
      description:
        'Acompanhe as atualizações de download do Vimeo, mudanças na análise, suporte a arquivos maiores e notas de versão do Vimeo Video Downloader.',
      seoTitle: 'Novidades do baixador de Vimeo | Vimeo Video Downloader',
      seoDescription:
        'Leia as novidades do Vimeo Video Downloader: atualizações de análise, tratamento de resoluções, arquivos maiores e notas de cada versão.',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: 'Ganho de desempenho',
          description: 'Melhorias importantes de desempenho para uma experiência melhor.',
          features: [
            'Velocidade de análise 50% maior',
            'Estabilidade otimizada em downloads grandes',
            'Interface mais responsiva'
          ]
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: 'Suporte a vários idiomas',
          description: 'Adicionamos suporte a 14 idiomas.',
          features: ['Japonês, coreano e mais idiomas', 'Melhor precisão de tradução', 'Detecção automática de idioma']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: 'Escolha da resolução',
          description: 'Escolha a resolução do Vimeo antes de o download começar.',
          features: [
            'Escolha qualquer resolução que o vídeo ofereça',
            'Mantenha a melhor qualidade disponível',
            'Melhor gestão da fila de downloads'
          ]
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: 'Segurança e privacidade',
          description: 'Melhorias de segurança e privacidade.',
          features: [
            'Removemos todo o rastreamento analítico dos downloads',
            'Adicionamos modo de processamento apenas local',
            'Criptografia de dados melhorada'
          ]
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: 'Primeira versão',
          description: 'Primeira versão do baixador por link do Vimeo.',
          features: [
            'Análise de links do Vimeo e saída MP4',
            'Suporte a links vimeo.com e player.vimeo.com',
            'Tratamento básico de resoluções'
          ]
        }
      ],
      labels: {
        features: 'Novos Recursos',
        fixes: 'Correções de Bugs'
      }
    },
    pricing: ptBRPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Baixador de vídeos do Vimeo HD - Várias resoluções | Vimeo Video Downloader',
          description:
            'Baixe vídeos do Vimeo em HD com várias opções de resolução, de graça. Sem aplicativo. Salve na hora qualquer vídeo público do Vimeo.',
          keywords:
            'baixador de vimeo, baixar vídeos do vimeo, baixar vimeo hd, baixador vimeo grátis, salvar vídeo do vimeo, vimeo hd'
        },
        workspace: {
          title: 'Baixador de vídeos do Vimeo HD',
          helperText:
            'Cole qualquer link público de vídeo do Vimeo para baixar em HD com escolha de resolução.',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: 'Por que usar o nosso baixador de Vimeo',
          subtitle: 'Salve vídeos do Vimeo em HD escolhendo a resolução, totalmente de graça.',
          items: [
            {
              title: 'Qualidade HD original',
              description:
                'Baixe vídeos do Vimeo na resolução Full HD. Você recebe a mesma nitidez que o criador enviou.'
            },
            {
              title: 'Várias resoluções',
              description:
                'Escolha entre as resoluções disponíveis (360p, 720p, 1080p e mais). Selecione a qualidade que precisa.'
            },
            {
              title: 'Rápido e grátis',
              description:
                'Sem instalar aplicativo e sem conta. Cole o link do Vimeo, escolha a resolução e baixe na hora.'
            }
          ]
        },
        howTo: {
          title: 'Como baixar vídeos do Vimeo em HD',
          subtitle: 'Três passos simples para salvar qualquer vídeo público do Vimeo na resolução que preferir.',
          steps: [
            {
              title: 'Copie o link do vídeo do Vimeo',
              description: 'Abra a página do vídeo no Vimeo e copie a URL da barra de endereços.'
            },
            {
              title: 'Cole o link acima',
              description: 'Cole a URL do Vimeo no campo de entrada e clique em Analisar.'
            },
            {
              title: 'Escolha a resolução e baixe',
              description: 'Selecione a resolução que preferir e clique em Baixar para salvar o vídeo em HD.'
            }
          ]
        },
        faq: {
          title: 'Perguntas frequentes do baixador de Vimeo',
          items: [
            {
              question: 'Como baixo um vídeo do Vimeo?',
              answer:
                'Copie a URL da página do vídeo no Vimeo, cole no campo acima, clique em Analisar e escolha a resolução para baixar.'
            },
            {
              question: 'Posso escolher a resolução do vídeo?',
              answer:
                'Sim. Após a análise você pode escolher entre todas as resoluções disponíveis, incluindo 360p, 720p, 1080p e superiores quando existirem.'
            },
            {
              question: 'Este baixador de Vimeo é grátis?',
              answer:
                'Analisar um link público do Vimeo é grátis e não exige cadastro. Downloads que passam pela área de trabalho usam créditos.'
            },
            {
              question: 'Preciso de conta no Vimeo para baixar?',
              answer: 'Não precisa de conta. Você pode baixar qualquer vídeo público do Vimeo sem fazer login.'
            },
            {
              question: 'Em que formato os vídeos são baixados?',
              answer: 'Os vídeos do Vimeo são baixados em MP4, compatível com praticamente todos os aparelhos e players.'
            }
          ]
        }
      }
    }
  }
}
