import type { SiteContent } from '../schema'
import { viVNPricingContent } from '../pricing'

export const viVN: SiteContent = {
  site: {
    description: 'Dán liên kết Vimeo để lưu video ngay trong trình duyệt, miễn phí và không cần đăng nhập. Cần âm thanh, phụ đề, ảnh bìa hoặc hàng đợi? Hãy thêm tiện ích Chrome.'
  },
  layout: {
    nav: {
      brand: 'Vimeo Downloader',
      home: 'Trang Chủ',
      pricing: 'Giá',
    },
    footer: {
      resources: 'Tài nguyên',
      rights: '© 2026 Vimeo Downloader. Bảo lưu mọi quyền.'
    }
  },
  common: {
    installCta: 'Cài Đặt Ngay'
  },
  pages: {
    homepage: {
      meta: {
        title: 'Vimeo Downloader – Công cụ trực tuyến miễn phí và tiện ích Chrome',
        description: 'Dán liên kết Vimeo để lưu video ngay trong trình duyệt, miễn phí và không cần đăng nhập. Cần âm thanh, phụ đề, ảnh bìa hoặc hàng đợi? Hãy thêm tiện ích Chrome.'
      },
      heroTrustPoints: [
        'Tải chất lượng HD',
        'Không cần đăng ký'
      ],
      workspace: {
        parse: {
          eyebrow: 'Kiểm tra liên kết nhanh',
          titleBrand: 'Trình tải video Vimeo',
          titleTagline: 'Lưu mọi video Vimeo công khai',
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
          extensionEntryLine: 'Tải trực tiếp trên Vimeo bằng tiện ích',
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
          rateLimitExceeded: 'Too many requests. Please try again later.',
          useExtensionForResource: 'Tài nguyên này chỉ có thể tải xuống bằng tiện ích trình duyệt. Hãy cài đặt tiện ích để tiếp tục.'
        },
                anonymousQueue: {
          title: 'Đang chờ tải xuống',
          remaining: 'Tải xuống bắt đầu sau {seconds} giây.',
          close: 'Đóng'
        },
                downloadAll: {
          allSuccess: 'All files downloaded.',
          partialFailed: 'Some files downloaded. Some files failed.',
          allFailed: 'All downloads failed.'
        }
      }
    ,
      softwareApplication: {
        description: 'Tiện ích Chrome dành cho người xem Vimeo muốn bản sao cục bộ của video đang xem, kèm bảng trên trang để tải video, âm thanh, phụ đề và ảnh bìa.',
        featureList: [
          'Bảng tải xuống ngay trên trang với bốn dòng Video, Âm thanh, Phụ đề và Hình ảnh',
          'Chọn chất lượng video hoặc chọn Best',
          'Lưu âm thanh dạng M4A hoặc chuyển mã sang MP3',
          'Lưu phụ đề dạng VTT và cắt video hoặc âm thanh thích ứng',
          'Lưu ảnh bìa dạng JPEG',
          'Danh sách tài nguyên trong cửa sổ bật lên với tiến độ và tốc độ trực tiếp',
          'Hàng đợi tải xuống chung cho mọi thẻ',
          'Lịch sử cục bộ, mẫu tên tệp và thư mục con để lưu'
        ]
      },
      intro: {
        heading: 'Làm được nhiều hơn với tiện ích Chrome',
        lead: 'Công cụ trực tuyến ở trên lưu video Vimeo từ một liên kết. Tiện ích hoạt động ngay trên trang Vimeo bạn đang xem và bổ sung âm thanh, phụ đề, ảnh bìa cùng hàng đợi tải xuống.',
        primaryCta: 'Thêm vào Chrome',
        secondaryCta: 'Xem các gói',
        panel: {
          ariaLabel: 'Hình minh họa bảng tải xuống trên trang',
          rows: {
            video: 'Video',
            audio: 'Âm thanh',
            subtitle: 'Phụ đề',
            image: 'Hình ảnh'
          }
        }
      },
      features: {
        heading: 'Tiện ích bổ sung những gì',
        items: [
          {
            title: 'Bảng tải xuống trên trang',
            description: 'Một bảng nhỏ cạnh video với bốn dòng Video, Âm thanh, Phụ đề và Hình ảnh. Bảng tự dựng lại khi bạn chuyển sang video khác.'
          },
          {
            title: 'Chọn chất lượng và Best',
            description: 'Chọn 720p, 1080p hoặc chất lượng khác mà video cung cấp, hoặc để Best chọn mức cao nhất.'
          },
          {
            title: 'Âm thanh M4A hoặc MP3',
            description: 'Lưu riêng track âm thanh dạng M4A, hoặc chọn MP3 trong cửa sổ bật lên để có đầu ra chuyển mã.'
          },
          {
            title: 'Phụ đề và cắt đoạn',
            description: 'Lưu phụ đề có sẵn dạng VTT. Video và âm thanh thích ứng có thể được cắt mà không chuyển mã video.'
          },
          {
            title: 'Ảnh bìa',
            description: 'Lưu ảnh bìa của video thành một tệp JPEG riêng.'
          },
          {
            title: 'Danh sách và hàng đợi',
            description: 'Xem mọi mục đã phân giải trong cửa sổ bật lên cùng tiến độ trực tiếp, rồi thêm vào hàng đợi để tải lần lượt trên mọi thẻ.'
          },
          {
            title: 'Tệp lớn',
            description: 'Tệp mà Chrome tự tải được sẽ giao cho trình quản lý tải xuống của Chrome. Luồng thích ứng được ghép trong nền, trong giới hạn hạn mức bộ nhớ.'
          },
          {
            title: 'Cài đặt và lịch sử',
            description: 'Chọn thư mục con để lưu, mẫu tên tệp và ngôn ngữ giao diện. Các lượt tải đã xong hoặc thất bại nằm trong lịch sử cục bộ và có thể xuất ra CSV.'
          }
        ]
      },
      steps: {
        heading: 'Cách tiện ích hoạt động',
        items: [
          {
            title: 'Cài đặt',
            description: 'Thêm tiện ích từ Chrome Web Store.'
          },
          {
            title: 'Ghim biểu tượng',
            description: 'Ghim lên thanh công cụ để mở cửa sổ bật lên nhanh.'
          },
          {
            title: 'Mở một video Vimeo',
            description: 'Vào trang video được hỗ trợ trên vimeo.com hoặc player.vimeo.com và bắt đầu phát.'
          },
          {
            title: 'Chọn chất lượng',
            description: 'Bấm chất lượng bạn muốn trong bảng, hoặc mở biểu tượng tiện ích để xem danh sách đầy đủ. Trình duyệt sẽ ghi tệp xuống ổ đĩa.'
          }
        ]
      },
      comparison: {
        heading: 'Công cụ trực tuyến hay tiện ích',
        columns: {
          dimension: 'So sánh',
          web: 'Công cụ trực tuyến',
          extension: 'Tiện ích Chrome'
        },
        rows: [
          {
            dimension: 'Chạy ở đâu',
            web: 'Trong bất kỳ thẻ trình duyệt nào trên trang này: dán liên kết Vimeo.',
            extension: 'Trong Chrome và các trình duyệt Chromium khác, trên trang Vimeo bạn đang xem.'
          },
          {
            dimension: 'Lưu được gì',
            web: 'Video dưới dạng tệp MP4.',
            extension: 'Video MP4, âm thanh M4A hoặc MP3, phụ đề VTT và ảnh bìa JPEG.'
          },
          {
            dimension: 'Hàng loạt và hàng đợi',
            web: 'Dán nhiều liên kết và chạy lần lượt từng cái bằng “Tải tất cả”.',
            extension: 'Thêm các mục từ cửa sổ bật lên vào một hàng đợi chung cho mọi thẻ; chúng tải theo thứ tự.'
          },
          {
            dimension: 'Tệp lớn',
            web: 'Tệp rất lớn hoặc không rõ kích thước sẽ được chuyển sang dùng tiện ích.',
            extension: 'Tệp trực tiếp dùng trình quản lý tải xuống của Chrome; luồng thích ứng được ghép trong giới hạn hạn mức bộ nhớ.'
          },
          {
            dimension: 'Đăng nhập',
            web: 'Không bắt buộc.',
            extension: 'Không bắt buộc. Đăng nhập là tùy chọn và chỉ ảnh hưởng hạn mức tải hằng ngày và trạng thái gói đăng ký.'
          },
          {
            dimension: 'Chi phí',
            web: 'Miễn phí.',
            extension: 'Có hạn mức tải miễn phí hằng ngày, kèm gói Unlimited trả phí để dùng nhiều hơn.'
          }
        ]
      },
      scope: {
        heading: 'Dùng được cho gì và không làm gì',
        worksFor: {
          heading: 'Dùng được cho',
          items: [
            'Các trang video cấp cao nhất được hỗ trợ trên vimeo.com, www.vimeo.com và player.vimeo.com; phát được chưa chắc đã có tài nguyên tải về',
            'Chọn chất lượng cụ thể hoặc track âm thanh thay cho luồng mặc định',
            'Lưu ảnh bìa',
            'Xếp nhiều mục từ cùng một trang vào hàng đợi'
          ]
        },
        doesNot: {
          heading: 'Không làm',
          items: [
            'Vượt qua kiểm soát truy cập: video riêng tư, có mật khẩu hoặc trả phí không được đảm bảo dùng được, kể cả khi bạn phát được',
            'Gỡ hoặc vượt DRM',
            'Hỗ trợ mọi định dạng HLS, ghi trọn phát trực tiếp, hoặc các trang ngoài Vimeo',
            'Hoạt động trong ứng dụng Vimeo trên máy tính hoặc di động'
          ]
        },
        compliance: {
          heading: 'Pháp lý và tuân thủ',
          items: [
            'Công cụ bên thứ ba phát triển độc lập, không liên kết, không được bảo trợ và không có quan hệ với Vimeo, Inc. Vimeo là nhãn hiệu của Vimeo, Inc.',
            'Dành cho nội dung bạn đã có quyền truy cập hợp pháp. Bạn tự chịu trách nhiệm tuân thủ luật bản quyền và điều khoản của Vimeo cùng tác giả gốc.',
            'Không dùng để phát tán tài liệu có bản quyền hoặc vượt kiểm soát truy cập mà bạn không có quyền.'
          ]
        }
      },
      plans: {
        heading: 'Các gói',
        free: {
          name: 'Free',
          description: 'Có hạn mức tải miễn phí hằng ngày. Tài khoản hoặc thiết bị mới có ngày đầu tiên không giới hạn.',
          cta: 'Xem các gói'
        },
        unlimited: {
          name: 'Unlimited',
          description: 'Gói đăng ký trả phí gỡ giới hạn hằng ngày cho tiện ích.',
          cta: 'Nhận Unlimited'
        }
      },
      faq: {
        heading: 'Câu hỏi thường gặp',
        items: [
          {
            question: 'Tôi có cần tài khoản để tải không?',
            answer: 'Không. Công cụ trực tuyến không cần đăng nhập, tiện ích cũng vậy. Đăng nhập vào tiện ích là tùy chọn và chỉ ảnh hưởng hạn mức tải hằng ngày và trạng thái gói đăng ký.'
          },
          {
            question: 'Có miễn phí không?',
            answer: 'Công cụ trực tuyến miễn phí. Tiện ích có hạn mức tải miễn phí hằng ngày và có gói Unlimited trả phí. Xem trang Bảng giá để biết chi tiết hiện hành.'
          },
          {
            question: 'Nên dùng công cụ trực tuyến hay tiện ích?',
            answer: 'Dùng công cụ trực tuyến để lấy nhanh một tệp MP4 từ liên kết. Dùng tiện ích khi bạn cần âm thanh, phụ đề, ảnh bìa, chất lượng tự chọn hoặc hàng đợi nhiều mục.'
          },
          {
            question: 'Có tải được video Vimeo riêng tư, có mật khẩu hoặc trả phí không?',
            answer: 'Không được đảm bảo. Cả hai công cụ đều không mở khóa hay vượt kiểm soát truy cập của Vimeo, và đều không gỡ DRM.'
          },
          {
            question: 'Tôi nhận được những định dạng nào?',
            answer: 'Công cụ trực tuyến lưu video MP4. Tiện ích lưu video MP4, âm thanh M4A hoặc MP3, phụ đề VTT và ảnh bìa JPEG.'
          },
          {
            question: 'Tệp rất lớn thì sao?',
            answer: 'Công cụ trực tuyến chuyển tệp rất lớn hoặc không rõ kích thước sang tiện ích. Trong tiện ích, luồng thích ứng được ghép trong giới hạn hạn mức bộ nhớ nên các mục đã biết vượt mức sẽ không được đưa ra.'
          },
          {
            question: 'Video của tôi có đi qua máy chủ của các bạn không?',
            answer: 'Chính tệp media đi từ máy chủ Vimeo tới trình duyệt và ổ đĩa của bạn. Tiện ích còn liên hệ dịch vụ của nhà phát triển cho tính năng tài khoản, hạn mức tải, gói đăng ký, cài đặt từ xa và báo cáo sử dụng hoặc lỗi.'
          },
          {
            question: 'Hỗ trợ những trình duyệt và trang nào?',
            answer: 'Tiện ích chạy trên Chrome và các trình duyệt Chromium như Edge, Brave, và chỉ trên trang Vimeo. Các trang video khác không được hỗ trợ.'
          }
        ]
      },
      finalCta: {
        heading: 'Lưu nhiều hơn từ Vimeo với tiện ích',
        description: 'Cài một lần và tải ngay từ trang Vimeo bạn đang xem.',
        primaryCta: 'Thêm vào Chrome'
      }
    },
    pricing: viVNPricingContent,
  }
}
