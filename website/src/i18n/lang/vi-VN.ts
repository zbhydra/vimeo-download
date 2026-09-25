import type { SiteContent } from '../schema'
import { viVNPricingContent } from '../pricing'

export const viVN: SiteContent = {
  site: {
    name: 'Vimeo Video Downloader — Tải video Vimeo chất lượng HD',
    description:
      'Dán liên kết Vimeo công khai và lưu video ở độ phân giải bạn cần. Không cần ứng dụng, không cần tài khoản và không cần tiện ích cho một lượt tải thông thường.',
    keywords:
      'tải video vimeo, trình tải vimeo, vimeo hd, lưu video vimeo, vimeo sang mp4, tải vimeo trực tuyến'
  },
  layout: {
    nav: {
      brand: 'Vimeo Video Downloader',
      home: 'Trang Chủ',
      pricing: 'Giá',
      solutions: 'Hướng dẫn tải',
      changelog: 'Thay Đổi'
    },
    footer: {
      resources: 'Tài nguyên',
      rights: '© 2026 Vimeo Video Downloader. Bảo lưu mọi quyền.'
    }
  },
  common: {
    installCta: 'Cài Đặt Ngay'
  },
  sections: {
    features: {
      title: 'Tính năng của trình tải Vimeo',
      subtitle:
        'Những gì trình tải làm với một liên kết Vimeo công khai: phân tích trang, liệt kê các độ phân giải Vimeo cung cấp và lưu đúng lựa chọn của bạn.',
      metaDescription:
        'Tính năng của Vimeo Video Downloader: tải HD, chọn độ phân giải, xuất MP4, không cần tài khoản và ranh giới rõ ràng với video riêng tư hoặc có mật khẩu.',
      items: [
        {
          title: 'Chọn độ phân giải',
          description: 'Chọn độ phân giải bạn cần thay vì chấp nhận tệp nhỏ nhất mà Vimeo cung cấp',
          details: [
            'Chọn trong các độ phân giải mà video cung cấp',
            'Tải chất lượng cao nhất hiện có để xem ngoại tuyến',
            'Giữ nguyên tỉ lệ khung hình và track âm thanh',
            'Xuất MP4 phát được trên mọi thiết bị'
          ]
        },
        {
          title: 'Phân tích liên kết',
          description: 'Dán URL trang video Vimeo và trình tải sẽ đọc các độ phân giải hiện có',
          details: [
            'Hỗ trợ liên kết vimeo.com, www.vimeo.com và player.vimeo.com',
            'Không cần tài khoản hay đăng nhập Vimeo',
            'Thông báo rõ khi video riêng tư hoặc không thể phân tích',
            'Không cần cài gì cho một lượt tải thông thường'
          ]
        },
        {
          title: 'Tệp dung lượng lớn',
          description:
            'Video Vimeo dài vẫn tải được với tiến độ hiển thị, và tiện ích sẽ xử lý những tệp quá lớn',
          details: [
            'Tiến độ hiển thị trong suốt quá trình tải',
            'Lượt tải bị gián đoạn có thể tiếp tục trong khu vực làm việc',
            'Tiện ích trình duyệt xử lý phần mà trình duyệt không thể hoàn tất',
            'Dung lượng lưu trữ được kiểm tra trước khi tải tệp lớn'
          ]
        },
        {
          title: 'Mọi thiết bị',
          description:
            'Dùng cùng một trang trên điện thoại, máy tính bảng hay máy tính — việc tải diễn ra trong trình duyệt',
          details: [
            'Hoạt động trên Windows, macOS, Android, iPhone và máy tính bảng',
            'Không cần ứng dụng máy tính',
            'Bố cục thích ứng cho màn hình nhỏ',
            'Tệp được lưu vào thư mục tải xuống quen thuộc'
          ]
        },
        {
          title: 'Ranh giới truy cập rõ ràng',
          description: 'Video Vimeo riêng tư, có mật khẩu hoặc trả phí nằm ngoài phạm vi và được nêu đúng như vậy',
          details: [
            'Không tìm cách vượt qua quyền riêng tư hay giới hạn truy cập',
            'Không bao giờ hỏi mật khẩu, mã xác minh hay tệp phiên Vimeo',
            'Chỉ phân tích được các trang video công khai',
            'Bạn vẫn chịu trách nhiệm về quyền được lưu video'
          ]
        },
        {
          title: 'Nhanh, không cần đăng ký',
          description: 'Sao chép, dán, chọn, tải; tài khoản chỉ cần khi dùng tín dụng',
          details: [
            'Không cần đăng ký để thử một liên kết công khai',
            'Đăng nhập bằng Google hoặc mã email chỉ khi cần tín dụng',
            'Tín dụng không hết hạn',
            'Thông báo lỗi rõ ràng khi không thể xử lý liên kết'
          ]
        }
      ]
    },
    steps: {
      title: 'Cách lưu video Vimeo',
      subtitle:
        'Toàn bộ quy trình chỉ ba bước: sao chép URL trang video Vimeo, dán vào ô phía trên, rồi chọn độ phân giải và tải.',
      metaDescription:
        'Hướng dẫn từng bước để lưu video Vimeo: sao chép URL trang video, dán vào Vimeo Video Downloader, chọn độ phân giải và tải MP4.',
      items: [
        {
          title: 'Sao chép liên kết Vimeo',
          description: 'Mở video trên vimeo.com và sao chép URL từ thanh địa chỉ hoặc menu chia sẻ'
        },
        {
          title: 'Dán vào ô phía trên',
          description:
            'Đưa liên kết vào ô nhập và bắt đầu phân tích — trình tải sẽ liệt kê những gì Vimeo cung cấp'
        },
        {
          title: 'Chọn độ phân giải',
          description: 'Chọn chất lượng bạn muốn trong các độ phân giải hiện có'
        },
        {
          title: 'Tải tệp MP4',
          description: 'Lưu tệp về thiết bị; tệp rất lớn có thể cần tiện ích trình duyệt'
        }
      ]
    },
    cta: {
      title: 'Sẵn sàng tải một video Vimeo?',
      description: 'Dán liên kết Vimeo công khai vào ô phía trên và lưu ở độ phân giải bạn cần.'
    },
    techSpecs: {
      title: 'Thông số kỹ thuật',
      browsersLabel: 'Trình Duyệt',
      browsers: 'Chrome, Edge, Brave và mọi trình duyệt dựa trên Chromium',
      sourceHostsLabel: 'Liên kết hỗ trợ',
      sourceHosts: 'vimeo.com, www.vimeo.com, player.vimeo.com',
      permissionsLabel: 'Quyền',
      permissions: 'Chỉ cần quyền tối thiểu',
      updatesLabel: 'Cập Nhật',
      updates: 'Cập nhật tự động từ cửa hàng tiện ích'
    }
  },
  pages: {
    homepage: {
      hero: {
        title: 'Tải video Vimeo ở độ phân giải bạn cần',
        description: 'Dán liên kết Vimeo công khai, chọn độ phân giải và lưu MP4 ngay trong trình duyệt.'
      },
      stats: {
        users: 'Người Dùng Trên Thế Giới',
        downloads: 'Tổng Lượt Tải'
      },
      seo: {
        title: 'Trình tải video Vimeo: tải video Vimeo chất lượng HD',
        description:
          'Lưu video Vimeo công khai ở chất lượng HD và chọn độ phân giải. Dán liên kết, xem các độ phân giải và tải MP4 mà không cần cài gì.',
        keywords:
          'trình tải vimeo, tải video vimeo, vimeo hd, lưu video vimeo, vimeo mp4, tải vimeo trực tuyến'
      },
      heroTrustPoints: [
        'Tải chất lượng HD',
        'Không cần đăng ký',
        'Thân thiện với di động',
        'Chạy trên Windows, Mac, Android và iPhone'
      ],
      situation: {
        title: 'Bắt đầu tại đây: bạn có liên kết Vimeo nào?',
        intro: 'Phần lớn người tìm trình tải Vimeo đang có một trong những liên kết sau. Tìm trường hợp của bạn:',
        headers: ['Tình huống của bạn', 'Thử cách này trước'],
        rows: [
          {
            cells: [
              'Bạn có URL của một trang video Vimeo công khai',
              'Dán vào trình tải phía trên và chọn độ phân giải'
            ]
          },
          {
            cells: [
              'Trang video không có nút tải xuống',
              'Dùng trình tải này — Vimeo chỉ hiện nút của họ khi chủ video cho phép'
            ]
          },
          {
            cells: [
              'Video riêng tư hoặc có mật khẩu',
              'Bạn cần quyền truy cập từ chủ video; trình tải không thể mở giúp bạn'
            ]
          },
          {
            cells: [
              'Trình tải báo video riêng tư hoặc không thể phân tích',
              'Kiểm tra liên kết có phải URL trang video và video có công khai không'
            ]
          }
        ]
      },
      solutions: {
        title: 'Điều gì thực sự hiệu quả với một video Vimeo?',
        intro:
          'Vimeo lưu trữ video với những quy tắc truy cập rất khác nhau. Trang video công khai thì trình tải phân tích được; video riêng tư, có mật khẩu hoặc trả phí thì không thể truy cập từ bên ngoài, dù dùng công cụ nào.',
        quickAnswer:
          'Trả lời nhanh: nếu trang Vimeo công khai, hãy dán liên kết phía trên và tải độ phân giải bạn cần. Nếu Vimeo hiện nút tải của chính họ, đó là cách sạch nhất. Nếu video riêng tư hoặc có mật khẩu, hãy xin chủ video quyền truy cập hoặc bản xuất — không trình tải nào vượt qua được điều đó.',
        items: [
          {
            title: 'Cách 1: trình tải Vimeo trực tuyến',
            description:
              'Phù hợp nhất với một trang video Vimeo công khai. Dán URL, để trình tải liệt kê các độ phân giải Vimeo cung cấp rồi lưu lựa chọn của bạn.',
            useWhenLabel: 'Dùng khi:',
            useWhen: [
              'Trang video công khai và mở được mà không cần đăng nhập.',
              'Bạn muốn một độ phân giải cụ thể hoặc chất lượng cao nhất hiện có.',
              'Bạn không muốn cài tiện ích hay ứng dụng máy tính.'
            ]
          },
          {
            title: 'Cách 2: nút tải xuống của chính Vimeo',
            description:
              'Một số nhà sáng tạo cho phép tải video của họ. Khi tuỳ chọn này được bật, trình phát Vimeo hiện nút tải và đó là cách trực tiếp nhất.',
            useWhenLabel: 'Dùng khi:',
            useWhen: [
              'Trình phát Vimeo hiện tuỳ chọn tải xuống.',
              'Bạn muốn đúng tệp mà nhà sáng tạo đã công bố.',
              'Bạn đã có quyền giữ một bản sao.'
            ]
          },
          {
            title: 'Cách 3: tiện ích trình duyệt cho tệp lớn',
            description:
              'Video dài có thể vượt quá khả năng truyền và lưu của một tab. Tiện ích sẽ tiếp nhận và giữ cho lượt tải có thể tiếp tục.',
            useWhenLabel: 'Dùng khi:',
            useWhen: [
              'Tệp rất lớn hoặc lượt tải liên tục bị gián đoạn.',
              'Khu vực làm việc báo trình duyệt hết dung lượng lưu trữ cục bộ.',
              'Bạn thường xuyên tải từ Vimeo.'
            ]
          },
          {
            title: 'Cách 4: ghi màn hình (phương án cuối)',
            description:
              'Nếu video phát được với bạn nhưng không thể tải bằng bất kỳ cách hợp pháp nào, phần mềm ghi màn hình có thể ghi lại. Đây là phương án dự phòng, không phải cách đầu tiên, vì chất lượng và âm thanh phụ thuộc vào quá trình phát.',
            useWhenLabel: 'Dùng khi:',
            useWhen: [
              'Bạn có quyền xem và giữ video.',
              'Video không thể phân tích từ liên kết.',
              'Bạn chỉ cần một bản sao ngoại tuyến cá nhân để tham khảo.'
            ]
          }
        ]
      },
      benefits: {
        title: 'Vì sao nên dùng trình tải Vimeo trực tuyến?',
        intro:
          'Một trình tải tốt trả lời nhanh câu hỏi: video Vimeo này có lưu được từ liên kết tôi đang có không? Trải nghiệm nên trực tiếp, trung thực về giới hạn và rõ ràng khi video riêng tư không thể xử lý.',
        items: [
          {
            title: 'Lưu video ở chất lượng cao',
            description:
              'Giữ độ phân giải cao nhất mà Vimeo cung cấp để bản ngoại tuyến vẫn đúng như khi nhà sáng tạo công bố.'
          },
          {
            title: 'Dùng được trên mọi thiết bị',
            description:
              'Dùng trình tải trong trình duyệt trên Android, iPhone, Windows, Mac hay máy tính bảng — chính trình duyệt bạn đang có sẽ lưu tệp.'
          },
          {
            title: 'Không cần đăng nhập Vimeo',
            description:
              'Trang video công khai không cần tài khoản Vimeo. Mật khẩu, mã xác minh và tệp phiên không bao giờ bị hỏi.'
          },
          {
            title: 'Xem ngoại tuyến dễ dàng',
            description:
              'Tệp tải về là MP4, phát được trên gần như mọi thiết bị và trình phát mà không cần codec thêm.'
          },
          {
            title: 'Quy trình nhanh theo liên kết',
            description:
              'Sao chép, dán, chọn, tải. Nếu liên kết lỗi, trang sẽ nói rõ video riêng tư, đã xoá hay không được hỗ trợ.'
          },
          {
            title: 'Ranh giới quyền rõ ràng',
            description:
              'Chỉ tải những video bạn có quyền giữ. Tôn trọng quyền của nhà sáng tạo, điều khoản của Vimeo và quy tắc truy cập của video.'
          },
          {
            title: 'Kiểm soát độ phân giải',
            description:
              'Chọn giữa các độ phân giải mà video cung cấp thay vì bị khoá vào một mức chất lượng duy nhất.'
          },
          {
            title: 'Xử lý tệp lớn',
            description:
              'Video dài được kiểm tra dung lượng trước khi bắt đầu và có thể tiếp tục qua tiện ích trình duyệt khi vượt quá khả năng của một tab.'
          },
          {
            title: 'Chi phí dễ dự đoán',
            description:
              'Phân tích liên kết công khai không cần tài khoản. Tín dụng chỉ cần cho các lượt tải qua khu vực làm việc và không hết hạn.'
          }
        ]
      },
      troubleshooting: {
        title: 'Nếu liên kết Vimeo không hoạt động',
        intro:
          'Không phải mọi lỗi đều nghĩa là trình tải hỏng. Video Vimeo thường lỗi vì trang không công khai. Hãy thử danh sách sau:',
        items: [
          'Mở liên kết trong trình duyệt và xác nhận video phát được mà không cần đăng nhập.',
          'Đảm bảo URL là trang video, không phải trang cá nhân, showcase hay tìm kiếm.',
          'Kiểm tra video có mật khẩu hay bị đặt riêng tư không.',
          'Xác nhận video vẫn tồn tại — video đã xoá không thể phân tích.',
          'Thử trình duyệt hoặc mạng khác nếu trang không kết nối được Vimeo.',
          'Tránh mọi công cụ hỏi mật khẩu Vimeo hay Google của bạn.'
        ]
      },
      permission: {
        title: 'Lưu ý quan trọng về quyền',
        note:
          'Không nên dùng trình tải video Vimeo để vượt qua quyền riêng tư, bản quyền hay giới hạn truy cập. Chỉ lưu video khi bạn có sự cho phép của chủ sở hữu quyền hoặc khi việc sử dụng của bạn được pháp luật và điều khoản của Vimeo cho phép.'
      },
      comparison: {
        title: 'Chọn cách tải Vimeo phù hợp',
        headers: ['Tình huống', 'Cách đề xuất', 'Phù hợp nhất', 'Cần kiểm tra'],
        rows: [
          {
            cells: [
              'Trang video Vimeo công khai',
              'Trình tải Vimeo trực tuyến',
              'Tải HD nhanh không cần ứng dụng',
              'Trang mở được mà không cần đăng nhập và video công khai'
            ]
          },
          {
            cells: [
              'Nhà sáng tạo đã bật tải xuống',
              'Nút tải xuống của chính Vimeo',
              'Lấy đúng tệp đã công bố',
              'Trình phát có hiện tuỳ chọn tải xuống'
            ]
          },
          {
            cells: [
              'Lượt tải rất lớn hoặc bị gián đoạn',
              'Tiện ích trình duyệt',
              'Truyền tải có thể tiếp tục vượt giới hạn của tab',
              'Dung lượng cục bộ còn trống và độ ổn định của mạng'
            ]
          },
          {
            cells: [
              'Video riêng tư hoặc có mật khẩu',
              'Xin chủ video quyền truy cập hoặc bản xuất',
              'Tuân thủ quy tắc truy cập của Vimeo',
              'Video bạn không truy cập được thì không công cụ nào lấy được'
            ]
          }
        ]
      },
      howTo: {
        title: 'Tải video Vimeo trong 3 bước',
        subtitle:
          'Cách nhanh nhất là trình tải phía trên. Nó hoạt động khi trang video Vimeo công khai và trình duyệt truy cập được.',
        steps: [
          {
            title: 'Sao chép liên kết video',
            description:
              'Mở video trên Vimeo và sao chép URL trang từ thanh địa chỉ hoặc menu chia sẻ.'
          },
          {
            title: 'Dán và phân tích',
            description:
              'Dán liên kết vào trình tải phía trên. Công cụ sẽ kiểm tra Vimeo cung cấp những độ phân giải nào cho video đó.'
          },
          {
            title: 'Chọn chất lượng và tải',
            description:
              'Chọn một độ phân giải rồi lưu MP4 về thiết bị. Nếu không có gì hiện ra, nhiều khả năng video riêng tư hoặc không khả dụng chứ không phải hỏng.'
          }
        ]
      },
      faq: {
        title: 'Câu hỏi thường gặp',
        description: 'Những câu hỏi thường gặp trước khi tải một video Vimeo.',
        items: [
          {
            question: 'Làm sao để tải một video Vimeo?',
            answer:
              'Mở trang video trên Vimeo, sao chép URL, dán vào trình tải phía trên, chọn một trong các độ phân giải hiện có rồi tải MP4.'
          },
          {
            question: 'Tôi có thể tải video Vimeo riêng tư hoặc có mật khẩu không?',
            answer:
              'Không. Video riêng tư, có mật khẩu và trả phí không truy cập được từ ngoài phiên Vimeo của bạn, nên trình tải không thể phân tích. Hãy xin chủ video quyền truy cập hoặc bản xuất tệp.'
          },
          {
            question: 'Vì sao trình tải báo video Vimeo là riêng tư?',
            answer:
              'Vimeo không trả về độ phân giải công khai cho liên kết đó. Nguyên nhân thường gặp là cài đặt riêng tư, yêu cầu mật khẩu, video đã xoá, hoặc URL trỏ tới trang cá nhân hay showcase thay vì trang video.'
          },
          {
            question: 'Có cần tài khoản Vimeo hay tiện ích không?',
            answer:
              'Một lượt tải công khai thông thường không cần tài khoản lẫn tiện ích. Tiện ích chỉ hữu ích với tệp rất lớn hoặc khi bạn muốn quá trình truyền tiếp tục ngoài tab.'
          },
          {
            question: 'Tệp tải về có định dạng và chất lượng gì?',
            answer:
              'Tệp tải về là MP4 được tạo từ các độ phân giải Vimeo cung cấp cho video. Bạn chọn trong các độ phân giải hiện có, và mức cao nhất thường là chất lượng nhà sáng tạo đã tải lên.'
          },
          {
            question: 'Có miễn phí không?',
            answer:
              'Phân tích liên kết Vimeo công khai là miễn phí. Các lượt tải qua khu vực làm việc dùng tín dụng, mua một lần và không hết hạn; tiện ích có gói đăng ký Unlimited riêng.'
          },
          {
            question: 'Dán liên kết Vimeo vào đây có an toàn không?',
            answer:
              'Có. Liên kết bạn dán chỉ được dùng để tra cứu video. Trình tải không bao giờ hỏi mật khẩu, mã xác minh hay tệp phiên Vimeo, và bạn nên rời khỏi bất kỳ trang nào làm điều đó.'
          },
          {
            question: 'Tải video Vimeo có hợp pháp không?',
            answer:
              'Điều đó phụ thuộc vào video, quyền của bạn và mục đích sử dụng. Chỉ tải nội dung bạn được phép giữ, và không phát tán tài liệu có bản quyền hoặc riêng tư khi chưa được phép.'
          }
        ]
      },
      workspace: {
                auth: {
          eyebrow: 'Truy cập web',
          title: 'Đăng nhập để đồng bộ điểm',
          signedInAs: 'Đã đăng nhập bằng',
          continueWithGoogle: 'Tiếp tục với Google',
          googleLoading: 'Đang mở Google...',
          or: 'hoặc',
          emailLabel: 'Email',
          emailPlaceholder: 'name@example.com',
          continueWithEmail: 'Tiếp tục với email',
          sendCode: 'Gửi mã',
          sendingCode: 'Đang gửi...',
          sendCodeSuccess: 'Đã gửi mã xác minh.',
          sendAgain: 'Gửi lại',
          codeLabel: 'Mã xác minh',
          codePlaceholder: '123456',
          signIn: 'Đăng nhập',
          termsNotice: 'Khi đăng nhập, bạn đồng ý với',
          termsLink: 'Điều khoản',
          privacyLink: 'Chính sách quyền riêng tư',
          logout: 'Đăng xuất',
          creditsLabel: 'điểm'
        },
                quota: {
          eyebrow: 'Hạn mức web',
          title: 'Số dư điểm hiện tại',
          planLabel: 'Gói',
          remainingLabel: 'Còn lại',
          dailyLimitLabel: 'Giới hạn mỗi ngày',
          unlimited: 'Không giới hạn'
        },
                checkin: {
          creditsLoading: 'Điểm',
          creditsButtonLabel: 'Mở điểm danh hằng ngày',
          accountButtonLabel: 'Mở menu tài khoản',
          accountMenuLabel: 'Menu tài khoản',
          title: 'Điểm miễn phí hôm nay đã sẵn sàng',
          todayRewardText: 'Phần thưởng hôm nay: {credits} điểm',
          claimedRewardText: 'Hôm nay bạn đã nhận {credits} điểm.',
          nextCountdown: 'Lần nhận tiếp theo sau {time}',
          nextAt: '(Lần làm mới tiếp theo: {time} EST)',
          claimButton: 'Nhận {credits} điểm',
          claimingButton: 'Đang nhận...',
          notNow: 'Để sau',
          close: 'Đóng',
          loadFailed: 'Không thể tải trạng thái điểm danh.',
          claimFailed: 'Không thể nhận điểm.'
        },
                creditPurchase: {
          installGuide: 'Bạn cũng có thể tải xuống bằng tiện ích trình duyệt.',
          installExtension: 'Cài đặt tiện ích',
          title: 'Mua điểm',
          description: 'Thêm điểm và tiếp tục tải xuống trong không gian làm việc này.',
          successTitle: 'Đã cộng điểm',
          successDescription: 'Số dư đã được cập nhật. Đóng cửa sổ này rồi bắt đầu tải lại.',
          packageEyebrow: 'Dùng đến đâu trả đến đó',
          cardNote: 'Dùng điểm cho tải xuống trên web. Điểm không hết hạn.',
          creditsAmount: '{credits} điểm',
          buyNow: 'Mua ngay',
          selectPackage: 'Chọn',
          paymentMethodLabel: 'Chọn phương thức thanh toán',
          paymentTitle: 'Chọn phương thức thanh toán',
          selectedPackageLabel: 'Sản phẩm đã chọn',
          clinkMethods: 'Visa / Mastercard / Apple Pay / Google Pay / Amex / Discover',
          confirmPurchase: 'Tiếp tục thanh toán',
          backToProducts: 'Quay lại',
          close: 'Đóng',
          agreementText: 'Tôi đồng ý với điều khoản mua hàng, Điều khoản và Chính sách quyền riêng tư.',
          loadingConfigs: 'Đang tải các gói điểm...',
          loadFailed: 'Không thể tải các gói điểm. Vui lòng thử lại.',
          noConfigs: 'Hiện không có gói điểm nào khả dụng. Vui lòng thử lại sau.',
          ready: 'Chọn một gói điểm. Giá được hiển thị bằng USD.',
          creatingOrder: 'Đang tạo đơn hàng...',
          pendingPayment: 'Hoàn tất thanh toán trong tab vừa mở. Chúng tôi sẽ tự động kiểm tra kết quả.',
          pendingPaymentTitle: 'Đang chờ thanh toán',
          cancelPayment: 'Hủy thanh toán',
          supportMailPrefix: 'Báo cáo sự cố: ',
          success: 'Thanh toán hoàn tất. Điểm đã có thể sử dụng.',
          failed: 'Thanh toán chưa hoàn tất. Bạn có thể thử lại hoặc đóng cửa sổ này.',
          successCredits: '+{credits} điểm đã cộng',
          successBalance: 'Số dư hiện tại: {balance} điểm',
          createFailed: 'Không thể tạo đơn hàng. Vui lòng thử lại.',
          invalidPaymentData: 'Liên kết thanh toán không hợp lệ. Vui lòng thử lại sau.',
          priceUpdated: 'Giá đã thay đổi. Kiểm tra giá mới nhất rồi mua lại.',
          gatewayFailed: 'Cổng thanh toán tạm thời không khả dụng. Vui lòng thử lại sau.',
          paymentCanceled: 'Thanh toán đã bị hủy. Chọn phương thức thanh toán và thử lại.',
          pollFailed: 'Không thể cập nhật trạng thái thanh toán. Vui lòng thử lại.',
          pollTimeout: 'Tự động cập nhật đã hết thời gian. Hãy làm mới kết quả sau khi thanh toán.',
          orderNotFound: 'Đơn hàng không còn khả dụng. Hãy tạo đơn mới.',
          orderExpired: 'Đơn hàng đã hết hạn. Hãy mua lại.',
          fulfillmentFailed: 'Đã nhận thanh toán nhưng điểm chưa được cộng. Vui lòng thử lại sau.',
          authExpired: 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.'
        },
        parse: {
          eyebrow: 'Kiểm tra liên kết nhanh',
          title: 'Trình tải video Vimeo: lưu mọi video Vimeo công khai',
          helperText:
            'Dán liên kết video Vimeo công khai, xem các độ phân giải Vimeo cung cấp và tải độ phân giải bạn cần.',
          linkLabel: 'Liên kết Vimeo',
          linkPlaceholder: 'https://vimeo.com/123456789',
          clearInput: 'Xóa nội dung nhập',
          submit: 'Dán liên kết video Vimeo',
          submitting: 'Đang phân tích...',
          noResults: 'Không tìm thấy tệp nào có thể tải cho video này.',
          download: 'Tải xuống',
          downloading: 'Đang tải xuống...',
          checkingStorage: 'Đang kiểm tra dung lượng trình duyệt...',
          unknownSize: 'Không rõ dung lượng',
          preparingMp4: 'Đang chuẩn bị MP4...',
          downloadAll: 'Tải tất cả',
          downloadingAll: 'Đang tải tất cả...',
          resumeNotice:
            'Phát hiện lượt tải chưa hoàn tất "{filename}" ({progress}). Bạn có muốn tiếp tục?',
          resumeAction: 'Tiếp tục',
          pendingRestartText: 'Bản ghi tải trước của "{filename}" có thể khởi động lại.',
          pendingRestartButton: 'Khởi động lại lượt tải',
          resumeUnavailableText: 'Bản ghi phục hồi cục bộ đã hết hạn.',
          resumeDismiss: 'Bỏ qua',
          resuming: 'Đang tiếp tục...',
          largeFileExtensionInlineChromeTitle: 'Tiện ích Chrome',
          largeFileExtensionInlineChromeDescription:
            'Tiện ích dành riêng cho Chrome, giữ các lượt tải Vimeo lớn chạy ngoài tab.',
          largeFileExtensionInlineChromeCta: 'Cài tiện ích',
          largeFileExtensionInlineEdgeTitle: 'Tiện ích Edge',
          largeFileExtensionInlineEdgeDescription:
            'Tiện ích dành riêng cho Microsoft Edge, xử lý tệp Vimeo lớn theo cùng cách.',
          largeFileExtensionInlineEdgeCta: 'Cài tiện ích'
        },
                errors: {
          enterEmailFirst: 'Vui lòng nhập địa chỉ email trước.',
          enterEmailAndCode: 'Vui lòng nhập email và mã xác minh.',
          sendCodeFailed: 'Không thể gửi mã xác minh.',
          googleSignInFailed: 'Không thể đăng nhập bằng Google.',
          googleClientMissing: 'Chưa cấu hình đăng nhập Google.',
          restoreSessionFailed: 'Không thể khôi phục phiên đăng nhập.',
          signInFailed: 'Không thể đăng nhập.',
          logoutFailed: 'Không thể đăng xuất.',
          loadQuotaFailed: 'Không thể tải điểm.',
          enterLink: 'Vui lòng nhập liên kết phương tiện.',
          invalidLink: 'Đây không phải là URL hợp lệ.',
          parseFailed: 'Không thể phân tích liên kết này.',
          downloadFailed: 'Không thể tải tệp này.',
          unsafeFileTypeUseExtension:
            'Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.',
          unsafeFileTypeConfirmTitle: 'Use the browser extension',
          unsafeFileTypeConfirmViewExtension: 'View extension download',
          unsafeFileTypeConfirmCancel: 'Cancel',
          clientMuxFailed: 'Failed to generate MP4.',
          clientMuxTooLarge: 'Video này vượt quá giới hạn dung lượng tải xuống của trình duyệt.',
          trackFetchFailed: 'Failed to download the video tracks.',
          unsupportedPlatform: 'This link platform is not supported.',
          vimeoParseFailed: 'This Vimeo video is private or cannot be parsed.',
          quotaExceeded: 'Không đủ điểm để tải tệp này.',
          rateLimitExceeded: 'Too many requests. Please try again later.'
        },
                anonymousQueue: {
          title: 'Đang chờ tải xuống',
          remaining: 'Tải xuống bắt đầu sau {seconds} giây.',
          hint: 'Đăng nhập để tải không cần chờ.',
          login: 'Đăng nhập',
          close: 'Đóng'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    },
    changelog: {
      title: 'Cập nhật trình tải Vimeo',
      description:
        'Theo dõi các cập nhật tải Vimeo, thay đổi trong phân tích, hỗ trợ tệp lớn hơn và ghi chú phát hành của Vimeo Video Downloader.',
      seoTitle: 'Cập nhật trình tải Vimeo | Vimeo Video Downloader',
      seoDescription:
        'Đọc cập nhật của Vimeo Video Downloader: cập nhật phân tích, xử lý độ phân giải, tệp lớn hơn và ghi chú từng phiên bản.',
      entries: [
        {
          version: '1.1.3',
          date: '2025-01-15',
          title: 'Tăng hiệu năng',
          description: 'Cải thiện hiệu năng đáng kể để có trải nghiệm tốt hơn.',
          features: [
            'Tốc độ phân tích nhanh hơn 50%',
            'Tối ưu độ ổn định khi tải tệp lớn',
            'Giao diện phản hồi nhanh hơn'
          ]
        },
        {
          version: '1.1.2',
          date: '2024-11-10',
          title: 'Hỗ trợ đa ngôn ngữ',
          description: 'Bổ sung hỗ trợ 14 ngôn ngữ.',
          features: ['Thêm tiếng Nhật, tiếng Hàn và nhiều ngôn ngữ khác', 'Cải thiện độ chính xác bản dịch', 'Thêm tự động nhận diện ngôn ngữ']
        },
        {
          version: '1.1.0',
          date: '2024-09-01',
          title: 'Chọn độ phân giải',
          description: 'Chọn độ phân giải Vimeo mong muốn trước khi lượt tải bắt đầu.',
          features: [
            'Chọn mọi độ phân giải được cung cấp',
            'Giữ chất lượng cao nhất hiện có',
            'Cải thiện quản lý hàng đợi tải'
          ]
        },
        {
          version: '1.0.2',
          date: '2024-08-15',
          title: 'Bảo mật và riêng tư',
          description: 'Cải thiện bảo mật và quyền riêng tư.',
          features: [
            'Loại bỏ mọi theo dõi phân tích khỏi lượt tải',
            'Thêm chế độ xử lý hoàn toàn cục bộ',
            'Cải thiện mã hoá dữ liệu'
          ]
        },
        {
          version: '1.0.0',
          date: '2024-07-01',
          title: 'Phiên bản đầu tiên',
          description: 'Phiên bản đầu tiên của trình tải theo liên kết Vimeo.',
          features: [
            'Phân tích liên kết Vimeo và xuất MP4',
            'Hỗ trợ liên kết vimeo.com và player.vimeo.com',
            'Xử lý độ phân giải cơ bản'
          ]
        }
      ],
      labels: {
        features: 'Tính năng mới',
        fixes: 'Sửa lỗi'
      }
    },
    pricing: viVNPricingContent,
    platformDownloaders: {
      vimeo: {
        seo: {
          title: 'Trình tải video Vimeo HD - Nhiều độ phân giải | Vimeo Video Downloader',
          description:
            'Tải video Vimeo chất lượng HD với nhiều lựa chọn độ phân giải, miễn phí. Không cần ứng dụng. Lưu ngay mọi video Vimeo công khai.',
          keywords:
            'trình tải vimeo, tải video vimeo, tải vimeo hd, trình tải vimeo miễn phí, lưu video vimeo, vimeo hd'
        },
        workspace: {
          title: 'Trình tải video Vimeo HD',
          helperText:
            'Dán bất kỳ liên kết video Vimeo công khai nào để tải ở chất lượng HD kèm chọn độ phân giải.',
          linkPlaceholder: 'https://vimeo.com/123456789'
        },
        features: {
          title: 'Vì sao nên dùng trình tải Vimeo của chúng tôi',
          subtitle: 'Lưu video Vimeo ở chất lượng HD với độ phân giải bạn chọn, hoàn toàn miễn phí.',
          items: [
            {
              title: 'Chất lượng HD gốc',
              description:
                'Tải video Vimeo ở độ phân giải Full HD. Bạn nhận đúng độ nét mà nhà sáng tạo đã tải lên.'
            },
            {
              title: 'Nhiều độ phân giải',
              description:
                'Chọn trong các độ phân giải hiện có (360p, 720p, 1080p và cao hơn). Lấy chất lượng phù hợp với bạn.'
            },
            {
              title: 'Nhanh và miễn phí',
              description:
                'Không cần cài ứng dụng, không cần tài khoản. Dán liên kết Vimeo, chọn độ phân giải và tải ngay.'
            }
          ]
        },
        howTo: {
          title: 'Cách tải video Vimeo chất lượng HD',
          subtitle: 'Ba bước đơn giản để lưu bất kỳ video Vimeo công khai nào ở độ phân giải bạn muốn.',
          steps: [
            {
              title: 'Sao chép liên kết video Vimeo',
              description: 'Mở trang video trên Vimeo và sao chép URL từ thanh địa chỉ của trình duyệt.'
            },
            {
              title: 'Dán liên kết vào ô phía trên',
              description: 'Dán URL Vimeo vừa sao chép vào ô nhập rồi bấm Phân tích.'
            },
            {
              title: 'Chọn độ phân giải và tải',
              description: 'Chọn độ phân giải bạn muốn và bấm Tải xuống để lưu video HD.'
            }
          ]
        },
        faq: {
          title: 'Câu hỏi thường gặp về trình tải Vimeo',
          items: [
            {
              question: 'Làm sao để tải video từ Vimeo?',
              answer:
                'Sao chép URL trang video Vimeo, dán vào ô phía trên, bấm Phân tích, rồi chọn độ phân giải và tải xuống.'
            },
            {
              question: 'Tôi có thể chọn độ phân giải của video không?',
              answer:
                'Có. Sau khi phân tích, bạn có thể chọn trong mọi độ phân giải hiện có, gồm 360p, 720p, 1080p và cao hơn nếu có.'
            },
            {
              question: 'Trình tải Vimeo này có miễn phí không?',
              answer:
                'Phân tích liên kết Vimeo công khai là miễn phí và không cần đăng ký. Các lượt tải qua khu vực làm việc dùng tín dụng.'
            },
            {
              question: 'Có cần tài khoản Vimeo để tải không?',
              answer: 'Không cần tài khoản. Bạn có thể tải mọi video Vimeo công khai mà không cần đăng nhập.'
            },
            {
              question: 'Video được tải về ở định dạng nào?',
              answer: 'Video Vimeo được tải về dưới dạng MP4, tương thích với gần như mọi thiết bị và trình phát.'
            }
          ]
        }
      }
    }
  }
}
